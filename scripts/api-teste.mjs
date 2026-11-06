// Teste direto da API PHP (sem o app): cadastro de terminais, envio, conflitos e recebimento.
// Uso: node scripts/api-teste.mjs

import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { iniciarServidor } from './servidor-php.mjs'

const pasta = mkdtempSync(join(tmpdir(), 'api-teste-'))
const srv = await iniciarServidor({ banco: join(pasta, 'srv.sqlite') })
let falhas = 0
const verificar = (cond, desc) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${desc}`)
  if (!cond) falhas++
}

async function req(metodo, rota, corpo, token) {
  const r = await fetch(srv.url + rota, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined
  })
  return { status: r.status, corpo: await r.json() }
}
const enviar = (token, alteracoes) => req('POST', '/sync/enviar', { alteracoes }, token).then((r) => r.corpo.resultados ?? r.corpo)

try {
  verificar((await req('GET', '/status')).corpo.ok, 'status responde')
  verificar((await req('POST', '/dispositivos', { chave: 'errada', nome: 'A', codigo: 'A' })).status === 403, 'chave de cadastro errada é recusada')
  const a = (await req('POST', '/dispositivos', { chave: 'chave-teste', nome: 'Loja A', codigo: 'a' })).corpo
  const b = (await req('POST', '/dispositivos', { chave: 'chave-teste', nome: 'Loja B', codigo: 'B' })).corpo
  verificar(a.token?.length === 64 && a.codigo === 'A', 'terminal cadastrado recebe token')
  verificar((await req('POST', '/dispositivos', { chave: 'chave-teste', nome: 'X', codigo: 'A' })).status === 409, 'código de terminal repetido é recusado')
  verificar((await req('POST', '/sync/enviar', { alteracoes: [] })).status === 401, 'envio sem token é recusado')

  const cat = '11111111-1111-4111-8111-111111111111'
  const p1 = '22222222-2222-4222-8222-222222222222'
  const p2 = '33333333-3333-4333-8333-333333333333'
  const prod = (nome, codigo) => ({ codigo, nome, categoria: cat, unidade: 'u', codigoBarras: '' })

  let r = await enviar(a.token, [
    { tabela: 'categorias', uuid: cat, operacao: 'salvar', alteradoEm: '2026-11-04T10:00:00.000Z', dados: { nome: 'Periféricos', descricao: '' } },
    { tabela: 'produtos', uuid: p1, operacao: 'salvar', alteradoEm: '2026-11-04T10:00:01.000Z', dados: prod('Mouse', 'P1') }
  ])
  verificar(r.every((x) => x.status === 'aceito'), 'A envia categoria e produto')
  r = await enviar(a.token, [{ tabela: 'produtos', uuid: p1, operacao: 'salvar', alteradoEm: '2026-11-04T10:00:01.000Z', dados: prod('Mouse', 'P1') }])
  verificar(r[0].status === 'aceito', 'reenvio idêntico (falha de rede) é aceito sem duplicar')
  r = await enviar(b.token, [{ tabela: 'produtos', uuid: p2, operacao: 'salvar', alteradoEm: '2026-11-04T10:00:02.000Z', dados: prod('Outro', 'p1') }])
  verificar(r[0].status === 'rejeitado' && r[0].motivo.includes('Código'), `código duplicado entre terminais é recusado (${r[0].motivo})`)
  r = await enviar(b.token, [{ tabela: 'produtos', uuid: p1, operacao: 'salvar', alteradoEm: '2026-11-04T09:00:00.000Z', dados: prod('Velho', 'P1') }])
  verificar(r[0].status === 'ignorado', 'edição mais antiga que a do servidor é ignorada')
  r = await enviar(b.token, [{ tabela: 'produtos', uuid: p1, operacao: 'salvar', alteradoEm: '2026-11-04T11:00:00.000Z', dados: prod('Mouse Novo', 'P1') }])
  verificar(r[0].status === 'aceito', 'edição mais recente é aceita')
  r = await enviar(b.token, [{ tabela: 'produtos', uuid: p2, operacao: 'salvar', alteradoEm: '2026-11-04T11:00:01.000Z', dados: { codigo: 'P2' } }])
  verificar(r[0].status === 'rejeitado', 'dados incompletos são recusados')

  // Compras e recebimento duplicado
  const forn = '44444444-4444-4444-8444-444444444444'
  const compra = '55555555-5555-4555-8555-555555555555'
  const usu = '66666666-6666-4666-8666-666666666666'
  const dadosCompra = (status) => ({ numero: 'C-A0001', fornecedor: forn, data: '2026-11-04', status, observacao: '', itens: [{ produto: p1, quantidade: 5, valorUnitario: 10 }] })
  const mov = (uuid, em) => ({ tabela: 'movimentacoes', uuid, operacao: 'salvar', alteradoEm: em, dados: { data: '2026-11-04T10:00:00', produto: p1, tipo: 'entrada', quantidade: 5, motivo: 'Compra', usuario: usu, compra } })
  r = await enviar(a.token, [
    { tabela: 'compras', uuid: compra, operacao: 'salvar', alteradoEm: '2026-11-04T12:00:00.000Z', dados: dadosCompra('recebida') },
    mov('77777777-7777-4777-8777-777777777777', '2026-11-04T12:00:00.000Z')
  ])
  verificar(r.every((x) => x.status === 'aceito'), 'A recebe a compra')
  r = await enviar(b.token, [mov('88888888-8888-4888-8888-888888888888', '2026-11-04T12:00:05.000Z')])
  verificar(r[0].status === 'rejeitado' && r[0].motivo.includes('já foi recebido'), 'segundo recebimento do mesmo item é recusado')
  r = await enviar(b.token, [{ tabela: 'compras', uuid: compra, operacao: 'salvar', alteradoEm: '2026-11-04T13:00:00.000Z', dados: dadosCompra('pedido') }])
  verificar(r[0].status === 'rejeitado', 'compra recebida não volta para pedido')
  r = await enviar(b.token, [{ tabela: 'movimentacoes', uuid: '77777777-7777-4777-8777-777777777777', operacao: 'excluir', alteradoEm: '2026-11-04T13:00:00.000Z' }])
  verificar(r[0].status === 'rejeitado', 'movimentação não pode ser excluída')

  // Recebimento parcial: entregas somadas entre terminais até o pedido
  const compra2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const entrada = (uuid, qtd, em) => ({ tabela: 'movimentacoes', uuid, operacao: 'salvar', alteradoEm: em, dados: { data: '2026-11-06T10:00:00', produto: p1, tipo: 'entrada', quantidade: qtd, motivo: 'Compra', usuario: usu, compra: compra2 } })
  r = await enviar(a.token, [
    { tabela: 'compras', uuid: compra2, operacao: 'salvar', alteradoEm: '2026-11-06T09:00:00.000Z', dados: { numero: 'C-A0002', fornecedor: forn, data: '2026-11-06', status: 'pedido', observacao: '', itens: [{ produto: p1, quantidade: 10, valorUnitario: 1 }] } },
    entrada('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 4, '2026-11-06T10:00:00.000Z')
  ])
  verificar(r.every((x) => x.status === 'aceito'), 'A recebe 4 de 10')
  r = await enviar(b.token, [entrada('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 6, '2026-11-06T11:00:00.000Z')])
  verificar(r[0].status === 'aceito', 'B recebe os outros 6 (entregas parciais em terminais diferentes)')
  r = await enviar(b.token, [entrada('ffffffff-ffff-4fff-8fff-ffffffffffff', 1, '2026-11-06T12:00:00.000Z')])
  verificar(r[0].status === 'rejeitado', 'receber além do pedido (11 de 10) é recusado')

  // Vendas: cancelada não volta, e cada item só retorna ao estoque uma vez
  const venda = '99999999-9999-4999-8999-999999999999'
  const dadosVenda = (status) => ({ numero: 'V-A0001', cliente: null, data: '2026-11-05T10:00:00', status, formaPagamento: 'pix', desconto: 0, observacao: '', usuario: usu, itens: [{ produto: p1, quantidade: 2, valorUnitario: 5 }] })
  const devolucao = (uuid, em) => ({ tabela: 'movimentacoes', uuid, operacao: 'salvar', alteradoEm: em, dados: { data: '2026-11-05T11:00:00', produto: p1, tipo: 'entrada', quantidade: 2, motivo: 'Cancelamento', usuario: usu, venda } })
  r = await enviar(a.token, [
    { tabela: 'vendas', uuid: venda, operacao: 'salvar', alteradoEm: '2026-11-05T10:00:00.000Z', dados: dadosVenda('concluida') },
    { tabela: 'vendas', uuid: venda, operacao: 'salvar', alteradoEm: '2026-11-05T11:00:00.000Z', dados: dadosVenda('cancelada') },
    devolucao('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-11-05T11:00:00.000Z')
  ])
  verificar(r.every((x) => x.status === 'aceito'), 'A registra e cancela uma venda')
  r = await enviar(b.token, [devolucao('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-11-05T11:00:05.000Z')])
  verificar(r[0].status === 'rejeitado' && r[0].motivo.includes('devolvido'), 'segundo cancelamento da mesma venda não devolve o estoque de novo')
  r = await enviar(b.token, [{ tabela: 'vendas', uuid: venda, operacao: 'salvar', alteradoEm: '2026-11-05T12:00:00.000Z', dados: dadosVenda('concluida') }])
  verificar(r[0].status === 'rejeitado', 'venda cancelada não volta a ser concluída')

  // Estorno: cada movimentação só é estornada uma vez
  const original = '12121212-1212-4121-8121-121212121212'
  const estornoMov = (uuid, em) => ({ tabela: 'movimentacoes', uuid, operacao: 'salvar', alteradoEm: em, dados: { data: '2026-11-06T13:00:00', produto: p1, tipo: 'entrada', quantidade: 1, motivo: 'Estorno', usuario: usu, estornoDe: original } })
  r = await enviar(a.token, [
    { tabela: 'movimentacoes', uuid: original, operacao: 'salvar', alteradoEm: '2026-11-06T12:00:00.000Z', dados: { data: '2026-11-06T12:00:00', produto: p1, tipo: 'saida', quantidade: 1, motivo: 'Errado', usuario: usu } },
    estornoMov('13131313-1313-4131-8131-131313131313', '2026-11-06T13:00:00.000Z')
  ])
  verificar(r.every((x) => x.status === 'aceito'), 'A lança e estorna uma movimentação')
  r = await enviar(b.token, [estornoMov('14141414-1414-4141-8141-141414141414', '2026-11-06T13:00:05.000Z')])
  verificar(r[0].status === 'rejeitado' && r[0].motivo.includes('estornada'), 'segundo estorno da mesma movimentação é recusado')

  // Exclusão libera a chave única
  r = await enviar(a.token, [{ tabela: 'categorias', uuid: cat, operacao: 'excluir', alteradoEm: '2026-11-04T14:00:00.000Z' }])
  verificar(r[0].status === 'aceito', 'exclusão aceita')

  // Recebimento: cada terminal recebe só o que os outros fizeram
  const rb = (await req('GET', '/sync/receber?desde=0', null, b.token)).corpo
  const ra = (await req('GET', '/sync/receber?desde=0', null, a.token)).corpo
  verificar(rb.alteracoes.length === 12 && rb.alteracoes.every((x) => x.uuid !== p2), `B recebe as 12 alterações de A (${rb.alteracoes.length})`)
  verificar(ra.alteracoes.length === 2 && ra.alteracoes[0].dados.nome === 'Mouse Novo', 'A recebe só o que B fez (edição e entrega parcial)')
  const rb2 = (await req('GET', `/sync/receber?desde=${rb.ultimoSeq}`, null, b.token)).corpo
  verificar(rb2.alteracoes.length === 0 && !rb2.temMais, 'cursor avança: nada novo na segunda leitura')
  const st = (await req('GET', '/status', null, a.token)).corpo
  verificar(st.terminal?.codigo === 'A' && st.registros === 10, `status autenticado mostra terminal e registros (${st.registros})`)
} catch (e) {
  falhas++
  console.error('  ✗ erro:', e.message, srv.log())
} finally {
  srv.parar()
  await new Promise((r) => setTimeout(r, 300))
  rmSync(pasta, { recursive: true, force: true })
}
console.log(falhas ? `\n${falhas} falha(s).` : '\nAPI ok.')
process.exit(falhas ? 1 : 0)

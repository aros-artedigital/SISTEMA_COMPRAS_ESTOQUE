// Teste de sincronização com dois terminais reais (duas instâncias do app) e a API PHP.
// Uso: npm run test:sync   (SMOKE_OUT=<pasta> salva screenshots; SMOKE_EXE=<.exe> usa o app empacotado)

import { _electron as electron } from 'playwright-core'
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { iniciarServidor } from './servidor-php.mjs'

const pasta = mkdtempSync(join(tmpdir(), 'sync-teste-'))
const bancoServidor = join(pasta, 'servidor.sqlite')
const saida = process.env.SMOKE_OUT
const exe = process.env.SMOKE_EXE
const CHAVE = 'chave-teste'
let srv = await iniciarServidor({ banco: bancoServidor, chave: CHAVE })

let falhas = 0
const verificar = (cond, desc) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${desc}`)
  if (!cond) falhas++
}
const pausa = (ms) => new Promise((r) => setTimeout(r, ms))
const abertos = []

async function terminal(nome, banco = join(pasta, `${nome}.sqlite`)) {
  const env = { ...process.env, ESTOQUE_DB_PATH: banco, ESTOQUE_DEMO: '1' }
  const app = await electron.launch(exe ? { executablePath: exe, args: [], env } : { args: ['.'], env })
  abertos.push(app)
  const page = await app.firstWindow()
  await page.waitForSelector('input[placeholder="seu.login"]')
  const ipc = async (canal, ...args) => page.evaluate(([c, a]) => window.api.invoke(c, ...a), [canal, args])
  const ok = async (canal, ...args) => {
    const r = await ipc(canal, ...args)
    if (!r.ok) throw new Error(`${nome} ${canal}: ${r.erro.mensagem}`)
    return r.dados
  }
  await ok('auth:entrar', 'admin', 'admin123')
  return { nome, app, page, ipc, ok, dados: () => ok('dados:carregar'), sync: () => ok('sync:sincronizar') }
}

const porCodigo = (d, codigo) => d.produtos.find((p) => p.codigo === codigo)
const resumo = (d) =>
  d.produtos
    .map((p) => `${p.codigo}|${p.nome}|${p.precoVenda}|${p.estoque}|${p.ativo}`)
    .sort()
    .join('\n')
const saldoBate = (d) =>
  d.produtos.every((p) => d.movimentacoes.filter((m) => m.produtoId === p.id).reduce((s, m) => s + (m.tipo === 'saida' ? -m.quantidade : m.quantidade), 0) === p.estoque)

const dadosProduto = (codigo, nome, d, extra = {}) => ({
  codigo,
  codigoBarras: '',
  nome,
  categoriaId: d.categorias[0].id,
  unidadeId: d.unidades[0].id,
  precoCusto: 10,
  precoVenda: 20,
  estoque: 0,
  estoqueMinimo: 1,
  ativo: true,
  ...extra
})

try {
  // ---------- Banco antigo (fase 3) ----------
  const antigo = join(homedir(), 'AppData', 'Roaming', 'gestor-estoque-compras', 'estoque.sqlite')
  if (existsSync(antigo)) {
    console.log('Atualização de um banco da versão anterior')
    const copia = join(pasta, 'antigo.sqlite')
    copyFileSync(antigo, copia)
    if (existsSync(antigo + '-wal')) copyFileSync(antigo + '-wal', copia + '-wal')
    const t = await terminal('antigo', copia)
    const d = await t.dados()
    const e = await t.ok('sync:estado')
    verificar(d.produtos.length > 0, `banco antigo abre com os dados (${d.produtos.length} produtos)`)
    verificar(saldoBate(d), 'depois da migração, o saldo de cada produto é a soma das movimentações')
    verificar(e.pendentes > 0 && !e.configurado, `tudo fica pendente para o primeiro envio (${e.pendentes} registros)`)
    await t.app.close()
  }

  // ---------- Conexão ----------
  console.log('Conexão dos terminais')
  const A = await terminal('A')
  const B = await terminal('B')
  let r = await A.ipc('sync:conectar', { url: srv.url, chave: 'errada', nome: 'Loja A', codigo: 'A', modo: 'enviar' })
  verificar(!r.ok && r.erro.mensagem.includes('Chave'), 'chave de cadastro errada é recusada')
  r = await A.ok('sync:conectar', { url: srv.url + '/', chave: CHAVE, nome: 'Loja A', codigo: 'a', modo: 'enviar' })
  verificar(r.estado.configurado && r.estado.pendentes === 0 && r.estado.codigo === 'A', 'terminal A conectado e todos os dados enviados')
  r = await B.ipc('sync:conectar', { url: srv.url, chave: CHAVE, nome: 'Loja B', codigo: 'A', modo: 'substituir' })
  verificar(!r.ok && r.erro.mensagem.includes('já está em uso'), 'código de terminal repetido é recusado')
  r = await B.ok('sync:conectar', { url: srv.url, chave: CHAVE, nome: 'Loja B', codigo: 'B', modo: 'substituir' })
  verificar(r.precisaEntrar, 'terminal B substitui os dados pelos do servidor e pede novo login')
  r = await B.ipc('dados:carregar')
  verificar(!r.ok, 'sessão de B encerrada após a substituição')
  await B.ok('auth:entrar', 'admin', 'admin123')
  let dA = await A.dados()
  let dB = await B.dados()
  verificar(resumo(dA) === resumo(dB), 'B tem exatamente os mesmos produtos, preços e saldos de A')
  verificar(dA.movimentacoes.length === dB.movimentacoes.length && dA.compras.length === dB.compras.length && dA.usuarios.length === dB.usuarios.length, 'movimentações, compras e usuários iguais')
  verificar(saldoBate(dB), 'saldos de B batem com as movimentações recebidas')

  // ---------- Alterações cruzadas ----------
  console.log('Alterações nos dois terminais')
  await A.ok('produtos:salvar', null, dadosProduto('P2001', 'Hub USB-C', dA, { estoque: 4 }))
  const mouseB = porCodigo(dB, 'P0001')
  await B.ok('estoque:movimentar', { produtoId: mouseB.id, tipo: 'saida', quantidade: 2, motivo: 'Venda no terminal B' })
  await A.sync()
  await B.sync()
  await A.sync()
  dA = await A.dados()
  dB = await B.dados()
  verificar(porCodigo(dB, 'P2001')?.estoque === 4, 'produto criado em A chega em B com o estoque inicial')
  verificar(porCodigo(dA, 'P0001').estoque === mouseB.estoque - 2, 'venda feita em B baixa o estoque em A')
  verificar(resumo(dA) === resumo(dB), 'terminais iguais depois da troca')

  // ---------- Vendas simultâneas sem sincronizar ----------
  const ssdA = porCodigo(dA, 'P0004')
  const ssdB = porCodigo(dB, 'P0004')
  await A.ok('estoque:movimentar', { produtoId: ssdA.id, tipo: 'saida', quantidade: 3, motivo: 'Venda A' })
  await B.ok('estoque:movimentar', { produtoId: ssdB.id, tipo: 'saida', quantidade: 4, motivo: 'Venda B' })
  await A.sync()
  await B.sync()
  await A.sync()
  dA = await A.dados()
  dB = await B.dados()
  verificar(porCodigo(dA, 'P0004').estoque === ssdA.estoque - 7 && porCodigo(dB, 'P0004').estoque === ssdA.estoque - 7, `vendas simultâneas somadas nos dois (${ssdA.estoque} − 3 − 4 = ${porCodigo(dA, 'P0004').estoque})`)

  // ---------- Edição concorrente: vale a mais recente ----------
  console.log('Conflitos')
  const tecladoA = porCodigo(dA, 'P0002')
  const tecladoB = porCodigo(dB, 'P0002')
  const edicao = (p, preco) => ({ ...p, codigoBarras: p.codigoBarras, precoVenda: preco })
  await B.ok('produtos:salvar', tecladoB.id, edicao(tecladoB, 111)) // mais antiga
  await pausa(30)
  await A.ok('produtos:salvar', tecladoA.id, edicao(tecladoA, 222)) // mais recente
  await A.sync()
  await B.sync() // envia a antiga (ignorada) e recebe a de A
  await A.sync()
  dA = await A.dados()
  dB = await B.dados()
  verificar(porCodigo(dA, 'P0002').precoVenda === 222 && porCodigo(dB, 'P0002').precoVenda === 222, 'edição mais recente prevalece nos dois terminais, mesmo enviada antes')

  // ---------- Código duplicado criado nos dois ----------
  await A.ok('produtos:salvar', null, dadosProduto('P3000', 'Item criado em A', dA))
  await B.ok('produtos:salvar', null, dadosProduto('P3000', 'Item criado em B', dB))
  await A.sync()
  await B.sync()
  dB = await B.dados()
  const conflitosB = await B.ok('sync:conflitos')
  verificar(porCodigo(dB, 'P3000')?.nome === 'Item criado em A', 'em B, o código P3000 fica com o produto que chegou primeiro ao servidor')
  verificar(dB.produtos.some((p) => p.nome === 'Item criado em B' && p.codigo.startsWith('P3000-CONFLITO')), 'o produto de B é mantido e renomeado para correção')
  verificar(conflitosB.some((c) => c.descricao.includes('P3000')), `conflito aparece na lista de B (${conflitosB.length})`)

  // ---------- Mesma compra recebida nos dois terminais ----------
  const compraA = dA.compras.find((c) => c.status === 'pedido')
  const compraB = dB.compras.find((c) => c.numero === compraA.numero)
  const produtoCompra = compraA.itens[0].produtoId
  const codigoCompra = dA.produtos.find((p) => p.id === produtoCompra).codigo
  const antes = porCodigo(dA, codigoCompra).estoque
  const qtd = compraA.itens.filter((i) => i.produtoId === produtoCompra).reduce((s, i) => s + i.quantidade, 0)
  await A.ok('compras:receber', compraA.id)
  await B.ok('compras:receber', compraB.id)
  await A.sync()
  await B.sync()
  await A.sync()
  dA = await A.dados()
  dB = await B.dados()
  verificar(porCodigo(dA, codigoCompra).estoque === antes + qtd && porCodigo(dB, codigoCompra).estoque === antes + qtd, `compra recebida nos dois terminais entra no estoque uma vez só (${antes} + ${qtd})`)
  verificar((await B.ok('sync:conflitos')).some((c) => /recebid/.test(c.motivo)), 'B é avisado de que a entrada dele foi desfeita')
  verificar(saldoBate(dA) && saldoBate(dB), 'saldos continuam batendo com as movimentações')

  // ---------- Exclusão ----------
  const cliente = dA.clientes.find((c) => !c.ativo)
  await A.ok('clientes:excluir', cliente.id)
  await A.sync()
  await B.sync()
  dB = await B.dados()
  verificar(!dB.clientes.some((c) => c.documento === cliente.documento), 'cliente excluído em A some de B')

  // ---------- Sem internet ----------
  console.log('Funcionamento sem conexão')
  srv.parar()
  await pausa(300)
  await A.ok('categorias:salvar', null, { nome: 'Criada sem internet', descricao: '' })
  r = await A.ipc('sync:sincronizar')
  const offline = await A.ok('sync:estado')
  verificar(!r.ok && /conex/.test(r.erro.mensagem), 'sem servidor, a sincronização avisa e o app continua funcionando')
  verificar(offline.pendentes >= 1 && offline.ultimoErro, `alteração fica guardada como pendente (${offline.pendentes})`)
  srv = await iniciarServidor({ banco: bancoServidor, chave: CHAVE })
  await A.sync()
  await B.sync()
  dB = await B.dados()
  verificar(dB.categorias.some((c) => c.nome === 'Criada sem internet') && (await A.ok('sync:estado')).pendentes === 0, 'quando o servidor volta, o pendente é enviado e chega em B')

  // ---------- Número de compra com código do terminal ----------
  const nova = await B.ok('compras:salvar', null, {
    fornecedorId: dB.fornecedores.find((f) => f.ativo).id,
    data: '2026-11-04',
    observacao: '',
    status: 'rascunho',
    itens: [{ produtoId: dB.produtos[0].id, quantidade: 1, valorUnitario: 1 }]
  })
  verificar(nova.numero.startsWith('C-B'), `número da compra inclui o terminal (${nova.numero})`)
  await B.sync()
  await A.sync()
  dA = await A.dados()
  verificar(dA.compras.some((c) => c.numero === nova.numero), 'compra de B chega em A')

  // ---------- Telas ----------
  if (saida) {
    await A.page.reload()
    await A.page.waitForSelector('input[placeholder="seu.login"]')
    await A.page.fill('input[placeholder="seu.login"]', 'admin')
    await A.page.fill('input[type="password"]', 'admin123')
    await A.page.getByRole('button', { name: 'Entrar' }).click()
    await A.page.getByText(/Sincronizado/).first().waitFor()
    await A.page.getByRole('link', { name: 'Configurações' }).click()
    await A.page.getByText('Sincronização entre terminais').scrollIntoViewIfNeeded()
    await A.page.screenshot({ path: join(saida, 'sync-configuracoes.png') })
    await B.page.reload()
    await B.page.waitForSelector('input[placeholder="seu.login"]')
    await B.page.fill('input[placeholder="seu.login"]', 'admin')
    await B.page.fill('input[type="password"]', 'admin123')
    await B.page.getByRole('button', { name: 'Entrar' }).click()
    await B.page.getByRole('link', { name: 'Configurações' }).click()
    await B.page.getByRole('button', { name: /Conflitos/ }).click()
    await B.page.getByText('Conflitos de sincronização').waitFor()
    await B.page.screenshot({ path: join(saida, 'sync-conflitos.png') })
  }
} catch (e) {
  falhas++
  console.error('  ✗ erro durante o teste:', e.message)
  console.error(srv.log())
} finally {
  for (const a of abertos) await a.close().catch(() => undefined)
  srv.parar()
  await pausa(500)
  try {
    rmSync(pasta, { recursive: true, force: true })
  } catch {
    console.warn(`  (não consegui apagar ${pasta})`)
  }
}

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nSincronização ok.')
process.exit(falhas ? 1 : 0)

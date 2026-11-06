// Teste de fumaça: abre o app Electron de verdade (build em out/) com um banco temporário
// e percorre login, telas, regras de negócio, permissões e persistência após reiniciar.
// Uso: npm run test:smoke   (SMOKE_OUT=<pasta> salva screenshots)

import { _electron as electron } from 'playwright-core'
import ExcelJS from 'exceljs'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'

const pasta = mkdtempSync(join(tmpdir(), 'estoque-smoke-'))
const ESTOQUE_DB_PATH = join(pasta, 'teste.sqlite')
// "Pendrive" do teste de backup externo: fora da pasta do banco.
const externa = mkdtempSync(join(tmpdir(), 'estoque-externo-'))
const saida = process.env.SMOKE_OUT

let falhas = 0
function verificar(cond, descricao) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${descricao}`)
  if (!cond) falhas++
}

// SMOKE_EXE=<caminho do .exe> testa o app empacotado (ex.: dist/win-unpacked/Gestor de Estoque e Compras.exe).
const exe = process.env.SMOKE_EXE

async function abrir() {
  const env = { ...process.env, ESTOQUE_DB_PATH, ESTOQUE_DEMO: '1' }
  const app = await electron.launch(exe ? { executablePath: exe, args: [], env } : { args: ['.'], env })
  const page = await app.firstWindow()
  await page.waitForSelector('input[placeholder="seu.login"]')
  return { app, page }
}

async function entrar(page, login, senha) {
  await page.fill('input[placeholder="seu.login"]', login)
  await page.fill('input[type="password"]', senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

/** Chama um canal IPC direto, como a interface faz. */
const ipc = (page, canal, ...args) => page.evaluate(([c, a]) => window.api.invoke(c, ...a), [canal, args])

/** Substitui os diálogos de arquivo do processo principal por um caminho fixo (o teste não tem quem clique). */
const aoSalvar = (caminho) =>
  app.evaluate(({ dialog }, c) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: c })
  }, caminho)
const aoAbrir = (caminho) =>
  app.evaluate(({ dialog }, c) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [c] })
  }, caminho)
function ehPdf(caminho) {
  const ok = existsSync(caminho) && readFileSync(caminho).subarray(0, 4).toString() === '%PDF'
  if (ok && saida) copyFileSync(caminho, join(saida, basename(caminho)))
  return ok
}

/** Espera um arquivo aparecer (geração de PDF/Excel é assíncrona). */
async function esperarArquivo(caminho, ms = 20000) {
  for (const fim = Date.now() + ms; Date.now() < fim; await new Promise((r) => setTimeout(r, 200))) {
    if (existsSync(caminho)) {
      await new Promise((r) => setTimeout(r, 300)) // termina de gravar
      return true
    }
  }
  await foto(page, `falha-${basename(caminho)}`)
  return false
}

async function foto(page, nome) {
  if (saida) await page.screenshot({ path: join(saida, `${nome}.png`) })
}

let app
let page
try {
  console.log('1ª execução (banco novo com dados de demonstração)')
  ;({ app, page } = await abrir())

  await entrar(page, 'admin', 'senha-errada')
  await page.getByText('Login ou senha inválidos.').waitFor()
  verificar(true, 'senha errada é recusada')

  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  verificar(true, 'login do administrador abre o painel')
  await foto(page, '1-painel')

  let dados = (await ipc(page, 'dados:carregar')).dados
  verificar(dados.produtos.length === 10 && dados.compras.length === 7, 'seed gravou produtos e compras')
  const pendrive = () => dados.produtos.find((p) => p.id === 5).estoque
  const antes = pendrive()

  // Cadastro pela interface
  await page.getByRole('link', { name: 'Produtos' }).click()
  await page.getByRole('button', { name: 'Novo Produto' }).click()
  await page.getByLabel('Nome').fill('Hub USB 4 portas')
  await page.getByLabel('Categoria').selectOption({ label: 'Periféricos' })
  await page.getByLabel('Unidade de medida').selectOption({ label: 'UN — Unidade' })
  await page.getByLabel('Preço de custo (R$)').fill('35')
  await page.getByLabel('Preço de venda (R$)').fill('59.9')
  await page.getByLabel('Estoque inicial').fill('7')
  await foto(page, '2-novo-produto')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.getByText('Produto cadastrado.').waitFor()
  await page.getByPlaceholder('Pesquisar por nome').fill('hub')
  await page.getByRole('cell', { name: 'Hub USB 4 portas' }).waitFor()
  verificar(true, 'produto cadastrado pelo formulário aparece na lista')

  // Código duplicado volta como erro no campo
  await page.getByRole('button', { name: 'Novo Produto' }).click()
  await page.getByLabel(/^Código \*$/).fill('P0001')
  await page.getByLabel('Nome').fill('Duplicado')
  await page.getByLabel('Categoria').selectOption({ label: 'Periféricos' })
  await page.getByLabel('Unidade de medida').selectOption({ label: 'UN — Unidade' })
  await page.getByLabel('Preço de custo (R$)').fill('1')
  await page.getByLabel('Preço de venda (R$)').fill('2')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.getByText('Já existe um produto com este código.').waitFor()
  verificar(true, 'código duplicado é recusado pelo banco e destacado no campo')
  await page.keyboard.press('Escape')

  dados = (await ipc(page, 'dados:carregar')).dados
  const hub = dados.produtos.find((p) => p.nome === 'Hub USB 4 portas')
  verificar(hub?.estoque === 7, 'estoque inicial aplicado ao produto')
  verificar(dados.movimentacoes.some((m) => m.produtoId === hub?.id && m.motivo === 'Estoque inicial' && m.saldoApos === 7), 'estoque inicial gerou movimentação')

  // Regras de negócio
  let r = await ipc(page, 'compras:receber', 6)
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(r.ok && pendrive() === antes + 50, `receber compra C-0006 soma 50 ao pendrive (${antes} → ${pendrive()})`)
  r = await ipc(page, 'compras:receber', 6)
  verificar(!r.ok && r.erro.mensagem.includes('já foi recebida'), 'compra não pode ser recebida duas vezes')
  r = await ipc(page, 'compras:receber', 7)
  verificar(!r.ok && r.erro.tipo === 'negocio', 'rascunho não pode ser recebido')
  r = await ipc(page, 'estoque:movimentar', { produtoId: 10, tipo: 'saida', quantidade: 1, motivo: 'teste' })
  verificar(!r.ok && r.erro.campo === 'quantidade', 'saída sem saldo é recusada')
  r = await ipc(page, 'produtos:excluir', 1)
  verificar(!r.ok && r.erro.mensagem.includes('Inative'), 'produto com histórico não pode ser excluído')
  r = await ipc(page, 'compras:salvar', null, { fornecedorId: 1, data: '2026-11-04', observacao: '', status: 'pedido', itens: [] })
  verificar(!r.ok && r.erro.tipo === 'validacao', 'compra sem itens é recusada na validação do main')
  r = await ipc(page, 'usuarios:salvar', 1, { nome: 'Administrador', email: 'admin@empresa.local', login: 'admin', senha: '', perfil: 'operador', ativo: true })
  verificar(!r.ok && r.erro.campo === 'perfil', 'administrador não pode rebaixar o próprio perfil')

  // ---------- Custo médio ----------
  console.log('Custo ao receber compras')
  const comprarERecebe = async (produtoId, quantidade, valorUnitario) => {
    const c = (await ipc(page, 'compras:salvar', null, { fornecedorId: 1, data: '2026-11-05', observacao: '', status: 'pedido', itens: [{ produtoId, quantidade, valorUnitario }] })).dados
    return (await ipc(page, 'compras:receber', c.id)).dados
  }
  const custoDe = async (id) => (await ipc(page, 'dados:carregar')).dados.produtos.find((p) => p.id === id).precoCusto
  const configBase = (await ipc(page, 'dados:carregar')).dados.configuracoes
  const teclado = (await ipc(page, 'dados:carregar')).dados.produtos.find((p) => p.id === 2)
  let alteracoes = await comprarERecebe(2, 3, 60)
  const esperado = Math.round(((teclado.estoque * teclado.precoCusto + 3 * 60) / (teclado.estoque + 3)) * 100) / 100
  verificar((await custoDe(2)) === esperado && alteracoes[0]?.para === esperado, `custo médio: ${teclado.estoque} un. a ${teclado.precoCusto} + 3 a 60 = ${esperado}`)
  await ipc(page, 'configuracoes:salvar', { ...configBase, custoAoReceber: 'ultimo' })
  await comprarERecebe(2, 1, 70)
  verificar((await custoDe(2)) === 70, 'opção "último preço pago": custo vira 70')
  await ipc(page, 'configuracoes:salvar', { ...configBase, custoAoReceber: 'manter' })
  alteracoes = await comprarERecebe(2, 1, 10)
  verificar((await custoDe(2)) === 70 && alteracoes.length === 0, 'opção "não alterar": custo continua 70')
  await ipc(page, 'configuracoes:salvar', { ...configBase, custoAoReceber: 'medio' })
  await comprarERecebe(10, 1, 120) // webcam: estoque zerado
  verificar((await custoDe(10)) === 120, 'com estoque zerado, o custo médio é o próprio preço pago')

  // ---------- Recebimento parcial ----------
  console.log('Recebimento parcial')
  dados = (await ipc(page, 'dados:carregar')).dados
  const fone = (d) => d.produtos.find((p) => p.codigo === 'P0008') // papel A4
  const pen = (d) => d.produtos.find((p) => p.codigo === 'P0005')
  const papelAntesP = fone(dados).estoque
  const penAntesP = pen(dados).estoque
  const parcial = (await ipc(page, 'compras:salvar', null, {
    fornecedorId: 3, data: '2026-11-06', observacao: '', status: 'pedido',
    itens: [{ produtoId: fone(dados).id, quantidade: 10, valorUnitario: 22 }, { produtoId: pen(dados).id, quantidade: 4, valorUnitario: 24 }]
  })).dados
  // A compra foi criada por fora da tela: recarrega e entra de novo para a lista mostrá-la.
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  await page.getByRole('link', { name: 'Compras', exact: true }).click()
  await page.getByRole('row', { name: new RegExp(parcial.numero) }).getByRole('button', { name: 'Receber' }).click()
  await page.getByLabel(`Quantidade recebida agora de ${fone(dados).nome}`).fill('6')
  await page.getByLabel(`Quantidade recebida agora de ${pen(dados).nome}`).fill('0')
  await foto(page, '10-receber-parcial')
  await page.getByRole('button', { name: /Receber 6 un\. \(parcial\)/ }).click()
  await page.getByText(`Compra ${parcial.numero} recebida em parte`).waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  let cp = dados.compras.find((c) => c.id === parcial.id)
  verificar(cp.status === 'pedido' && fone(dados).estoque === papelAntesP + 6 && pen(dados).estoque === penAntesP, 'entrega parcial pela tela: entra só o que chegou (6 de 10)')
  verificar(cp.itens.find((i) => i.produtoId === fone(dados).id).quantidadeRecebida === 6, 'compra guarda quanto já foi recebido de cada item')
  await page.getByRole('row', { name: new RegExp(parcial.numero) }).getByText('Parcial').waitFor()
  verificar(true, 'lista mostra a compra como "Parcial"')
  r = await ipc(page, 'compras:receber', parcial.id, [{ produtoId: fone(dados).id, quantidade: 5 }])
  verificar(!r.ok && r.erro.mensagem.includes('só faltam 4'), 'não deixa receber mais do que falta')
  r = await ipc(page, 'compras:salvar', parcial.id, { fornecedorId: 3, data: '2026-11-06', observacao: '', status: 'pedido', itens: [{ produtoId: fone(dados).id, quantidade: 99, valorUnitario: 22 }] })
  verificar(!r.ok && r.erro.mensagem.includes('em parte'), 'compra recebida em parte não pode mais ser editada')
  r = await ipc(page, 'compras:excluir', parcial.id)
  verificar(!r.ok, 'compra recebida em parte não pode ser excluída')
  r = await ipc(page, 'compras:receber', parcial.id) // sem itens: recebe tudo o que falta
  dados = (await ipc(page, 'dados:carregar')).dados
  cp = dados.compras.find((c) => c.id === parcial.id)
  verificar(r.ok && cp.status === 'recebida' && fone(dados).estoque === papelAntesP + 10 && pen(dados).estoque === penAntesP + 4, 'segunda entrega completa a compra, que vira "Recebida"')
  const outra = (await ipc(page, 'compras:salvar', null, { fornecedorId: 3, data: '2026-11-06', observacao: 'Pedido urgente', status: 'pedido', itens: [{ produtoId: fone(dados).id, quantidade: 8, valorUnitario: 22 }] })).dados
  r = await ipc(page, 'compras:encerrar', outra.id)
  verificar(!r.ok, 'compra sem nada recebido não é encerrada (deve ser cancelada)')
  await ipc(page, 'compras:receber', outra.id, [{ produtoId: fone(dados).id, quantidade: 3 }])
  r = await ipc(page, 'compras:encerrar', outra.id)
  dados = (await ipc(page, 'dados:carregar')).dados
  cp = dados.compras.find((c) => c.id === outra.id)
  verificar(r.ok && cp.status === 'recebida' && cp.observacao.includes('Encerrada sem receber: 5') && fone(dados).estoque === papelAntesP + 13, 'encerrar sem o restante: fica recebida, anota o que faltou e não mexe no estoque')

  // ---------- Vendas ----------
  console.log('Vendas')
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  const mouseAntes = dados.produtos.find((p) => p.id === 1).estoque
  await page.getByRole('link', { name: 'Vendas' }).click()
  await page.getByRole('button', { name: /Nova venda/ }).click()
  const caixa = page.getByRole('dialog')
  const leitorVenda = caixa.getByLabel('Código de barras')
  await leitorVenda.fill('7891000100011')
  await leitorVenda.press('Enter')
  await leitorVenda.fill('7891000100011')
  await leitorVenda.press('Enter')
  await caixa.getByLabel('Cliente').selectOption({ label: 'João Pereira — 123.456.789-00' })
  await caixa.getByLabel('Forma de pagamento').selectOption({ label: 'Pix' })
  await caixa.getByLabel('Desconto (R$)').fill('9.80')
  await foto(page, '8-nova-venda')
  await caixa.getByRole('button', { name: /Finalizar venda/ }).click()
  await page.getByText('Venda V-0001 registrada').waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  const venda1 = dados.vendas.find((v) => v.numero === 'V-0001')
  verificar(venda1?.itens[0]?.quantidade === 2 && venda1.clienteId === 1 && venda1.formaPagamento === 'pix' && venda1.desconto === 9.8, 'venda feita pela tela: 2 leituras do código, cliente, Pix e desconto')
  verificar(dados.produtos.find((p) => p.id === 1).estoque === mouseAntes - 2, 'venda dá baixa no estoque')
  verificar(dados.movimentacoes.some((m) => m.vendaId === venda1?.id && m.tipo === 'saida' && m.motivo === 'Venda V-0001'), 'baixa aparece no histórico ligada à venda')
  await aoSalvar(join(pasta, 'recibo.pdf'))
  await page.getByRole('dialog').getByRole('button', { name: 'PDF' }).click()
  verificar((await esperarArquivo(join(pasta, 'recibo.pdf'))) && ehPdf(join(pasta, 'recibo.pdf')), 'recibo da venda salvo em PDF')
  await page.keyboard.press('Escape')

  const vendasAntes = dados.vendas.length
  const monitor = dados.produtos.find((p) => p.codigo === 'P0009')
  r = await ipc(page, 'vendas:registrar', { clienteId: null, formaPagamento: 'dinheiro', desconto: 0, observacao: '', itens: [{ produtoId: monitor.id, quantidade: monitor.estoque + 3, valorUnitario: 10 }] })
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(!r.ok && r.erro.mensagem.includes('Saldo insuficiente') && dados.vendas.length === vendasAntes, 'venda sem estoque suficiente é recusada e nada é gravado')
  r = await ipc(page, 'vendas:registrar', { clienteId: null, formaPagamento: 'dinheiro', desconto: 999, observacao: '', itens: [{ produtoId: 1, quantidade: 1, valorUnitario: 10 }] })
  verificar(!r.ok && r.erro.campo === 'desconto', 'desconto maior que o total é recusado')
  r = await ipc(page, 'clientes:excluir', 1)
  verificar(!r.ok && r.erro.mensagem.includes('vendas'), 'cliente com vendas não pode ser excluído')
  r = await ipc(page, 'vendas:cancelar', venda1.id, 'Cliente desistiu')
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(r.ok && dados.vendas.find((v) => v.id === venda1.id).status === 'cancelada' && dados.produtos.find((p) => p.id === 1).estoque === mouseAntes, 'cancelar devolve os itens ao estoque')
  r = await ipc(page, 'vendas:cancelar', venda1.id, 'De novo')
  verificar(!r.ok, 'venda já cancelada não é cancelada de novo')
  await page.getByRole('link', { name: 'Relatórios' }).click()
  await page.getByText('Faturamento').waitFor()
  verificar(true, 'relatório de vendas abre como primeira aba')

  // ---------- Inventário ----------
  console.log('Inventário')
  dados = (await ipc(page, 'dados:carregar')).dados
  const porCod = (d, c) => d.produtos.find((p) => p.codigo === c)
  const roteadorAntes = porCod(dados, 'P0007').estoque
  const ssdAntes = porCod(dados, 'P0004').estoque
  const caboAntes = porCod(dados, 'P0006').estoque
  const papelAntes = porCod(dados, 'P0008').estoque
  await page.getByRole('link', { name: 'Inventário' }).click()
  await page.getByRole('button', { name: 'Iniciar contagem' }).click()
  await page.getByRole('dialog').getByLabel('Descrição').fill('Contagem de teste')
  await page.getByRole('dialog').getByRole('button', { name: 'Iniciar' }).click()
  await page.getByText('Inventário INV-0001').waitFor()
  const leitorInv = page.getByLabel('Código de barras')
  for (let i = 0; i < 2; i++) {
    await leitorInv.fill('7891000100073') // roteador
    await leitorInv.press('Enter')
  }
  const inv = (await ipc(page, 'inventario:listar')).dados.find((i) => i.status === 'aberto')
  let det = (await ipc(page, 'inventario:obter', inv.id)).dados
  const item = (codigo) => det.lista.find((i) => i.produtoId === porCod(dados, codigo).id)
  await page.getByLabel(`Quantidade contada de ${porCod(dados, 'P0004').nome}`).fill(String(ssdAntes - 2))
  await page.getByLabel(`Quantidade contada de ${porCod(dados, 'P0004').nome}`).press('Enter')
  await ipc(page, 'inventario:contar', item('P0006').id, caboAntes)
  await foto(page, '9-inventario')
  r = await ipc(page, 'inventario:abrir', { descricao: 'Outro', categoriaId: null })
  verificar(!r.ok && r.erro.mensagem.includes('ainda está aberto'), 'só um inventário aberto por vez')
  await new Promise((r) => setTimeout(r, 500))
  det = (await ipc(page, 'inventario:obter', inv.id)).dados
  verificar(item('P0007').contado === 2, 'duas leituras do código somam 2 na contagem')
  verificar(item('P0004').contado === ssdAntes - 2 && det.contados === 3, 'quantidade digitada é gravada (3 produtos contados)')
  await page.getByRole('button', { name: 'Concluir inventário' }).click()
  await page.getByRole('button', { name: 'Concluir e ajustar estoque' }).click()
  await page.getByText('INV-0001 concluído').waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(porCod(dados, 'P0007').estoque === 2 && porCod(dados, 'P0004').estoque === ssdAntes - 2, `estoque ajustado para o contado (roteador ${roteadorAntes} → 2, SSD ${ssdAntes} → ${ssdAntes - 2})`)
  verificar(porCod(dados, 'P0006').estoque === caboAntes && porCod(dados, 'P0008').estoque === papelAntes, 'produto sem diferença e produto não contado ficam como estavam')
  verificar(dados.movimentacoes.filter((m) => m.motivo === 'Inventário INV-0001').length === 2, 'um ajuste por produto com diferença, ligado ao inventário')
  await page.getByText('Diferença (custo)').waitFor()
  verificar(true, 'relatório de diferenças aparece ao concluir')
  r = await ipc(page, 'inventario:contar', item('P0006').id, 1)
  verificar(!r.ok, 'inventário concluído não aceita novas contagens')
  const inv2 = (await ipc(page, 'inventario:abrir', { descricao: 'Para cancelar', categoriaId: null })).dados
  r = await ipc(page, 'inventario:cancelar', inv2.id)
  verificar(r.ok && (await ipc(page, 'inventario:listar')).dados.find((i) => i.id === inv2.id).status === 'cancelado', 'inventário pode ser cancelado sem ajustar nada')

  // ---------- Estorno de movimentação ----------
  console.log('Estorno de movimentação')
  dados = (await ipc(page, 'dados:carregar')).dados
  const mon = (d) => d.produtos.find((p) => p.codigo === 'P0003')
  const monAntes = mon(dados).estoque
  await ipc(page, 'estoque:movimentar', { produtoId: mon(dados).id, tipo: 'saida', quantidade: 1, motivo: 'Lançado errado' })
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  await page.getByRole('link', { name: 'Movimentações' }).click()
  await page.getByPlaceholder('Produto, código ou motivo...').fill('Lançado errado')
  await page.getByRole('row', { name: /Lançado errado/ }).getByRole('button', { name: 'Estornar' }).click()
  await page.getByLabel('Motivo do estorno').fill('Produto errado')
  await page.getByRole('dialog').getByRole('button', { name: 'Estornar' }).click()
  await page.getByText('Movimentação estornada').waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  const errada = dados.movimentacoes.find((m) => m.motivo === 'Lançado errado')
  const estorno = dados.movimentacoes.find((m) => m.estornoDe === errada.id)
  verificar(mon(dados).estoque === monAntes && estorno?.tipo === 'entrada' && estorno.motivo === 'Estorno: Lançado errado — Produto errado', 'estorno pela tela devolve o estoque e fica ligado à original')
  await page.getByText('Estornada').first().waitFor()
  verificar(true, 'histórico marca a original como "Estornada"')
  r = await ipc(page, 'estoque:estornar', errada.id, 'De novo')
  verificar(!r.ok && r.erro.mensagem.includes('já foi estornada'), 'a mesma movimentação não é estornada duas vezes')
  r = await ipc(page, 'estoque:estornar', estorno.id, 'Desfazer o estorno')
  verificar(!r.ok && r.erro.mensagem.includes('não pode ser estornado'), 'um estorno não pode ser estornado')
  r = await ipc(page, 'estoque:estornar', dados.movimentacoes.find((m) => m.vendaId).id, 'Teste')
  verificar(!r.ok && r.erro.mensagem.includes('cancele a venda'), 'movimento de venda é desfeito cancelando a venda, não por estorno')
  r = await ipc(page, 'estoque:estornar', dados.movimentacoes.find((m) => m.compraId).id, 'Teste')
  verificar(!r.ok && r.erro.mensagem.includes('compra'), 'recebimento de compra não pode ser estornado')
  const quatroK = (d) => d.produtos.find((p) => p.codigo === 'P0009')
  await ipc(page, 'estoque:movimentar', { produtoId: quatroK(dados).id, tipo: 'entrada', quantidade: 5, motivo: 'Entrada para teste' })
  dados = (await ipc(page, 'dados:carregar')).dados
  await ipc(page, 'estoque:movimentar', { produtoId: quatroK(dados).id, tipo: 'saida', quantidade: quatroK(dados).estoque, motivo: 'Saída total' })
  dados = (await ipc(page, 'dados:carregar')).dados
  r = await ipc(page, 'estoque:estornar', dados.movimentacoes.find((m) => m.motivo === 'Entrada para teste').id, 'Teste')
  verificar(!r.ok && r.erro.mensagem.includes('Não há saldo'), 'estorno que deixaria o estoque negativo é recusado')

  // ---------- Backup externo ----------
  console.log('Backup fora do computador')
  verificar((await ipc(page, 'backupExterno:estado')).dados.pasta === null, 'começa sem backup externo configurado')
  await aoAbrir(pasta)
  r = await ipc(page, 'backupExterno:escolherPasta')
  verificar(!r.ok && r.erro.mensagem.includes('fora da pasta do sistema'), 'pasta do próprio sistema é recusada')
  await aoAbrir(join(externa, 'nao-existe'))
  r = await ipc(page, 'backupExterno:escolherPasta')
  verificar(!r.ok && r.erro.mensagem.includes('não foi encontrada'), 'pasta inexistente (pendrive desconectado) é recusada')
  await aoAbrir(externa)
  r = await ipc(page, 'backupExterno:escolherPasta')
  const subpasta = join(externa, 'Gestor de Estoque - backups')
  verificar(r.ok && r.dados.arquivos === 1 && existsSync(subpasta), 'pasta externa configurada e primeira cópia feita')
  r = await ipc(page, 'backupExterno:fazerAgora')
  verificar(r.ok && r.dados.arquivos === 2 && !r.dados.ultimoErro, '"Fazer cópia agora" grava outra cópia')
  verificar((await ipc(page, 'auth:avisos')).dados.backupExternoAtrasado === null, 'com cópia recente, nenhum aviso')
  rmSync(externa, { recursive: true, force: true }) // pendrive removido
  r = await ipc(page, 'backupExterno:fazerAgora')
  verificar(!r.ok && (await ipc(page, 'backupExterno:estado')).dados.ultimoErro?.includes('conectado'), 'sem o pendrive, a cópia falha e o erro fica registrado')
  const arquivoLocal = join(pasta, 'config-local.json')
  const cfg = JSON.parse(readFileSync(arquivoLocal, 'utf8'))
  cfg.backupExterno.ultimoEm = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
  writeFileSync(arquivoLocal, JSON.stringify(cfg))
  verificar((await ipc(page, 'auth:avisos')).dados.backupExternoAtrasado === 8, 'oito dias sem cópia externa: o administrador é avisado')
  r = await ipc(page, 'backupExterno:desativar')
  verificar(r.ok && r.dados.pasta === null && (await ipc(page, 'auth:avisos')).dados.backupExternoAtrasado === null, 'desativar remove a configuração e o aviso')

  // ---------- Fase 3: relatórios, etiquetas, Excel e backup ----------
  console.log('Relatórios, etiquetas, Excel e backup')
  const arq = (nome) => join(pasta, nome)
  // As chamadas IPC diretas acima não atualizam a cópia de dados da tela: recarrega e entra de novo.
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()

  await page.getByRole('link', { name: 'Relatórios' }).click()
  await page.getByRole('tab', { name: /Posição de estoque/ }).click()
  await page.getByText('Valor a preço de custo').waitFor()
  await foto(page, '4-relatorio')
  await aoSalvar(arq('posicao.pdf'))
  await page.getByRole('button', { name: 'PDF' }).click()
  verificar((await esperarArquivo(arq('posicao.pdf'))) && ehPdf(arq('posicao.pdf')), 'relatório de posição de estoque salvo em PDF')

  await page.getByRole('tab', { name: /Sugestão de compra/ }).click()
  await page.getByText('Investimento estimado').waitFor()
  verificar(await page.getByRole('cell', { name: 'Pendrive 64GB' }).count() === 0, 'sugestão de compra não lista produto já reposto (pendrive)')

  await page.getByRole('link', { name: 'Produtos' }).click()
  await page.getByRole('button', { name: 'Etiquetas' }).click()
  const leitor = page.getByRole('dialog').getByLabel('Código de barras')
  await leitor.fill('7891000100011')
  await leitor.press('Enter')
  await leitor.fill('7891000100011')
  await leitor.press('Enter')
  await page.getByRole('dialog').getByText('2 etiqueta(s)').waitFor()
  verificar(true, 'leitor de código de barras adiciona produto (2 leituras = 2 etiquetas)')
  await foto(page, '5-etiquetas')
  await aoSalvar(arq('etiquetas.pdf'))
  await page.getByRole('button', { name: 'Salvar PDF' }).click()
  verificar((await esperarArquivo(arq('etiquetas.pdf'))) && ehPdf(arq('etiquetas.pdf')), 'etiquetas com código de barras salvas em PDF')
  await page.keyboard.press('Escape')

  await aoSalvar(arq('produtos.xlsx'))
  await page.getByRole('button', { name: 'Excel' }).click()
  await esperarArquivo(arq('produtos.xlsx'))
  const wbExp = new ExcelJS.Workbook()
  await wbExp.xlsx.readFile(arq('produtos.xlsx'))
  verificar(wbExp.worksheets[0].rowCount === 12, `Excel exportado com cabeçalho + 11 produtos (${wbExp.worksheets[0].rowCount} linhas)`)

  await aoSalvar(arq('modelo.xlsx'))
  r = await ipc(page, 'excel:modelo', 'produtos')
  verificar(r.ok && existsSync(arq('modelo.xlsx')), 'modelo de importação gerado')

  // Planilha de importação: 1 novo (com categoria nova), 1 atualização, 1 inválido.
  const wbImp = new ExcelJS.Workbook()
  const ws = wbImp.addWorksheet('Produtos')
  ws.addRow(['Código *', 'Nome *', 'Categoria *', 'Unidade *', 'Preço de custo *', 'Preço de venda *', 'Estoque inicial'])
  ws.addRow(['P0900', 'Cadeira gamer', 'Móveis', 'UN', '500,00', 899.9, 3])
  ws.addRow(['p0001', 'Mouse USB Óptico', 'Periféricos', 'un', 28.5, 54.9, 99])
  ws.addRow(['P0901', 'Item com unidade errada', 'Periféricos', 'XX', 1, 2, null])
  await wbImp.xlsx.writeFile(arq('importar.xlsx'))
  await aoAbrir(arq('importar.xlsx'))
  r = await ipc(page, 'excel:previa', 'produtos')
  const prev = r.dados
  verificar(r.ok && prev.criar === 1 && prev.atualizar === 1 && prev.erros === 1, `prévia: 1 novo, 1 atualização, 1 erro (${prev && [prev.criar, prev.atualizar, prev.erros]})`)
  verificar(prev?.linhas.find((l) => l.linha === 4)?.erro?.includes('XX'), 'prévia explica o erro da linha 4')
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(!dados.produtos.some((p) => p.codigo === 'P0900'), 'prévia não grava nada no banco')
  r = await ipc(page, 'excel:importar', prev.token)
  verificar(r.ok && r.dados.criados === 1 && r.dados.atualizados === 1 && r.dados.ignorados === 1, 'importação grava as linhas válidas')
  dados = (await ipc(page, 'dados:carregar')).dados
  const cadeira = dados.produtos.find((p) => p.codigo === 'P0900')
  const mouse = dados.produtos.find((p) => p.id === 1)
  verificar(cadeira?.estoque === 3 && dados.categorias.some((c) => c.nome === 'Móveis'), 'produto novo com estoque inicial e categoria criada')
  verificar(mouse?.nome === 'Mouse USB Óptico' && mouse?.estoque === 18, 'produto existente atualizado sem mexer no estoque')
  r = await ipc(page, 'excel:importar', prev.token)
  verificar(!r.ok, 'a mesma prévia não pode ser importada duas vezes')

  // Backup e restauração
  r = await ipc(page, 'backup:listar')
  verificar(r.ok && r.dados.some((b) => b.automatico), 'backup automático criado ao abrir o app')
  await aoSalvar(arq('manual.sqlite'))
  r = await ipc(page, 'backup:criar')
  verificar(r.ok && existsSync(arq('manual.sqlite')), 'backup manual salvo')
  await ipc(page, 'categorias:salvar', null, { nome: 'Depois do backup', descricao: '' })
  writeFileSync(arq('lixo.sqlite'), 'isto não é um banco')
  await aoAbrir(arq('lixo.sqlite'))
  r = await ipc(page, 'backup:restaurar', null)
  verificar(!r.ok && r.erro.tipo === 'negocio', 'arquivo inválido é recusado na restauração')
  r = await ipc(page, 'backup:restaurar', arq('lixo.sqlite'))
  verificar(!r.ok, 'caminho fora da pasta de backups é recusado')
  await aoAbrir(arq('manual.sqlite'))
  r = await ipc(page, 'backup:restaurar', null)
  verificar(r.ok && r.dados === true, 'backup restaurado')
  r = await ipc(page, 'dados:carregar')
  verificar(!r.ok && r.erro.tipo === 'permissao', 'restauração encerra a sessão')
  await ipc(page, 'auth:entrar', 'admin', 'admin123')
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(!dados.categorias.some((c) => c.nome === 'Depois do backup') && dados.produtos.some((p) => p.codigo === 'P0900'), 'dados voltaram ao estado do backup')
  r = await ipc(page, 'backup:listar')
  verificar(r.dados.some((b) => b.nome.startsWith('antes-da-restauracao')), 'cópia de segurança feita antes de restaurar')

  // Permissões checadas no processo principal
  await ipc(page, 'auth:sair')
  r = await ipc(page, 'dados:carregar')
  verificar(!r.ok && r.erro.tipo === 'permissao', 'sem sessão, nada é lido do banco')
  await ipc(page, 'auth:entrar', 'operador', 'operador123')
  r = await ipc(page, 'usuarios:salvar', null, { nome: 'X', email: 'x@x.com', login: 'invasor', senha: '123456', perfil: 'admin', ativo: true })
  verificar(!r.ok && r.erro.tipo === 'permissao', 'operador não consegue criar usuário nem chamando o IPC direto')
  r = await ipc(page, 'compras:receber', 1)
  verificar(!r.ok && r.erro.tipo === 'permissao', 'operador não consegue receber compra')
  r = await ipc(page, 'vendas:registrar', { clienteId: null, formaPagamento: 'dinheiro', desconto: 0, observacao: '', itens: [{ produtoId: 1, quantidade: 1, valorUnitario: 49.9 }] })
  verificar(r.ok, 'operador pode vender')
  r = await ipc(page, 'vendas:cancelar', r.dados.id, 'Teste')
  verificar(!r.ok && r.erro.tipo === 'permissao', 'operador não pode cancelar venda')
  const inv3 = (await ipc(page, 'inventario:abrir', { descricao: 'Operador', categoriaId: null }))
  verificar(inv3.ok, 'operador pode abrir e contar inventário')
  r = await ipc(page, 'inventario:concluir', inv3.dados.id, { naoContadosZero: false })
  verificar(!r.ok && r.erro.tipo === 'permissao', 'operador não pode concluir inventário (ajustar estoque)')
  r = await ipc(page, 'estoque:estornar', 1, 'Teste')
  verificar(!r.ok && r.erro.tipo === 'permissao', 'operador não pode estornar movimentação')

  await app.close()

  console.log('2ª execução (mesmo banco: os dados precisam continuar lá)')
  ;({ app, page } = await abrir())
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(dados.produtos.some((p) => p.nome === 'Hub USB 4 portas'), 'produto criado continua após reiniciar')
  verificar(dados.compras.find((c) => c.id === 6)?.status === 'recebida', 'compra recebida continua recebida')
  verificar(dados.produtos.length === 12, 'seed não roda de novo em banco existente')
  await page.getByRole('link', { name: 'Movimentações' }).click()
  await page.getByPlaceholder('Produto, código ou motivo...').fill('C-0006')
  await page.getByText('Compra C-0006').first().waitFor()
  await foto(page, '3-movimentacoes')

  console.log('Recuperação de acesso')
  r = await ipc(page, 'auth:avisos')
  verificar(r.ok && r.dados.senhaPadrao && r.dados.semCodigoRecuperacao, 'admin com senha padrão e sem código recebe os dois avisos')
  await page.getByText('Você está usando a senha padrão').waitFor()
  verificar(true, 'faixa de aviso aparece na tela')
  const codigo = (await ipc(page, 'recuperacao:gerar')).dados
  verificar(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(codigo), `código gerado no formato XXXX-XXXX-XXXX-XXXX (${codigo})`)
  verificar((await ipc(page, 'recuperacao:estado')).dados.existe, 'sistema registra que existe um código')
  await ipc(page, 'auth:sair')
  r = await ipc(page, 'auth:recuperar', 'operador', codigo, 'nova-senha-1')
  verificar(!r.ok, 'código não serve para redefinir senha de quem não é administrador')
  r = await ipc(page, 'auth:recuperar', 'admin', 'AAAA-BBBB-CCCC-DDDD', 'nova-senha-1')
  verificar(!r.ok && r.erro.campo === 'codigo', 'código errado é recusado')

  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click()
  await page.getByLabel('Login do administrador').fill('admin')
  await page.getByLabel('Código de recuperação').fill(codigo.toLowerCase().replaceAll('-', ' ')) // digitado de qualquer jeito
  await page.getByLabel(/^Nova senha/).fill('nova-senha-1')
  await page.getByLabel(/^Confirmar nova senha/).fill('nova-senha-1')
  await foto(page, '6-recuperar-senha')
  await page.getByRole('button', { name: 'Redefinir senha' }).click()
  await page.getByText('Senha redefinida.').waitFor()
  verificar(true, '"Esqueci minha senha" redefine a senha do administrador pela tela de login')
  verificar(!(await ipc(page, 'auth:entrar', 'admin', 'admin123')).ok, 'senha antiga deixa de funcionar')
  verificar((await ipc(page, 'auth:entrar', 'admin', 'nova-senha-1')).ok, 'nova senha funciona')
  verificar(!(await ipc(page, 'recuperacao:estado')).dados.existe, 'código usado é descartado')
  r = await ipc(page, 'auth:avisos')
  verificar(!r.dados.senhaPadrao && r.dados.semCodigoRecuperacao, 'aviso de senha padrão some; o de criar novo código continua')
  await ipc(page, 'auth:sair')
  r = await ipc(page, 'auth:recuperar', 'admin', codigo, 'outra-senha')
  verificar(!r.ok, 'o mesmo código não funciona duas vezes')
  for (let i = 0; i < 4; i++) await ipc(page, 'auth:recuperar', 'admin', 'AAAA-BBBB-CCCC-DDDD', 'outra-senha')
  r = await ipc(page, 'auth:recuperar', 'admin', 'AAAA-BBBB-CCCC-DDDD', 'outra-senha')
  verificar(!r.ok && r.erro.mensagem.includes('Muitas tentativas'), 'depois de 5 tentativas erradas, bloqueia por um tempo')

  console.log('Zerar dados')
  await ipc(page, 'auth:entrar', 'admin', 'nova-senha-1')
  const unidadesAntes = (await ipc(page, 'dados:carregar')).dados.unidades.length
  r = await ipc(page, 'sistema:zerarDados', { manterUsuarios: false, restaurarEmpresa: true, confirmacao: 'apagar' })
  verificar(!r.ok && r.erro.campo === 'confirmacao', 'sem digitar ZERAR, nada é apagado')
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'nova-senha-1')
  await page.getByRole('link', { name: 'Configurações' }).click()
  await page.getByRole('button', { name: 'Zerar dados...' }).click()
  await page.getByLabel('Para confirmar, digite ZERAR').fill('zerar')
  await foto(page, '7-zerar')
  await page.getByRole('button', { name: 'Zerar agora' }).click()
  await page.getByText('Dados zerados.').waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(
    dados.produtos.length === 0 && dados.compras.length === 0 && dados.movimentacoes.length === 0 && dados.categorias.length === 0 && dados.fornecedores.length === 0 && dados.clientes.length === 0,
    'produtos, estoque, compras e cadastros apagados'
  )
  verificar(dados.unidades.length === unidadesAntes, 'unidades de medida mantidas')
  verificar(dados.usuarios.length === 1 && dados.usuarios[0].login === 'admin', 'fica só o administrador que zerou')
  verificar(dados.configuracoes.nomeEmpresa === 'Minha Empresa', 'dados da empresa voltam ao padrão')
  verificar((await ipc(page, 'backup:listar')).dados.some((b) => b.nome.startsWith('antes-de-zerar')), 'backup feito antes de zerar')
  const cat = (await ipc(page, 'categorias:salvar', null, { nome: 'Minha categoria', descricao: '' })).dados
  r = await ipc(page, 'produtos:salvar', null, {
    codigo: 'P0001', codigoBarras: '', nome: 'Meu primeiro produto', categoriaId: cat.id, unidadeId: dados.unidades[0].id,
    precoCusto: 5, precoVenda: 9, estoque: 10, estoqueMinimo: 2, ativo: true
  })
  verificar(r.ok && r.dados.id === 1, 'depois de zerar, o primeiro produto cadastrado começa do código e id 1')
  await app.close()
} catch (e) {
  falhas++
  console.error('  ✗ erro durante o teste:', e.message)
} finally {
  await app?.close().catch(() => undefined)
  try {
    rmSync(pasta, { recursive: true, force: true })
    rmSync(externa, { recursive: true, force: true })
  } catch {
    console.warn(`  (não consegui apagar ${pasta})`)
  }
}

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)

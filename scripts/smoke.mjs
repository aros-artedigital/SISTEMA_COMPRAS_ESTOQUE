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

/** Escolhe uma opção num campo de seleção com busca (a lista abre por cima da tela). */
async function escolher(campo, opcao) {
  await campo.click()
  await campo.page().getByRole('option', { name: opcao, exact: true }).click()
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
const fmt = (n) => new Intl.NumberFormat('pt-BR').format(n)

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
  if (!saida) return
  // A foto é só para conferência visual: se a captura demorar (máquina ocupada), avisa e segue o teste.
  await page.screenshot({ path: join(saida, `${nome}.png`), timeout: 15000 }).catch((e) => console.log(`  (foto ${nome} não capturada: ${e.message.split(/\r?\n/)[0]})`))
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
  await escolher(page.getByLabel('Categoria'), 'Periféricos')
  await escolher(page.getByLabel('Unidade de medida'), 'UN — Unidade')
  await page.getByLabel('Preço de custo (R$)').fill('35')
  await page.getByLabel('Preço de venda (R$)').fill('59.9')
  await page.getByLabel('Estoque inicial').fill('7')
  await foto(page, '2-novo-produto')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.getByText('Produto cadastrado.').waitFor()
  await page.getByPlaceholder('Pesquisar por nome').fill('hub')
  await page.getByRole('cell', { name: 'Hub USB 4 portas', exact: true }).waitFor()
  verificar(true, 'produto cadastrado pelo formulário aparece na lista')

  // Código duplicado volta como erro no campo
  await page.getByRole('button', { name: 'Novo Produto' }).click()
  await page.getByLabel(/^Código \*$/).fill('P0001')
  await page.getByLabel('Nome').fill('Duplicado')
  await escolher(page.getByLabel('Categoria'), 'Periféricos')
  await escolher(page.getByLabel('Unidade de medida'), 'UN — Unidade')
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
  await escolher(caixa.getByLabel('Cliente'), 'João Pereira — 123.456.789-00')
  await escolher(caixa.getByLabel('Forma de pagamento'), 'Pix')
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

  // ---------- Ficha do produto ----------
  console.log('Ficha do produto')
  dados = (await ipc(page, 'dados:carregar')).dados
  const mouseFicha = dados.produtos.find((p) => p.id === 1)
  const movsMouse = dados.movimentacoes.filter((m) => m.produtoId === 1).length
  const comprasMouse = dados.compras.filter((c) => c.itens.some((i) => i.produtoId === 1)).length
  const vendasMouse = dados.vendas.filter((v) => v.itens.some((i) => i.produtoId === 1)).length
  await page.getByRole('link', { name: 'Produtos' }).click()
  await page.getByPlaceholder('Pesquisar por nome, código ou código de barras...').fill('P0001')
  await page.getByRole('row', { name: /P0001/ }).getByRole('button', { name: 'Ficha' }).click()
  const ficha = page.getByRole('dialog', { name: `P0001 — ${mouseFicha.nome}` })
  await ficha.waitFor()
  verificar(await ficha.getByRole('tab', { name: `Movimentações ${movsMouse}` }).count() === 1, `ficha mostra as ${movsMouse} movimentações do produto`)
  verificar(
    (await ficha.getByRole('tab', { name: `Compras ${comprasMouse}` }).count()) === 1 && (await ficha.getByRole('tab', { name: `Vendas ${vendasMouse}` }).count()) === 1,
    `ficha conta ${comprasMouse} compra(s) e ${vendasMouse} venda(s) do produto`
  )
  verificar(await ficha.getByText(`${fmt(mouseFicha.estoque)} UN`).first().isVisible(), 'saldo atual aparece nos indicadores')
  verificar(await ficha.getByRole('img', { name: 'Saldo do produto ao longo do tempo' }).count() === 1, 'gráfico do saldo ao longo do tempo aparece')
  await ficha.getByRole('tab', { name: /Vendas/ }).click()
  await ficha.getByText('V-0001').waitFor()
  await ficha.getByRole('tab', { name: /Movimentações/ }).click()
  await foto(page, '11-ficha-produto')
  await aoSalvar(join(pasta, 'ficha.pdf'))
  await ficha.getByRole('button', { name: 'PDF' }).click()
  verificar((await esperarArquivo(join(pasta, 'ficha.pdf'))) && ehPdf(join(pasta, 'ficha.pdf')), 'histórico do produto (kardex) salvo em PDF')
  await page.keyboard.press('Escape')

  // ---------- Auditoria ----------
  console.log('Auditoria')
  const reais = (v) => v.toFixed(2).replace('.', ',')
  const mouseAud = dados.produtos.find((p) => p.id === 1)
  r = await ipc(page, 'produtos:salvar', 1, { ...mouseAud, precoVenda: 54.9, estoqueMinimo: mouseAud.estoqueMinimo + 1 })
  verificar(r.ok, 'alteração de preço salva')
  let aud = (await ipc(page, 'auditoria:listar', { acao: 'Alteração', entidade: 'Produto' })).dados
  const regPreco = aud.itens[0]
  const campoPreco = regPreco?.alteracoes.find((a) => a.campo === 'Preço de venda')
  verificar(
    regPreco?.usuario === 'Administrador' && regPreco.descricao.includes('P0001') && campoPreco?.de.includes(reais(mouseAud.precoVenda)) && campoPreco?.para.includes('54,90'),
    `troca de preço registrada com antes → depois (${campoPreco?.de} → ${campoPreco?.para})`
  )
  verificar(regPreco?.alteracoes.length === 2 && regPreco.alteracoes.some((a) => a.campo === 'Estoque mínimo'), 'só os campos que mudaram entram no registro')
  r = await ipc(page, 'produtos:salvar', 1, { ...mouseAud, precoVenda: 54.9, estoqueMinimo: mouseAud.estoqueMinimo + 1 })
  verificar((await ipc(page, 'auditoria:listar', { acao: 'Alteração', entidade: 'Produto' })).dados.total === aud.total, 'salvar sem mudar nada não gera registro')
  const catAud = (await ipc(page, 'categorias:salvar', null, { nome: 'Categoria auditada', descricao: '' })).dados
  await ipc(page, 'categorias:excluir', catAud.id)
  aud = (await ipc(page, 'auditoria:listar', { entidade: 'Categoria' })).dados
  verificar(aud.itens[0]?.acao === 'Exclusão' && aud.itens[0].descricao === 'Categoria Categoria auditada' && aud.itens[1]?.acao === 'Inclusão', 'inclusão e exclusão de cadastro registradas')
  r = await ipc(page, 'auth:entrar', 'admin', 'senha-errada')
  aud = (await ipc(page, 'auditoria:listar', { acao: 'Login recusado' })).dados
  verificar(!r.ok && aud.itens[0]?.usuario === 'admin' && aud.itens[0].descricao.includes('inválidos'), 'tentativa de login com senha errada registrada')
  aud = (await ipc(page, 'auditoria:listar', {})).dados
  verificar(['Cancelamento', 'Estorno', 'Conclusão', 'Recebimento parcial', 'Encerramento', 'Login'].every((a) => aud.itens.some((i) => i.acao === a)), 'cancelamento de venda, estorno, inventário e compras registrados')
  verificar(aud.itens.find((i) => i.acao === 'Estorno')?.descricao.includes('Motivo: Produto errado'), 'estorno registrado com o motivo')
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByRole('link', { name: 'Auditoria' }).click()
  await page.getByPlaceholder('Buscar na descrição ou nos valores...').fill('54,90')
  await page.getByText('Entrou no sistema').first().waitFor({ state: 'detached' })
  verificar(
    (await page.getByText('Preço de venda:').first().isVisible()) && (await page.getByText('1 registro(s)').isVisible()),
    'tela de Auditoria mostra e filtra os registros (busca pelo valor novo)'
  )
  await foto(page, '12-auditoria')
  await aoSalvar(join(pasta, 'auditoria.pdf'))
  await page.getByRole('button', { name: 'PDF' }).click()
  verificar((await esperarArquivo(join(pasta, 'auditoria.pdf'))) && ehPdf(join(pasta, 'auditoria.pdf')), 'auditoria exportada em PDF')

  // ---------- Atalhos de teclado e tema ----------
  console.log('Atalhos de teclado e modo escuro')
  await page.keyboard.press('Control+3')
  await page.getByRole('heading', { name: 'Produtos', exact: true }).waitFor()
  verificar(true, 'Ctrl+3 abre Produtos')
  await page.keyboard.press('Control+f')
  verificar(await page.evaluate(() => document.activeElement?.getAttribute('type') === 'search'), 'Ctrl+F vai para a busca da tela')
  await page.keyboard.press('Control+n')
  await page.getByRole('dialog', { name: 'Novo produto' }).waitFor()
  verificar(true, 'Ctrl+N abre o cadastro de novo produto')
  await page.keyboard.press('Control+6')
  verificar((await page.getByRole('heading', { name: 'Compras', exact: true }).count()) === 0, 'com uma janela aberta, os atalhos de tela ficam desligados')
  await page.keyboard.press('Escape')
  await page.keyboard.press('F2')
  await page.getByRole('dialog', { name: 'Nova venda' }).waitFor()
  verificar(true, 'F2 em outra tela abre uma nova venda')
  await page.keyboard.press('Escape')
  await page.keyboard.press('F1')
  await page.getByRole('dialog', { name: 'Atalhos de teclado' }).waitFor()
  verificar(true, 'F1 mostra a lista de atalhos')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+Shift+D')
  const escuro = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  const fundo = await page.evaluate(() => getComputedStyle(document.querySelector('main').parentElement.parentElement).backgroundColor)
  verificar(escuro && fundo === 'rgb(13, 20, 33)', `Ctrl+Shift+D liga o modo escuro (fundo ${fundo})`)
  await foto(page, '13-modo-escuro')
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  verificar(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'tema escolhido continua depois de reabrir')
  await entrar(page, 'admin', 'admin123')
  await page.getByRole('button', { name: 'Tema da tela' }).click()
  await page.getByRole('menuitemradio', { name: 'Claro' }).click()
  verificar(!(await page.evaluate(() => document.documentElement.classList.contains('dark'))), 'menu de tema volta para o claro')
  await page.getByRole('menuitemradio', { name: /Grande/ }).click()
  verificar((await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)) === '18px', 'letra grande aumenta o tamanho da tela inteira')
  await page.getByRole('menuitemradio', { name: /Normal/ }).click()
  await page.keyboard.press('Escape')

  // ---------- Aparência: título único, ícones, janela azul, temas ----------
  console.log('Aparência e temas')
  await page.keyboard.press('Control+4')
  await page.getByRole('heading', { name: 'Movimentações de Estoque' }).waitFor()
  verificar((await page.getByText('Movimentações de Estoque', { exact: true }).count()) === 1, 'título da tela aparece uma vez só (sem repetir na barra superior)')
  verificar((await page.locator('main h1').locator('xpath=../..').locator('svg').count()) === 1, 'título da tela tem ícone')
  await page.keyboard.press('Control+n')
  const barra = await page.getByRole('dialog').locator('div').first().evaluate((e) => getComputedStyle(e).backgroundColor)
  verificar(barra === 'rgb(37, 99, 235)', `barra da janela em azul (${barra})`)
  await page.keyboard.press('Escape')
  const principal = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c-blue-600').trim())
  const corMenu = () => page.evaluate(() => getComputedStyle(document.querySelector('aside')).backgroundColor)
  const menuAntes = await corMenu()
  await page.getByRole('link', { name: 'Configurações' }).click()
  verificar(await page.getByRole('tab', { name: 'Dados da empresa' }).getAttribute('aria-selected') === 'true', 'Configurações abrem na aba Dados da empresa')
  await page.getByRole('tab', { name: 'Aparência' }).click()
  await page.getByRole('radio', { name: 'Verde floresta' }).click()
  verificar((await principal()) !== '37 99 235' && (await corMenu()) !== menuAntes, 'escolher um tema muda as cores na hora (prévia)')
  await page.getByRole('link', { name: 'Produtos' }).click()
  verificar((await corMenu()) === menuAntes, 'sair sem salvar volta às cores salvas')
  await page.getByRole('link', { name: 'Configurações' }).click()
  await page.getByRole('tab', { name: 'Aparência' }).click()
  await page.getByRole('radio', { name: 'Personalizado' }).click()
  await page.getByRole('textbox', { name: 'Cor principal', exact: true }).fill('#ff8800')
  await page.getByRole('textbox', { name: 'Cor secundária', exact: true }).fill('#f0f0f0')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await page.getByText('Configurações salvas.').waitFor()
  const cfgTema = (await ipc(page, 'dados:carregar')).dados.configuracoes
  verificar(cfgTema.tema === 'personalizado' && cfgTema.corPrincipal === '#ff8800' && cfgTema.corSecundaria === '#f0f0f0', 'tema personalizado salvo nas configurações')
  const [r6, g6, b6] = (await principal()).split(' ').map(Number)
  const menuRgb = (await corMenu()).match(/\d+/g).map(Number)
  verificar(r6 > g6 && g6 > b6 && r6 < 255, `cor clara demais é escurecida para o texto branco ficar legível (${r6} ${g6} ${b6})`)
  verificar(menuRgb.every((v) => v < 120), `menu lateral claro demais é escurecido (${menuRgb.join(' ')})`)
  await foto(page, '14-tema-personalizado')
  aud = (await ipc(page, 'auditoria:listar', { entidade: 'Configurações' })).dados
  verificar(aud.itens[0]?.alteracoes.some((a) => a.campo === 'Tema de cores' && a.para === 'Personalizado'), 'troca de tema registrada na auditoria')
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  verificar((await principal()) === `${r6} ${g6} ${b6}`, 'tela de login já abre com as cores da empresa')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  r = await ipc(page, 'configuracoes:salvar', { ...cfgTema, tema: 'azul' })
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  verificar(r.ok && (await principal()) === '37 99 235', 'voltar ao tema Azul clássico restaura as cores originais')

  // ---------- Formulários: máscaras, CEP, seleção com busca, mensagens ----------
  console.log('Formulários (máscaras, CEP, busca, mensagens)')
  // ViaCEP simulado no processo principal: o teste não depende de internet.
  await app.evaluate(() => {
    globalThis.fetch = async (url) => {
      const cep = String(url).match(/ws\/(\d{8})/)?.[1]
      if (cep === '99999999') throw new Error('offline')
      const corpo =
        cep === '01310100'
          ? { cep: '01310-100', logradouro: 'Avenida Paulista', complemento: 'de 612 a 1510 - lado par', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' }
          : { erro: true }
      return new Response(JSON.stringify(corpo), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  })
  await page.keyboard.press('Control+8')
  await page.getByRole('heading', { name: 'Clientes', exact: true }).waitFor()
  await page.keyboard.press('Control+n')
  const janelaCli = page.getByRole('dialog', { name: 'Novo cliente' })
  await janelaCli.waitFor()
  await janelaCli.getByRole('button', { name: 'Salvar' }).click()
  await page.getByText(/Verifique os \d+ campos destacados/).waitFor()
  verificar(true, 'salvar com campos obrigatórios vazios mostra aviso além de destacar os campos')
  await janelaCli.getByLabel('CPF').fill('52998224725')
  verificar((await janelaCli.getByLabel('CPF').inputValue()) === '529.982.247-25', 'CPF recebe máscara ao digitar')
  await janelaCli.getByLabel('Nome completo').fill('Cliente com CEP')
  await janelaCli.getByLabel('Telefone', { exact: true }).fill('11987654321')
  verificar((await janelaCli.getByLabel('Telefone', { exact: true }).inputValue()) === '(11) 98765-4321', 'telefone recebe máscara ao digitar')
  await janelaCli.getByLabel('CEP', { exact: true }).fill('00000000')
  await janelaCli.getByText('CEP não encontrado.').waitFor()
  verificar(true, 'CEP inexistente avisa sem travar o formulário')
  await janelaCli.getByLabel('CEP', { exact: true }).fill('99999999')
  await janelaCli.getByText(/sem internet/).waitFor()
  verificar(true, 'sem internet, avisa para preencher o endereço à mão')
  await janelaCli.getByLabel('CEP', { exact: true }).fill('01310100')
  await janelaCli.getByText('Endereço encontrado').waitFor()
  verificar(
    (await janelaCli.getByLabel('CEP', { exact: true }).inputValue()) === '01310-100' &&
      (await janelaCli.getByLabel('Endereço (rua, avenida...)').inputValue()) === 'Avenida Paulista' &&
      (await janelaCli.getByLabel('Bairro', { exact: true }).inputValue()) === 'Bela Vista' &&
      (await janelaCli.getByLabel('Cidade', { exact: true }).inputValue()) === 'São Paulo' &&
      (await janelaCli.getByLabel('UF', { exact: true }).inputValue()) === 'SP',
    'CEP preenche rua, bairro, cidade e UF'
  )
  verificar(await janelaCli.getByLabel('Número', { exact: true }).evaluate((e) => e === document.activeElement), 'depois do CEP, o cursor vai para o número')
  await page.keyboard.type('1000')
  await janelaCli.getByRole('button', { name: 'Salvar' }).click()
  await page.getByText('Cliente cadastrado.').waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  const cliCep = dados.clientes.find((c) => c.nome === 'Cliente com CEP')
  verificar(
    cliCep?.cep === '01310-100' && cliCep.logradouro === 'Avenida Paulista' && cliCep.numero === '1000' && cliCep.bairro === 'Bela Vista' && cliCep.uf === 'SP',
    'endereço completo gravado no cliente'
  )
  await foto(page, '15-mensagem-sucesso')

  // Valor em reais
  await page.keyboard.press('Control+3')
  await page.getByPlaceholder('Pesquisar por nome, código ou código de barras...').fill('P0002')
  await page.getByRole('row', { name: /P0002/ }).getByRole('button', { name: 'Editar' }).click()
  const janelaProd = page.getByRole('dialog', { name: 'Editar produto' })
  await janelaProd.waitFor()
  const venda = janelaProd.getByLabel('Preço de venda (R$)')
  verificar((await venda.inputValue()) === '89,90', `preço aparece formatado em reais (${await venda.inputValue()})`)
  await venda.fill('1.234,5')
  await janelaProd.getByLabel('Estoque mínimo').click()
  verificar((await venda.inputValue()) === '1.234,50', 'ao sair do campo, o valor é formatado (1.234,50)')
  // Seleção com busca: digitar filtra a lista e Enter escolhe
  await janelaProd.getByLabel('Categoria').click()
  await page.keyboard.type('armaz')
  await page.getByRole('option', { name: 'Armazenamento' }).waitFor()
  verificar((await page.locator('ul[role=listbox] [role=option]').count()) === 1, 'digitar no campo de seleção filtra as opções')
  await page.keyboard.press('Enter')
  verificar((await janelaProd.getByLabel('Categoria').inputValue()) === 'Armazenamento', 'Enter escolhe a opção filtrada')
  await janelaProd.getByLabel('Unidade de medida').click()
  await page.keyboard.press('Escape')
  verificar(await janelaProd.isVisible(), 'Esc fecha só a lista, não a janela')
  await foto(page, '16-moeda-e-busca')
  await janelaProd.getByRole('button', { name: 'Salvar' }).click()
  await page.getByText('Produto atualizado.').waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  const prodP2 = dados.produtos.find((p) => p.codigo === 'P0002')
  verificar(prodP2.precoVenda === 1234.5 && dados.categorias.find((c) => c.id === prodP2.categoriaId)?.nome === 'Armazenamento', 'preço e categoria escolhidos foram gravados')
  await ipc(page, 'produtos:salvar', prodP2.id, { ...prodP2, precoVenda: 89.9, categoriaId: dados.produtos.find((p) => p.codigo === 'P0001').categoriaId })

  // ---------- Listas: paginação, cabeçalho fixo, seleção e ações em lote ----------
  console.log('Listas (paginação, cabeçalho fixo, ações em lote)')
  // Dois produtos novos, sem histórico (podem ser excluídos), para as ações em lote.
  const catLote = dados.categorias[0]
  for (const [codigo, nome] of [['L0001', 'Lote Alfa'], ['L0002', 'Lote Beta']]) {
    await ipc(page, 'produtos:salvar', null, {
      codigo, codigoBarras: '', nome, categoriaId: catLote.id, unidadeId: dados.unidades[0].id, precoCusto: 1, precoVenda: 2, estoque: 0, estoqueMinimo: 0, ativo: true
    })
  }
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  await page.keyboard.press('Control+3')
  dados = (await ipc(page, 'dados:carregar')).dados
  const totalProd = dados.produtos.length
  await page.getByText(`de ${totalProd} produtos`).waitFor()
  verificar(await page.getByText(`Mostrando 1–10 de ${totalProd} produtos`).isVisible(), `rodapé mostra o total (1–10 de ${totalProd} produtos)`)
  await page.getByLabel('Itens por página').selectOption('25')
  verificar((await page.locator('main tbody tr').count()) === totalProd, 'escolher 25 por página mostra todos')
  verificar((await page.locator('main thead th').first().evaluate((e) => getComputedStyle(e).position)) === 'sticky', 'cabeçalho da tabela fica fixo ao rolar')
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  await page.keyboard.press('Control+3')
  await page.getByText(`de ${totalProd} produtos`).waitFor()
  verificar((await page.getByLabel('Itens por página').inputValue()) === '25', 'a quantidade por página escolhida fica guardada')

  const busca = page.getByPlaceholder('Pesquisar por nome, código ou código de barras...')
  await busca.fill('Lote')
  await page.getByLabel('Selecionar todos desta página').check()
  await page.getByText('2 selecionados').waitFor()
  verificar(true, 'marcar o cabeçalho seleciona os produtos da página')
  await page.getByRole('region', { name: 'Ações com os selecionados' }).getByRole('button', { name: 'Inativar' }).click()
  await page.getByText('2 produtos inativados.').waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(dados.produtos.filter((p) => p.codigo.startsWith('L000')).every((p) => !p.ativo), 'inativar em lote')
  await busca.fill('')
  await page.getByLabel('Selecionar L0001 Lote Alfa').check()
  await page.getByLabel('Selecionar P0001 Mouse USB').check()
  await page.getByRole('region', { name: 'Ações com os selecionados' }).getByRole('button', { name: 'Mudar categoria' }).click()
  const catDestino = dados.categorias.find((c) => c.nome === 'Redes')
  await escolher(page.getByRole('dialog', { name: 'Mudar categoria' }).getByLabel('Nova categoria'), 'Redes')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await page.getByText('2 produtos alterados.').waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(['L0001', 'P0001'].every((c) => dados.produtos.find((p) => p.codigo === c).categoriaId === catDestino.id), 'mudar categoria em lote')
  aud = (await ipc(page, 'auditoria:listar', { entidade: 'Produto', acao: 'Alteração' })).dados
  verificar(aud.itens[0]?.alteracoes.some((a) => a.campo === 'Categoria' && a.para === 'Redes'), 'cada produto alterado em lote fica na auditoria')
  await ipc(page, 'produtos:salvar', 1, { ...dados.produtos.find((p) => p.id === 1), categoriaId: catLote.id })
  await page.getByLabel('Selecionar L0002 Lote Beta').check()
  await page.getByText('Limpar seleção').click()
  await page.getByLabel('Selecionar L0001 Lote Alfa').check()
  await page.getByLabel('Selecionar L0002 Lote Beta').check()
  await page.getByLabel('Selecionar P0001 Mouse USB').check()
  await foto(page, '17-acoes-em-lote')
  await page.getByRole('region', { name: 'Ações com os selecionados' }).getByRole('button', { name: 'Excluir' }).click()
  await page.getByRole('button', { name: 'Excluir 3' }).click()
  await page.getByText('2 produtos excluídos.').waitFor()
  await page.getByText(/1 não pôde ser excluído — P0001/).waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(
    !dados.produtos.some((p) => p.codigo.startsWith('L000')) && dados.produtos.some((p) => p.codigo === 'P0001') && (await page.getByText('1 selecionado', { exact: true }).isVisible()),
    'excluir em lote: exclui os que podem, mantém o com histórico (e explica o motivo)'
  )
  await page.getByText('Limpar seleção').click()
  await page.getByLabel('Itens por página').selectOption('10')

  // ---------- Ações em lote nas outras telas ----------
  console.log('Ações em lote (clientes, compras, categorias, movimentações)')
  const barraLote = () => page.getByRole('region', { name: 'Ações com os selecionados' })
  // Clientes: dois novos (sem vendas) + um com vendas
  for (const [nome, doc] of [['Lote Cliente A', '111.444.777-35'], ['Lote Cliente B', '222.555.888-46']]) {
    await ipc(page, 'clientes:salvar', null, { nome, tipo: 'PF', documento: doc, telefone: '', email: '', cidade: '', uf: '', ativo: true })
  }
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  await page.keyboard.press('Control+8')
  await page.getByRole('heading', { name: 'Clientes', exact: true }).waitFor()
  await page.getByLabel('Selecionar Lote Cliente A').check()
  await page.getByLabel('Selecionar Lote Cliente B').check()
  await barraLote().getByRole('button', { name: 'Inativar' }).click()
  await page.getByText('2 clientes inativados.').waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(dados.clientes.filter((c) => c.nome.startsWith('Lote Cliente')).every((c) => !c.ativo), 'clientes: inativar em lote')
  await page.getByLabel('Selecionar Lote Cliente A').check()
  await page.getByLabel('Selecionar Lote Cliente B').check()
  await page.getByLabel('Selecionar João Pereira').check()
  await barraLote().getByRole('button', { name: 'Excluir' }).click()
  await page.getByRole('button', { name: 'Excluir 3' }).click()
  await page.getByText('2 clientes excluídos.').waitFor()
  await page.getByText(/1 não pôde ser excluído — Cliente João Pereira: Cliente possui vendas/).waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(
    !dados.clientes.some((c) => c.nome.startsWith('Lote Cliente')) && dados.clientes.some((c) => c.nome === 'João Pereira') && (await page.getByText('1 selecionado', { exact: true }).isVisible()),
    'clientes: exclui os que podem e mantém marcado o que tem vendas'
  )
  await page.getByText('Limpar seleção').click()

  // Compras: uma não recebida (rascunho novo) + uma recebida
  const fornLote = dados.fornecedores.find((f) => f.ativo)
  const rascunho = (await ipc(page, 'compras:salvar', null, { fornecedorId: fornLote.id, data: '2026-11-01', observacao: 'lote', status: 'rascunho', itens: [{ produtoId: 1, quantidade: 1, valorUnitario: 10 }] })).dados
  const recebida = dados.compras.find((c) => c.status === 'recebida')
  await page.keyboard.press('Control+6')
  await page.getByRole('heading', { name: 'Compras', exact: true }).waitFor()
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  await page.keyboard.press('Control+6')
  await page.getByLabel('Itens por página').selectOption('50')
  await page.getByLabel(`Selecionar ${rascunho.numero}`).check()
  await page.getByLabel(`Selecionar ${recebida.numero}`, { exact: true }).check()
  await foto(page, '20-lote-compras')
  await barraLote().getByRole('button', { name: 'Excluir' }).click()
  await page.getByRole('button', { name: 'Excluir 2' }).click()
  await page.getByText('1 compra excluída.').waitFor()
  await page.getByText(/1 não pôde ser excluída — Compra .*recebidas/).waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(!dados.compras.some((c) => c.id === rascunho.id) && dados.compras.some((c) => c.id === recebida.id), 'compras: exclui a não recebida e mantém a recebida (no feminino: "1 compra excluída")')
  await page.getByText('Limpar seleção').click()
  await page.getByLabel('Itens por página').selectOption('10')

  // Categorias: uma livre + uma em uso
  await ipc(page, 'categorias:salvar', null, { nome: 'Categoria lote', descricao: '' })
  await page.getByRole('link', { name: 'Categorias e Unidades' }).click()
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  await page.getByRole('link', { name: 'Categorias e Unidades' }).click()
  await page.getByLabel('Selecionar Categoria lote').check()
  await page.getByLabel('Selecionar Periféricos').check()
  await barraLote().getByRole('button', { name: 'Excluir' }).click()
  await page.getByRole('button', { name: 'Excluir 2' }).click()
  await page.getByText('1 categoria excluída.').waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(!dados.categorias.some((c) => c.nome === 'Categoria lote') && dados.categorias.some((c) => c.nome === 'Periféricos'), 'categorias: exclui a livre e mantém a que está em uso')
  await page.getByText('Limpar seleção').click()

  // Movimentações: exportar só as selecionadas
  await page.keyboard.press('Control+4')
  await page.getByRole('heading', { name: 'Movimentações de Estoque', exact: true }).waitFor()
  const linhasVenda = page.locator('main tbody input[type=checkbox]')
  const nVendas = await linhasVenda.count()
  if (nVendas >= 2) {
    await linhasVenda.nth(0).check()
    await linhasVenda.nth(1).check()
    await aoSalvar(join(pasta, 'movs-selecao.xlsx'))
    await barraLote().getByRole('button', { name: 'Excel' }).click()
    await esperarArquivo(join(pasta, 'movs-selecao.xlsx'))
    const wbSel = new ExcelJS.Workbook()
    await wbSel.xlsx.readFile(join(pasta, 'movs-selecao.xlsx'))
    verificar(wbSel.worksheets[0].rowCount === 3, `movimentações: Excel só com as 2 selecionadas (${wbSel.worksheets[0].rowCount - 1})`)
    await page.getByText('Limpar seleção').click()
  } else {
    verificar(false, `movimentações: esperava ao menos 2 linhas (${nVendas})`)
  }

  // ---------- Notificações ----------
  console.log('Central de notificações')
  let notif = (await ipc(page, 'notificacoes:listar')).dados
  verificar(notif.some((n) => n.chave === 'senha-padrao') && notif.some((n) => n.chave.startsWith('estoque-')), `lista avisos do sistema (${notif.length}: senha padrão, estoque...)`)
  const sino = page.getByRole('button', { name: /^Notificações/ })
  const naoLidas = notif.filter((n) => !n.lida).length
  verificar((await sino.getAttribute('aria-label')) === `Notificações (${naoLidas} não lidas)`, `sino mostra ${naoLidas} não lidas`)
  await sino.click()
  const painel = page.getByRole('dialog', { name: 'Notificações' })
  await painel.waitFor()
  await foto(page, '18-notificacoes')
  await painel.getByRole('button', { name: 'Marcar todas como lidas' }).click()
  await painel.getByText('Nenhuma notificação nova.').waitFor()
  verificar((await sino.getAttribute('aria-label')) === 'Notificações', 'marcar todas como lidas zera o contador')
  notif = (await ipc(page, 'notificacoes:listar')).dados
  verificar(notif.every((n) => n.lida), 'lidas ficam guardadas')
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 300)
  // Produto que passa a ficar abaixo do mínimo: aviso novo + mensagem
  dados = (await ipc(page, 'dados:carregar')).dados
  const tecladoN = dados.produtos.find((p) => p.codigo === 'P0002')
  await page.getByRole('link', { name: 'Clientes' }).click()
  await page.getByRole('heading', { name: 'Clientes', exact: true }).waitFor()
  await ipc(page, 'produtos:salvar', tecladoN.id, { ...tecladoN, estoqueMinimo: tecladoN.estoque + 5 })
  await page.keyboard.press('Control+3')
  await page.getByText(`Nova notificação: Estoque baixo: ${tecladoN.nome}`).waitFor()
  verificar((await sino.getAttribute('aria-label')) === 'Notificações (1 não lidas)', 'aviso novo aparece no sino e como mensagem')
  await sino.click()
  await painel.getByRole('button', { name: new RegExp(`Estoque baixo: ${tecladoN.nome}`) }).click()
  verificar(page.url().includes('/produtos') && (await sino.getAttribute('aria-label')) === 'Notificações', 'clicar no aviso leva à tela e marca como lido')
  await ipc(page, 'produtos:salvar', tecladoN.id, { ...tecladoN })
  notif = (await ipc(page, 'notificacoes:listar')).dados
  verificar(!notif.some((n) => n.chave === `estoque-baixo:${tecladoN.id}`), 'situação resolvida: o aviso some')
  await ipc(page, 'produtos:salvar', tecladoN.id, { ...tecladoN, estoqueMinimo: tecladoN.estoque + 5 })
  notif = (await ipc(page, 'notificacoes:listar')).dados
  verificar(notif.find((n) => n.chave === `estoque-baixo:${tecladoN.id}`)?.lida === false, 'se o problema voltar, o aviso volta como não lido')
  await ipc(page, 'produtos:salvar', tecladoN.id, { ...tecladoN })

  // ---------- Permissões personalizadas ----------
  console.log('Permissões personalizadas')
  await page.getByRole('link', { name: 'Usuários' }).click()
  await page.keyboard.press('Control+n')
  const janelaUsu = page.getByRole('dialog', { name: 'Novo usuário' })
  await janelaUsu.getByLabel('Nome').fill('Estoquista Personalizado')
  await janelaUsu.getByLabel('E-mail').fill('estoquista@empresa.local')
  await janelaUsu.getByLabel('Login').fill('estoquista')
  await janelaUsu.getByLabel('Senha').fill('estoque123')
  await escolher(janelaUsu.getByLabel('Perfil'), 'Personalizado (escolher permissões)')
  verificar(await janelaUsu.getByLabel('Produtos: cadastrar e editar').isChecked(), 'personalizado começa com as permissões do perfil anterior (operador)')
  await janelaUsu.getByLabel('Vendas: ver').uncheck()
  await janelaUsu.getByLabel('Clientes: ver').uncheck()
  await janelaUsu.getByLabel('Ordens de Serviço: ver').uncheck()
  verificar(!(await janelaUsu.getByLabel('Clientes: excluir').isChecked()), 'tirar "ver" tira também editar e excluir da tela')
  await janelaUsu.getByLabel('Produtos: cadastrar e editar').uncheck()
  await janelaUsu.getByLabel('Produtos: excluir').uncheck()
  await janelaUsu.getByLabel('Compras: cadastrar e editar').check()
  verificar(await janelaUsu.getByLabel('Compras: ver').isChecked(), 'marcar "cadastrar" marca também "ver"')
  await janelaUsu.getByLabel('Concluir inventário').check()
  await foto(page, '19-permissoes-personalizadas')
  await janelaUsu.getByRole('button', { name: 'Salvar' }).click()
  await page.getByText('Usuário cadastrado.').waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  const estoquista = dados.usuarios.find((u) => u.login === 'estoquista')
  verificar(
    JSON.stringify([...estoquista.permissoes].sort()) === JSON.stringify(['compras', 'comprasEditar', 'dashboard', 'estoque', 'inventarioConcluir', 'produtos'].sort()),
    `permissões escolhidas gravadas (${estoquista.permissoes.join(', ')})`
  )
  verificar(await page.getByRole('row', { name: /Estoquista Personalizado/ }).getByText('Personalizado', { exact: true }).isVisible(), 'lista mostra o perfil Personalizado')
  // Tentativas de se dar acesso de administrador pelo IPC são descartadas
  r = await ipc(page, 'usuarios:salvar', estoquista.id, { ...estoquista, senha: '', permissoes: [...estoquista.permissoes, 'usuarios', 'configuracoes', 'clientesExcluir'] })
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(
    r.ok && !dados.usuarios.find((u) => u.login === 'estoquista').permissoes.some((x) => ['usuarios', 'configuracoes', 'clientesExcluir'].includes(x)),
    'permissões de administrador (e "excluir" sem "ver") não entram no personalizado'
  )
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'estoquista', 'estoque123')
  await page.getByRole('link', { name: 'Produtos' }).waitFor()
  const menu = await page.locator('aside nav a').allTextContents()
  verificar(menu.includes('Compras') && menu.includes('Inventário') && !menu.includes('Vendas') && !menu.includes('Clientes') && !menu.includes('Usuários'), `menu mostra só o permitido (${menu.join(', ')})`)
  await page.getByRole('link', { name: 'Produtos' }).click()
  await page.getByRole('heading', { name: 'Produtos', exact: true }).waitFor()
  verificar(
    (await page.getByRole('button', { name: 'Novo Produto' }).count()) === 0 && (await page.getByRole('button', { name: 'Editar' }).count()) === 0,
    'sem "cadastrar e editar", a tela de Produtos fica só para consulta'
  )
  r = await ipc(page, 'produtos:salvar', null, {
    codigo: 'X0001', codigoBarras: '', nome: 'Invasor', categoriaId: dados.categorias[0].id, unidadeId: dados.unidades[0].id, precoCusto: 1, precoVenda: 2, estoque: 0, estoqueMinimo: 0, ativo: true
  })
  verificar(!r.ok && r.erro.tipo === 'permissao', 'e o processo principal também recusa cadastrar produto')
  r = await ipc(page, 'vendas:registrar', { clienteId: null, formaPagamento: 'dinheiro', desconto: 0, observacao: '', itens: [{ produtoId: 1, quantidade: 1, valorUnitario: 49.9 }] })
  verificar(!r.ok && r.erro.tipo === 'permissao', 'sem "Vendas", não registra venda')
  r = await ipc(page, 'compras:encerrar', 999999)
  verificar(r.ok || r.erro.tipo !== 'permissao', 'com "Compras: cadastrar e editar", pode mexer em compras')
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  const estq = (await ipc(page, 'dados:carregar')).dados.usuarios.find((u) => u.login === 'estoquista')
  await ipc(page, 'usuarios:salvar', estq.id, { ...estq, senha: '', permissoes: [...estq.permissoes, 'relatorios'] })
  aud = (await ipc(page, 'auditoria:listar', { entidade: 'Usuário', acao: 'Alteração' })).dados
  const mudPerm = aud.itens[0]?.alteracoes.find((a) => a.campo === 'Permissões')
  verificar(mudPerm?.para.includes('Relatórios') && !mudPerm.de.includes('Relatórios'), 'mudança de permissões fica na auditoria (com os nomes das telas)')
  await ipc(page, 'usuarios:excluir', estoquista.id)

  // ---------- Ordens de serviço ----------
  console.log('Ordens de serviço')
  dados = (await ipc(page, 'dados:carregar')).dados
  const mouseOs = () => dados.produtos.find((p) => p.id === 1).estoque
  const mouseAntesOs = mouseOs()
  await page.keyboard.press('Control+0')
  await page.getByRole('heading', { name: 'Ordens de Serviço', exact: true }).waitFor()
  verificar((await page.locator('aside nav a').allTextContents()).includes('Ordens de Serviço'), 'menu tem "Ordens de Serviço" e Ctrl+0 abre a tela')
  await page.keyboard.press('Control+n')
  const janelaOs = page.getByRole('dialog', { name: 'Nova ordem de serviço' })
  await janelaOs.waitFor()
  await janelaOs.getByRole('button', { name: 'Abrir OS' }).click()
  await janelaOs.getByText('Selecione o cliente').waitFor()
  verificar(await janelaOs.getByText('Defeito relatado é obrigatório').isVisible(), 'sem cliente e defeito, a OS não é aberta (campos destacados)')
  await escolher(janelaOs.getByLabel(/^Cliente \*$/), 'João Pereira — 123.456.789-00')
  await escolher(janelaOs.getByLabel('Técnico responsável'), 'Administrador')
  await janelaOs.getByPlaceholder('Celular, notebook...').fill('Celular')
  await janelaOs.getByLabel('Marca', { exact: true }).fill('Samsung')
  await janelaOs.getByLabel('Modelo', { exact: true }).fill('Galaxy A54')
  await janelaOs.getByLabel('Nº de série / IMEI').fill('356789012345678')
  await janelaOs.getByLabel('Acessórios entregues').fill('Capa e carregador')
  await janelaOs.getByLabel(/^Defeito relatado/).fill('Não carrega')
  const leitorOs = janelaOs.getByLabel('Código de barras')
  await leitorOs.fill('7891000100011')
  await leitorOs.press('Enter')
  await janelaOs.getByRole('button', { name: 'Adicionar serviço' }).click()
  await janelaOs.getByLabel('Descrição do serviço').fill('Troca do conector de carga')
  await janelaOs.getByLabel('Valor unitário').last().fill('80')
  await janelaOs.getByLabel('Desconto', { exact: true }).fill('10')
  await janelaOs.getByRole('radio', { name: 'Desenho (padrão)' }).click()
  const grade = janelaOs.getByRole('group', { name: /^Desenho da senha/ })
  const caixaGrade = await grade.boundingBox()
  const ponto = (n) => ({ x: caixaGrade.x + ((50 + ((n - 1) % 3) * 100) / 300) * caixaGrade.width, y: caixaGrade.y + ((50 + Math.floor((n - 1) / 3) * 100) / 300) * caixaGrade.height })
  // Arrasta de 1 até 3 (passa pelo 2), depois 6 e 9 — como no celular.
  await page.mouse.move(ponto(1).x, ponto(1).y)
  await page.mouse.down()
  for (const n of [3, 6, 9]) await page.mouse.move(ponto(n).x, ponto(n).y, { steps: 8 })
  await page.mouse.up()
  verificar(await janelaOs.getByText('Sequência: 1 → 2 → 3 → 6 → 9').isVisible(), 'senha por desenho: arrastar o mouse marca os pontos (passando pelo 2 de 1 para 3)')
  await foto(page, '21-os-formulario')
  await janelaOs.getByRole('button', { name: 'Abrir OS' }).click()
  await page.getByText('Ordem de serviço OS-0001 aberta.').waitFor()
  const fichaOs = page.getByRole('dialog', { name: 'Ordem de serviço OS-0001' })
  await fichaOs.waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  let os1 = dados.ordensServico.find((o) => o.numero === 'OS-0001')
  verificar(
    os1?.status === 'aberta' && os1.itens.length === 2 && os1.itens[0].tipo === 'peca' && os1.itens[1].descricao === 'Troca do conector de carga' && os1.desconto === 10 && os1.historico.length === 1 && os1.tecnicoId === 1,
    'OS aberta pela tela: equipamento, peça (pelo leitor), serviço, desconto, técnico e histórico'
  )
  verificar(mouseOs() === mouseAntesOs, 'abrir a OS não mexe no estoque')
  verificar(os1.senhaTipo === 'desenho' && !JSON.stringify(dados).includes('1-2-3-6-9'), 'a senha é gravada, mas não vem junto com os dados das telas')
  await fichaOs.getByRole('button', { name: 'Mostrar senha' }).click()
  await fichaOs.getByText('Sequência: 1 → 2 → 3 → 6 → 9').waitFor()
  aud = (await ipc(page, 'auditoria:listar', { acao: 'Visualização de senha' })).dados
  verificar(aud.itens[0]?.descricao.includes('OS-0001'), 'quem tem permissão vê o desenho na ficha, e a visualização vai para a auditoria')
  await fichaOs.getByRole('button', { name: 'Ocultar' }).click()
  await escolher(fichaOs.getByLabel('Novo status'), 'Pronta — serviço concluído')
  verificar(await fichaOs.getByText('será baixada do estoque').isVisible(), 'a ficha avisa que as peças vão sair do estoque')
  await fichaOs.getByLabel('Observação do andamento').fill('Conector trocado e testado')
  await fichaOs.getByRole('button', { name: 'Atualizar status' }).click()
  await page.getByText('OS-0001: pronta.').waitFor()
  await foto(page, '22-os-ficha')
  dados = (await ipc(page, 'dados:carregar')).dados
  os1 = dados.ordensServico.find((o) => o.id === os1.id)
  const movOs = dados.movimentacoes.find((m) => m.osId === os1.id && m.tipo === 'saida')
  verificar(os1.status === 'pronta' && os1.estoqueBaixado && mouseOs() === mouseAntesOs - 1 && movOs?.motivo === 'Ordem de serviço OS-0001', 'pronta: a peça sai do estoque ligada à OS')
  verificar(os1.historico.at(-1).observacao === 'Conector trocado e testado', 'mudança de status fica no histórico com a observação')
  r = await ipc(page, 'os:salvar', os1.id, { ...os1, laudo: 'Alterado depois de pronta' })
  verificar(!r.ok && r.erro.mensagem.includes('Reabra'), 'OS pronta não pode ser editada (precisa reabrir)')
  r = await ipc(page, 'estoque:estornar', movOs.id, 'teste')
  verificar(!r.ok && r.erro.mensagem.includes('ordem de serviço'), 'baixa de peça da OS não é estornada pela tela de movimentações')
  r = await ipc(page, 'os:status', os1.id, 'em_execucao', 'Cliente voltou com o mesmo defeito')
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(r.ok && !r.dados.estoqueBaixado && mouseOs() === mouseAntesOs, 'reabrir devolve a peça ao estoque')
  // Pagamentos: sinal, limites e entrega com duas formas
  r = await ipc(page, 'os:receber', os1.id, [{ forma: 'pix', valor: 50 }])
  verificar(r.ok && r.dados.pagamentos[0]?.tipo === 'sinal' && r.dados.pagamentos[0].valor === 50, 'recebe sinal com a OS em andamento')
  r = await ipc(page, 'os:receber', os1.id, [{ forma: 'pix', valor: 100 }])
  verificar(!r.ok && r.erro.mensagem.includes('maior que o que falta receber'), 'não deixa receber mais do que falta')
  r = await ipc(page, 'os:salvar', os1.id, { ...os1, desconto: 100 })
  verificar(!r.ok && r.erro.campo === 'desconto' && r.erro.mensagem.includes('já recebido'), 'o total não pode ficar menor do que já foi recebido')
  r = await ipc(page, 'os:status', os1.id, 'entregue', '')
  verificar(!r.ok && r.erro.mensagem.includes('Falta receber'), 'não entrega com saldo sem confirmar')
  r = await ipc(page, 'os:status', os1.id, 'entregue', '', { pagamentos: [{ forma: 'dinheiro', valor: 40 }, { forma: 'credito', valor: 34.9 }] })
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(r.ok && r.dados.entregueEm && r.dados.estoqueBaixado && mouseOs() === mouseAntesOs - 1, 'entregue direto: baixa a peça e registra a data de entrega')
  verificar(r.dados.pagamentos.length === 3 && r.dados.pagamentos.slice(1).every((p) => p.tipo === 'pagamento'), 'na entrega, o restante é recebido em duas formas (dinheiro + crédito)')
  const pagCredito = r.dados.pagamentos.find((p) => p.forma === 'credito')
  r = await ipc(page, 'os:estornarPagamento', os1.id, pagCredito.id, 'Cartão recusado')
  notif = (await ipc(page, 'notificacoes:listar')).dados
  verificar(r.ok && r.dados.pagamentos.find((p) => p.id === pagCredito.id).estornado && notif.some((n) => n.chave === `os-a-receber:${os1.id}`), 'estornar um pagamento de OS entregue gera o aviso de valor a receber')
  r = await ipc(page, 'os:receber', os1.id, [{ forma: 'pix', valor: 34.9 }])
  notif = (await ipc(page, 'notificacoes:listar')).dados
  verificar(r.ok && !notif.some((n) => n.chave === `os-a-receber:${os1.id}`), 'recebido o restante, o aviso some')
  aud = (await ipc(page, 'auditoria:listar', { entidade: 'Ordem de serviço' })).dados
  verificar(aud.itens.some((a) => a.acao === 'Estorno de pagamento' && a.descricao.includes('Cartão recusado')) && aud.itens.some((a) => a.acao === 'Recebimento'), 'recebimentos e estornos ficam na auditoria')
  r = await ipc(page, 'os:verSenha', os1.id)
  verificar(r.ok && r.dados.tipo === 'nenhuma' && r.dados.valor === '', 'ao entregar, a senha do equipamento é apagada')
  r = await ipc(page, 'os:status', os1.id, 'cancelada', 'Tentativa')
  verificar(!r.ok, 'OS entregue não muda mais de status')
  r = await ipc(page, 'os:excluir', os1.id)
  verificar(!r.ok, 'OS entregue não pode ser excluída')
  await aoSalvar(join(pasta, 'os.pdf'))
  await fichaOs.getByRole('button', { name: 'PDF' }).click()
  verificar((await esperarArquivo(join(pasta, 'os.pdf'))) && ehPdf(join(pasta, 'os.pdf')), 'OS salva em PDF (folha para o cliente assinar)')
  // Enviar ao cliente (sem servidor): arquivo .html + WhatsApp com a mensagem pronta
  // (as mudanças acima foram feitas direto pelo IPC: recarrega a tela para a ficha mostrar a OS entregue)
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  await page.keyboard.press('Control+0')
  await page.getByRole('row', { name: /OS-0001/ }).getByRole('button', { name: 'Ficha' }).click()
  await fichaOs.getByRole('button', { name: 'Enviar ao cliente' }).click()
  const envio = page.getByRole('dialog', { name: 'Enviar a OS OS-0001 ao cliente' })
  await aoSalvar(join(pasta, 'os-cliente.html'))
  await envio.getByRole('button', { name: 'Salvar arquivo' }).click()
  await esperarArquivo(join(pasta, 'os-cliente.html'))
  const paginaCliente = readFileSync(join(pasta, 'os-cliente.html'), 'utf8')
  verificar(
    paginaCliente.includes('OS-0001') && paginaCliente.includes('Entregue') && paginaCliente.includes('Garantia de 90 dias, válida até') && paginaCliente.includes('Troca do conector de carga') && paginaCliente.includes('124,90'),
    'arquivo da OS para o cliente: número, situação, serviços, total e garantia'
  )
  verificar(!/<script/i.test(paginaCliente) && !paginaCliente.includes('1-2-3-6-9') && !paginaCliente.includes('Conector trocado e testado'), 'o arquivo não tem scripts, senha nem observações internas do andamento')
  if (saida) copyFileSync(join(pasta, 'os-cliente.html'), join(saida, 'os-cliente.html'))
  await app.evaluate(({ shell }) => {
    globalThis.linksAbertos = []
    shell.openExternal = async (u) => void globalThis.linksAbertos.push(u)
  })
  await envio.getByRole('button', { name: /^Abrir WhatsApp/ }).click()
  await page.waitForTimeout(500)
  const linkZap = (await app.evaluate(() => globalThis.linksAbertos))[0] ?? ''
  verificar(linkZap.startsWith('https://wa.me/5511987654321?text=') && decodeURIComponent(linkZap).includes('*OS-0001*'), `WhatsApp abre no número do cliente com a mensagem pronta (${linkZap.slice(0, 40)}...)`)
  await foto(page, '23-os-enviar-cliente')
  aud = (await ipc(page, 'auditoria:listar', { acao: 'Arquivo para o cliente' })).dados
  verificar(aud.itens[0]?.descricao.includes('OS-0001'), 'gerar o arquivo para o cliente fica na auditoria')
  await envio.getByRole('button', { name: 'Concluir' }).click()
  await page.keyboard.press('Escape')

  // Peça sem saldo: a OS não fica pronta e nada muda
  const semSaldo = dados.produtos.find((p) => p.codigo === 'P0010')
  const base = { clienteId: 1, tecnicoId: null, previsao: null, equipTipo: 'Notebook', equipMarca: 'Dell', equipModelo: 'Inspiron', equipSerie: '', acessorios: '', estadoFisico: '', defeito: 'Não liga', diagnostico: '', laudo: '', observacao: '', desconto: 0, garantiaDias: 90 }
  r = await ipc(page, 'os:salvar', null, { ...base, senha: { tipo: 'pin', valor: '12' }, itens: [] })
  verificar(!r.ok && r.erro.tipo === 'validacao', 'PIN com menos de 4 números é recusado')
  r = await ipc(page, 'os:salvar', null, { ...base, senha: { tipo: 'desenho', valor: '1-2-1-3' }, itens: [] })
  verificar(!r.ok, 'desenho repetindo ponto é recusado')
  const os2 = (await ipc(page, 'os:salvar', null, { ...base, senha: { tipo: 'pin', valor: '4321' }, itens: [{ tipo: 'peca', produtoId: semSaldo.id, descricao: '', quantidade: semSaldo.estoque + 1, valorUnitario: 50 }] })).dados
  r = await ipc(page, 'os:status', os2.id, 'pronta', '')
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(!r.ok && r.erro.mensagem.includes('Saldo insuficiente') && dados.ordensServico.find((o) => o.id === os2.id).status === 'aberta', 'sem saldo da peça, a OS não fica pronta')
  r = await ipc(page, 'os:salvar', null, { ...base, desconto: 999, itens: [{ tipo: 'servico', produtoId: null, descricao: 'Limpeza', quantidade: 1, valorUnitario: 50 }] })
  verificar(!r.ok && r.erro.campo === 'desconto', 'desconto maior que o total é recusado')

  // Atrasada: aviso no sino e filtro
  await ipc(page, 'os:salvar', os2.id, { ...base, previsao: '2026-01-10', itens: [] })
  r = await ipc(page, 'os:verSenha', os2.id)
  verificar(r.dados?.tipo === 'pin' && r.dados.valor === '4321', 'editar a OS sem mexer na senha mantém a senha')
  notif = (await ipc(page, 'notificacoes:listar')).dados
  verificar(notif.some((n) => n.chave === `os-atrasada:${os2.id}`), 'previsão vencida gera aviso de OS atrasada')
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  await page.keyboard.press('Control+0')
  await page.getByRole('button', { name: /^Atrasadas/ }).click()
  await page.getByRole('cell', { name: os2.numero, exact: true }).waitFor()
  verificar((await page.locator('main tbody tr').count()) === 1, 'o quadro "Atrasadas" filtra a lista')
  r = await ipc(page, 'os:status', os2.id, 'cancelada', '')
  verificar(!r.ok && r.erro.campo === 'observacao', 'cancelar exige o motivo')
  r = await ipc(page, 'os:status', os2.id, 'cancelada', 'Cliente não aprovou o orçamento')
  notif = (await ipc(page, 'notificacoes:listar')).dados
  verificar(r.ok && !notif.some((n) => n.chave === `os-atrasada:${os2.id}`), 'OS cancelada deixa de aparecer como atrasada')
  verificar((await ipc(page, 'os:verSenha', os2.id)).dados.tipo === 'nenhuma', 'ao cancelar, a senha também é apagada')

  // Cliente com OS não é excluído; OS sem peças baixadas pode ser excluída
  const cliOs = (await ipc(page, 'clientes:salvar', null, { nome: 'Cliente da Assistência', tipo: 'PF', documento: '390.533.447-05', telefone: '', email: '', cidade: '', uf: '', ativo: true })).dados
  const os3 = (await ipc(page, 'os:salvar', null, { ...base, clienteId: cliOs.id, itens: [] })).dados
  r = await ipc(page, 'clientes:excluir', cliOs.id)
  verificar(!r.ok && r.erro.mensagem.includes('ordens de serviço'), 'cliente com OS não pode ser excluído')
  r = await ipc(page, 'cadastros:emLote', 'os', [os3.id, os1.id], 'excluir')
  verificar(r.ok && r.dados.feitos === 1 && r.dados.falhas.length === 1 && r.dados.falhas[0].id === os1.id, 'exclusão em lote: exclui a OS sem movimento e mantém a entregue')
  r = await ipc(page, 'clientes:excluir', cliOs.id)
  verificar(r.ok, 'sem OS, o cliente pode ser excluído')
  aud = (await ipc(page, 'auditoria:listar', { entidade: 'Ordem de serviço' })).dados
  verificar(aud.itens.some((a) => a.acao === 'Mudança de status' && a.descricao.includes('Aberta → Pronta') && a.descricao.includes('Peças baixadas')) && aud.itens.some((a) => a.acao === 'Inclusão'), 'abertura e mudanças de status ficam na auditoria')
  verificar(!JSON.stringify(aud.itens).includes('4321') && !JSON.stringify(aud.itens).includes('1-2-3-6-9'), 'o valor da senha nunca aparece na auditoria')

  // Sem a permissão "Ver senha do equipamento" (operador): vê que existe, mas não vê a senha.
  const os4 = (await ipc(page, 'os:salvar', null, { ...base, senha: { tipo: 'texto', valor: 'segredo' }, itens: [] })).dados
  await ipc(page, 'usuarios:salvar', null, { nome: 'Balcão', email: 'balcao@empresa.local', login: 'balcao', senha: 'balcao123', perfil: 'operador', permissoes: null, ativo: true })
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'balcao', 'balcao123')
  await page.getByRole('link', { name: 'Ordens de Serviço' }).click()
  await page.getByRole('row', { name: new RegExp(os4.numero) }).getByRole('button', { name: 'Ficha' }).click()
  await page.getByText('Senha (texto) cadastrada. Você não tem permissão para ver.').waitFor()
  r = await ipc(page, 'os:verSenha', os4.id)
  verificar(!r.ok && r.erro.tipo === 'permissao', 'operador vê que há senha, mas não consegue ver (nem pelo processo principal)')
  await page.keyboard.press('Escape')
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  await ipc(page, 'os:excluir', os4.id)
  await ipc(page, 'usuarios:excluir', (await ipc(page, 'dados:carregar')).dados.usuarios.find((u) => u.login === 'balcao').id)

  // Mesmo aparelho de novo (garantia), leitor na busca, receber pela ficha e entregar recebendo o restante
  const os5 = (await ipc(page, 'os:salvar', null, { ...base, equipTipo: 'Celular', equipSerie: '35 678901 234567 8', defeito: 'Não carrega de novo', itens: [{ tipo: 'servico', produtoId: null, descricao: 'Revisão do conector', quantidade: 1, valorUnitario: 100 }] })).dados
  await ipc(page, 'os:status', os5.id, 'pronta', '')
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  verificar(await page.getByText('Serviços no mês').isVisible(), 'o painel mostra o faturamento de serviços no mês')
  await page.keyboard.press('Control+0')
  await page.keyboard.press('Control+n')
  const janelaOs2 = page.getByRole('dialog', { name: 'Nova ordem de serviço' })
  await janelaOs2.getByLabel('Nº de série / IMEI').fill('356789012345678')
  await janelaOs2.getByText(/^Em garantia até .* pela OS OS-0001/).waitFor()
  verificar(true, 'ao digitar o IMEI, o formulário mostra que o aparelho está na garantia da OS anterior')
  await janelaOs2.getByRole('button', { name: 'Cancelar' }).click()
  const buscaOs = page.getByPlaceholder('Número, cliente, equipamento, série/IMEI...')
  await buscaOs.fill(os5.numero.toLowerCase())
  await buscaOs.press('Enter')
  const ficha5 = page.getByRole('dialog', { name: `Ordem de serviço ${os5.numero}` })
  await ficha5.waitFor()
  verificar(await ficha5.getByText(/Em garantia até/).isVisible(), 'leitor/Enter na busca abre a ficha, que também mostra o histórico do aparelho')
  await ficha5.getByRole('button', { name: 'Receber', exact: true }).click()
  const painelPag = ficha5.getByLabel('Pagamento da OS')
  await escolher(painelPag.getByLabel('Forma de pagamento 1'), 'Pix')
  await painelPag.getByLabel('Valor recebido 1').fill('30')
  await ficha5.getByRole('button', { name: 'Confirmar recebimento' }).click()
  await page.getByText(`Recebido R$ 30,00 na OS ${os5.numero}.`.replace(/ R\$ /, ' R$ ')).waitFor()
  await escolher(ficha5.getByLabel('Novo status'), 'Entregue ao cliente')
  await ficha5.getByText(/Receber na entrega: falta R\$\s70,00/).waitFor()
  await escolher(ficha5.getByRole('complementary').getByLabel('Forma de pagamento 1'), 'Dinheiro')
  await foto(page, '24-os-entrega-pagamento')
  await ficha5.getByRole('button', { name: 'Atualizar status' }).click()
  await page.getByText(`${os5.numero}: entregue.`).waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  const os5d = dados.ordensServico.find((o) => o.id === os5.id)
  verificar(
    os5d.status === 'entregue' && os5d.pagamentos.length === 2 && os5d.pagamentos.map((p) => `${p.forma}:${p.valor}`).join(',') === 'pix:30,dinheiro:70',
    'pela ficha: recebe parte no Pix e o restante em dinheiro na entrega'
  )
  await aoSalvar(join(pasta, 'etiqueta-os.pdf'))
  await ficha5.getByRole('button', { name: 'Etiqueta' }).click()
  await page.getByRole('dialog', { name: `Etiqueta da OS ${os5.numero}` }).getByRole('button', { name: 'PDF' }).click()
  verificar((await esperarArquivo(join(pasta, 'etiqueta-os.pdf'))) && ehPdf(join(pasta, 'etiqueta-os.pdf')), 'etiqueta da OS com código de barras em PDF')
  await page.getByRole('dialog', { name: `Etiqueta da OS ${os5.numero}` }).getByRole('button', { name: 'Fechar', exact: true }).last().click()
  await ficha5.getByRole('button', { name: 'Fechar', exact: true }).last().click()

  // Relatórios de OS
  await page.getByRole('link', { name: 'Relatórios' }).click()
  await page.getByRole('tab', { name: /Ordens de serviço/ }).click()
  await page.getByRole('cell', { name: os5.numero, exact: true }).waitFor()
  verificar(await page.getByRole('cell', { name: 'OS-0001', exact: true }).isVisible(), 'relatório de OS entregues no período')
  await escolher(page.getByLabel('Visão do relatório de OS'), 'Recebimentos')
  await page.getByRole('cell', { name: 'Dinheiro', exact: true }).first().waitFor()
  verificar((await page.getByRole('cell', { name: os5.numero, exact: true }).count()) === 2, 'relatório de recebimentos lista cada pagamento (Pix e dinheiro)')
  await escolher(page.getByLabel('Visão do relatório de OS'), 'Por técnico')
  await page.getByRole('cell', { name: 'Administrador', exact: true }).waitFor()
  verificar(true, 'relatório de OS por técnico')
  await escolher(page.getByLabel('Visão do relatório de OS'), 'Canceladas / recusadas')
  await page.getByRole('cell', { name: 'Cliente não aprovou o orçamento', exact: true }).waitFor()
  verificar(true, 'relatório de OS canceladas mostra o motivo')
  await foto(page, '25-relatorio-os')

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
  const mouseAntesImp = (await ipc(page, 'dados:carregar')).dados.produtos.find((p) => p.id === 1).estoque
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
  verificar(mouse?.nome === 'Mouse USB Óptico' && mouse?.estoque === mouseAntesImp, 'produto existente atualizado sem mexer no estoque')
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
  r = await ipc(page, 'auditoria:listar', {})
  verificar(!r.ok && r.erro.tipo === 'permissao', 'operador não consulta a auditoria')

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
  await page.getByRole('tab', { name: 'Backup e dados' }).click()
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
  aud = (await ipc(page, 'auditoria:listar', {})).dados
  verificar(
    aud.itens[0]?.acao === 'Zerar dados' && aud.itens.some((i) => i.acao === 'Recuperação de acesso') && aud.itens.some((i) => i.acao === 'Restauração de backup') && aud.itens.some((i) => i.entidade === 'Produto'),
    'zerar fica registrado e o histórico de auditoria é mantido'
  )
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

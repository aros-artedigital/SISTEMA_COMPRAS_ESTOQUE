// Teste de fumaça: abre o app Electron de verdade (build em out/) com um banco temporário
// e percorre login, telas, regras de negócio, permissões e persistência após reiniciar.
// Uso: npm run test:smoke   (SMOKE_OUT=<pasta> salva screenshots)

import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const pasta = mkdtempSync(join(tmpdir(), 'estoque-smoke-'))
const ESTOQUE_DB_PATH = join(pasta, 'teste.sqlite')
const saida = process.env.SMOKE_OUT

let falhas = 0
function verificar(cond, descricao) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${descricao}`)
  if (!cond) falhas++
}

async function abrir() {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, ESTOQUE_DB_PATH } })
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

  // Permissões checadas no processo principal
  await ipc(page, 'auth:sair')
  r = await ipc(page, 'dados:carregar')
  verificar(!r.ok && r.erro.tipo === 'permissao', 'sem sessão, nada é lido do banco')
  await ipc(page, 'auth:entrar', 'operador', 'operador123')
  r = await ipc(page, 'usuarios:salvar', null, { nome: 'X', email: 'x@x.com', login: 'invasor', senha: '123456', perfil: 'admin', ativo: true })
  verificar(!r.ok && r.erro.tipo === 'permissao', 'operador não consegue criar usuário nem chamando o IPC direto')
  r = await ipc(page, 'compras:receber', 1)
  verificar(!r.ok && r.erro.tipo === 'permissao', 'operador não consegue receber compra')

  await app.close()

  console.log('2ª execução (mesmo banco: os dados precisam continuar lá)')
  ;({ app, page } = await abrir())
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()
  dados = (await ipc(page, 'dados:carregar')).dados
  verificar(dados.produtos.some((p) => p.nome === 'Hub USB 4 portas'), 'produto criado continua após reiniciar')
  verificar(dados.compras.find((c) => c.id === 6)?.status === 'recebida', 'compra recebida continua recebida')
  verificar(dados.produtos.length === 11, 'seed não roda de novo em banco existente')
  await page.getByRole('link', { name: 'Movimentações' }).click()
  await page.getByText('Compra C-0006').first().waitFor()
  await foto(page, '3-movimentacoes')
  await app.close()
} catch (e) {
  falhas++
  console.error('  ✗ erro durante o teste:', e.message)
} finally {
  await app?.close().catch(() => undefined)
  try {
    rmSync(pasta, { recursive: true, force: true })
  } catch {
    console.warn(`  (não consegui apagar ${pasta})`)
  }
}

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)

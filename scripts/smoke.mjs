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

  // ---------- Fase 3: relatórios, etiquetas, Excel e backup ----------
  console.log('Relatórios, etiquetas, Excel e backup')
  const arq = (nome) => join(pasta, nome)
  // As chamadas IPC diretas acima não atualizam a cópia de dados da tela: recarrega e entra de novo.
  await page.reload()
  await page.waitForSelector('input[placeholder="seu.login"]')
  await entrar(page, 'admin', 'admin123')
  await page.getByText('Olá, Administrador').waitFor()

  await page.getByRole('link', { name: 'Relatórios' }).click()
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
  } catch {
    console.warn(`  (não consegui apagar ${pasta})`)
  }
}

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)

// Teste da atualização automática no app empacotado: publica uma "versão 9.9.9" num servidor
// local e confere que o app a encontra, baixa e valida (SHA-512) até ficar pronta para instalar.
// Uso: npm run dist && node scripts/atualizacao-teste.mjs

import { _electron as electron } from 'playwright-core'
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs'
import { createServer } from 'http'
import { tmpdir } from 'os'
import { join } from 'path'

const exe = process.env.SMOKE_EXE ?? join('dist', 'win-unpacked', 'Gestor de Estoque e Compras.exe')
const versaoAtual = JSON.parse(readFileSync('package.json', 'utf8')).version
const instalador = join('dist', `Gestor-Estoque-Compras-Setup-${versaoAtual}.exe`)
if (!existsSync(exe) || !existsSync(instalador)) {
  console.error('Gere o instalador antes: npm run dist')
  process.exit(1)
}

// latest.yml anunciando 9.9.9, apontando para o instalador atual (mesmo SHA-512).
const yml = readFileSync(join('dist', 'latest.yml'), 'utf8').replaceAll(versaoAtual, '9.9.9')
const servidor = createServer((req, res) => {
  const caminho = new URL(req.url, 'http://x').pathname // o updater acrescenta ?noCache=...
  if (caminho === '/latest.yml') return res.end(yml)
  if (caminho === '/Gestor-Estoque-Compras-Setup-9.9.9.exe') {
    res.setHeader('Content-Length', statSync(instalador).size)
    return createReadStream(instalador).pipe(res)
  }
  res.statusCode = 404
  res.end()
})
await new Promise((r) => servidor.listen(8098, '127.0.0.1', r))

const pasta = mkdtempSync(join(tmpdir(), 'atualizacao-teste-'))
let falhas = 0
const verificar = (cond, desc) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${desc}`)
  if (!cond) falhas++
}
const app = await electron.launch({
  executablePath: exe,
  args: [],
  env: { ...process.env, ESTOQUE_DB_PATH: join(pasta, 't.sqlite'), ESTOQUE_ATUALIZACAO_URL: 'http://127.0.0.1:8098' }
})
try {
  const page = await app.firstWindow()
  await page.waitForSelector('input[placeholder="seu.login"]')
  const ipc = (c, ...a) => page.evaluate(([c, a]) => window.api.invoke(c, ...a), [c, a])
  // App instalado começa só com o administrador (sem dados de demonstração).
  const r = await ipc('auth:entrar', 'admin', 'admin123')
  verificar(r.ok, 'app empacotado inicia com o usuário admin padrão')
  const d = (await ipc('dados:carregar')).dados
  verificar(d.produtos.length === 0 && d.usuarios.length === 1, 'app instalado começa sem dados de demonstração')

  await ipc('atualizacao:verificar')
  let estado
  for (let i = 0; i < 180; i++) {
    estado = (await ipc('atualizacao:estado')).dados
    if (estado.status === 'pronta' || estado.status === 'erro') break
    await new Promise((r) => setTimeout(r, 500))
  }
  verificar(estado.status === 'pronta' && estado.novaVersao === '9.9.9', `nova versão encontrada, baixada e validada (${estado.status} ${estado.mensagem ?? ''})`)
  // A faixa fica no layout do sistema: entra pela tela de login.
  await ipc('auth:sair')
  await page.fill('input[placeholder="seu.login"]', 'admin')
  await page.fill('input[type="password"]', 'admin123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.getByText('foi baixada e será instalada').waitFor({ timeout: 10000 })
  if (process.env.SMOKE_OUT) await page.screenshot({ path: join(process.env.SMOKE_OUT, 'atualizacao.png') })
  verificar(true, 'faixa "Reiniciar e atualizar" aparece na tela')
} catch (e) {
  falhas++
  console.error('  ✗ erro:', e.message)
} finally {
  await app.close().catch(() => undefined)
  servidor.close()
  rmSync(pasta, { recursive: true, force: true })
}
console.log(falhas ? `\n${falhas} falha(s).` : '\nAtualização ok.')
process.exit(falhas ? 1 : 0)

// Sobe a API PHP (pasta servidor/) no servidor embutido do PHP, com um banco SQLite temporário.
// Usado pelos testes; requer o PHP portátil em tools/php (ou PHP no PATH).

import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

const raiz = resolve(import.meta.dirname, '..')

// Porta própria dos testes (a 8099 fica livre para o servidor de testes manuais).
export async function iniciarServidor({ porta = 8097, banco, chave = 'chave-teste' }) {
  const url = `http://127.0.0.1:${porta}`
  const ocupada = await fetch(`${url}/status`).then(
    () => true,
    () => false
  )
  if (ocupada) throw new Error(`A porta ${porta} já está em uso por outro servidor. Feche-o antes de rodar os testes.`)

  const local = join(raiz, 'tools', 'php', 'php.exe')
  const php = existsSync(local) ? local : 'php'
  const args = existsSync(local) ? ['-c', join(raiz, 'tools', 'php', 'php.ini')] : []
  const proc = spawn(php, [...args, '-S', `127.0.0.1:${porta}`, '-t', join(raiz, 'servidor'), join(raiz, 'servidor', 'index.php')], {
    env: { ...process.env, ESTOQUE_DB_DSN: `sqlite:${banco}`, ESTOQUE_CHAVE_CADASTRO: chave },
    stdio: ['ignore', 'ignore', 'pipe']
  })
  let log = ''
  proc.stderr.on('data', (d) => (log += d))
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${url}/status`)).ok) return { url, parar: () => proc.kill(), log: () => log }
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  proc.kill()
  throw new Error(`Servidor PHP não respondeu.\n${log}`)
}

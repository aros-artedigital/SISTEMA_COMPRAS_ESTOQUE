// Sobe a API PHP (pasta servidor/) no servidor embutido do PHP, com um banco SQLite temporário.
// Usado pelos testes; requer o PHP portátil em tools/php (ou PHP no PATH).

import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

const raiz = resolve(import.meta.dirname, '..')

export async function iniciarServidor({ porta = 8099, banco, chave = 'chave-teste' }) {
  const local = join(raiz, 'tools', 'php', 'php.exe')
  const php = existsSync(local) ? local : 'php'
  const args = existsSync(local) ? ['-c', join(raiz, 'tools', 'php', 'php.ini')] : []
  const proc = spawn(php, [...args, '-S', `127.0.0.1:${porta}`, '-t', join(raiz, 'servidor'), join(raiz, 'servidor', 'index.php')], {
    env: { ...process.env, ESTOQUE_DB_DSN: `sqlite:${banco}`, ESTOQUE_CHAVE_CADASTRO: chave },
    stdio: ['ignore', 'ignore', 'pipe']
  })
  let log = ''
  proc.stderr.on('data', (d) => (log += d))
  const url = `http://127.0.0.1:${porta}`
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

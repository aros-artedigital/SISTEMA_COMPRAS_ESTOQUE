import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { migrar } from './migracoes'
import { popular } from './seed'

let conexao: Database.Database | null = null
let caminhoAtual = ''

export function abrirBanco(caminho: string, comDemo: boolean): Database.Database {
  mkdirSync(dirname(caminho), { recursive: true })
  const db = new Database(caminho)
  db.pragma('journal_mode = WAL') // leituras não bloqueiam escritas
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  migrar(db)
  popular(db, comDemo)
  conexao = db
  caminhoAtual = caminho
  return db
}

export function banco(): Database.Database {
  if (!conexao) throw new Error('Banco de dados não foi aberto')
  return conexao
}

export function caminhoBanco(): string {
  return caminhoAtual
}

export function fecharBanco(): void {
  conexao?.close()
  conexao = null
}

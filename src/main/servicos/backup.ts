import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs'
import { basename, join } from 'path'
import type { InfoBackup } from '@shared/api'
import { abrirBanco, banco, caminhoBanco, fecharBanco } from '../db/conexao'
import { VERSAO_SCHEMA } from '../db/migracoes'
import { ErroNegocio } from '../erros'
import { agoraIso } from './mapeadores'
import { encerrarSessao } from './sessao'

// Backups usam a API de backup online do SQLite: a cópia é consistente
// mesmo com o banco aberto e em uso.

const PREFIXO_AUTO = 'auto-'
let pastaBackups = ''

export function configurarPastaBackups(pasta: string): void {
  pastaBackups = pasta
  mkdirSync(pasta, { recursive: true })
}

export function pastaDeBackups(): string {
  return pastaBackups
}

/** "2026-11-04T10:15:00" (hora local) → "2026-11-04_101500", seguro para nome de arquivo. */
const carimbo = (): string => agoraIso().replace('T', '_').replace(/:/g, '')

export const nomeSugerido = (): string => `estoque-backup_${carimbo()}.sqlite`

export async function criarBackup(destino: string): Promise<string> {
  await banco().backup(destino)
  return destino
}

export function listarBackups(): InfoBackup[] {
  if (!pastaBackups || !existsSync(pastaBackups)) return []
  return readdirSync(pastaBackups)
    .filter((n) => n.endsWith('.sqlite'))
    .map((nome) => {
      const st = statSync(join(pastaBackups, nome))
      return { nome, caminho: join(pastaBackups, nome), tamanho: st.size, data: agoraIso(st.mtime), automatico: nome.startsWith(PREFIXO_AUTO) }
    })
    .sort((a, b) => b.data.localeCompare(a.data))
}

/**
 * Backup automático: no máximo um por dia, guardando os `manter` mais recentes.
 * Roda ao abrir o app; falhas só são registradas no console, nunca impedem o uso.
 */
export async function backupAutomatico(manter = 7): Promise<void> {
  try {
    const autos = listarBackups().filter((b) => b.automatico)
    const umDia = 24 * 60 * 60 * 1000
    if (autos.length === 0 || Date.now() - new Date(autos[0].data).getTime() > umDia) {
      await criarBackup(join(pastaBackups, `${PREFIXO_AUTO}${carimbo()}.sqlite`))
    }
    for (const antigo of listarBackups().filter((b) => b.automatico).slice(manter)) rmSync(antigo.caminho, { force: true })
  } catch (e) {
    console.error('[backup automático]', e)
  }
}

/** Confere se o arquivo é um banco deste sistema, íntegro e de uma versão compatível. */
function validarArquivo(origem: string): void {
  if (!existsSync(origem)) throw new ErroNegocio('Arquivo de backup não encontrado.')
  let teste: Database.Database | null = null
  try {
    teste = new Database(origem, { readonly: true, fileMustExist: true })
    const tabelas = (teste.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map((t) => t.name)
    for (const t of ['usuarios', 'produtos', 'compras', 'movimentacoes']) {
      if (!tabelas.includes(t)) throw new ErroNegocio('O arquivo não é um backup deste sistema.')
    }
    const versao = teste.pragma('user_version', { simple: true }) as number
    if (versao > VERSAO_SCHEMA) throw new ErroNegocio('Backup feito em uma versão mais nova do sistema. Atualize o app antes de restaurar.')
    const integridade = teste.pragma('integrity_check', { simple: true })
    if (integridade !== 'ok') throw new ErroNegocio('O arquivo de backup está corrompido.')
    const { n } = teste.prepare(`SELECT COUNT(*) AS n FROM usuarios WHERE perfil = 'admin' AND ativo = 1`).get() as { n: number }
    if (n === 0) throw new ErroNegocio('O backup não tem nenhum administrador ativo.')
  } catch (e) {
    if (e instanceof ErroNegocio) throw e
    throw new ErroNegocio('Não foi possível ler o arquivo. Verifique se é um backup válido (.sqlite).')
  } finally {
    teste?.close()
  }
}

/**
 * Substitui o banco atual pelo backup. Antes, guarda uma cópia de segurança do estado atual.
 * A sessão é encerrada: o usuário precisa entrar de novo com as senhas do backup.
 */
export async function restaurar(origem: string): Promise<void> {
  validarArquivo(origem)
  const atual = caminhoBanco()
  await criarBackup(join(pastaBackups, `antes-da-restauracao_${carimbo()}.sqlite`))

  fecharBanco()
  try {
    for (const sufixo of ['-wal', '-shm']) rmSync(atual + sufixo, { force: true })
    copyFileSync(origem, atual)
  } finally {
    // Reabre mesmo se a cópia falhar, para o app continuar utilizável. Migra se o backup for de versão anterior.
    abrirBanco(atual, false)
  }
  encerrarSessao()
  console.log(`[backup] restaurado de ${basename(origem)}`)
}

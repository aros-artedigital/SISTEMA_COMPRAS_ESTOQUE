import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { EstadoBackupExterno } from '@shared/api'
import { caminhoBanco } from '../db/conexao'
import { ErroNegocio } from '../erros'
import { criarBackup } from './backup'
import { agoraIso } from './mapeadores'

// Backup externo: cópia do banco numa pasta fora deste computador (pendrive, outro disco
// ou pasta sincronizada do Google Drive/OneDrive). A configuração fica num arquivo local,
// ao lado do banco: não vai para outros terminais nem se perde ao restaurar um backup.

const SUBPASTA = 'Gestor de Estoque - backups'
const MANTER = 10
const UM_DIA = 24 * 60 * 60 * 1000
/** Depois de tantos dias sem backup externo, o sistema avisa o administrador. */
export const DIAS_ATRASO = 7

interface ConfigLocal {
  backupExterno?: { pasta: string; ultimoEm: string | null; ultimoErro: string | null }
}

const arquivoConfig = (): string => join(dirname(caminhoBanco()), 'config-local.json')

function ler(): ConfigLocal {
  try {
    return JSON.parse(readFileSync(arquivoConfig(), 'utf8')) as ConfigLocal
  } catch {
    return {}
  }
}

function gravar(c: ConfigLocal): void {
  writeFileSync(arquivoConfig(), JSON.stringify(c, null, 2))
}

const destino = (pasta: string): string => join(pasta, SUBPASTA)

function listar(pasta: string): { caminho: string; data: number }[] {
  const d = destino(pasta)
  if (!existsSync(d)) return []
  return readdirSync(d)
    .filter((n) => n.startsWith('estoque_') && n.endsWith('.sqlite'))
    .map((n) => ({ caminho: join(d, n), data: statSync(join(d, n)).mtimeMs }))
    .sort((a, b) => b.data - a.data)
}

export function estado(): EstadoBackupExterno {
  const b = ler().backupExterno
  if (!b) return { pasta: null, ultimoEm: null, ultimoErro: null, arquivos: 0, diasSemBackup: null }
  const dias = b.ultimoEm ? Math.floor((Date.now() - new Date(b.ultimoEm).getTime()) / UM_DIA) : null
  let arquivos = 0
  try {
    arquivos = listar(b.pasta).length
  } catch {
    // pendrive desconectado: só não dá para contar
  }
  return { pasta: b.pasta, ultimoEm: b.ultimoEm, ultimoErro: b.ultimoErro, arquivos, diasSemBackup: dias }
}

/** Confere se a pasta existe e aceita gravação (pendrive conectado, sem proteção contra escrita). */
function validarPasta(pasta: string): void {
  if (!existsSync(pasta)) throw new ErroNegocio('A pasta não foi encontrada. Se for um pendrive ou disco externo, confira se está conectado.')
  try {
    mkdirSync(destino(pasta), { recursive: true })
    const teste = join(destino(pasta), '.teste-gravacao')
    writeFileSync(teste, 'ok')
    rmSync(teste, { force: true })
  } catch {
    throw new ErroNegocio('Não foi possível gravar nessa pasta. Escolha outra ou verifique as permissões.')
  }
  // Na mesma pasta do banco não protege contra a perda do computador.
  if (destino(pasta).toLowerCase().startsWith(dirname(caminhoBanco()).toLowerCase())) {
    throw new ErroNegocio('Escolha uma pasta fora da pasta do sistema (de preferência um pendrive, outro disco ou uma pasta do Google Drive/OneDrive).')
  }
}

/** Faz uma cópia agora. Erros ficam registrados (para o aviso) e são repassados a quem chamou. */
export async function fazerAgora(): Promise<EstadoBackupExterno> {
  const c = ler()
  if (!c.backupExterno) throw new ErroNegocio('Escolha primeiro a pasta do backup externo.')
  try {
    validarPasta(c.backupExterno.pasta)
    // Milissegundos no nome: duas cópias no mesmo segundo não se sobrescrevem.
    const ms = String(new Date().getMilliseconds()).padStart(3, '0')
    await criarBackup(join(destino(c.backupExterno.pasta), `estoque_${agoraIso().replace('T', '_').replace(/:/g, '')}-${ms}.sqlite`))
    for (const antigo of listar(c.backupExterno.pasta).slice(MANTER)) rmSync(antigo.caminho, { force: true })
    c.backupExterno = { ...c.backupExterno, ultimoEm: new Date().toISOString(), ultimoErro: null }
    gravar(c)
  } catch (e) {
    c.backupExterno = { ...c.backupExterno, ultimoErro: (e as Error).message }
    gravar(c)
    throw e
  }
  return estado()
}

export async function configurar(pasta: string): Promise<EstadoBackupExterno> {
  validarPasta(pasta)
  gravar({ ...ler(), backupExterno: { pasta, ultimoEm: null, ultimoErro: null } })
  return fazerAgora()
}

export function desativar(): EstadoBackupExterno {
  const c = ler()
  delete c.backupExterno
  gravar(c)
  return estado()
}

/** Ao abrir o app: se passou um dia desde a última cópia externa, faz outra. Nunca impede o uso. */
export async function backupExternoAutomatico(): Promise<void> {
  const b = ler().backupExterno
  if (!b) return
  if (b.ultimoEm && Date.now() - new Date(b.ultimoEm).getTime() < UM_DIA) return
  try {
    await fazerAgora()
  } catch (e) {
    console.error('[backup externo]', (e as Error).message)
  }
}

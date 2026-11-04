import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { EstadoAtualizacao } from '@shared/api'
import { janelaPrincipal } from './janela'
import { lerConfig } from './servicos/sync/config'

// Atualização automática: o app instalado procura novas versões na pasta "atualizacoes"
// do servidor de sincronização (arquivos latest.yml + instalador gerados por "npm run dist").

let atual: EstadoAtualizacao = { status: 'desativada', versaoAtual: app.getVersion() }
let configurado = false

function definir(e: Partial<EstadoAtualizacao>): EstadoAtualizacao {
  atual = { ...atual, ...e, versaoAtual: app.getVersion() }
  janelaPrincipal()?.webContents.send('atualizacao:estado', atual)
  return atual
}

/** Endereço das atualizações: ESTOQUE_ATUALIZACAO_URL (testes) ou <servidor>/atualizacoes. */
function urlAtualizacoes(): string | null {
  const env = process.env['ESTOQUE_ATUALIZACAO_URL']
  if (env) return env
  const { url } = lerConfig()
  return url ? `${url}/atualizacoes` : null
}

function preparar(): string | null {
  if (!app.isPackaged) {
    definir({ status: 'desativada', mensagem: 'A atualização automática funciona apenas no aplicativo instalado.' })
    return null
  }
  const url = urlAtualizacoes()
  if (!url) {
    definir({ status: 'desativada', mensagem: 'Conecte este terminal a um servidor de sincronização para receber atualizações.' })
    return null
  }
  autoUpdater.setFeedURL({ provider: 'generic', url })
  if (!configurado) {
    configurado = true
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('checking-for-update', () => definir({ status: 'verificando', mensagem: undefined }))
    autoUpdater.on('update-not-available', () => definir({ status: 'atualizado', novaVersao: undefined, mensagem: undefined }))
    autoUpdater.on('update-available', (i) => definir({ status: 'disponivel', novaVersao: i.version, progresso: 0 }))
    autoUpdater.on('download-progress', (p) => definir({ status: 'baixando', progresso: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (i) => definir({ status: 'pronta', novaVersao: i.version, progresso: 100 }))
    autoUpdater.on('error', (e) => definir({ status: 'erro', mensagem: mensagemErro(e) }))
  }
  return url
}

function mensagemErro(e: Error): string {
  const m = e.message ?? ''
  if (/404|latest\.yml/.test(m)) return 'Nenhuma versão publicada no servidor ainda.'
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::/.test(m)) return 'Sem conexão com o servidor de atualizações.'
  return `Não foi possível verificar atualizações: ${m.split('\n')[0]}`
}

export function estado(): EstadoAtualizacao {
  return atual
}

export async function verificar(): Promise<EstadoAtualizacao> {
  if (!preparar()) return atual
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    definir({ status: 'erro', mensagem: mensagemErro(e as Error) })
  }
  return atual
}

/** Fecha o app e roda o instalador da versão baixada. */
export function instalar(): void {
  if (atual.status === 'pronta') autoUpdater.quitAndInstall(false, true)
}

/** Verifica ao abrir e depois a cada 6 horas. */
export function iniciarAtualizacoes(): void {
  setTimeout(() => void verificar(), 15_000)
  setInterval(() => void verificar(), 6 * 60 * 60 * 1000)
}

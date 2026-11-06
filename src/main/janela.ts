import { BrowserWindow, dialog, type FileFilter } from 'electron'

// Referência à janela principal, usada como "dona" dos diálogos de abrir/salvar.
let principal: BrowserWindow | null = null

export function definirJanelaPrincipal(win: BrowserWindow | null): void {
  principal = win
}

export function janelaPrincipal(): BrowserWindow | null {
  return principal && !principal.isDestroyed() ? principal : null
}

/** Diálogo "Salvar como". Retorna o caminho escolhido ou null se o usuário cancelar. */
export async function escolherDestino(titulo: string, nomePadrao: string, filtros: FileFilter[]): Promise<string | null> {
  const opcoes = { title: titulo, defaultPath: nomePadrao, filters: filtros }
  const win = janelaPrincipal()
  const r = win ? await dialog.showSaveDialog(win, opcoes) : await dialog.showSaveDialog(opcoes)
  return r.canceled || !r.filePath ? null : r.filePath
}

/** Diálogo "Abrir arquivo". Retorna o caminho escolhido ou null se o usuário cancelar. */
export async function escolherArquivo(titulo: string, filtros: FileFilter[]): Promise<string | null> {
  const opcoes = { title: titulo, filters: filtros, properties: ['openFile' as const] }
  const win = janelaPrincipal()
  const r = win ? await dialog.showOpenDialog(win, opcoes) : await dialog.showOpenDialog(opcoes)
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
}

/** Diálogo "Escolher pasta". Retorna o caminho ou null se o usuário cancelar. */
export async function escolherPasta(titulo: string): Promise<string | null> {
  const opcoes = { title: titulo, properties: ['openDirectory' as const, 'createDirectory' as const] }
  const win = janelaPrincipal()
  const r = win ? await dialog.showOpenDialog(win, opcoes) : await dialog.showOpenDialog(opcoes)
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
}

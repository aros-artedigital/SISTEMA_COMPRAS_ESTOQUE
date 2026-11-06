import { app, BrowserWindow, dialog, shell } from 'electron'
import { dirname, join } from 'path'
import { abrirBanco, fecharBanco } from './db/conexao'
import { registrarCanais } from './ipc'
import { definirJanelaPrincipal } from './janela'
import { backupAutomatico, configurarPastaBackups } from './servicos/backup'
import { backupExternoAutomatico } from './servicos/backupExterno'
import { iniciarAgendador } from './servicos/sync/motor'
import { iniciarAtualizacoes } from './atualizacao'

// Banco em %APPDATA%/gestor-estoque-compras. ESTOQUE_DB_PATH permite apontar outro arquivo (usado nos testes).
const caminhoBanco = process.env['ESTOQUE_DB_PATH'] || join(app.getPath('userData'), 'estoque.sqlite')
// Dados de demonstração só em desenvolvimento; o app instalado começa só com o administrador.
const comDemo = !app.isPackaged || process.env['ESTOQUE_DEMO'] === '1'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'Gestor de Estoque e Compras',
    autoHideMenuBar: true,
    backgroundColor: '#f1f5f9',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  definirJanelaPrincipal(win)
  win.on('closed', () => definirJanelaPrincipal(null))
  win.once('ready-to-show', () => win.show())

  // Links externos abrem no navegador padrão, nunca dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  try {
    abrirBanco(caminhoBanco, comDemo)
  } catch (e) {
    dialog.showErrorBox('Erro ao abrir o banco de dados', `${caminhoBanco}\n\n${(e as Error).message}`)
    app.quit()
    return
  }
  // Backups ficam ao lado do banco, na subpasta "backups".
  configurarPastaBackups(join(dirname(caminhoBanco), 'backups'))
  registrarCanais()
  createWindow()
  void backupAutomatico().then(backupExternoAutomatico)
  iniciarAgendador()
  iniciarAtualizacoes()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', fecharBanco)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

import { BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import type { OpcoesPagina } from '@shared/api'

// Relatórios e etiquetas chegam como HTML pronto (montado na interface) e são
// renderizados numa janela oculta, sem JavaScript e sem acesso ao Node.

async function renderizar<T>(html: string, acao: (win: BrowserWindow) => Promise<T>): Promise<T> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await acao(win)
  } finally {
    win.destroy()
  }
}

const rodape = `
  <div style="width:100%;font-size:8px;color:#64748b;padding:0 12mm;display:flex;justify-content:space-between;font-family:'Segoe UI',sans-serif">
    <span>Gestor de Estoque e Compras</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`

export async function gerarPdf(html: string, destino: string, pagina: OpcoesPagina): Promise<string> {
  const pdf = await renderizar(html, (win) =>
    win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true, // tamanho e margens vêm do @page do HTML (A4, rolo térmico...)
      landscape: pagina.paisagem ?? false,
      displayHeaderFooter: pagina.numerarPaginas ?? false,
      headerTemplate: '<span></span>',
      footerTemplate: rodape
    })
  )
  writeFileSync(destino, pdf)
  return destino
}

/** Abre o diálogo de impressão do Windows. Retorna false se o usuário cancelar. */
export function imprimir(html: string, pagina: OpcoesPagina): Promise<boolean> {
  return renderizar(
    html,
    (win) =>
      new Promise<boolean>((resolve, reject) => {
        win.webContents.print({ silent: false, printBackground: true, landscape: pagina.paisagem ?? false }, (ok, motivo) => {
          if (ok || motivo === 'cancelled' || motivo === 'Print job canceled') resolve(ok)
          else reject(new Error(`Falha ao imprimir: ${motivo}`))
        })
      })
  )
}

import type { OpcoesPagina, Planilha } from '@shared/api'
import { chamar } from '@/data/api'
import type { Notificar } from '@/contexts/ToastContext'
import { executar } from './executar'
import { emPaisagem, paraHtml, paraPlanilha, type Relatorio } from './relatorio'

// Ações de saída usadas por várias telas: PDF, impressão e Excel.

const mostrarNaPasta = (caminho: string) => ({ rotulo: 'Mostrar na pasta', executar: () => void chamar('arquivo:mostrar', caminho) })

export async function salvarPdf(html: string, nome: string, pagina: OpcoesPagina, notificar: Notificar): Promise<void> {
  let caminho: string | null = null
  const ok = await executar(async () => (caminho = await chamar('relatorio:pdf', html, nome, pagina)), { notificar })
  if (ok && caminho) notificar('sucesso', 'PDF salvo.', mostrarNaPasta(caminho))
}

export async function imprimir(html: string, pagina: OpcoesPagina, notificar: Notificar): Promise<void> {
  await executar(() => chamar('relatorio:imprimir', html, pagina), { notificar })
}

export async function exportarExcel(planilha: Planilha, nome: string, notificar: Notificar): Promise<void> {
  let caminho: string | null = null
  const ok = await executar(async () => (caminho = await chamar('excel:exportar', planilha, nome)), { notificar })
  if (ok && caminho) notificar('sucesso', 'Planilha exportada.', mostrarNaPasta(caminho))
}

/** Atalhos para um relatório completo. */
export const relatorioPdf = (r: Relatorio, empresa: string, nome: string, n: Notificar) =>
  salvarPdf(paraHtml(r, empresa), nome, { paisagem: emPaisagem(r), numerarPaginas: true }, n)
export const relatorioImprimir = (r: Relatorio, empresa: string, n: Notificar) => imprimir(paraHtml(r, empresa), { paisagem: emPaisagem(r) }, n)
export const relatorioExcel = (r: Relatorio, nome: string, n: Notificar) => exportarExcel(paraPlanilha(r), nome, n)

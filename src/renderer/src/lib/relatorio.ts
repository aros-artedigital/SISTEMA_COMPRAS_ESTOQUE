import type { FormatoColuna, Planilha } from '@shared/api'
import * as fmt from '@shared/format'

// Estrutura única de relatório: a mesma definição vira tabela na tela, PDF/impressão e planilha Excel.

export type Valor = string | number | null

export interface ColunaRelatorio {
  titulo: string
  formato?: FormatoColuna
  /** Peso relativo da largura no PDF. */
  peso?: number
}

export interface Relatorio {
  titulo: string
  /** Texto curto com os filtros aplicados, impresso no cabeçalho. */
  filtros: string[]
  colunas: ColunaRelatorio[]
  linhas: Valor[][]
  /** Linha de totais no fim da tabela (mesmo número de colunas; null = vazio). */
  totais?: Valor[]
  /** Quadros de resumo exibidos acima da tabela. */
  resumo?: { rotulo: string; valor: string }[]
}

export function formatar(v: Valor, formato: FormatoColuna = 'texto'): string {
  if (v === null || v === '') return ''
  switch (formato) {
    case 'moeda':
      return typeof v === 'number' ? fmt.moeda(v) : String(v)
    case 'numero':
      return typeof v === 'number' ? fmt.numero(v) : String(v)
    case 'data':
      return typeof v === 'string' ? fmt.data(v) : String(v)
    case 'dataHora':
      return typeof v === 'string' ? fmt.dataHora(v) : String(v)
    default:
      return String(v)
  }
}

export const alinhadoADireita = (f?: FormatoColuna): boolean => f === 'moeda' || f === 'numero'

export function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Relatórios com muitas colunas saem em paisagem. */
export const emPaisagem = (r: Relatorio): boolean => r.colunas.length > 7

export function paraPlanilha(r: Relatorio): Planilha {
  const linhas = r.totais ? [...r.linhas, r.totais] : r.linhas
  return { nome: r.titulo, colunas: r.colunas.map((c) => ({ titulo: c.titulo, formato: c.formato })), linhas }
}

export function paraHtml(r: Relatorio, empresa: string): string {
  const paisagem = emPaisagem(r)
  const pesos = r.colunas.map((c) => c.peso ?? 1)
  const somaPesos = pesos.reduce((a, b) => a + b, 0)
  const celula = (v: Valor, c: ColunaRelatorio, tag: 'td' | 'th' = 'td'): string =>
    `<${tag} class="${alinhadoADireita(c.formato) ? 'num' : ''}">${escapar(formatar(v, c.formato))}</${tag}>`

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${escapar(r.titulo)}</title>
<style>
  @page { size: A4 ${paisagem ? 'landscape' : 'portrait'}; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; color: #0f172a; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #13294b; padding-bottom: 6px; margin-bottom: 10px; }
  h1 { font-size: 15pt; margin: 0; color: #13294b; }
  .empresa { font-weight: 600; font-size: 10pt; }
  .meta { text-align: right; font-size: 8pt; color: #475569; }
  .filtros { font-size: 8.5pt; color: #475569; margin: 0 0 10px; }
  .resumo { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
  .resumo div { border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 10px; min-width: 110px; }
  .resumo span { display: block; font-size: 7.5pt; color: #64748b; text-transform: uppercase; letter-spacing: .03em; }
  .resumo strong { font-size: 11pt; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: #13294b; color: #fff; text-align: left; font-weight: 600; padding: 5px 6px; font-size: 8.5pt; }
  td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; overflow-wrap: anywhere; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  tfoot td { font-weight: 700; border-top: 2px solid #13294b; border-bottom: none; background: #f1f5f9; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .vazio { text-align: center; color: #64748b; padding: 24px; }
</style></head><body>
<header>
  <div><div class="empresa">${escapar(empresa)}</div><h1>${escapar(r.titulo)}</h1></div>
  <div class="meta">Emitido em ${escapar(fmt.dataHora(agoraIso()))}<br>${r.linhas.length} registro(s)</div>
</header>
${r.filtros.length ? `<p class="filtros">${r.filtros.map(escapar).join(' · ')}</p>` : ''}
${r.resumo?.length ? `<div class="resumo">${r.resumo.map((x) => `<div><span>${escapar(x.rotulo)}</span><strong>${escapar(x.valor)}</strong></div>`).join('')}</div>` : ''}
<table>
  <colgroup>${pesos.map((p) => `<col style="width:${((p / somaPesos) * 100).toFixed(2)}%">`).join('')}</colgroup>
  <thead><tr>${r.colunas.map((c) => `<th class="${alinhadoADireita(c.formato) ? 'num' : ''}">${escapar(c.titulo)}</th>`).join('')}</tr></thead>
  <tbody>${
    r.linhas.length
      ? r.linhas.map((l) => `<tr>${l.map((v, i) => celula(v, r.colunas[i])).join('')}</tr>`).join('')
      : `<tr><td class="vazio" colspan="${r.colunas.length}">Nenhum registro para os filtros selecionados.</td></tr>`
  }</tbody>
  ${r.totais ? `<tfoot><tr>${r.totais.map((v, i) => celula(v, r.colunas[i])).join('')}</tr></tfoot>` : ''}
</table>
</body></html>`
}

function agoraIso(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

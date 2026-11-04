import JsBarcode from 'jsbarcode'
import type { Produto } from '@shared/tipos'
import * as fmt from '@shared/format'
import { escapar } from './relatorio'

// Etiquetas de produto com código de barras, montadas em HTML (medidas em mm) para PDF ou impressão.

export interface ModeloEtiqueta {
  id: string
  nome: string
  /** Tamanho da página em mm. */
  pagina: { largura: number; altura: number }
  margem: { topo: number; esquerda: number }
  etiqueta: { largura: number; altura: number }
  colunas: number
  linhas: number
  espaco: { horizontal: number; vertical: number }
}

export const modelos: ModeloEtiqueta[] = [
  {
    id: 'a4-3x7',
    nome: 'Folha A4 — 3 × 7 (63,5 × 38,1 mm)',
    pagina: { largura: 210, altura: 297 },
    margem: { topo: 15.1, esquerda: 7.2 },
    etiqueta: { largura: 63.5, altura: 38.1 },
    colunas: 3,
    linhas: 7,
    espaco: { horizontal: 2.5, vertical: 0 }
  },
  {
    id: 'a4-4x10',
    nome: 'Folha A4 — 4 × 10 (48,5 × 25,4 mm)',
    pagina: { largura: 210, altura: 297 },
    margem: { topo: 21.6, esquerda: 8 },
    etiqueta: { largura: 48.5, altura: 25.4 },
    colunas: 4,
    linhas: 10,
    espaco: { horizontal: 0, vertical: 0 }
  },
  {
    id: 'rolo-50x30',
    nome: 'Rolo térmico — 50 × 30 mm (1 por página)',
    pagina: { largura: 50, altura: 30 },
    margem: { topo: 0, esquerda: 0 },
    etiqueta: { largura: 50, altura: 30 },
    colunas: 1,
    linhas: 1,
    espaco: { horizontal: 0, vertical: 0 }
  }
]

export interface OpcoesEtiqueta {
  mostrarPreco: boolean
  mostrarCodigo: boolean
  /** Pula as primeiras N posições da folha (para reaproveitar folhas já usadas). */
  pular: number
}

/** Dígito verificador EAN-8/EAN-13. */
function eanValido(codigo: string): boolean {
  if (!/^\d{8}$|^\d{13}$/.test(codigo)) return false
  const digitos = codigo.split('').map(Number)
  const dv = digitos.pop()!
  const soma = digitos.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (soma % 10)) % 10 === dv
}

/** SVG do código de barras: EAN quando o código é um EAN válido, senão CODE128 (aceita letras). */
export function codigoBarrasSvg(valor: string, altura = 40): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  JsBarcode(svg, valor, {
    format: eanValido(valor) ? (valor.length === 13 ? 'EAN13' : 'EAN8') : 'CODE128',
    height: altura,
    margin: 0,
    fontSize: 12,
    textMargin: 1,
    displayValue: true,
    background: 'transparent'
  })
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  return svg.outerHTML
}

export function htmlEtiquetas(itens: { produto: Produto; quantidade: number }[], modelo: ModeloEtiqueta, op: OpcoesEtiqueta): string {
  const porPagina = modelo.colunas * modelo.linhas
  const celulas: string[] = Array.from({ length: Math.max(0, Math.min(op.pular, porPagina - 1)) }, () => '<div class="et vazia"></div>')
  for (const { produto: p, quantidade } of itens) {
    const valor = p.codigoBarras || p.codigo
    const etiqueta = `<div class="et">
      <div class="nome">${escapar(p.nome)}</div>
      <div class="barras">${codigoBarrasSvg(valor)}</div>
      <div class="rodape">${op.mostrarCodigo ? `<span>${escapar(p.codigo)}</span>` : '<span></span>'}${op.mostrarPreco ? `<strong>${escapar(fmt.moeda(p.precoVenda))}</strong>` : ''}</div>
    </div>`
    for (let i = 0; i < quantidade; i++) celulas.push(etiqueta)
  }

  const paginas: string[] = []
  for (let i = 0; i < celulas.length; i += porPagina) paginas.push(`<section class="folha">${celulas.slice(i, i + porPagina).join('')}</section>`)

  const { pagina, margem, etiqueta: e, espaco } = modelo
  const pequena = e.altura < 30
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas</title><style>
  @page { size: ${pagina.largura}mm ${pagina.altura}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #000; }
  .folha {
    width: ${pagina.largura}mm; height: ${pagina.altura}mm; padding: ${margem.topo}mm 0 0 ${margem.esquerda}mm;
    display: grid; grid-template-columns: repeat(${modelo.colunas}, ${e.largura}mm); grid-auto-rows: ${e.altura}mm;
    column-gap: ${espaco.horizontal}mm; row-gap: ${espaco.vertical}mm; page-break-after: always; overflow: hidden;
  }
  .folha:last-child { page-break-after: auto; }
  .et { width: ${e.largura}mm; height: ${e.altura}mm; padding: ${pequena ? 1.2 : 2}mm ${pequena ? 1.5 : 2.5}mm; display: flex; flex-direction: column; overflow: hidden; }
  .nome { font-size: ${pequena ? 6.5 : 8}pt; font-weight: 600; line-height: 1.15; max-height: ${pequena ? 2.3 : 2.4}em; overflow: hidden; }
  .barras { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 0.5mm 0; }
  .barras svg { max-width: 100%; max-height: 100%; height: 100%; }
  .rodape { display: flex; justify-content: space-between; align-items: baseline; font-size: ${pequena ? 6 : 7}pt; }
  .rodape strong { font-size: ${pequena ? 8 : 10}pt; }
</style></head><body>${paginas.join('')}</body></html>`
}

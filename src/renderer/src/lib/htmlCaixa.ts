import type { CaixaResumo } from '@shared/api'
import { rotuloFormaPagamento } from '@shared/dominio'
import * as fmt from '@shared/format'
import type { FormaPagamento } from '@shared/tipos'
import { escapar } from './relatorio'

// Comprovante de fechamento de caixa em formato de cupom (80 mm): conferência por forma de pagamento,
// sangrias e suprimentos, e espaço para a assinatura do operador.

export const FORMAS_CAIXA: FormaPagamento[] = ['dinheiro', 'pix', 'debito', 'credito', 'boleto', 'outro']

export const rotuloLancamento = { venda: 'Venda', os: 'OS', cancelamento: 'Cancelamento', estorno: 'Estorno', sangria: 'Sangria', suprimento: 'Suprimento' } as const

export function htmlFechamento(c: CaixaResumo, empresa: string): string {
  const e = (v: string): string => escapar(v)
  const formas = FORMAS_CAIXA.filter((f) => c.esperado[f] || c.contado?.[f])
  const soma = (tipo: keyof typeof rotuloLancamento): number => c.lancamentos.filter((l) => l.tipo === tipo).reduce((t, l) => t + l.valor, 0)
  const difTotal = c.contado ? formas.reduce((t, f) => t + (c.contado![f] ?? 0) - c.esperado[f], 0) : 0
  const linhas = formas
    .map((f) => {
      const dif = c.contado ? (c.contado[f] ?? 0) - c.esperado[f] : 0
      return `<tr><td>${e(rotuloFormaPagamento[f])}</td><td class="num">${e(fmt.moeda(c.esperado[f]))}</td><td class="num">${c.contado ? e(fmt.moeda(c.contado[f] ?? 0)) : '—'}</td><td class="num">${
        Math.abs(dif) < 0.005 ? '—' : e(fmt.moeda(dif))
      }</td></tr>`
    })
    .join('')
  const movs = c.lancamentos
    .filter((l) => l.tipo === 'sangria' || l.tipo === 'suprimento')
    .map((l) => `<tr><td>${e(fmt.dataHora(l.em).slice(-5))} ${e(rotuloLancamento[l.tipo])}<br><small>${e(l.descricao)}</small></td><td class="num">${e(fmt.moeda(l.valor))}</td></tr>`)
    .join('')
  const altura = 150 + formas.length * 6 + c.lancamentos.filter((l) => l.tipo === 'sangria' || l.tipo === 'suprimento').length * 9
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Fechamento ${e(c.numero)}</title><style>
  @page { size: 80mm ${altura}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; }
  body { width: 80mm; padding: 5mm 4mm; font-family: Consolas, 'Courier New', monospace; font-size: 8pt; color: #000; }
  .centro { text-align: center; } .empresa { font-size: 10pt; font-weight: 700; }
  hr { border: none; border-top: 1px dashed #000; margin: 2.5mm 0; }
  table { width: 100%; border-collapse: collapse; } td, th { padding: 0.4mm 0; vertical-align: top; text-align: left; font-weight: normal; }
  th { font-size: 7pt; } .num { text-align: right; white-space: nowrap; } small { font-size: 7pt; }
  .total td { font-weight: 700; border-top: 1px solid #000; padding-top: 1mm; }
  .assinatura { margin-top: 12mm; border-top: 1px solid #000; text-align: center; padding-top: 1mm; }
</style></head><body>
  <div class="centro"><div class="empresa">${e(empresa)}</div><div>FECHAMENTO DE CAIXA</div><div><strong>${e(c.numero)}</strong></div></div>
  <hr>
  <div>Abertura: ${e(fmt.dataHora(c.abertoEm))} (${e(c.abertoPor)})</div>
  <div>Fechamento: ${c.fechadoEm ? `${e(fmt.dataHora(c.fechadoEm))} (${e(c.fechadoPor ?? '')})` : 'em aberto'}</div>
  <hr>
  <table>
    <tr><td>Troco inicial</td><td class="num">${e(fmt.moeda(c.troco))}</td></tr>
    <tr><td>Vendas</td><td class="num">${e(fmt.moeda(soma('venda')))}</td></tr>
    <tr><td>Recebimentos de OS</td><td class="num">${e(fmt.moeda(soma('os')))}</td></tr>
    <tr><td>Cancelamentos/estornos</td><td class="num">${e(fmt.moeda(soma('cancelamento') + soma('estorno')))}</td></tr>
    <tr><td>Suprimentos</td><td class="num">${e(fmt.moeda(soma('suprimento')))}</td></tr>
    <tr><td>Sangrias</td><td class="num">${e(fmt.moeda(soma('sangria')))}</td></tr>
  </table>
  <hr>
  <table><tr><th>Forma</th><th class="num">Esperado</th><th class="num">Contado</th><th class="num">Dif.</th></tr>${linhas}
    ${c.contado ? `<tr class="total"><td colspan="3">Diferença total</td><td class="num">${e(fmt.moeda(difTotal))}</td></tr>` : ''}
  </table>
  ${movs ? `<hr><table>${movs}</table>` : ''}
  ${c.observacao ? `<hr><div>${e(c.observacao)}</div>` : ''}
  <div class="assinatura">${e(c.fechadoPor ?? c.abertoPor)}</div>
</body></html>`
}

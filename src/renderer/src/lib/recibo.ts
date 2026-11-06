import type { Snapshot } from '@shared/api'
import { rotuloFormaPagamento, subtotalVenda, totalVenda } from '@shared/dominio'
import * as fmt from '@shared/format'
import type { Venda } from '@shared/tipos'
import { escapar } from './relatorio'

// Recibo de venda em formato de cupom (80 mm), para impressoras térmicas ou PDF.
// Não é documento fiscal.

export function htmlRecibo(v: Venda, db: Snapshot): string {
  const empresa = db.configuracoes
  const cliente = v.clienteId ? db.clientes.find((c) => c.id === v.clienteId) : null
  const vendedor = db.usuarios.find((u) => u.id === v.usuarioId)?.nome ?? ''
  const produto = (id: number) => db.produtos.find((p) => p.id === id)
  const altura = 120 + v.itens.length * 9 + (v.status === 'cancelada' ? 12 : 0)

  const linhas = v.itens
    .map((i) => {
      const p = produto(i.produtoId)
      return `<tr><td colspan="3" class="nome">${escapar(p?.nome ?? '')}</td></tr>
        <tr class="valores"><td>${fmt.numero(i.quantidade)} × ${escapar(fmt.moeda(i.valorUnitario))}</td><td></td><td class="num">${escapar(fmt.moeda(i.quantidade * i.valorUnitario))}</td></tr>`
    })
    .join('')

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo ${escapar(v.numero)}</title><style>
  @page { size: 80mm ${altura}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; }
  body { width: 80mm; padding: 5mm 4mm; font-family: Consolas, 'Courier New', monospace; font-size: 8.5pt; color: #000; }
  .centro { text-align: center; }
  .empresa { font-size: 10pt; font-weight: 700; }
  hr { border: none; border-top: 1px dashed #000; margin: 2.5mm 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 0.4mm 0; vertical-align: top; }
  .nome { padding-top: 1mm; }
  .num { text-align: right; white-space: nowrap; }
  .total td { font-size: 11pt; font-weight: 700; padding-top: 1mm; }
  .cancelada { border: 1.5px solid #000; padding: 1.5mm; text-align: center; font-weight: 700; margin-bottom: 2mm; }
  .rodape { font-size: 7.5pt; }
</style></head><body>
  <div class="centro">
    <div class="empresa">${escapar(empresa.nomeEmpresa)}</div>
    ${empresa.cnpj ? `<div>CNPJ ${escapar(empresa.cnpj)}</div>` : ''}
    ${empresa.endereco ? `<div>${escapar(empresa.endereco)}</div>` : ''}
    ${empresa.telefone ? `<div>${escapar(empresa.telefone)}</div>` : ''}
  </div>
  <hr>
  ${v.status === 'cancelada' ? `<div class="cancelada">VENDA CANCELADA<br>${escapar(v.motivoCancelamento)}</div>` : ''}
  <div>Venda: <strong>${escapar(v.numero)}</strong></div>
  <div>Data: ${escapar(fmt.dataHora(v.data))}</div>
  <div>Cliente: ${escapar(cliente ? `${cliente.nome} (${cliente.documento})` : 'Consumidor final')}</div>
  <div>Atendente: ${escapar(vendedor)}</div>
  <hr>
  <table>${linhas}</table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="num">${escapar(fmt.moeda(subtotalVenda(v)))}</td></tr>
    ${v.desconto ? `<tr><td>Desconto</td><td class="num">- ${escapar(fmt.moeda(v.desconto))}</td></tr>` : ''}
    <tr class="total"><td>TOTAL</td><td class="num">${escapar(fmt.moeda(totalVenda(v)))}</td></tr>
    <tr><td>Pagamento</td><td class="num">${escapar(rotuloFormaPagamento[v.formaPagamento])}</td></tr>
  </table>
  ${v.observacao ? `<hr><div>${escapar(v.observacao)}</div>` : ''}
  <hr>
  <div class="centro rodape">Obrigado pela preferência!<br>Documento sem valor fiscal</div>
</body></html>`
}

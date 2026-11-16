import type { Snapshot } from '@shared/api'
import { descreverEquipamento, rotuloStatusOS, subtotalOS, totalOS } from '@shared/dominio'
import * as fmt from '@shared/format'
import type { OrdemServico } from '@shared/tipos'
import { escapar } from './relatorio'

// Ordem de serviço impressa (A4): entregue ao cliente na entrada do equipamento (comprovante)
// e na entrega (com laudo, valores e garantia). Tem espaço para as assinaturas.

const e = (v: string | number | null | undefined): string => escapar(String(v ?? ''))
const quebras = (v: string): string => e(v).replace(/\n/g, '<br>')

export function htmlOS(o: OrdemServico, db: Snapshot): string {
  const empresa = db.configuracoes
  const cliente = db.clientes.find((c) => c.id === o.clienteId)
  const tecnico = o.tecnicoId ? db.usuarios.find((u) => u.id === o.tecnicoId)?.nome : ''
  const produto = (id: number | null) => db.produtos.find((p) => p.id === id)
  const endereco = cliente
    ? [cliente.logradouro && `${cliente.logradouro}${cliente.numero ? `, ${cliente.numero}` : ''}`, cliente.complemento, cliente.bairro, cliente.cidade && `${cliente.cidade}${cliente.uf ? `/${cliente.uf}` : ''}`]
        .filter(Boolean)
        .join(' — ')
    : ''

  const campo = (rotulo: string, valor: string): string => (valor ? `<div class="campo"><span>${e(rotulo)}</span>${valor}</div>` : '')
  const bloco = (titulo: string, texto: string): string => (texto.trim() ? `<h3>${e(titulo)}</h3><p class="texto">${quebras(texto)}</p>` : '')

  const linhas = o.itens
    .map((i) => {
      const nome = i.tipo === 'peca' ? `${produto(i.produtoId)?.nome ?? 'Peça'}` : i.descricao
      return `<tr><td>${i.tipo === 'peca' ? 'Peça' : 'Serviço'}</td><td>${e(nome)}</td><td class="num">${fmt.numero(i.quantidade)}</td><td class="num">${e(fmt.moeda(i.valorUnitario))}</td><td class="num">${e(fmt.moeda(i.quantidade * i.valorUnitario))}</td></tr>`
    })
    .join('')

  const garantia =
    o.garantiaDias > 0
      ? `Garantia de ${o.garantiaDias} dias para os serviços e peças descritos acima, contados a partir da entrega do equipamento. A garantia não cobre mau uso, quedas, contato com líquidos ou violação por terceiros.`
      : 'Sem garantia.'

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>OS ${e(o.numero)}</title><style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; color: #1e293b; }
  .topo { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e293b; padding-bottom: 8px; }
  .empresa { font-size: 14pt; font-weight: 700; }
  .empresa-dados { color: #475569; font-size: 8.5pt; line-height: 1.4; }
  .numero { text-align: right; }
  .numero .rotulo { font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: #64748b; }
  .numero .valor { font-size: 16pt; font-weight: 700; }
  .status { display: inline-block; margin-top: 2px; border: 1px solid #1e293b; border-radius: 10px; padding: 1px 8px; font-size: 8pt; font-weight: 600; }
  .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .caixa { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; }
  .caixa h2 { margin: 0 0 4px; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: #64748b; }
  .campo { margin: 1.5px 0; }
  .campo span { color: #64748b; margin-right: 4px; }
  h3 { margin: 10px 0 2px; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: #64748b; }
  .texto { margin: 0; line-height: 1.45; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { text-align: left; font-size: 8pt; color: #64748b; font-weight: 600; border-bottom: 1px solid #94a3b8; padding: 4px; }
  td { padding: 4px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .totais { margin-left: auto; width: 45%; margin-top: 4px; }
  .totais td { border: none; padding: 2px 4px; }
  .totais .total td { font-size: 12pt; font-weight: 700; border-top: 1.5px solid #1e293b; padding-top: 4px; }
  .garantia { margin-top: 12px; font-size: 8.5pt; color: #334155; border-top: 1px dashed #94a3b8; padding-top: 6px; }
  .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; text-align: center; font-size: 8.5pt; color: #475569; }
  .assinaturas div { border-top: 1px solid #1e293b; padding-top: 4px; }
  .cancelada { margin-top: 10px; border: 2px solid #b91c1c; color: #b91c1c; text-align: center; font-weight: 700; padding: 6px; border-radius: 6px; }
</style></head><body>
  <div class="topo">
    <div>
      <div class="empresa">${e(empresa.nomeEmpresa)}</div>
      <div class="empresa-dados">
        ${empresa.cnpj ? `CNPJ ${e(empresa.cnpj)}<br>` : ''}
        ${empresa.endereco ? `${e(empresa.endereco)}<br>` : ''}
        ${[empresa.telefone, empresa.email].filter(Boolean).map(e).join(' · ')}
      </div>
    </div>
    <div class="numero">
      <div class="rotulo">Ordem de serviço</div>
      <div class="valor">${e(o.numero)}</div>
      <div class="status">${e(rotuloStatusOS[o.status])}</div>
    </div>
  </div>
  ${o.status === 'cancelada' ? `<div class="cancelada">ORDEM DE SERVIÇO CANCELADA</div>` : ''}

  <div class="grade">
    <div class="caixa">
      <h2>Cliente</h2>
      <div class="campo"><strong>${e(cliente?.nome ?? '—')}</strong></div>
      ${campo(cliente?.tipo === 'PJ' ? 'CNPJ' : 'CPF', e(cliente?.documento))}
      ${campo('Telefone', e(cliente?.telefone))}
      ${campo('E-mail', e(cliente?.email))}
      ${campo('Endereço', e(endereco))}
    </div>
    <div class="caixa">
      <h2>Atendimento</h2>
      ${campo('Entrada', e(fmt.dataHora(o.dataEntrada)))}
      ${campo('Previsão', o.previsao ? e(fmt.data(o.previsao)) : '')}
      ${campo('Pronta em', o.concluidaEm ? e(fmt.dataHora(o.concluidaEm)) : '')}
      ${campo('Entregue em', o.entregueEm ? e(fmt.dataHora(o.entregueEm)) : '')}
      ${campo('Técnico', e(tecnico))}
    </div>
  </div>

  <div class="caixa" style="margin-top:10px">
    <h2>Equipamento</h2>
    <div class="campo"><strong>${e(descreverEquipamento(o))}</strong></div>
    ${campo('Nº de série / IMEI', e(o.equipSerie))}
    ${campo('Acessórios', e(o.acessorios))}
    ${campo('Estado físico', e(o.estadoFisico))}
  </div>

  ${bloco('Defeito relatado pelo cliente', o.defeito)}
  ${bloco('Diagnóstico', o.diagnostico)}
  ${bloco('Laudo técnico / serviço realizado', o.laudo)}

  ${
    o.itens.length
      ? `<h3>Peças e serviços</h3>
  <table>
    <thead><tr><th style="width:12%">Tipo</th><th>Descrição</th><th class="num" style="width:8%">Qtd.</th><th class="num" style="width:15%">Valor unit.</th><th class="num" style="width:15%">Subtotal</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>
  <table class="totais">
    <tr><td>Subtotal</td><td class="num">${e(fmt.moeda(subtotalOS(o)))}</td></tr>
    ${o.desconto ? `<tr><td>Desconto</td><td class="num">- ${e(fmt.moeda(o.desconto))}</td></tr>` : ''}
    <tr class="total"><td>Total</td><td class="num">${e(fmt.moeda(totalOS(o)))}</td></tr>
  </table>`
      : ''
  }

  ${bloco('Observações', o.observacao)}

  <div class="garantia">${e(garantia)}</div>

  <div class="assinaturas">
    <div>${e(cliente?.nome ?? 'Cliente')}</div>
    <div>${e(empresa.nomeEmpresa)}</div>
  </div>
</body></html>`
}

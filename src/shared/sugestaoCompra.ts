import type { Compra, Movimentacao, Produto } from './tipos'
import { faltaReceber } from './dominio'

// Sugestão de compra: quanto comprar de cada produto para cobrir os próximos dias, pelo consumo real.
//
//   consumo/dia = (saídas − devoluções) dos últimos N dias ÷ N
//   estoque alvo = estoque mínimo (segurança) + consumo/dia × dias de cobertura
//   comprar     = estoque alvo − (estoque atual + o que já foi pedido e não chegou)
//
// Devoluções: entradas de cancelamento de venda, de OS reaberta/cancelada e estornos de saída.
// O fornecedor e o custo de referência vêm da última compra do produto (sem compra: custo cadastrado).

export interface OpcoesSugestao {
  /** Período usado para medir o consumo (dias). */
  diasConsumo: number
  /** Para quantos dias a compra deve durar. */
  diasCobertura: number
  /** Só produtos no estoque mínimo ou abaixo (senão, todos com sugestão > 0). */
  somenteAbaixoMinimo: boolean
  /** yyyy-mm-dd (padrão: hoje). */
  hoje?: string
}

export interface ItemSugestao {
  produto: Produto
  /** Consumo médio por dia no período. */
  consumoDiario: number
  /** Saídas líquidas no período. */
  consumoPeriodo: number
  /** Já pedido e ainda não recebido (rascunhos e pedidos em aberto). */
  aCaminho: number
  alvo: number
  sugerido: number
  /** Fornecedor da última compra (null = nunca comprado). */
  fornecedorId: number | null
  /** Custo de referência (última compra ou custo cadastrado). */
  custo: number
  ultimaCompra: string | null
}

const diaIso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function calcularSugestao(d: { produtos: Produto[]; movimentacoes: Movimentacao[]; compras: Compra[] }, op: OpcoesSugestao): ItemSugestao[] {
  const hoje = op.hoje ?? diaIso(new Date())
  const inicio = new Date(`${hoje}T12:00:00`)
  inicio.setDate(inicio.getDate() - op.diasConsumo + 1)
  const desde = diaIso(inicio)

  // Consumo líquido no período, por produto.
  const tipoPorId = new Map(d.movimentacoes.map((m) => [m.id, m.tipo]))
  const consumo = new Map<number, number>()
  const somar = (id: number, q: number): void => void consumo.set(id, (consumo.get(id) ?? 0) + q)
  for (const m of d.movimentacoes) {
    const dia = m.data.slice(0, 10)
    if (dia < desde || dia > hoje) continue
    if (m.tipo === 'saida' && !m.estornoDe) somar(m.produtoId, m.quantidade)
    else if (m.tipo === 'entrada' && (m.vendaId || m.osId || (m.estornoDe && tipoPorId.get(m.estornoDe) === 'saida'))) somar(m.produtoId, -m.quantidade)
  }

  // Já pedido e não recebido; última compra de cada produto.
  const aCaminho = new Map<number, number>()
  const ultima = new Map<number, { fornecedorId: number; valor: number; data: string }>()
  for (const c of [...d.compras].filter((c) => c.status !== 'cancelada').sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id)) {
    for (const i of c.itens) {
      if (c.status === 'pedido' || c.status === 'rascunho') aCaminho.set(i.produtoId, (aCaminho.get(i.produtoId) ?? 0) + faltaReceber(i))
      ultima.set(i.produtoId, { fornecedorId: c.fornecedorId, valor: i.valorUnitario, data: c.data })
    }
  }

  const lista: ItemSugestao[] = []
  for (const p of d.produtos) {
    if (!p.ativo) continue
    const periodo = Math.max(0, consumo.get(p.id) ?? 0)
    const diario = periodo / op.diasConsumo
    const caminho = aCaminho.get(p.id) ?? 0
    const alvo = p.estoqueMinimo + Math.ceil(diario * op.diasCobertura)
    const sugerido = Math.max(0, alvo - Math.max(0, p.estoque) - caminho)
    if (sugerido <= 0) continue
    if (op.somenteAbaixoMinimo && p.estoque > p.estoqueMinimo) continue
    const u = ultima.get(p.id)
    lista.push({
      produto: p,
      consumoDiario: Math.round(diario * 100) / 100,
      consumoPeriodo: periodo,
      aCaminho: caminho,
      alvo,
      sugerido,
      fornecedorId: u?.fornecedorId ?? null,
      custo: u?.valor ?? p.precoCusto,
      ultimaCompra: u?.data ?? null
    })
  }
  // Mais urgente primeiro: sem estoque, depois quem está mais abaixo do mínimo.
  return lista.sort((a, b) => Number(b.produto.estoque <= 0) - Number(a.produto.estoque <= 0) || a.produto.estoque - a.produto.estoqueMinimo - (b.produto.estoque - b.produto.estoqueMinimo))
}

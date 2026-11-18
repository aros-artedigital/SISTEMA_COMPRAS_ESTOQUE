import { descreverConta, saldoConta, saldoOS, totalVenda } from './dominio'
import type { Compra, Conta, OrdemServico, Venda } from './tipos'

// Fluxo de caixa: o que entrou e saiu de fato (realizado) e o que está para entrar e sair (previsto),
// a partir do que o sistema já registra — sem lançamento extra.
//
// Realizado:  vendas à vista (não canceladas), recebimentos de OS, recebimentos e pagamentos de contas
//             (com juros e desconto) e, opcionalmente, compras recebidas que não têm conta a pagar.
// Previsto:   saldo das contas a receber e a pagar em aberto (pelo vencimento) e OS entregues com saldo.
//             O que já venceu e não foi pago entra como "em atraso", na data de hoje (continua previsto).
// Vendas a prazo entram quando as parcelas são recebidas (não na data da venda).
// Sangrias e suprimentos não entram: são só dinheiro mudando de lugar (gaveta ↔ banco).

export type SituacaoFluxo = 'realizado' | 'previsto' | 'atrasado'
export type Agrupamento = 'dia' | 'semana' | 'mes'

export interface MovimentoFluxo {
  /** Data em que entra no fluxo (yyyy-mm-dd); para atrasados, hoje. */
  data: string
  /** Vencimento original (só previstos e atrasados). */
  vencimento: string | null
  tipo: 'entrada' | 'saida'
  situacao: SituacaoFluxo
  origem: 'Venda' | 'OS' | 'Conta a receber' | 'Conta a pagar' | 'Compra'
  descricao: string
  valor: number
}

export interface PeriodoFluxo {
  chave: string
  rotulo: string
  entradasRealizadas: number
  saidasRealizadas: number
  entradasPrevistas: number
  saidasPrevistas: number
  saldo: number
  acumulado: number
}

export interface OpcoesFluxo {
  de: string
  ate: string
  hoje: string
  /** Compras recebidas sem conta a pagar contam como pagas na data da compra. */
  comprasSemConta: boolean
}

const centavos = (v: number): number => Math.round(v * 100) / 100
const dia = (iso: string): string => iso.slice(0, 10)

export function movimentosFluxo(d: { vendas: Venda[]; ordensServico: OrdemServico[]; contas: Conta[]; compras: Compra[] }, op: OpcoesFluxo): MovimentoFluxo[] {
  const lista: MovimentoFluxo[] = []
  const add = (m: Omit<MovimentoFluxo, 'vencimento'> & { vencimento?: string | null }): void => {
    if (m.valor > 0.004) lista.push({ vencimento: null, ...m, valor: centavos(m.valor) })
  }
  const previsto = (vencimento: string): { data: string; situacao: SituacaoFluxo } =>
    vencimento < op.hoje ? { data: op.hoje, situacao: 'atrasado' } : { data: vencimento, situacao: 'previsto' }

  for (const v of d.vendas) {
    if (v.status !== 'concluida' || v.formaPagamento === 'prazo') continue
    add({ data: dia(v.data), tipo: 'entrada', situacao: 'realizado', origem: 'Venda', descricao: `Venda ${v.numero}`, valor: totalVenda(v) })
  }
  for (const o of d.ordensServico) {
    for (const p of o.pagamentos) if (!p.estornado) add({ data: dia(p.em), tipo: 'entrada', situacao: 'realizado', origem: 'OS', descricao: `OS ${o.numero}`, valor: p.valor })
    if (o.status === 'entregue' && saldoOS(o) > 0) {
      const venc = dia(o.entregueEm ?? o.dataEntrada)
      add({ ...previsto(venc), vencimento: venc, tipo: 'entrada', origem: 'OS', descricao: `OS ${o.numero} (valor em aberto)`, valor: saldoOS(o) })
    }
  }
  for (const c of d.contas) {
    const tipo = c.tipo === 'receber' ? 'entrada' : 'saida'
    const origem = c.tipo === 'receber' ? 'Conta a receber' : 'Conta a pagar'
    for (const b of c.baixas) {
      if (!b.estornada) add({ data: dia(b.em), tipo, situacao: 'realizado', origem, descricao: descreverConta(c), valor: b.valor + b.juros - b.desconto })
    }
    if (c.status === 'aberta' && saldoConta(c) > 0) add({ ...previsto(c.vencimento), vencimento: c.vencimento, tipo, origem, descricao: descreverConta(c), valor: saldoConta(c) })
  }
  if (op.comprasSemConta) {
    const comConta = new Set(d.contas.filter((c) => c.compraId && c.status !== 'cancelada').map((c) => c.compraId))
    for (const c of d.compras) {
      if (c.status === 'cancelada' || comConta.has(c.id)) continue
      const recebido = c.itens.reduce((s, i) => s + (i.quantidadeRecebida ?? 0) * i.valorUnitario, 0)
      add({ data: c.data, tipo: 'saida', situacao: 'realizado', origem: 'Compra', descricao: `Compra ${c.numero} (sem conta a pagar)`, valor: recebido })
    }
  }
  return lista.filter((m) => m.data >= op.de && m.data <= op.ate).sort((a, b) => a.data.localeCompare(b.data))
}

// ---------- Períodos ----------

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const data = (iso: string): Date => new Date(`${iso}T12:00:00`)
const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Segunda-feira da semana da data. */
function inicioSemana(i: string): string {
  const d = data(i)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return iso(d)
}

export function chavePeriodo(i: string, a: Agrupamento): string {
  if (a === 'mes') return i.slice(0, 7)
  if (a === 'semana') return inicioSemana(i)
  return i
}

export function rotuloPeriodo(chave: string, a: Agrupamento): string {
  if (a === 'mes') return `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`
  const [, m, d] = chave.split('-')
  return a === 'semana' ? `sem. ${d}/${m}` : `${d}/${m}`
}

/** Todos os períodos entre de e até (inclusive os vazios), com totais e saldo acumulado. */
export function periodosFluxo(movimentos: MovimentoFluxo[], op: Pick<OpcoesFluxo, 'de' | 'ate'>, agrupar: Agrupamento, saldoInicial: number): PeriodoFluxo[] {
  const chaves: string[] = []
  for (const d = data(op.de); iso(d) <= op.ate; d.setDate(d.getDate() + 1)) {
    const k = chavePeriodo(iso(d), agrupar)
    if (chaves[chaves.length - 1] !== k) chaves.push(k)
    if (chaves.length > 800) break // proteção contra períodos enormes por dia
  }
  const mapa = new Map(chaves.map((k) => [k, { entradasRealizadas: 0, saidasRealizadas: 0, entradasPrevistas: 0, saidasPrevistas: 0 }]))
  for (const m of movimentos) {
    const p = mapa.get(chavePeriodo(m.data, agrupar))
    if (!p) continue
    const realizado = m.situacao === 'realizado'
    if (m.tipo === 'entrada') p[realizado ? 'entradasRealizadas' : 'entradasPrevistas'] += m.valor
    else p[realizado ? 'saidasRealizadas' : 'saidasPrevistas'] += m.valor
  }
  let acumulado = saldoInicial
  return chaves.map((k) => {
    const p = mapa.get(k)!
    const saldo = centavos(p.entradasRealizadas + p.entradasPrevistas - p.saidasRealizadas - p.saidasPrevistas)
    acumulado = centavos(acumulado + saldo)
    return {
      chave: k,
      rotulo: rotuloPeriodo(k, agrupar),
      entradasRealizadas: centavos(p.entradasRealizadas),
      saidasRealizadas: centavos(p.saidasRealizadas),
      entradasPrevistas: centavos(p.entradasPrevistas),
      saidasPrevistas: centavos(p.saidasPrevistas),
      saldo,
      acumulado
    }
  })
}

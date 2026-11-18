import type { Compra, FormaPagamento, OrdemServico, Produto, StatusCompra, StatusOS, StatusVenda, TipoMovimentacao, TipoSenhaOS, Venda, Conta } from '@shared/tipos'
import { hojeIso } from './format'

// Regras e rótulos do domínio compartilhados entre telas.

export const totalCompra = (c: Compra): number => c.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0)

export type SituacaoEstoque = 'zerado' | 'baixo' | 'ok'

export function situacaoEstoque(p: Produto): SituacaoEstoque {
  if (p.estoque <= 0) return 'zerado'
  if (p.estoque <= p.estoqueMinimo) return 'baixo'
  return 'ok'
}

export const rotuloStatusCompra: Record<StatusCompra, string> = {
  rascunho: 'Rascunho',
  pedido: 'Pedido enviado',
  recebida: 'Recebida',
  cancelada: 'Cancelada'
}

export const corStatusCompra = {
  rascunho: 'cinza',
  pedido: 'azul',
  recebida: 'verde',
  cancelada: 'vermelho'
} as const

export const rotuloTipoMov: Record<TipoMovimentacao, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste'
}

export const corTipoMov = {
  entrada: 'verde',
  saida: 'vermelho',
  ajuste: 'amarelo'
} as const

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]

export const subtotalVenda = (v: Pick<Venda, 'itens'>): number => v.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0)
export const totalVenda = (v: Pick<Venda, 'itens' | 'desconto'>): number => Math.max(0, subtotalVenda(v) - v.desconto)

export const rotuloFormaPagamento: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  boleto: 'Boleto',
  outro: 'Outro',
  prazo: 'A prazo (fiado/parcelado)'
}

export const rotuloStatusVenda: Record<StatusVenda, string> = { concluida: 'Concluída', cancelada: 'Cancelada' }
export const corStatusVenda = { concluida: 'verde', cancelada: 'vermelho' } as const

/** Compra com parte dos itens já recebida (continua com status "pedido"). */
export const recebidaEmParte = (c: Compra): boolean => c.status === 'pedido' && c.itens.some((i) => (i.quantidadeRecebida ?? 0) > 0)
export const faltaReceber = (i: Compra['itens'][number]): number => Math.max(0, i.quantidade - (i.quantidadeRecebida ?? 0))

// ---------- Ordens de serviço ----------

export const rotuloStatusOS: Record<StatusOS, string> = {
  aberta: 'Aberta',
  em_analise: 'Em análise',
  aguardando_aprovacao: 'Aguardando aprovação',
  em_execucao: 'Em execução',
  pronta: 'Pronta',
  entregue: 'Entregue',
  cancelada: 'Cancelada'
}

export const corStatusOS = {
  aberta: 'cinza',
  em_analise: 'azul',
  aguardando_aprovacao: 'amarelo',
  em_execucao: 'roxo',
  pronta: 'verde',
  entregue: 'verde',
  cancelada: 'vermelho'
} as const

/** Etapas do atendimento, na ordem (cancelada fica de fora). */
export const ETAPAS_OS: StatusOS[] = ['aberta', 'em_analise', 'aguardando_aprovacao', 'em_execucao', 'pronta', 'entregue']

/** OS ainda em atendimento (dados e itens podem ser alterados). */
export const osEmAndamento = (s: StatusOS): boolean => s === 'aberta' || s === 'em_analise' || s === 'aguardando_aprovacao' || s === 'em_execucao'

/**
 * Para onde a OS pode ir a partir do status atual.
 * Em andamento: qualquer etapa, pronta, entregue ou cancelada. Pronta: entregar, reabrir (volta
 * para "em execução", devolvendo as peças) ou cancelar. Entregue e cancelada são finais.
 */
export function proximosStatusOS(s: StatusOS): StatusOS[] {
  if (osEmAndamento(s)) return (['aberta', 'em_analise', 'aguardando_aprovacao', 'em_execucao', 'pronta', 'entregue', 'cancelada'] as StatusOS[]).filter((x) => x !== s)
  if (s === 'pronta') return ['entregue', 'em_execucao', 'cancelada']
  return []
}

export const subtotalOS = (o: Pick<OrdemServico, 'itens'>): number => o.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0)
export const totalPecasOS = (o: Pick<OrdemServico, 'itens'>): number => o.itens.filter((i) => i.tipo === 'peca').reduce((s, i) => s + i.quantidade * i.valorUnitario, 0)
export const totalServicosOS = (o: Pick<OrdemServico, 'itens'>): number => o.itens.filter((i) => i.tipo === 'servico').reduce((s, i) => s + i.quantidade * i.valorUnitario, 0)
export const totalOS = (o: Pick<OrdemServico, 'itens' | 'desconto'>): number => Math.max(0, subtotalOS(o) - o.desconto)

/** Equipamento em uma linha: "Celular Samsung Galaxy A54". */
export const descreverEquipamento = (o: Pick<OrdemServico, 'equipTipo' | 'equipMarca' | 'equipModelo'>): string =>
  [o.equipTipo, o.equipMarca, o.equipModelo].map((v) => v.trim()).filter(Boolean).join(' ')

/** Previsão de entrega já passou e a OS ainda não ficou pronta. */
export function osAtrasada(o: Pick<OrdemServico, 'status' | 'previsao'>, hoje: string): boolean {
  return osEmAndamento(o.status) && !!o.previsao && o.previsao < hoje
}

export const TIPOS_EQUIPAMENTO = ['Celular', 'Tablet', 'Notebook', 'Computador', 'Monitor', 'Impressora', 'Videogame', 'Smartwatch', 'Televisão', 'Outro']

export const rotuloSenhaOS: Record<TipoSenhaOS, string> = {
  nenhuma: 'Sem senha',
  desenho: 'Desenho (padrão)',
  pin: 'PIN (números)',
  texto: 'Senha (texto)'
}

/** Desenho guardado ("1-5-9-6") → pontos [1, 5, 9, 6]. */
export const pontosDoDesenho = (valor: string): number[] => (valor ? valor.split('-').map(Number).filter((n) => n >= 1 && n <= 9) : [])

/** Quanto já foi recebido (sem os pagamentos estornados). */
export const pagoOS = (o: Pick<OrdemServico, 'pagamentos'>): number =>
  Math.round(o.pagamentos.filter((p) => !p.estornado).reduce((s, p) => s + p.valor, 0) * 100) / 100

/** Quanto falta receber. */
export const saldoOS = (o: Pick<OrdemServico, 'itens' | 'desconto' | 'pagamentos'>): number => Math.max(0, Math.round((totalOS(o) - pagoOS(o)) * 100) / 100)

/** Entregue (ou pronta) com valor ainda a receber. */
export const osComSaldo = (o: OrdemServico): boolean => (o.status === 'entregue' || o.status === 'pronta') && saldoOS(o) > 0

/** Data em que a garantia termina (conta da entrega); null se não foi entregue ou não tem garantia. */
export function fimGarantia(o: Pick<OrdemServico, 'entregueEm' | 'garantiaDias'>): string | null {
  if (!o.entregueEm || o.garantiaDias <= 0) return null
  const d = new Date(`${o.entregueEm.slice(0, 10)}T12:00:00`)
  d.setDate(d.getDate() + o.garantiaDias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const emGarantia = (o: OrdemServico, hoje = hojeIso()): boolean => o.status === 'entregue' && (fimGarantia(o) ?? '') >= hoje

/** Nº de série/IMEI comparável (sem espaços, pontos e traços; maiúsculas). */
export const normalizarSerie = (s: string): string => s.replace(/[\s.\-/]/g, '').toUpperCase()

/** Outras OS do mesmo aparelho (mesmo nº de série/IMEI), da mais recente para a mais antiga. */
export function osDoMesmoAparelho(lista: OrdemServico[], serie: string, excetoId?: number): OrdemServico[] {
  const alvo = normalizarSerie(serie)
  if (alvo.length < 4) return []
  return lista.filter((o) => o.id !== excetoId && normalizarSerie(o.equipSerie) === alvo).sort((a, b) => b.dataEntrada.localeCompare(a.dataEntrada))
}

/** Dias entre a entrada e a conclusão (OS pronta). */
export function diasDeConserto(o: Pick<OrdemServico, 'dataEntrada' | 'concluidaEm' | 'entregueEm'>): number | null {
  const fim = o.concluidaEm ?? o.entregueEm
  if (!fim) return null
  const dia = (iso: string): number => new Date(`${iso.slice(0, 10)}T12:00:00`).getTime()
  return Math.max(0, Math.round((dia(fim) - dia(o.dataEntrada)) / 86_400_000))
}

export const rotuloTipoPagamentoOS = { sinal: 'Sinal', pagamento: 'Pagamento' } as const

// ---------- Contas a receber e a pagar ----------

/** Formas com que se recebe/paga de verdade (a prazo não é uma delas). */
export const FORMAS_RECEBIMENTO: FormaPagamento[] = ['dinheiro', 'pix', 'debito', 'credito', 'boleto', 'outro']

export const pagoConta = (c: Pick<Conta, 'baixas'>): number => Math.round(c.baixas.filter((b) => !b.estornada).reduce((s, b) => s + b.valor, 0) * 100) / 100
export const saldoConta = (c: Pick<Conta, 'baixas' | 'valor' | 'status'>): number =>
  c.status === 'cancelada' ? 0 : Math.max(0, Math.round((c.valor - pagoConta(c)) * 100) / 100)

export type SituacaoConta = 'paga' | 'cancelada' | 'vencida' | 'vence_hoje' | 'a_vencer'

export function situacaoConta(c: Pick<Conta, 'status' | 'vencimento'>, hoje = hojeIso()): SituacaoConta {
  if (c.status === 'paga' || c.status === 'cancelada') return c.status
  if (c.vencimento < hoje) return 'vencida'
  if (c.vencimento === hoje) return 'vence_hoje'
  return 'a_vencer'
}

export const rotuloSituacaoConta: Record<SituacaoConta, string> = { paga: 'Paga', cancelada: 'Cancelada', vencida: 'Vencida', vence_hoje: 'Vence hoje', a_vencer: 'A vencer' }
export const corSituacaoConta = { paga: 'verde', cancelada: 'cinza', vencida: 'vermelho', vence_hoje: 'amarelo', a_vencer: 'azul' } as const

/** "Venda V-0003 (2/3)" */
export const descreverConta = (c: Pick<Conta, 'descricao' | 'parcela' | 'parcelas'>): string => `${c.descricao}${c.parcelas > 1 ? ` (${c.parcela}/${c.parcelas})` : ''}`

export const CATEGORIAS_PAGAR = ['Fornecedores', 'Aluguel', 'Energia', 'Água', 'Internet e telefone', 'Salários', 'Impostos', 'Manutenção', 'Marketing', 'Outros']
export const CATEGORIAS_RECEBER = ['Vendas a prazo', 'Serviços', 'Outros']

/** Soma meses mantendo o dia (31/01 + 1 mês = 28 ou 29/02). */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const alvo = new Date(a, m - 1 + meses, 1)
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  alvo.setDate(Math.min(d, ultimo))
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')}`
}

/** Divide o total em parcelas; os centavos que sobram vão na primeira. */
export function dividirParcelas(total: number, parcelas: number): number[] {
  const base = Math.floor((total * 100) / parcelas) / 100
  const lista = Array.from({ length: parcelas }, () => base)
  lista[0] = Math.round((total - base * (parcelas - 1)) * 100) / 100
  return lista
}

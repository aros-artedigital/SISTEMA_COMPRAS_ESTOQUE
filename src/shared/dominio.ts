import type { Compra, FormaPagamento, OrdemServico, Produto, StatusCompra, StatusOS, StatusVenda, TipoMovimentacao, TipoSenhaOS, Venda } from '@shared/tipos'

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
  outro: 'Outro'
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

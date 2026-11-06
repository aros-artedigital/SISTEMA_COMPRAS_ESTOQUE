import type { Compra, FormaPagamento, Produto, StatusCompra, StatusVenda, TipoMovimentacao, Venda } from '@shared/tipos'

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

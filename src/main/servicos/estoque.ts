import type { TipoMovimentacao } from '@shared/tipos'
import { banco } from '../db/conexao'
import { ErroNegocio } from '../erros'
import { agoraIso } from './mapeadores'

interface NovaMovimentacao {
  produtoId: number
  tipo: TipoMovimentacao
  quantidade: number
  motivo: string
  usuarioId: number
  compraId?: number
  vendaId?: number
}

/**
 * Lança uma movimentação e atualiza o saldo do produto.
 * Não abre transação própria: quem chama decide (uma compra recebida grava vários itens de uma vez).
 */
export function lancarMovimentacao(m: NovaMovimentacao): void {
  const db = banco()
  const produto = db.prepare('SELECT nome, estoque, ativo FROM produtos WHERE id = ?').get(m.produtoId) as
    | { nome: string; estoque: number; ativo: number }
    | undefined
  if (!produto) throw new ErroNegocio('Produto não encontrado.', 'produtoId')

  if (m.tipo !== 'ajuste' && m.quantidade <= 0) throw new ErroNegocio('Informe uma quantidade positiva.', 'quantidade')
  if (m.quantidade === 0) throw new ErroNegocio('Quantidade não pode ser zero.', 'quantidade')

  const delta = m.tipo === 'saida' ? -m.quantidade : m.quantidade
  const saldo = produto.estoque + delta
  if (saldo < 0) {
    throw new ErroNegocio(`Saldo insuficiente de "${produto.nome}" (disponível: ${produto.estoque}).`, 'quantidade')
  }

  db.prepare(`UPDATE produtos SET estoque = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?`).run(saldo, m.produtoId)
  db.prepare(
    `INSERT INTO movimentacoes (data, produto_id, tipo, quantidade, saldo_apos, motivo, usuario_id, compra_id, venda_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(agoraIso(), m.produtoId, m.tipo, m.quantidade, saldo, m.motivo, m.usuarioId, m.compraId ?? null, m.vendaId ?? null)
}

export function movimentar(m: NovaMovimentacao): void {
  banco().transaction(() => lancarMovimentacao(m))()
}

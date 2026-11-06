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
  estornoDe?: number
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
    `INSERT INTO movimentacoes (data, produto_id, tipo, quantidade, saldo_apos, motivo, usuario_id, compra_id, venda_id, estorno_de)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(agoraIso(), m.produtoId, m.tipo, m.quantidade, saldo, m.motivo, m.usuarioId, m.compraId ?? null, m.vendaId ?? null, m.estornoDe ?? null)
}

export function movimentar(m: NovaMovimentacao): void {
  banco().transaction(() => lancarMovimentacao(m))()
}

/**
 * Estorna uma movimentação lançada por engano: cria a movimentação inversa ligada à original.
 * Movimentações de compra e de venda são desfeitas pelas próprias telas (cancelar venda);
 * um estorno não pode ser estornado (faça um novo lançamento).
 */
export function estornar(id: number, motivo: string, usuarioId: number): void {
  const db = banco()
  db.transaction(() => {
    const m = db.prepare('SELECT * FROM movimentacoes WHERE id = ?').get(id) as
      | { id: number; produto_id: number; tipo: TipoMovimentacao; quantidade: number; motivo: string; compra_id: number | null; venda_id: number | null; estorno_de: number | null }
      | undefined
    if (!m) throw new ErroNegocio('Movimentação não encontrada.')
    if (m.estorno_de) throw new ErroNegocio('Um estorno não pode ser estornado. Se precisar, faça um novo lançamento.')
    if (m.venda_id) throw new ErroNegocio('Esta movimentação é de uma venda: para desfazê-la, cancele a venda na tela de Vendas.')
    if (m.compra_id) throw new ErroNegocio('Esta movimentação é do recebimento de uma compra e não pode ser estornada.')
    if (db.prepare('SELECT 1 FROM movimentacoes WHERE estorno_de = ?').get(id)) throw new ErroNegocio('Esta movimentação já foi estornada.')

    // Inverso: saída volta como entrada, entrada sai como saída, ajuste com o sinal trocado.
    const inverso: { tipo: TipoMovimentacao; quantidade: number } =
      m.tipo === 'saida' ? { tipo: 'entrada', quantidade: m.quantidade } : m.tipo === 'entrada' ? { tipo: 'saida', quantidade: m.quantidade } : { tipo: 'ajuste', quantidade: -m.quantidade }
    try {
      lancarMovimentacao({ produtoId: m.produto_id, ...inverso, motivo: `Estorno: ${m.motivo} — ${motivo}`, usuarioId, estornoDe: m.id })
    } catch (e) {
      if (e instanceof ErroNegocio && e.message.startsWith('Saldo insuficiente')) {
        throw new ErroNegocio(`Não há saldo para estornar: ${e.message.replace('Saldo insuficiente de ', '')}`)
      }
      throw e
    }
  })()
}

import type { z } from 'zod'
import type { produtoSchema } from '@shared/schemas'
import type { Produto } from '@shared/tipos'
import { banco } from '../db/conexao'
import { ErroNegocio } from '../erros'
import { lancarMovimentacao } from './estoque'
import * as map from './mapeadores'

type DadosProduto = z.output<typeof produtoSchema>

function validarReferencias(d: DadosProduto, id: number | null): void {
  const db = banco()
  const dup = db.prepare('SELECT id FROM produtos WHERE codigo = ? COLLATE NOCASE AND id IS NOT ?').get(d.codigo, id)
  if (dup) throw new ErroNegocio('Já existe um produto com este código.', 'codigo')
  if (d.codigoBarras) {
    const dupBarras = db.prepare(`SELECT nome FROM produtos WHERE codigo_barras = ? AND id IS NOT ?`).get(d.codigoBarras, id) as
      | { nome: string }
      | undefined
    if (dupBarras) throw new ErroNegocio(`Código de barras já usado em "${dupBarras.nome}".`, 'codigoBarras')
  }
  if (!db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(d.categoriaId)) throw new ErroNegocio('Categoria inválida.', 'categoriaId')
  if (!db.prepare('SELECT 1 FROM unidades WHERE id = ?').get(d.unidadeId)) throw new ErroNegocio('Unidade inválida.', 'unidadeId')
}

export function salvar(id: number | null, d: DadosProduto, usuarioId: number): Produto {
  const db = banco()
  return db.transaction(() => {
    validarReferencias(d, id)
    const valores = [d.codigo, d.codigoBarras, d.nome, d.categoriaId, d.unidadeId, map.dinheiro(d.precoCusto), map.dinheiro(d.precoVenda), d.estoqueMinimo, map.bool(d.ativo)]

    if (id === null) {
      // O estoque inicial entra como movimentação, para ficar no histórico.
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO produtos (codigo, codigo_barras, nome, categoria_id, unidade_id, preco_custo, preco_venda, estoque_minimo, ativo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(...valores)
      id = Number(lastInsertRowid)
      if (d.estoque > 0) lancarMovimentacao({ produtoId: id, tipo: 'entrada', quantidade: d.estoque, motivo: 'Estoque inicial', usuarioId })
    } else {
      // O saldo nunca é editado diretamente: só por movimentação.
      const r = db
        .prepare(
          `UPDATE produtos SET codigo = ?, codigo_barras = ?, nome = ?, categoria_id = ?, unidade_id = ?, preco_custo = ?, preco_venda = ?,
           estoque_minimo = ?, ativo = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?`
        )
        .run(...valores, id)
      if (r.changes === 0) throw new ErroNegocio('Produto não encontrado.')
    }
    return map.produto(db.prepare('SELECT * FROM produtos WHERE id = ?').get(id) as map.Linha)
  })()
}

export function excluir(id: number): void {
  const db = banco()
  const p = db.prepare('SELECT nome FROM produtos WHERE id = ?').get(id) as { nome: string } | undefined
  if (!p) throw new ErroNegocio('Produto não encontrado.')
  const emUso =
    db.prepare('SELECT 1 FROM movimentacoes WHERE produto_id = ? LIMIT 1').get(id) ||
    db.prepare('SELECT 1 FROM compra_itens WHERE produto_id = ? LIMIT 1').get(id) ||
    db.prepare('SELECT 1 FROM venda_itens WHERE produto_id = ? LIMIT 1').get(id)
  if (emUso) throw new ErroNegocio(`"${p.nome}" possui histórico de compras, vendas ou movimentações. Inative o produto em vez de excluir.`)
  db.prepare('DELETE FROM produtos WHERE id = ?').run(id)
}

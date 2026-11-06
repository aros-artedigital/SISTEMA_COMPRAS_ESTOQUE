import type { InventarioDetalhe, InventarioResumo, ResultadoInventario } from '@shared/api'
import { banco } from '../db/conexao'
import { ErroNegocio } from '../erros'
import { lancarMovimentacao } from './estoque'
import { agoraIso, type Linha } from './mapeadores'

// Inventário: congela a lista de produtos, recebe as quantidades contadas e, ao concluir,
// lança um ajuste para cada produto cuja contagem difere do saldo do sistema naquele momento.

const SELECT_RESUMO = `
  SELECT i.*,
    (SELECT nome FROM usuarios WHERE id = i.criado_por) AS criado_por_nome,
    (SELECT nome FROM usuarios WHERE id = i.concluido_por) AS concluido_por_nome,
    (SELECT COUNT(*) FROM inventario_itens WHERE inventario_id = i.id) AS itens,
    (SELECT COUNT(*) FROM inventario_itens WHERE inventario_id = i.id AND contado IS NOT NULL) AS contados,
    (SELECT COUNT(*) FROM inventario_itens WHERE inventario_id = i.id AND ajuste IS NOT NULL AND ajuste <> 0) AS ajustados
  FROM inventarios i`

const resumo = (r: Linha): InventarioResumo => ({
  id: r.id,
  numero: r.numero,
  descricao: r.descricao,
  categoriaId: r.categoria_id ?? null,
  status: r.status,
  criadoEm: r.criado_em,
  criadoPor: r.criado_por_nome ?? '—',
  concluidoEm: r.concluido_em ?? null,
  concluidoPor: r.concluido_por_nome ?? null,
  naoContadosZero: !!r.nao_contados_zero,
  itens: r.itens,
  contados: r.contados,
  ajustados: r.ajustados
})

export function listar(): InventarioResumo[] {
  return (banco().prepare(`${SELECT_RESUMO} ORDER BY i.id DESC`).all() as Linha[]).map(resumo)
}

export function obter(id: number): InventarioDetalhe {
  const db = banco()
  const r = db.prepare(`${SELECT_RESUMO} WHERE i.id = ?`).get(id) as Linha | undefined
  if (!r) throw new ErroNegocio('Inventário não encontrado.')
  const lista = (db.prepare('SELECT * FROM inventario_itens WHERE inventario_id = ? ORDER BY id').all(id) as Linha[]).map((i) => ({
    id: i.id,
    produtoId: i.produto_id,
    saldoSistema: i.saldo_sistema,
    contado: i.contado,
    ajuste: i.ajuste
  }))
  return { ...resumo(r), lista }
}

export function abrir(d: { descricao: string; categoriaId: number | null }, usuarioId: number): InventarioDetalhe {
  const db = banco()
  return db.transaction(() => {
    const aberto = db.prepare(`SELECT numero FROM inventarios WHERE status = 'aberto'`).get() as { numero: string } | undefined
    if (aberto) throw new ErroNegocio(`O inventário ${aberto.numero} ainda está aberto. Conclua ou cancele antes de começar outro.`)
    const produtos = db
      .prepare(`SELECT id, estoque FROM produtos WHERE ativo = 1 ${d.categoriaId ? 'AND categoria_id = ?' : ''} ORDER BY nome`)
      .all(...(d.categoriaId ? [d.categoriaId] : [])) as { id: number; estoque: number }[]
    if (produtos.length === 0) throw new ErroNegocio('Nenhum produto ativo para contar com esse filtro.')

    const { n } = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM inventarios').get() as { n: number }
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO inventarios (numero, descricao, categoria_id, status, criado_em, criado_por) VALUES (?, ?, ?, 'aberto', ?, ?)`)
      .run(`INV-${String(n).padStart(4, '0')}`, d.descricao, d.categoriaId, agoraIso(), usuarioId)
    const id = Number(lastInsertRowid)
    const ins = db.prepare('INSERT INTO inventario_itens (inventario_id, produto_id, saldo_sistema) VALUES (?, ?, ?)')
    for (const p of produtos) ins.run(id, p.id, p.estoque)
    return obter(id)
  })()
}

function exigirAberto(inventarioId: number): void {
  const r = banco().prepare('SELECT status FROM inventarios WHERE id = ?').get(inventarioId) as { status: string } | undefined
  if (!r) throw new ErroNegocio('Inventário não encontrado.')
  if (r.status !== 'aberto') throw new ErroNegocio('Este inventário não está mais aberto.')
}

export function contar(itemId: number, contado: number | null): void {
  const db = banco()
  const item = db.prepare('SELECT inventario_id FROM inventario_itens WHERE id = ?').get(itemId) as { inventario_id: number } | undefined
  if (!item) throw new ErroNegocio('Item do inventário não encontrado.')
  exigirAberto(item.inventario_id)
  db.prepare('UPDATE inventario_itens SET contado = ? WHERE id = ?').run(contado, itemId)
}

/**
 * Conclui: para cada item contado (ou todos, se não contados valerem zero), compara com o saldo
 * atual do produto e lança um ajuste com a diferença. Tudo numa transação.
 */
export function concluir(id: number, o: { naoContadosZero: boolean }, usuarioId: number): ResultadoInventario {
  const db = banco()
  return db.transaction(() => {
    exigirAberto(id)
    const inv = db.prepare('SELECT numero FROM inventarios WHERE id = ?').get(id) as { numero: string }
    const itens = db
      .prepare(
        `SELECT it.id, it.produto_id, it.contado, p.estoque, p.preco_custo FROM inventario_itens it
         JOIN produtos p ON p.id = it.produto_id WHERE it.inventario_id = ?`
      )
      .all(id) as { id: number; produto_id: number; contado: number | null; estoque: number; preco_custo: number }[]
    if (!o.naoContadosZero && itens.every((i) => i.contado === null)) throw new ErroNegocio('Nenhum produto foi contado ainda.')

    const atualizar = db.prepare('UPDATE inventario_itens SET saldo_sistema = ?, contado = ?, ajuste = ? WHERE id = ?')
    let ajustados = 0
    let unidades = 0
    let valor = 0
    for (const i of itens) {
      const contado = i.contado ?? (o.naoContadosZero ? 0 : null)
      if (contado === null) {
        atualizar.run(i.estoque, null, null, i.id)
        continue
      }
      const diferenca = contado - i.estoque
      atualizar.run(i.estoque, contado, diferenca, i.id)
      if (diferenca === 0) continue
      lancarMovimentacao({ produtoId: i.produto_id, tipo: 'ajuste', quantidade: diferenca, motivo: `Inventário ${inv.numero}`, usuarioId })
      ajustados++
      unidades += diferenca
      valor += diferenca * i.preco_custo
    }
    db.prepare(`UPDATE inventarios SET status = 'concluido', concluido_em = ?, concluido_por = ?, nao_contados_zero = ? WHERE id = ?`).run(
      agoraIso(),
      usuarioId,
      o.naoContadosZero ? 1 : 0,
      id
    )
    return { ajustados, unidades, valor: Math.round(valor * 100) / 100 }
  })()
}

export function cancelar(id: number): void {
  exigirAberto(id)
  banco().prepare(`UPDATE inventarios SET status = 'cancelado', concluido_em = ? WHERE id = ?`).run(agoraIso(), id)
}

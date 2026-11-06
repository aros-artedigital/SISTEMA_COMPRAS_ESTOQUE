import type { z } from 'zod'
import type { vendaSchema } from '@shared/schemas'
import type { Venda } from '@shared/tipos'
import { banco } from '../db/conexao'
import { ErroNegocio } from '../erros'
import { lancarMovimentacao } from './estoque'
import * as map from './mapeadores'
import { lerConfig } from './sync/config'

// Vendas: concluídas na hora (dão baixa no estoque). Não são editadas; só canceladas,
// e o cancelamento devolve os itens ao estoque com uma entrada ligada à venda.

type DadosVenda = z.output<typeof vendaSchema>

function buscar(id: number): Venda {
  const db = banco()
  const linha = db.prepare('SELECT * FROM vendas WHERE id = ?').get(id) as map.Linha | undefined
  if (!linha) throw new ErroNegocio('Venda não encontrada.')
  const itens = (db.prepare('SELECT * FROM venda_itens WHERE venda_id = ? ORDER BY id').all(id) as map.Linha[]).map(map.itemVenda)
  return map.venda(linha, itens)
}

/** V-0001, ou V-A0001 com sincronização (o código do terminal evita números repetidos entre terminais). */
function proximoNumero(): string {
  const prefixo = `V-${lerConfig().codigo}`
  const { n } = banco().prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM vendas').get() as { n: number }
  let numero = `${prefixo}${String(n).padStart(4, '0')}`
  for (let i = n + 1; banco().prepare('SELECT 1 FROM vendas WHERE numero = ?').get(numero); i++) {
    numero = `${prefixo}${String(i).padStart(4, '0')}`
  }
  return numero
}

export function registrar(d: DadosVenda, usuarioId: number): Venda {
  const db = banco()
  return db.transaction(() => {
    if (d.clienteId !== null) {
      const c = db.prepare('SELECT ativo FROM clientes WHERE id = ?').get(d.clienteId) as { ativo: number } | undefined
      if (!c) throw new ErroNegocio('Cliente inválido.', 'clienteId')
      if (!c.ativo) throw new ErroNegocio('Cliente inativo.', 'clienteId')
    }
    for (const item of d.itens) {
      const p = db.prepare('SELECT nome, ativo FROM produtos WHERE id = ?').get(item.produtoId) as { nome: string; ativo: number } | undefined
      if (!p) throw new ErroNegocio('Produto inválido na lista de itens.', 'itens')
      if (!p.ativo) throw new ErroNegocio(`"${p.nome}" está inativo e não pode ser vendido.`, 'itens')
    }

    const numero = proximoNumero()
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO vendas (numero, cliente_id, data, status, forma_pagamento, desconto, observacao, usuario_id)
         VALUES (?, ?, ?, 'concluida', ?, ?, ?, ?)`
      )
      .run(numero, d.clienteId, map.agoraIso(), d.formaPagamento, map.dinheiro(d.desconto), d.observacao, usuarioId)
    const id = Number(lastInsertRowid)

    const insItem = db.prepare('INSERT INTO venda_itens (venda_id, produto_id, quantidade, valor_unitario) VALUES (?, ?, ?, ?)')
    for (const item of d.itens) {
      insItem.run(id, item.produtoId, item.quantidade, map.dinheiro(item.valorUnitario))
      // Confere o saldo e dá baixa; sem saldo, a venda inteira é desfeita.
      lancarMovimentacao({ produtoId: item.produtoId, tipo: 'saida', quantidade: item.quantidade, motivo: `Venda ${numero}`, usuarioId, vendaId: id })
    }
    return buscar(id)
  })()
}

export function cancelar(id: number, motivo: string, usuarioId: number): void {
  const db = banco()
  db.transaction(() => {
    const v = buscar(id)
    if (v.status === 'cancelada') throw new ErroNegocio('Esta venda já foi cancelada.')
    db.prepare(`UPDATE vendas SET status = 'cancelada', cancelada_em = ?, motivo_cancelamento = ? WHERE id = ?`).run(map.agoraIso(), motivo, id)
    for (const item of v.itens) {
      lancarMovimentacao({
        produtoId: item.produtoId,
        tipo: 'entrada',
        quantidade: item.quantidade,
        motivo: `Cancelamento da venda ${v.numero}`,
        usuarioId,
        vendaId: id
      })
    }
  })()
}

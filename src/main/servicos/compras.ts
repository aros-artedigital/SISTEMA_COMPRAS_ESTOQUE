import type { z } from 'zod'
import type { compraEntradaSchema } from '@shared/schemas'
import type { AlteracaoCusto } from '@shared/api'
import type { Compra, Configuracoes, StatusCompra } from '@shared/tipos'
import { banco } from '../db/conexao'
import { ErroNegocio } from '../erros'
import { lerConfiguracoes } from './dados'
import { lancarMovimentacao } from './estoque'
import * as map from './mapeadores'
import { lerConfig } from './sync/config'

type DadosCompra = z.output<typeof compraEntradaSchema>

function buscar(id: number): Compra {
  const db = banco()
  const linha = db.prepare('SELECT * FROM compras WHERE id = ?').get(id) as map.Linha | undefined
  if (!linha) throw new ErroNegocio('Compra não encontrada.')
  const itens = (db.prepare('SELECT * FROM compra_itens WHERE compra_id = ? ORDER BY id').all(id) as map.Linha[]).map(map.itemCompra)
  return map.compra(linha, itens)
}

function proximoNumero(): string {
  // Com sincronização, o código do terminal entra no número (C-A0008) para não colidir com outros terminais.
  const prefixo = `${lerConfiguracoes().prefixoCompra}${lerConfig().codigo}`
  const { n } = banco().prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM compras').get() as { n: number }
  let numero = `${prefixo}${String(n).padStart(4, '0')}`
  // Se o prefixo mudou e colidiu com um número antigo, avança até achar um livre.
  for (let i = n + 1; banco().prepare('SELECT 1 FROM compras WHERE numero = ?').get(numero); i++) {
    numero = `${prefixo}${String(i).padStart(4, '0')}`
  }
  return numero
}

export function salvar(id: number | null, d: DadosCompra): Compra {
  const db = banco()
  return db.transaction(() => {
    const forn = db.prepare('SELECT ativo FROM fornecedores WHERE id = ?').get(d.fornecedorId) as { ativo: number } | undefined
    if (!forn) throw new ErroNegocio('Fornecedor inválido.', 'fornecedorId')

    for (const item of d.itens) {
      if (!db.prepare('SELECT 1 FROM produtos WHERE id = ?').get(item.produtoId)) throw new ErroNegocio('Produto inválido na lista de itens.', 'itens')
    }

    if (id === null) {
      if (!forn.ativo) throw new ErroNegocio('Fornecedor inativo.', 'fornecedorId')
      const r = db
        .prepare('INSERT INTO compras (numero, fornecedor_id, data, status, observacao) VALUES (?, ?, ?, ?, ?)')
        .run(proximoNumero(), d.fornecedorId, d.data, d.status, d.observacao)
      id = Number(r.lastInsertRowid)
    } else {
      const atual = buscar(id)
      if (atual.status === 'recebida') throw new ErroNegocio('Compra recebida não pode ser alterada.')
      if (atual.itens.some((i) => (i.quantidadeRecebida ?? 0) > 0)) {
        throw new ErroNegocio('Esta compra já foi recebida em parte e não pode mais ser alterada. Receba o restante ou encerre a compra.')
      }
      if (atual.status === 'cancelada' && d.status !== 'cancelada') throw new ErroNegocio('Compra cancelada não pode ser reaberta.', 'status')
      db.prepare(
        `UPDATE compras SET fornecedor_id = ?, data = ?, status = ?, observacao = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?`
      ).run(d.fornecedorId, d.data, d.status, d.observacao, id)
      db.prepare('DELETE FROM compra_itens WHERE compra_id = ?').run(id)
    }

    const insItem = db.prepare('INSERT INTO compra_itens (compra_id, produto_id, quantidade, valor_unitario) VALUES (?, ?, ?, ?)')
    for (const item of d.itens) insItem.run(id, item.produtoId, item.quantidade, map.dinheiro(item.valorUnitario))

    return buscar(id)
  })()
}

/**
 * Novo preço de custo ao entrar mercadoria.
 * medio: média ponderada entre o que já estava em estoque e o que chegou;
 * ultimo: o preço pago nesta compra; manter: não altera.
 * Com saldo zerado ou negativo, o médio é o próprio preço pago.
 */
export function novoCusto(modo: Configuracoes['custoAoReceber'], saldo: number, custoAtual: number, quantidade: number, valorPago: number): number {
  if (modo === 'manter') return custoAtual
  if (modo === 'ultimo' || saldo <= 0) return map.dinheiro(valorPago)
  return map.dinheiro((saldo * custoAtual + quantidade * valorPago) / (saldo + quantidade))
}

/**
 * Recebe a compra, inteira ou em parte. `itens` diz quanto chegou de cada produto agora;
 * sem `itens`, recebe tudo o que falta. Atualiza o custo, dá entrada no estoque e, quando
 * tudo chegou, marca a compra como recebida. Tudo ou nada.
 */
export function receber(id: number, usuarioId: number, itens?: { produtoId: number; quantidade: number }[]): AlteracaoCusto[] {
  const db = banco()
  const { custoAoReceber } = lerConfiguracoes()
  return db.transaction(() => {
    const alteracoes: AlteracaoCusto[] = []
    const compra = buscar(id)
    const bloqueios: Partial<Record<StatusCompra, string>> = {
      recebida: 'Esta compra já foi recebida.',
      cancelada: 'Compra cancelada não pode ser recebida.',
      rascunho: 'Envie o pedido (status "Pedido enviado") antes de receber.'
    }
    if (bloqueios[compra.status]) throw new ErroNegocio(bloqueios[compra.status]!)
    if (compra.itens.length === 0) throw new ErroNegocio('A compra não possui itens.')

    const chegando = new Map((itens ?? compra.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade - (i.quantidadeRecebida ?? 0) }))).map((i) => [i.produtoId, i.quantidade]))
    for (const [produtoId, qtd] of chegando) {
      const item = compra.itens.find((i) => i.produtoId === produtoId)
      if (!item) throw new ErroNegocio('Produto não faz parte desta compra.', 'itens')
      const falta = item.quantidade - (item.quantidadeRecebida ?? 0)
      if (qtd > falta) {
        const nome = (db.prepare('SELECT nome FROM produtos WHERE id = ?').get(produtoId) as { nome: string }).nome
        throw new ErroNegocio(`"${nome}": só faltam ${falta} para receber.`, 'itens')
      }
    }
    if (![...chegando.values()].some((q) => q > 0)) throw new ErroNegocio('Informe a quantidade recebida de pelo menos um item.', 'itens')

    for (const item of compra.itens) {
      const quantidade = chegando.get(item.produtoId) ?? 0
      if (quantidade <= 0) continue
      // O custo é calculado com o saldo de antes da entrada.
      const p = db.prepare('SELECT nome, estoque, preco_custo FROM produtos WHERE id = ?').get(item.produtoId) as { nome: string; estoque: number; preco_custo: number }
      const custo = novoCusto(custoAoReceber, p.estoque, p.preco_custo, quantidade, item.valorUnitario)
      if (custo !== p.preco_custo) {
        db.prepare(`UPDATE produtos SET preco_custo = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?`).run(custo, item.produtoId)
        alteracoes.push({ produtoId: item.produtoId, produto: p.nome, de: p.preco_custo, para: custo })
      }
      lancarMovimentacao({
        produtoId: item.produtoId,
        tipo: 'entrada',
        quantidade,
        motivo: `Compra ${compra.numero}`,
        usuarioId,
        compraId: compra.id
      })
      db.prepare('UPDATE compra_itens SET quantidade_recebida = quantidade_recebida + ? WHERE compra_id = ? AND produto_id = ?').run(quantidade, id, item.produtoId)
    }
    const completa = buscar(id).itens.every((i) => (i.quantidadeRecebida ?? 0) >= i.quantidade)
    if (completa) {
      db.prepare(`UPDATE compras SET status = 'recebida', recebida_em = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?`).run(map.agoraIso(), id)
    } else {
      db.prepare(`UPDATE compras SET atualizado_em = datetime('now', 'localtime') WHERE id = ?`).run(id)
    }
    return alteracoes
  })()
}

/**
 * Encerra uma compra recebida em parte quando o restante não vai chegar:
 * fica como recebida, com o que faltou anotado na observação. Nada entra no estoque.
 */
export function encerrar(id: number): void {
  const db = banco()
  db.transaction(() => {
    const compra = buscar(id)
    if (compra.status !== 'pedido' || !compra.itens.some((i) => (i.quantidadeRecebida ?? 0) > 0)) {
      throw new ErroNegocio('Só uma compra recebida em parte pode ser encerrada. Para desistir de um pedido sem nada recebido, cancele-o.')
    }
    const faltas = compra.itens.filter((i) => (i.quantidadeRecebida ?? 0) < i.quantidade)
    const nomes = faltas.map((i) => {
      const nome = (db.prepare('SELECT nome FROM produtos WHERE id = ?').get(i.produtoId) as { nome: string }).nome
      return `${i.quantidade - (i.quantidadeRecebida ?? 0)} ${nome}`
    })
    const nota = `Encerrada sem receber: ${nomes.join(', ')}.`
    db.prepare(
      `UPDATE compras SET status = 'recebida', recebida_em = ?, observacao = TRIM(observacao || ' ' || ?), atualizado_em = datetime('now', 'localtime') WHERE id = ?`
    ).run(map.agoraIso(), nota, id)
  })()
}

export function excluir(id: number): void {
  const compra = buscar(id)
  if (compra.status === 'recebida' || compra.itens.some((i) => (i.quantidadeRecebida ?? 0) > 0)) {
    throw new ErroNegocio('Compras recebidas (mesmo em parte) não podem ser excluídas, pois já geraram movimentação de estoque.')
  }
  banco().prepare('DELETE FROM compras WHERE id = ?').run(id) // itens saem por ON DELETE CASCADE
}

import { useSyncExternalStore } from 'react'
import * as seed from './mock'
import type {
  Categoria,
  Cliente,
  Compra,
  Configuracoes,
  Fornecedor,
  Movimentacao,
  Produto,
  Unidade,
  Usuario
} from '@/types'

// Store em memória da fase 1. Na fase 2, cada ação aqui vira uma chamada IPC
// para o processo principal, que grava no SQLite. As telas continuam iguais.

export interface Db {
  usuarios: Usuario[]
  categorias: Categoria[]
  unidades: Unidade[]
  produtos: Produto[]
  fornecedores: Fornecedor[]
  clientes: Cliente[]
  compras: Compra[]
  movimentacoes: Movimentacao[]
  configuracoes: Configuracoes
}

export type Colecao = Exclude<keyof Db, 'configuracoes'>
export type ItemDe<K extends Colecao> = Db[K][number]

let state: Db = {
  usuarios: [...seed.usuarios],
  categorias: [...seed.categorias],
  unidades: [...seed.unidades],
  produtos: [...seed.produtos],
  fornecedores: [...seed.fornecedores],
  clientes: [...seed.clientes],
  compras: [...seed.compras],
  movimentacoes: [...seed.movimentacoes],
  configuracoes: { ...seed.configuracoes }
}

const listeners = new Set<() => void>()

function setState(next: Db): void {
  state = next
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDb(): Db {
  return useSyncExternalStore(subscribe, () => state)
}

export function getDb(): Db {
  return state
}

function proximoId(lista: { id: number }[]): number {
  return lista.reduce((max, item) => Math.max(max, item.id), 0) + 1
}

export class RegraNegocioError extends Error {}

export const db = {
  criar<K extends Colecao>(colecao: K, dados: Omit<ItemDe<K>, 'id'>): ItemDe<K> {
    const lista = state[colecao] as ItemDe<K>[]
    const item = { ...dados, id: proximoId(lista) } as ItemDe<K>
    setState({ ...state, [colecao]: [...lista, item] })
    return item
  },

  atualizar<K extends Colecao>(colecao: K, id: number, dados: Partial<ItemDe<K>>): void {
    const lista = state[colecao] as ItemDe<K>[]
    setState({
      ...state,
      [colecao]: lista.map((item) => (item.id === id ? { ...item, ...dados, id } : item))
    })
  },

  excluir<K extends Colecao>(colecao: K, id: number): void {
    const lista = state[colecao] as ItemDe<K>[]
    setState({ ...state, [colecao]: lista.filter((item) => item.id !== id) })
  },

  salvarConfiguracoes(dados: Configuracoes): void {
    setState({ ...state, configuracoes: { ...dados } })
  },

  proximoNumeroCompra(): string {
    const n = proximoId(state.compras)
    return `${state.configuracoes.prefixoCompra}${String(n).padStart(4, '0')}`
  },

  /** Lança movimentação e aplica no saldo do produto. Saída não pode deixar saldo negativo. */
  movimentar(dados: Omit<Movimentacao, 'id' | 'data'>): void {
    const produto = state.produtos.find((p) => p.id === dados.produtoId)
    if (!produto) throw new RegraNegocioError('Produto não encontrado.')

    const delta =
      dados.tipo === 'entrada' ? dados.quantidade : dados.tipo === 'saida' ? -dados.quantidade : dados.quantidade
    if (produto.estoque + delta < 0) {
      throw new RegraNegocioError(`Saldo insuficiente de "${produto.nome}" (disponível: ${produto.estoque}).`)
    }

    const mov: Movimentacao = { ...dados, id: proximoId(state.movimentacoes), data: agoraIso() }
    setState({
      ...state,
      movimentacoes: [...state.movimentacoes, mov],
      produtos: state.produtos.map((p) => (p.id === produto.id ? { ...p, estoque: p.estoque + delta } : p))
    })
  },

  /** Recebe a compra: muda status e dá entrada de todos os itens no estoque. */
  receberCompra(compraId: number, usuarioId: number): void {
    const compra = state.compras.find((c) => c.id === compraId)
    if (!compra) throw new RegraNegocioError('Compra não encontrada.')
    if (compra.status === 'recebida') throw new RegraNegocioError('Esta compra já foi recebida.')
    if (compra.status === 'cancelada') throw new RegraNegocioError('Compra cancelada não pode ser recebida.')
    if (compra.itens.length === 0) throw new RegraNegocioError('A compra não possui itens.')

    let idMov = proximoId(state.movimentacoes)
    const data = agoraIso()
    const novasMovs: Movimentacao[] = compra.itens.map((item) => ({
      id: idMov++,
      data,
      produtoId: item.produtoId,
      tipo: 'entrada',
      quantidade: item.quantidade,
      motivo: `Compra ${compra.numero}`,
      usuarioId,
      compraId: compra.id
    }))

    setState({
      ...state,
      compras: state.compras.map((c) => (c.id === compraId ? { ...c, status: 'recebida' } : c)),
      movimentacoes: [...state.movimentacoes, ...novasMovs],
      produtos: state.produtos.map((p) => {
        const qtd = compra.itens.filter((i) => i.produtoId === p.id).reduce((s, i) => s + i.quantidade, 0)
        return qtd ? { ...p, estoque: p.estoque + qtd } : p
      })
    })
  }
}

function agoraIso(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

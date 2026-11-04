import { useSyncExternalStore } from 'react'
import type { ArgsDe, NomeCanal, RetornoDe, Snapshot } from '@shared/api'
import { configuracoesPadrao } from './padroes'
import { chamar } from './api'

// Cópia local dos dados do banco, usada pelas telas para leitura.
// Toda alteração vai para o processo principal (SQLite) via IPC e, em seguida,
// a cópia é recarregada — assim a interface sempre mostra o que está gravado.

const vazio: Snapshot = {
  usuarios: [],
  categorias: [],
  unidades: [],
  produtos: [],
  fornecedores: [],
  clientes: [],
  compras: [],
  movimentacoes: [],
  configuracoes: configuracoesPadrao
}

let state: Snapshot = vazio
const listeners = new Set<() => void>()

function setState(next: Snapshot): void {
  state = next
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDb(): Snapshot {
  return useSyncExternalStore(subscribe, () => state)
}

export async function recarregar(): Promise<void> {
  setState(await chamar('dados:carregar'))
}

export function limpar(): void {
  setState(vazio)
}

/** Executa uma alteração no banco e atualiza a cópia local. Erros sobem como ErroApp. */
export async function alterar<C extends NomeCanal>(canal: C, ...args: ArgsDe<C>): Promise<RetornoDe<C>> {
  const resultado = await chamar(canal, ...args)
  await recarregar()
  return resultado
}

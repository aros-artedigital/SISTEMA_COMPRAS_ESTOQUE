import type { Snapshot } from '@shared/api'
import type { Configuracoes, ItemCompra } from '@shared/tipos'
import { banco } from '../db/conexao'
import { configuracoesPadrao } from '../db/seed'
import * as map from './mapeadores'

export function lerConfiguracoes(): Configuracoes {
  const linha = banco().prepare('SELECT dados FROM configuracoes WHERE id = 1').get() as { dados: string } | undefined
  return { ...configuracoesPadrao, ...(linha ? JSON.parse(linha.dados) : {}) }
}

export function salvarConfiguracoes(dados: Configuracoes): void {
  banco()
    .prepare('INSERT INTO configuracoes (id, dados) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET dados = excluded.dados')
    .run(JSON.stringify(dados))
}

/** Todas as linhas de uma consulta, já tipadas para os mapeadores. */
export const todas = (sql: string, ...params: unknown[]): map.Linha[] => banco().prepare(sql).all(...params) as map.Linha[]

/** Carrega todas as tabelas para a interface. Para o porte de um sistema local, é simples e rápido. */
export function carregar(): Snapshot {
  const itens = new Map<number, ItemCompra[]>()
  for (const r of todas('SELECT * FROM compra_itens ORDER BY id')) {
    const lista = itens.get(r.compra_id) ?? []
    lista.push(map.itemCompra(r))
    itens.set(r.compra_id, lista)
  }

  return {
    usuarios: todas('SELECT * FROM usuarios ORDER BY nome').map(map.usuario),
    categorias: todas('SELECT * FROM categorias ORDER BY nome').map(map.categoria),
    unidades: todas('SELECT * FROM unidades ORDER BY sigla').map(map.unidade),
    produtos: todas('SELECT * FROM produtos ORDER BY id').map(map.produto),
    fornecedores: todas('SELECT * FROM fornecedores ORDER BY razao_social').map(map.fornecedor),
    clientes: todas('SELECT * FROM clientes ORDER BY nome').map(map.cliente),
    compras: todas('SELECT * FROM compras ORDER BY id').map((r) => map.compra(r, itens.get(r.id) ?? [])),
    movimentacoes: todas('SELECT * FROM movimentacoes ORDER BY id').map(map.movimentacao),
    configuracoes: lerConfiguracoes()
  }
}

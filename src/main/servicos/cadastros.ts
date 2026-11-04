import type { z } from 'zod'
import type { categoriaSchema, clienteSchema, fornecedorSchema, unidadeSchema } from '@shared/schemas'
import { somenteDigitos } from '@shared/format'
import type { Categoria, Cliente, Fornecedor, Unidade } from '@shared/tipos'
import { banco } from '../db/conexao'
import { ErroNegocio } from '../erros'
import * as map from './mapeadores'

// Tabelas de cadastro simples: categorias, unidades, fornecedores e clientes.

function exigirAlterado(changes: number, oque: string): void {
  if (changes === 0) throw new ErroNegocio(`${oque} não encontrado(a).`)
}

function inserirOuAtualizar(id: number | null, insert: string, update: string, valores: unknown[]): number {
  const db = banco()
  if (id === null) return Number(db.prepare(insert).run(...valores).lastInsertRowid)
  exigirAlterado(db.prepare(update).run(...valores, id).changes, 'Registro')
  return id
}

// ---------- Categorias ----------

export function salvarCategoria(id: number | null, d: z.output<typeof categoriaSchema>): Categoria {
  const db = banco()
  if (db.prepare('SELECT 1 FROM categorias WHERE nome = ? COLLATE NOCASE AND id IS NOT ?').get(d.nome, id)) {
    throw new ErroNegocio('Categoria já cadastrada.', 'nome')
  }
  const novoId = inserirOuAtualizar(
    id,
    'INSERT INTO categorias (nome, descricao) VALUES (?, ?)',
    'UPDATE categorias SET nome = ?, descricao = ? WHERE id = ?',
    [d.nome, d.descricao]
  )
  return map.categoria(db.prepare('SELECT * FROM categorias WHERE id = ?').get(novoId) as map.Linha)
}

export function excluirCategoria(id: number): void {
  const db = banco()
  if (db.prepare('SELECT 1 FROM produtos WHERE categoria_id = ? LIMIT 1').get(id)) {
    throw new ErroNegocio('Categoria em uso por produtos. Mova os produtos antes de excluir.')
  }
  exigirAlterado(db.prepare('DELETE FROM categorias WHERE id = ?').run(id).changes, 'Categoria')
}

// ---------- Unidades ----------

export function salvarUnidade(id: number | null, d: z.output<typeof unidadeSchema>): Unidade {
  const db = banco()
  if (db.prepare('SELECT 1 FROM unidades WHERE sigla = ? AND id IS NOT ?').get(d.sigla, id)) {
    throw new ErroNegocio('Sigla já cadastrada.', 'sigla')
  }
  const novoId = inserirOuAtualizar(
    id,
    'INSERT INTO unidades (sigla, nome) VALUES (?, ?)',
    'UPDATE unidades SET sigla = ?, nome = ? WHERE id = ?',
    [d.sigla, d.nome]
  )
  return map.unidade(db.prepare('SELECT * FROM unidades WHERE id = ?').get(novoId) as map.Linha)
}

export function excluirUnidade(id: number): void {
  const db = banco()
  if (db.prepare('SELECT 1 FROM produtos WHERE unidade_id = ? LIMIT 1').get(id)) throw new ErroNegocio('Unidade em uso por produtos.')
  exigirAlterado(db.prepare('DELETE FROM unidades WHERE id = ?').run(id).changes, 'Unidade')
}

// ---------- Fornecedores ----------

/** Documentos (CPF/CNPJ) são comparados só pelos dígitos, independente da máscara. */
const mesmoDocumento = (tabela: 'fornecedores' | 'clientes', coluna: 'cnpj' | 'documento', valor: string, id: number | null): boolean =>
  (banco().prepare(`SELECT ${coluna} AS doc FROM ${tabela} WHERE id IS NOT ?`).all(id) as { doc: string }[]).some(
    (r) => somenteDigitos(r.doc) === somenteDigitos(valor)
  )

export function salvarFornecedor(id: number | null, d: z.output<typeof fornecedorSchema>): Fornecedor {
  if (mesmoDocumento('fornecedores', 'cnpj', d.cnpj, id)) throw new ErroNegocio('CNPJ já cadastrado.', 'cnpj')
  const novoId = inserirOuAtualizar(
    id,
    'INSERT INTO fornecedores (razao_social, nome_fantasia, cnpj, telefone, email, cidade, uf, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'UPDATE fornecedores SET razao_social = ?, nome_fantasia = ?, cnpj = ?, telefone = ?, email = ?, cidade = ?, uf = ?, ativo = ? WHERE id = ?',
    [d.razaoSocial, d.nomeFantasia, d.cnpj, d.telefone, d.email, d.cidade, d.uf, map.bool(d.ativo)]
  )
  return map.fornecedor(banco().prepare('SELECT * FROM fornecedores WHERE id = ?').get(novoId) as map.Linha)
}

export function excluirFornecedor(id: number): void {
  const db = banco()
  if (db.prepare('SELECT 1 FROM compras WHERE fornecedor_id = ? LIMIT 1').get(id)) {
    throw new ErroNegocio('Fornecedor possui compras registradas. Inative-o em vez de excluir.')
  }
  exigirAlterado(db.prepare('DELETE FROM fornecedores WHERE id = ?').run(id).changes, 'Fornecedor')
}

// ---------- Clientes ----------

export function salvarCliente(id: number | null, d: z.output<typeof clienteSchema>): Cliente {
  if (mesmoDocumento('clientes', 'documento', d.documento, id)) throw new ErroNegocio('Documento já cadastrado.', 'documento')
  const novoId = inserirOuAtualizar(
    id,
    'INSERT INTO clientes (nome, tipo, documento, telefone, email, cidade, uf, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'UPDATE clientes SET nome = ?, tipo = ?, documento = ?, telefone = ?, email = ?, cidade = ?, uf = ?, ativo = ? WHERE id = ?',
    [d.nome, d.tipo, d.documento, d.telefone, d.email, d.cidade, d.uf, map.bool(d.ativo)]
  )
  return map.cliente(banco().prepare('SELECT * FROM clientes WHERE id = ?').get(novoId) as map.Linha)
}

export function excluirCliente(id: number): void {
  exigirAlterado(banco().prepare('DELETE FROM clientes WHERE id = ?').run(id).changes, 'Cliente')
}

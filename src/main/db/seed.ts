import type Database from 'better-sqlite3'
import type { Configuracoes } from '@shared/tipos'
import { gerarHash } from '../seguranca'
import * as demo from './dadosDemo'

export const configuracoesPadrao: Configuracoes = {
  nomeEmpresa: 'Minha Empresa',
  cnpj: '',
  telefone: '',
  email: '',
  endereco: '',
  estoqueMinimoPadrao: 5,
  alertarEstoqueMinimo: true,
  prefixoCompra: 'C-'
}

/**
 * Popula um banco recém-criado.
 * - comDemo = true: dados fictícios completos (desenvolvimento e testes).
 * - comDemo = false: só o administrador inicial e tabelas auxiliares básicas.
 */
export function popular(db: Database.Database, comDemo: boolean): void {
  const vazio = (db.prepare('SELECT COUNT(*) AS n FROM usuarios').get() as { n: number }).n === 0
  if (!vazio) return

  db.transaction(() => {
    const insUsuario = db.prepare(
      'INSERT INTO usuarios (id, nome, email, login, senha_hash, perfil, ativo) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    const insConfig = db.prepare('INSERT INTO configuracoes (id, dados) VALUES (1, ?)')

    if (!comDemo) {
      insUsuario.run(1, 'Administrador', 'admin@empresa.local', 'admin', gerarHash('admin123'), 'admin', 1)
      const insUn = db.prepare('INSERT INTO unidades (sigla, nome) VALUES (?, ?)')
      for (const u of demo.unidades) insUn.run(u.sigla, u.nome)
      insConfig.run(JSON.stringify(configuracoesPadrao))
      return
    }

    for (const u of demo.usuarios) insUsuario.run(u.id, u.nome, u.email, u.login, gerarHash(u.senha), u.perfil, u.ativo ? 1 : 0)

    const insCat = db.prepare('INSERT INTO categorias (id, nome, descricao) VALUES (?, ?, ?)')
    for (const c of demo.categorias) insCat.run(c.id, c.nome, c.descricao)

    const insUn = db.prepare('INSERT INTO unidades (id, sigla, nome) VALUES (?, ?, ?)')
    for (const u of demo.unidades) insUn.run(u.id, u.sigla, u.nome)

    const insProd = db.prepare(`
      INSERT INTO produtos (id, codigo, codigo_barras, nome, categoria_id, unidade_id, preco_custo, preco_venda, estoque, estoque_minimo, ativo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const p of demo.produtos) {
      insProd.run(p.id, p.codigo, p.codigoBarras, p.nome, p.categoriaId, p.unidadeId, p.precoCusto, p.precoVenda, p.estoque, p.estoqueMinimo, p.ativo ? 1 : 0)
    }

    const insForn = db.prepare(`
      INSERT INTO fornecedores (id, razao_social, nome_fantasia, cnpj, telefone, email, cidade, uf, ativo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const f of demo.fornecedores) insForn.run(f.id, f.razaoSocial, f.nomeFantasia, f.cnpj, f.telefone, f.email, f.cidade, f.uf, f.ativo ? 1 : 0)

    const insCli = db.prepare(`
      INSERT INTO clientes (id, nome, tipo, documento, telefone, email, cidade, uf, ativo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const c of demo.clientes) insCli.run(c.id, c.nome, c.tipo, c.documento, c.telefone, c.email, c.cidade, c.uf, c.ativo ? 1 : 0)

    const insCompra = db.prepare(`
      INSERT INTO compras (id, numero, fornecedor_id, data, status, observacao, recebida_em) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    const insItem = db.prepare('INSERT INTO compra_itens (compra_id, produto_id, quantidade, valor_unitario) VALUES (?, ?, ?, ?)')
    for (const c of demo.compras) {
      insCompra.run(c.id, c.numero, c.fornecedorId, c.data, c.status, c.observacao, c.status === 'recebida' ? `${c.data}T12:00:00` : null)
      for (const i of c.itens) insItem.run(c.id, i.produtoId, i.quantidade, i.valorUnitario)
    }

    // O saldo após cada movimentação é reconstruído de trás para frente a partir do estoque atual.
    const saldo = new Map(demo.produtos.map((p) => [p.id, p.estoque]))
    const comSaldo = [...demo.movimentacoes]
      .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id)
      .map((m) => {
        const apos = saldo.get(m.produtoId) ?? 0
        const delta = m.tipo === 'saida' ? -m.quantidade : m.quantidade
        saldo.set(m.produtoId, apos - delta)
        return { ...m, saldoApos: apos }
      })
    const insMov = db.prepare(`
      INSERT INTO movimentacoes (id, data, produto_id, tipo, quantidade, saldo_apos, motivo, usuario_id, compra_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const m of comSaldo) insMov.run(m.id, m.data, m.produtoId, m.tipo, m.quantidade, m.saldoApos, m.motivo, m.usuarioId, m.compraId ?? null)

    insConfig.run(JSON.stringify(demo.configuracoes))
  })()
}

import { randomBytes } from 'crypto'
import type { Configuracoes } from '@shared/tipos'
import { banco } from '../../db/conexao'
import { configuracoesPadrao } from '../../db/seed'
import { lerConfiguracoes, salvarConfiguracoes } from '../dados'

// Conversão entre as linhas do SQLite local e o formato trocado com o servidor:
// camelCase, booleanos de verdade e referências por uuid (os ids numéricos são só locais).

export type TabelaSync =
  | 'usuarios'
  | 'categorias'
  | 'unidades'
  | 'fornecedores'
  | 'clientes'
  | 'produtos'
  | 'compras'
  | 'movimentacoes'
  | 'configuracoes'
  | 'recuperacao'

type Dados = Record<string, unknown>
type Linha = Record<string, unknown>

/** Problema ao aplicar uma alteração do servidor; vira um registro em "Conflitos". */
export class ErroAplicacao extends Error {}

/** Falta um registro de que a alteração depende: ela é guardada e tentada de novo nas próximas sincronizações. */
export class ErroReferencia extends ErroAplicacao {}

const db = () => banco()
const linhaPorUuid = (t: string, uuid: string): Linha | undefined => db().prepare(`SELECT * FROM ${t} WHERE uuid = ?`).get(uuid) as Linha | undefined
const uuidDe = (t: string, id: unknown): string | null =>
  id === null || id === undefined ? null : ((db().prepare(`SELECT uuid FROM ${t} WHERE id = ?`).get(id) as { uuid: string } | undefined)?.uuid ?? null)

function idDe(t: string, uuid: unknown, oque: string): number {
  const r = typeof uuid === 'string' ? (db().prepare(`SELECT id FROM ${t} WHERE uuid = ?`).get(uuid) as { id: number } | undefined) : undefined
  if (!r) throw new ErroReferencia(`${oque} ainda não chegou a este terminal; será aplicado na próxima sincronização`)
  return r.id
}

const txt = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
const num = (v: unknown): number => Number(v) || 0
const bool = (v: unknown): number => (v ? 1 : 0)

// ---------- Local → servidor ----------

/** Estado atual do registro para envio, ou null se ele foi excluído. */
export function montarDados(tabela: TabelaSync, uuid: string): Dados | null {
  if (tabela === 'configuracoes') return { ...lerConfiguracoes() }
  if (tabela === 'recuperacao') {
    const r = db().prepare('SELECT codigo_hash, criado_em FROM recuperacao WHERE id = 1').get() as Linha | undefined
    return r ? { codigoHash: r.codigo_hash, criadoEm: r.criado_em } : null
  }
  const r = linhaPorUuid(tabela, uuid)
  if (!r) return null
  switch (tabela) {
    case 'usuarios':
      return { nome: r.nome, email: r.email, login: r.login, senhaHash: r.senha_hash, perfil: r.perfil, ativo: !!r.ativo }
    case 'categorias':
      return { nome: r.nome, descricao: r.descricao }
    case 'unidades':
      return { sigla: r.sigla, nome: r.nome }
    case 'fornecedores':
      return { razaoSocial: r.razao_social, nomeFantasia: r.nome_fantasia, cnpj: r.cnpj, telefone: r.telefone, email: r.email, cidade: r.cidade, uf: r.uf, ativo: !!r.ativo }
    case 'clientes':
      return { nome: r.nome, tipo: r.tipo, documento: r.documento, telefone: r.telefone, email: r.email, cidade: r.cidade, uf: r.uf, ativo: !!r.ativo }
    case 'produtos':
      return {
        codigo: r.codigo,
        codigoBarras: r.codigo_barras,
        nome: r.nome,
        categoria: uuidDe('categorias', r.categoria_id),
        unidade: uuidDe('unidades', r.unidade_id),
        precoCusto: r.preco_custo,
        precoVenda: r.preco_venda,
        estoqueMinimo: r.estoque_minimo,
        ativo: !!r.ativo
      }
    case 'compras': {
      const itens = db().prepare('SELECT * FROM compra_itens WHERE compra_id = ? ORDER BY id').all(r.id) as Linha[]
      return {
        numero: r.numero,
        fornecedor: uuidDe('fornecedores', r.fornecedor_id),
        data: r.data,
        status: r.status,
        observacao: r.observacao,
        recebidaEm: r.recebida_em,
        itens: itens.map((i) => ({ produto: uuidDe('produtos', i.produto_id), quantidade: i.quantidade, valorUnitario: i.valor_unitario }))
      }
    }
    case 'movimentacoes':
      return {
        data: r.data,
        produto: uuidDe('produtos', r.produto_id),
        tipo: r.tipo,
        quantidade: r.quantidade,
        motivo: r.motivo,
        usuario: uuidDe('usuarios', r.usuario_id),
        compra: uuidDe('compras', r.compra_id)
      }
  }
}

/** Texto curto para identificar o registro na lista de conflitos. */
export function descrever(tabela: string, uuid: string, dados?: Dados | null): string {
  const r = (dados ?? (tabela === 'configuracoes' || tabela === 'recuperacao' ? {} : montarDados(tabela as TabelaSync, uuid))) as Dados | null
  if (!r) return `${tabela} ${uuid.slice(0, 8)}`
  const nomes: Record<string, string> = {
    usuarios: `Usuário ${txt(r.login)}`,
    categorias: `Categoria ${txt(r.nome)}`,
    unidades: `Unidade ${txt(r.sigla)}`,
    fornecedores: `Fornecedor ${txt(r.razaoSocial)}`,
    clientes: `Cliente ${txt(r.nome)}`,
    produtos: `Produto ${txt(r.codigo)} — ${txt(r.nome)}`,
    compras: `Compra ${txt(r.numero)}`,
    movimentacoes: `Movimentação: ${txt(r.motivo)}`,
    configuracoes: 'Configurações da empresa',
    recuperacao: 'Código de recuperação do administrador'
  }
  return nomes[tabela] ?? tabela
}

// ---------- Servidor → local ----------

/** Campo único de cada tabela e como renomear o registro local que colidir com um vindo de outro terminal. */
const UNICOS: Record<string, Record<string, (v: string) => string>> = {
  usuarios: { login: (v) => `${v}-conflito` },
  categorias: { nome: (v) => `${v} (conflito)` },
  unidades: { sigla: (v) => `${v}-${sufixo()}` },
  produtos: { codigo: (v) => `${v}-CONFLITO-${sufixo()}`, codigo_barras: () => '' },
  fornecedores: { cnpj: (v) => `${v} (conflito)` },
  clientes: { documento: (v) => `${v} (conflito)` },
  compras: { numero: (v) => `${v}-${sufixo()}` }
}
const sufixo = (): string => randomBytes(2).toString('hex').toUpperCase()

/** Conflito resolvido automaticamente ao aplicar uma alteração (o registro local foi ajustado). */
export interface ConflitoLocal {
  tabela: string
  uuid: string
  descricao: string
  motivo: string
}

/**
 * Executa a gravação; se bater num valor único já usado por um registro local diferente,
 * renomeia o local (o do servidor vale) e tenta de novo. Retorna o conflito, se houve.
 */
function comUnicos(uuid: string, gravar: () => void): ConflitoLocal | null {
  try {
    gravar()
    return null
  } catch (e) {
    const m = /UNIQUE constraint failed: (\w+)\.(\w+)/.exec((e as Error).message)
    const renomear = m && UNICOS[m[1]]?.[m[2]]
    if (!m || !renomear) throw e
    const [, t, coluna] = m
    const valor = String(pendente[coluna] ?? '')
    const local = db().prepare(`SELECT id, uuid, ${coluna} AS v FROM ${t} WHERE ${coluna} = ? COLLATE NOCASE AND uuid IS NOT ?`).get(valor, uuid) as
      | { id: number; uuid: string; v: string }
      | undefined
    if (!local) throw e
    const novo = renomear(local.v)
    db().prepare(`UPDATE ${t} SET ${coluna} = ? WHERE id = ?`).run(novo, local.id)
    gravar()
    return {
      tabela: t,
      uuid: local.uuid,
      descricao: descrever(t, local.uuid),
      motivo: `"${local.v}" já existe em outro terminal, então este registro foi alterado para "${novo || '(vazio)'}". Revise e salve de novo.`
    }
  }
}

// Colunas do último upsert (para achar o registro local que colidiu num valor único).
let pendente: Record<string, unknown> = {}

function upsert(tabela: string, uuid: string, colunas: Record<string, unknown>, somenteInsercao: Record<string, unknown> = {}): number {
  pendente = colunas
  const atual = linhaPorUuid(tabela, uuid)
  const nomes = Object.keys(colunas)
  if (atual) {
    db()
      .prepare(`UPDATE ${tabela} SET ${nomes.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...Object.values(colunas), atual.id)
    return atual.id as number
  }
  const todas = { uuid, ...colunas, ...somenteInsercao }
  const r = db()
    .prepare(`INSERT INTO ${tabela} (${Object.keys(todas).join(', ')}) VALUES (${Object.keys(todas).map(() => '?').join(', ')})`)
    .run(...Object.values(todas))
  return Number(r.lastInsertRowid)
}

/**
 * Aplica no banco local uma alteração vinda de outro terminal. Deve rodar com sync_controle.aplicando = 1
 * (para não voltar para a fila). Retorna a descrição de um conflito resolvido automaticamente, se houve.
 */
export function aplicarRemoto(tabela: TabelaSync, uuid: string, operacao: 'salvar' | 'excluir', d: Dados | null): ConflitoLocal | null {
  if (tabela === 'configuracoes') {
    if (operacao === 'salvar' && d) salvarConfiguracoes({ ...configuracoesPadrao, ...(d as Partial<Configuracoes>) })
    return null
  }
  if (tabela === 'recuperacao') {
    if (operacao === 'excluir') db().prepare('DELETE FROM recuperacao WHERE id = 1').run()
    else if (d)
      db()
        .prepare('INSERT INTO recuperacao (id, codigo_hash, criado_em) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET codigo_hash = excluded.codigo_hash, criado_em = excluded.criado_em')
        .run(txt(d.codigoHash), txt(d.criadoEm))
    return null
  }

  if (operacao === 'excluir') {
    try {
      db().prepare(`DELETE FROM ${tabela} WHERE uuid = ?`).run(uuid)
    } catch (e) {
      if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        throw new ErroAplicacao('Excluído em outro terminal, mas ainda está em uso neste (compras ou movimentações). Mantido aqui.')
      }
      throw e
    }
    return null
  }

  if (!d) throw new ErroAplicacao('Alteração sem dados')

  switch (tabela) {
    case 'usuarios':
      return comUnicos(uuid, () =>
        upsert(tabela, uuid, { nome: txt(d.nome), email: txt(d.email), login: txt(d.login).toLowerCase(), senha_hash: txt(d.senhaHash), perfil: txt(d.perfil), ativo: bool(d.ativo) })
      )
    case 'categorias':
      return comUnicos(uuid, () => upsert(tabela, uuid, { nome: txt(d.nome), descricao: txt(d.descricao) }))
    case 'unidades':
      return comUnicos(uuid, () => upsert(tabela, uuid, { sigla: txt(d.sigla).toUpperCase(), nome: txt(d.nome) }))
    case 'fornecedores':
      return comUnicos(uuid, () =>
        upsert(tabela, uuid, {
          razao_social: txt(d.razaoSocial),
          nome_fantasia: txt(d.nomeFantasia),
          cnpj: txt(d.cnpj),
          telefone: txt(d.telefone),
          email: txt(d.email),
          cidade: txt(d.cidade),
          uf: txt(d.uf),
          ativo: bool(d.ativo)
        })
      )
    case 'clientes':
      return comUnicos(uuid, () =>
        upsert(tabela, uuid, {
          nome: txt(d.nome),
          tipo: txt(d.tipo),
          documento: txt(d.documento),
          telefone: txt(d.telefone),
          email: txt(d.email),
          cidade: txt(d.cidade),
          uf: txt(d.uf),
          ativo: bool(d.ativo)
        })
      )
    case 'produtos': {
      const colunas = {
        codigo: txt(d.codigo),
        codigo_barras: txt(d.codigoBarras),
        nome: txt(d.nome),
        categoria_id: idDe('categorias', d.categoria, 'A categoria do produto'),
        unidade_id: idDe('unidades', d.unidade, 'A unidade do produto'),
        preco_custo: num(d.precoCusto),
        preco_venda: num(d.precoVenda),
        estoque_minimo: num(d.estoqueMinimo),
        ativo: bool(d.ativo)
      }
      // O saldo nunca vem do servidor: começa em zero e é formado pelas movimentações recebidas.
      return comUnicos(uuid, () => upsert(tabela, uuid, colunas, { estoque: 0 }))
    }
    case 'compras': {
      const fornecedorId = idDe('fornecedores', d.fornecedor, 'O fornecedor da compra')
      const itens = (Array.isArray(d.itens) ? d.itens : []) as Dados[]
      const resolvidos = itens.map((i) => ({ produtoId: idDe('produtos', i.produto, 'Um produto da compra'), quantidade: num(i.quantidade), valor: num(i.valorUnitario) }))
      let id = 0
      const conflito = comUnicos(uuid, () => {
        id = upsert(tabela, uuid, {
          numero: txt(d.numero),
          fornecedor_id: fornecedorId,
          data: txt(d.data),
          status: txt(d.status),
          observacao: txt(d.observacao),
          recebida_em: d.recebidaEm ? txt(d.recebidaEm) : null
        })
      })
      db().prepare('DELETE FROM compra_itens WHERE compra_id = ?').run(id)
      const ins = db().prepare('INSERT INTO compra_itens (compra_id, produto_id, quantidade, valor_unitario) VALUES (?, ?, ?, ?)')
      for (const i of resolvidos) ins.run(id, i.produtoId, i.quantidade, i.valor)
      return conflito
    }
    case 'movimentacoes': {
      if (linhaPorUuid(tabela, uuid)) return null // já aplicada
      const produtoId = idDe('produtos', d.produto, 'O produto da movimentação')
      const usuarioId = idDe('usuarios', d.usuario, 'O usuário da movimentação')
      const compraId = d.compra ? idDe('compras', d.compra, 'A compra da movimentação') : null
      const quantidade = num(d.quantidade)
      const delta = d.tipo === 'saida' ? -quantidade : quantidade
      db().prepare(`UPDATE produtos SET estoque = estoque + ? WHERE id = ?`).run(delta, produtoId)
      const { estoque } = db().prepare('SELECT estoque FROM produtos WHERE id = ?').get(produtoId) as { estoque: number }
      db()
        .prepare(
          `INSERT INTO movimentacoes (uuid, data, produto_id, tipo, quantidade, saldo_apos, motivo, usuario_id, compra_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(uuid, txt(d.data), produtoId, txt(d.tipo), quantidade, estoque, txt(d.motivo), usuarioId, compraId)
      return null
    }
  }
}

/** Desfaz uma movimentação local que o servidor recusou (ex.: compra já recebida em outro terminal). */
export function desfazerMovimentacao(uuid: string): void {
  const m = linhaPorUuid('movimentacoes', uuid)
  if (!m) return
  const delta = m.tipo === 'saida' ? -(m.quantidade as number) : (m.quantidade as number)
  db().prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?').run(delta, m.produto_id)
  db().prepare('DELETE FROM movimentacoes WHERE id = ?').run(m.id)
}

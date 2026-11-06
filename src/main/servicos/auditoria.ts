import type { AlteracaoAuditoria, FiltrosAuditoria, RegistroAuditoria } from '@shared/api'
import { nomePerfil } from '@shared/permissoes'
import type { Perfil } from '@shared/tipos'
import { banco } from '../db/conexao'
import { lerConfiguracoes } from './dados'
import * as map from './mapeadores'

// Registro de auditoria. Os valores já são gravados em texto legível (nomes, moeda, Sim/Não),
// para a consulta continuar fazendo sentido mesmo depois que os cadastros mudarem.

export type TabelaAuditada = 'produtos' | 'categorias' | 'unidades' | 'fornecedores' | 'clientes' | 'usuarios' | 'compras'

interface NovoRegistro {
  usuario: { id: number; nome: string } | null
  /** Usado quando não há usuário logado (ex.: login recusado). */
  usuarioNome?: string
  acao: string
  entidade: string
  entidadeId?: number | null
  descricao: string
  alteracoes?: AlteracaoAuditoria[]
}

export function registrar(r: NovoRegistro): void {
  try {
    banco()
      .prepare(
        `INSERT INTO auditoria (em, usuario_id, usuario_nome, acao, entidade, entidade_id, descricao, alteracoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        map.agoraIso(),
        r.usuario?.id ?? null,
        r.usuario?.nome ?? r.usuarioNome ?? '—',
        r.acao,
        r.entidade,
        r.entidadeId ?? null,
        r.descricao,
        r.alteracoes?.length ? JSON.stringify(r.alteracoes) : null
      )
  } catch (e) {
    // A auditoria nunca impede a operação do usuário.
    console.error('[auditoria]', e)
  }
}

// ---------- Leitura dos registros auditados ----------

type Objeto = Record<string, unknown>

export function ler(tabela: TabelaAuditada, id: number): Objeto | null {
  const db = banco()
  const r = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id) as map.Linha | undefined
  if (!r) return null
  switch (tabela) {
    case 'produtos':
      return map.produto(r) as unknown as Objeto
    case 'categorias':
      return map.categoria(r) as unknown as Objeto
    case 'unidades':
      return map.unidade(r) as unknown as Objeto
    case 'fornecedores':
      return map.fornecedor(r) as unknown as Objeto
    case 'clientes':
      return map.cliente(r) as unknown as Objeto
    case 'usuarios':
      return map.usuario(r) as unknown as Objeto
    case 'compras': {
      const itens = (db.prepare('SELECT * FROM compra_itens WHERE compra_id = ? ORDER BY id').all(id) as map.Linha[]).map(map.itemCompra)
      return map.compra(r, itens) as unknown as Objeto
    }
  }
}

export function descrever(tabela: TabelaAuditada, o: Objeto | null): string {
  if (!o) return tabela
  const t = (k: string): string => String(o[k] ?? '')
  return {
    produtos: `Produto ${t('codigo')} — ${t('nome')}`,
    categorias: `Categoria ${t('nome')}`,
    unidades: `Unidade ${t('sigla')}`,
    fornecedores: `Fornecedor ${t('razaoSocial')}`,
    clientes: `Cliente ${t('nome')}`,
    usuarios: `Usuário ${t('nome')} (${t('login')})`,
    compras: `Compra ${t('numero')}`
  }[tabela]
}

const ROTULOS: Record<string, string> = {
  codigo: 'Código',
  codigoBarras: 'Código de barras',
  nome: 'Nome',
  categoriaId: 'Categoria',
  unidadeId: 'Unidade',
  precoCusto: 'Preço de custo',
  precoVenda: 'Preço de venda',
  estoqueMinimo: 'Estoque mínimo',
  ativo: 'Ativo',
  descricao: 'Descrição',
  sigla: 'Sigla',
  razaoSocial: 'Razão social',
  nomeFantasia: 'Nome fantasia',
  cnpj: 'CNPJ',
  telefone: 'Telefone',
  email: 'E-mail',
  cidade: 'Cidade',
  uf: 'UF',
  tipo: 'Tipo',
  documento: 'CPF/CNPJ',
  login: 'Login',
  perfil: 'Perfil',
  fornecedorId: 'Fornecedor',
  data: 'Data',
  status: 'Status',
  observacao: 'Observação',
  itens: 'Itens',
  nomeEmpresa: 'Nome da empresa',
  endereco: 'Endereço',
  estoqueMinimoPadrao: 'Estoque mínimo padrão',
  alertarEstoqueMinimo: 'Alertas de estoque mínimo',
  prefixoCompra: 'Prefixo das compras',
  custoAoReceber: 'Custo ao receber compras'
}
// Campos que não entram na comparação (o saldo muda por movimentação, que já tem histórico próprio).
const IGNORAR = new Set(['id', 'estoque', 'senha', 'numero'])
const MOEDA = new Set(['precoCusto', 'precoVenda'])
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function nomeDe(tabela: string, coluna: string, id: unknown): string {
  const r = banco().prepare(`SELECT ${coluna} AS v FROM ${tabela} WHERE id = ?`).get(id) as { v: string } | undefined
  return r?.v ?? `#${id}`
}

function formatar(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '(vazio)'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (MOEDA.has(campo)) return moeda.format(Number(v))
  if (campo === 'categoriaId') return nomeDe('categorias', 'nome', v)
  if (campo === 'unidadeId') return nomeDe('unidades', 'sigla', v)
  if (campo === 'fornecedorId') return nomeDe('fornecedores', "COALESCE(NULLIF(nome_fantasia, ''), razao_social)", v)
  if (campo === 'perfil') return nomePerfil[v as Perfil] ?? String(v)
  if (campo === 'custoAoReceber') return ({ medio: 'Custo médio', ultimo: 'Último preço', manter: 'Não alterar' } as Record<string, string>)[String(v)] ?? String(v)
  if (campo === 'itens' && Array.isArray(v)) {
    return v
      .map((i: { produtoId: number; quantidade: number; valorUnitario: number }) => `${nomeDe('produtos', 'codigo', i.produtoId)} ×${i.quantidade} a ${moeda.format(i.valorUnitario)}`)
      .join('; ')
  }
  return String(v)
}

/** Campos que mudaram entre duas versões do mesmo registro, já em texto legível. */
export function diferencas(antes: Objeto | null, depois: Objeto | null): AlteracaoAuditoria[] {
  if (!antes || !depois) return []
  const lista: AlteracaoAuditoria[] = []
  for (const campo of Object.keys({ ...antes, ...depois })) {
    if (IGNORAR.has(campo)) continue
    const a = campo === 'itens' ? (antes.itens as Objeto[] | undefined)?.map(({ quantidadeRecebida: _r, ...i }) => i) : antes[campo]
    const d = campo === 'itens' ? (depois.itens as Objeto[] | undefined)?.map(({ quantidadeRecebida: _r, ...i }) => i) : depois[campo]
    if (JSON.stringify(a) === JSON.stringify(d)) continue
    lista.push({ campo: ROTULOS[campo] ?? campo, de: formatar(campo, a), para: formatar(campo, d) })
  }
  return lista
}

export const configuracoesAtuais = (): Objeto => ({ ...lerConfiguracoes() })

// ---------- Consulta ----------

export function listar(f: FiltrosAuditoria): { itens: RegistroAuditoria[]; total: number } {
  const onde: string[] = []
  const params: unknown[] = []
  if (f.de) onde.push('substr(em, 1, 10) >= ?') && params.push(f.de)
  if (f.ate) onde.push('substr(em, 1, 10) <= ?') && params.push(f.ate)
  if (f.usuario) onde.push('usuario_nome = ?') && params.push(f.usuario)
  if (f.acao) onde.push('acao = ?') && params.push(f.acao)
  if (f.entidade) onde.push('entidade = ?') && params.push(f.entidade)
  if (f.busca) onde.push('(descricao LIKE ? OR alteracoes LIKE ?)') && params.push(`%${f.busca}%`, `%${f.busca}%`)
  const where = onde.length ? `WHERE ${onde.join(' AND ')}` : ''
  const db = banco()
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM auditoria ${where}`).get(...params) as { n: number }
  const linhas = db.prepare(`SELECT * FROM auditoria ${where} ORDER BY id DESC LIMIT 1000`).all(...params) as map.Linha[]
  return {
    total: n,
    itens: linhas.map((r) => ({
      id: r.id,
      em: r.em,
      usuario: r.usuario_nome,
      acao: r.acao,
      entidade: r.entidade,
      descricao: r.descricao,
      alteracoes: r.alteracoes ? JSON.parse(r.alteracoes) : []
    }))
  }
}

export function usuariosComRegistro(): string[] {
  return (banco().prepare('SELECT DISTINCT usuario_nome AS n FROM auditoria ORDER BY n').all() as { n: string }[]).map((r) => r.n)
}

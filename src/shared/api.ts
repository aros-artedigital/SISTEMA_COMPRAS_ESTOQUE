import type { z } from 'zod'
import type {
  categoriaSchema,
  clienteSchema,
  compraEntradaSchema,
  configuracoesSchema,
  fornecedorSchema,
  movimentacaoSchema,
  perfilSchema,
  produtoSchema,
  unidadeSchema,
  usuarioSchema
} from './schemas'
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
} from './tipos'

// Contrato entre a interface e o processo principal.
// Cada canal IPC declara os argumentos e o retorno; os dois lados usam este mapa.

/** Tudo o que a interface precisa para montar as telas (carregado após login e após cada alteração). */
export interface Snapshot {
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

export interface InfoSistema {
  versao: string
  caminhoBanco: string
  electron: string
  chrome: string
  node: string
  sqlite: string
}

type Entrada<S extends z.ZodTypeAny> = z.input<S>
type Canal<A extends unknown[], R> = { args: A; ret: R }

export interface Canais {
  'auth:entrar': Canal<[login: string, senha: string], Usuario>
  'auth:sair': Canal<[], void>
  'auth:trocarSenha': Canal<[atual: string, nova: string], void>
  'auth:atualizarPerfil': Canal<[dados: Entrada<typeof perfilSchema>], void>

  'dados:carregar': Canal<[], Snapshot>
  'sistema:info': Canal<[], InfoSistema>

  'categorias:salvar': Canal<[id: number | null, dados: Entrada<typeof categoriaSchema>], Categoria>
  'categorias:excluir': Canal<[id: number], void>
  'unidades:salvar': Canal<[id: number | null, dados: Entrada<typeof unidadeSchema>], Unidade>
  'unidades:excluir': Canal<[id: number], void>
  'produtos:salvar': Canal<[id: number | null, dados: Entrada<typeof produtoSchema>], Produto>
  'produtos:excluir': Canal<[id: number], void>
  'fornecedores:salvar': Canal<[id: number | null, dados: Entrada<typeof fornecedorSchema>], Fornecedor>
  'fornecedores:excluir': Canal<[id: number], void>
  'clientes:salvar': Canal<[id: number | null, dados: Entrada<typeof clienteSchema>], Cliente>
  'clientes:excluir': Canal<[id: number], void>
  'usuarios:salvar': Canal<[id: number | null, dados: Entrada<typeof usuarioSchema>], Usuario>
  'usuarios:excluir': Canal<[id: number], void>

  'compras:salvar': Canal<[id: number | null, dados: Entrada<typeof compraEntradaSchema>], Compra>
  'compras:excluir': Canal<[id: number], void>
  'compras:receber': Canal<[id: number], void>

  'estoque:movimentar': Canal<[dados: Entrada<typeof movimentacaoSchema>], void>

  'configuracoes:salvar': Canal<[dados: Entrada<typeof configuracoesSchema>], void>
}

export type NomeCanal = keyof Canais
export type ArgsDe<C extends NomeCanal> = Canais[C]['args']
export type RetornoDe<C extends NomeCanal> = Canais[C]['ret']

/** Erro de regra de negócio/validação; `campo` indica qual campo do formulário destacar. */
export interface ErroSerializado {
  mensagem: string
  campo?: string
  tipo: 'validacao' | 'negocio' | 'permissao' | 'interno'
}

export type Resposta<T> = { ok: true; dados: T } | { ok: false; erro: ErroSerializado }

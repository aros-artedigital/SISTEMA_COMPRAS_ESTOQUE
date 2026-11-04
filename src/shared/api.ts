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

  // Os canais abaixo abrem diálogos de arquivo; retornam null quando o usuário cancela.
  'relatorio:pdf': Canal<[html: string, nomeArquivo: string, pagina: OpcoesPagina], string | null>
  'relatorio:imprimir': Canal<[html: string, pagina: OpcoesPagina], boolean>

  'excel:exportar': Canal<[planilha: Planilha, nomeArquivo: string], string | null>
  'excel:modelo': Canal<[tipo: TipoImportacao], string | null>
  'excel:previa': Canal<[tipo: TipoImportacao], PreviaImportacao | null>
  'excel:importar': Canal<[token: string], ResultadoImportacao>

  'backup:criar': Canal<[], string | null>
  'backup:listar': Canal<[], InfoBackup[]>
  'backup:restaurar': Canal<[caminho: string | null], boolean>
  'backup:abrirPasta': Canal<[], void>
  'arquivo:mostrar': Canal<[caminho: string], void>

  'sync:estado': Canal<[], EstadoSync>
  'sync:conectar': Canal<[dados: DadosConexao], { estado: EstadoSync; precisaEntrar: boolean }>
  'sync:sincronizar': Canal<[], ResultadoSync>
  'sync:configurar': Canal<[opcoes: { ativo: boolean; intervalo: number }], EstadoSync>
  'sync:desconectar': Canal<[], EstadoSync>
  'sync:conflitos': Canal<[], ConflitoSync[]>
  'sync:resolverConflito': Canal<[id: number], void>

  'atualizacao:estado': Canal<[], EstadoAtualizacao>
  'atualizacao:verificar': Canal<[], EstadoAtualizacao>
  'atualizacao:instalar': Canal<[], void>
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

// ---------- Fase 3: relatórios, Excel e backup ----------

export interface OpcoesPagina {
  paisagem?: boolean
  numerarPaginas?: boolean
}

export type FormatoColuna = 'texto' | 'numero' | 'moeda' | 'data' | 'dataHora'

export interface ColunaPlanilha {
  titulo: string
  formato?: FormatoColuna
  largura?: number
}

export interface Planilha {
  nome: string
  colunas: ColunaPlanilha[]
  linhas: (string | number | boolean | null)[][]
}

export type TipoImportacao = 'produtos' | 'fornecedores' | 'clientes'

export interface LinhaImportacao {
  linha: number
  descricao: string
  acao: 'criar' | 'atualizar' | 'erro'
  erro?: string
  avisos: string[]
}

export interface PreviaImportacao {
  token: string
  arquivo: string
  tipo: TipoImportacao
  linhas: LinhaImportacao[]
  criar: number
  atualizar: number
  erros: number
}

export interface ResultadoImportacao {
  criados: number
  atualizados: number
  ignorados: number
}

export interface InfoBackup {
  nome: string
  caminho: string
  tamanho: number
  data: string
  automatico: boolean
}

// ---------- Fase 4: sincronização e atualização ----------

export interface EstadoSync {
  configurado: boolean
  ativo: boolean
  url: string
  nome: string
  codigo: string
  /** Intervalo da sincronização automática, em minutos. */
  intervalo: number
  ultimaSync: string | null
  ultimoErro: string | null
  sincronizando: boolean
  /** Registros alterados neste terminal que ainda não foram enviados. */
  pendentes: number
  conflitos: number
}

export interface DadosConexao {
  url: string
  chave: string
  nome: string
  codigo: string
  /** enviar: este terminal manda seus dados; substituir: apaga os dados locais e baixa os do servidor. */
  modo: 'enviar' | 'substituir'
}

export interface ResultadoSync {
  enviados: number
  recebidos: number
  rejeitados: number
}

export interface ConflitoSync {
  id: number
  tabela: string
  descricao: string
  motivo: string
  em: string
}

export interface EstadoAtualizacao {
  status: 'desativada' | 'verificando' | 'atualizado' | 'disponivel' | 'baixando' | 'pronta' | 'erro'
  versaoAtual: string
  novaVersao?: string
  progresso?: number
  mensagem?: string
}

/** Eventos que o processo principal envia para a interface sem ser chamado. */
export interface Eventos {
  'sync:estado': EstadoSync
  'dados:alterados': { precisaEntrar: boolean }
  'atualizacao:estado': EstadoAtualizacao
}

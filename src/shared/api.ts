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
  usuarioSchema,
  vendaSchema
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
  Usuario,
  Venda
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
  vendas: Venda[]
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
  'auth:avisos': Canal<[], AvisosSeguranca>
  /** Pela tela de login, sem sessão: redefine a senha de um administrador com o código de recuperação. */
  'auth:recuperar': Canal<[login: string, codigo: string, novaSenha: string], void>
  'recuperacao:estado': Canal<[], EstadoRecuperacao>
  /** Gera um novo código; o texto só é devolvido nesta chamada. */
  'recuperacao:gerar': Canal<[], string>
  /** Apaga produtos, estoque, compras e cadastros (com backup antes). Só administrador. */
  'sistema:zerarDados': Canal<[opcoes: OpcoesZerar], ResultadoZerar>

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
  /** Sem itens: recebe tudo o que falta. Com itens: recebe só essas quantidades (recebimento parcial). */
  'compras:receber': Canal<[id: number, itens?: { produtoId: number; quantidade: number }[]], AlteracaoCusto[]>
  'compras:encerrar': Canal<[id: number], void>

  'estoque:movimentar': Canal<[dados: Entrada<typeof movimentacaoSchema>], void>
  'estoque:estornar': Canal<[id: number, motivo: string], void>

  'vendas:registrar': Canal<[dados: Entrada<typeof vendaSchema>], Venda>
  'vendas:cancelar': Canal<[id: number, motivo: string], void>

  'inventario:listar': Canal<[], InventarioResumo[]>
  'inventario:obter': Canal<[id: number], InventarioDetalhe>
  'inventario:abrir': Canal<[dados: { descricao: string; categoriaId: number | null }], InventarioDetalhe>
  /** Grava a quantidade contada de um item (null = ainda não contado). */
  'inventario:contar': Canal<[itemId: number, contado: number | null], void>
  'inventario:concluir': Canal<[id: number, opcoes: { naoContadosZero: boolean }], ResultadoInventario>
  'inventario:cancelar': Canal<[id: number], void>

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
  'backupExterno:estado': Canal<[], EstadoBackupExterno>
  /** Abre o diálogo para escolher a pasta (pendrive, outro disco, Google Drive/OneDrive) e já faz uma cópia. */
  'backupExterno:escolherPasta': Canal<[], EstadoBackupExterno | null>
  'backupExterno:fazerAgora': Canal<[], EstadoBackupExterno>
  'backupExterno:desativar': Canal<[], EstadoBackupExterno>
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

  /** Só administrador. Devolve até 1000 registros, do mais recente para o mais antigo. */
  'auditoria:listar': Canal<[filtros: FiltrosAuditoria], ConsultaAuditoria>
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

// ---------- Recuperação de acesso ----------

export interface EstadoRecuperacao {
  existe: boolean
  criadoEm: string | null
}

export interface AvisosSeguranca {
  /** O usuário logado ainda usa a senha padrão de instalação. */
  senhaPadrao: boolean
  /** Administrador e o sistema ainda não tem código de recuperação. */
  semCodigoRecuperacao: boolean
  /** Administrador e o backup externo está configurado, mas atrasado (dias sem cópia) ou falhando. */
  backupExternoAtrasado: number | null
}

export interface EstadoBackupExterno {
  /** null = não configurado. */
  pasta: string | null
  ultimoEm: string | null
  ultimoErro: string | null
  /** Cópias guardadas na pasta (as 10 mais recentes são mantidas). */
  arquivos: number
  diasSemBackup: number | null
}

// ---------- Zerar dados ----------

export interface OpcoesZerar {
  /** false: apaga os outros usuários e mantém só quem está zerando. */
  manterUsuarios: boolean
  /** true: volta os dados da empresa (nome, CNPJ...) ao padrão. */
  restaurarEmpresa: boolean
  /** Precisa ser a palavra ZERAR. */
  confirmacao: string
}

export interface ResultadoZerar {
  backup: string
  produtos: number
  compras: number
  movimentacoes: number
}

// ---------- Custo médio ----------

/** Mudança no preço de custo de um produto causada pelo recebimento de uma compra. */
export interface AlteracaoCusto {
  produtoId: number
  produto: string
  de: number
  para: number
}

// ---------- Inventário ----------

export type StatusInventario = 'aberto' | 'concluido' | 'cancelado'

export interface InventarioResumo {
  id: number
  numero: string
  descricao: string
  categoriaId: number | null
  status: StatusInventario
  criadoEm: string
  criadoPor: string
  concluidoEm: string | null
  concluidoPor: string | null
  naoContadosZero: boolean
  itens: number
  contados: number
  /** Itens ajustados (só depois de concluído). */
  ajustados: number
}

export interface ItemInventario {
  id: number
  produtoId: number
  saldoSistema: number
  contado: number | null
  ajuste: number | null
}

export interface InventarioDetalhe extends InventarioResumo {
  lista: ItemInventario[]
}

// ---------- Auditoria ----------

export interface AlteracaoAuditoria {
  campo: string
  de: string
  para: string
}

export interface RegistroAuditoria {
  id: number
  /** Data/hora local, "AAAA-MM-DDTHH:MM:SS". */
  em: string
  usuario: string
  acao: string
  entidade: string
  descricao: string
  alteracoes: AlteracaoAuditoria[]
}

export interface FiltrosAuditoria {
  /** Datas no formato AAAA-MM-DD (comparadas com a data local do registro). */
  de?: string
  ate?: string
  usuario?: string
  acao?: string
  entidade?: string
  busca?: string
}

export interface ConsultaAuditoria {
  itens: RegistroAuditoria[]
  /** Total de registros que atendem aos filtros (pode passar do que foi devolvido). */
  total: number
  usuarios: string[]
}

export interface ResultadoInventario {
  ajustados: number
  /** Soma das diferenças em unidades e em valor (preço de custo). */
  unidades: number
  valor: number
}

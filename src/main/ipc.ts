import { app, ipcMain, shell } from 'electron'
import { z } from 'zod'
import type { ArgsDe, NomeCanal, Resposta, RetornoDe } from '@shared/api'
import type { Recurso } from '@shared/permissoes'
import * as s from '@shared/schemas'
import { banco, caminhoBanco } from './db/conexao'
import { basename } from 'path'
import { ErroNegocio, ErroPermissao, serializarErro } from './erros'
import * as auditoria from './servicos/auditoria'
import { escolherArquivo, escolherDestino, escolherPasta } from './janela'
import * as backup from './servicos/backup'
import * as backupExterno from './servicos/backupExterno'
import * as excel from './servicos/excel'
import * as impressao from './servicos/impressao'
import * as cadastros from './servicos/cadastros'
import * as compras from './servicos/compras'
import * as dados from './servicos/dados'
import * as estoque from './servicos/estoque'
import * as produtos from './servicos/produtos'
import { exigir, usuarioLogado } from './servicos/sessao'
import * as usuarios from './servicos/usuarios'
import * as vendas from './servicos/vendas'
import * as inventario from './servicos/inventario'
import * as sync from './servicos/sync/motor'
import * as atualizacao from './atualizacao'
import * as recuperacao from './servicos/recuperacao'
import { zerarDados } from './servicos/zerar'

type Handler<C extends NomeCanal> = (...args: ArgsDe<C>) => RetornoDe<C> | Promise<RetornoDe<C>>

/**
 * Registra um canal IPC. Os argumentos vindos da interface não são confiáveis:
 * cada handler valida com zod e checa permissão no próprio processo principal.
 * O retorno é sempre um envelope { ok, dados | erro } para a mensagem chegar intacta.
 */
function canal<C extends NomeCanal>(nome: C, handler: Handler<C>): void {
  ipcMain.handle(nome, async (_evento, ...args: unknown[]): Promise<Resposta<RetornoDe<C>>> => {
    try {
      return { ok: true, dados: await handler(...(args as ArgsDe<C>)) }
    } catch (e) {
      return { ok: false, erro: serializarErro(e) }
    }
  })
}

const id = (v: unknown): number => s.idSchema.parse(v)
const idOuNovo = (v: unknown): number | null => s.idOuNovoSchema.parse(v)
const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const moedaBr = (v: number): string => formatoMoeda.format(v)

const ENTIDADE: Record<auditoria.TabelaAuditada, string> = {
  produtos: 'Produto',
  categorias: 'Categoria',
  unidades: 'Unidade',
  fornecedores: 'Fornecedor',
  clientes: 'Cliente',
  usuarios: 'Usuário',
  compras: 'Compra'
}

/** Gera os canais salvar/excluir de um cadastro simples, registrando cada alteração na auditoria. */
function crud<Dados>(
  recurso: Recurso,
  tabela: auditoria.TabelaAuditada,
  salvar: (id: number | null, dados: Dados, usuarioId: number) => unknown,
  excluir: (id: number, usuarioId: number) => void,
  schema: z.ZodType<Dados, z.ZodTypeDef, unknown>
) {
  const entidade = ENTIDADE[tabela]
  return {
    salvar: (i: number | null, d: unknown) => {
      const u = exigir(recurso)
      const idAlvo = idOuNovo(i)
      const dadosValidos = schema.parse(d)
      const antes = idAlvo === null ? null : auditoria.ler(tabela, idAlvo)
      const salvo = salvar(idAlvo, dadosValidos, u.id) as { id: number }
      const depois = auditoria.ler(tabela, salvo.id)
      if (idAlvo === null) {
        auditoria.registrar({ usuario: u, acao: 'Inclusão', entidade, entidadeId: salvo.id, descricao: auditoria.descrever(tabela, depois) })
      } else {
        const alteracoes = auditoria.diferencas(antes, depois)
        const senha = (dadosValidos as { senha?: string }).senha
        if (tabela === 'usuarios' && senha) alteracoes.push({ campo: 'Senha', de: '•••', para: '(alterada)' })
        if (alteracoes.length) {
          auditoria.registrar({ usuario: u, acao: 'Alteração', entidade, entidadeId: salvo.id, descricao: auditoria.descrever(tabela, depois), alteracoes })
        }
      }
      return salvo
    },
    excluir: (i: number) => {
      const u = exigir(recurso)
      const idAlvo = id(i)
      const antes = auditoria.ler(tabela, idAlvo)
      excluir(idAlvo, u.id)
      auditoria.registrar({ usuario: u, acao: 'Exclusão', entidade, entidadeId: idAlvo, descricao: auditoria.descrever(tabela, antes) })
    }
  }
}

export function registrarCanais(): void {
  // ---------- Sessão ----------
  canal('auth:entrar', (login, senha) => {
    const l = z.string().parse(login)
    try {
      const u = usuarios.entrar(l, z.string().parse(senha))
      auditoria.registrar({ usuario: u, acao: 'Login', entidade: 'Sessão', entidadeId: u.id, descricao: `Entrou no sistema (${u.login})` })
      return u
    } catch (e) {
      if (e instanceof ErroNegocio || e instanceof ErroPermissao) {
        auditoria.registrar({
          usuario: null,
          usuarioNome: l.trim().slice(0, 60) || '(vazio)',
          acao: 'Login recusado',
          entidade: 'Sessão',
          descricao: `Tentativa de entrar com o login "${l.trim().slice(0, 60)}": ${e.message}`
        })
      }
      throw e
    }
  })
  canal('auth:sair', () => usuarios.sair())
  canal('auth:trocarSenha', (atual, nova) => {
    const d = s.trocaSenhaSchema.parse({ atual, nova })
    const u = usuarioLogado()
    usuarios.trocarSenha(u.id, d.atual, d.nova)
    auditoria.registrar({ usuario: u, acao: 'Alteração', entidade: 'Usuário', entidadeId: u.id, descricao: `Trocou a própria senha (${u.login})` })
  })
  canal('auth:atualizarPerfil', (d) => {
    const u = usuarioLogado()
    const dadosPerfil = s.perfilSchema.parse(d)
    const antes = auditoria.ler('usuarios', u.id)
    usuarios.atualizarPerfil(u.id, dadosPerfil)
    const depois = auditoria.ler('usuarios', u.id)
    const alteracoes = auditoria.diferencas(antes, depois)
    if (alteracoes.length) {
      auditoria.registrar({ usuario: u, acao: 'Alteração', entidade: 'Usuário', entidadeId: u.id, descricao: `Atualizou o próprio perfil (${u.login})`, alteracoes })
    }
  })

  canal('auth:avisos', () => {
    const u = usuarioLogado()
    return recuperacao.avisos(u.id, u.perfil)
  })
  canal('auth:recuperar', (login, codigo, nova) => {
    const l = z.string().max(100).parse(login).trim()
    try {
      recuperacao.recuperar(l, z.string().max(100).parse(codigo), z.string().max(200).parse(nova))
      auditoria.registrar({ usuario: null, usuarioNome: l, acao: 'Recuperação de acesso', entidade: 'Sessão', descricao: `Senha de "${l}" redefinida com o código de recuperação` })
    } catch (e) {
      if (e instanceof ErroNegocio && e.campo === 'codigo') {
        auditoria.registrar({ usuario: null, usuarioNome: l || '(vazio)', acao: 'Recuperação recusada', entidade: 'Sessão', descricao: `Código de recuperação incorreto para "${l}"` })
      }
      throw e
    }
  })
  canal('recuperacao:estado', () => {
    exigir('configuracoes')
    return recuperacao.estado()
  })
  canal('sistema:zerarDados', async (o) => {
    const u = exigir('configuracoes')
    const opcoes = z.object({ manterUsuarios: z.boolean(), restaurarEmpresa: z.boolean(), confirmacao: z.string().max(20) }).parse(o)
    const r = await zerarDados(opcoes, u.id)
    auditoria.registrar({
      usuario: u,
      acao: 'Zerar dados',
      entidade: 'Sistema',
      descricao: `Apagou ${r.produtos} produto(s), ${r.compras} compra(s) e ${r.movimentacoes} movimentação(ões)${opcoes.manterUsuarios ? '' : ', e os outros usuários'}${opcoes.restaurarEmpresa ? '; dados da empresa voltaram ao padrão' : ''}. Backup: ${basename(r.backup)}`
    })
    return r
  })
  canal('recuperacao:gerar', () => {
    const u = exigir('configuracoes')
    const codigo = recuperacao.gerar()
    auditoria.registrar({ usuario: u, acao: 'Alteração', entidade: 'Sistema', descricao: 'Gerou um novo código de recuperação de acesso' })
    return codigo
  })

  canal('dados:carregar', () => {
    usuarioLogado()
    return dados.carregar()
  })
  canal('sistema:info', () => {
    usuarioLogado()
    const { versao } = banco().prepare('SELECT sqlite_version() AS versao').get() as { versao: string }
    return {
      versao: app.getVersion(),
      caminhoBanco: caminhoBanco(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      sqlite: versao
    }
  })

  // ---------- Cadastros ----------
  const cat = crud('cadastros', 'categorias', cadastros.salvarCategoria, cadastros.excluirCategoria, s.categoriaSchema)
  canal('categorias:salvar', cat.salvar as Handler<'categorias:salvar'>)
  canal('categorias:excluir', cat.excluir)

  const un = crud('cadastros', 'unidades', cadastros.salvarUnidade, cadastros.excluirUnidade, s.unidadeSchema)
  canal('unidades:salvar', un.salvar as Handler<'unidades:salvar'>)
  canal('unidades:excluir', un.excluir)

  const prod = crud('produtos', 'produtos', produtos.salvar, produtos.excluir, s.produtoSchema)
  canal('produtos:salvar', prod.salvar as Handler<'produtos:salvar'>)
  canal('produtos:excluir', prod.excluir)

  const forn = crud('fornecedores', 'fornecedores', cadastros.salvarFornecedor, cadastros.excluirFornecedor, s.fornecedorSchema)
  canal('fornecedores:salvar', forn.salvar as Handler<'fornecedores:salvar'>)
  canal('fornecedores:excluir', forn.excluir)

  const cli = crud('clientes', 'clientes', cadastros.salvarCliente, cadastros.excluirCliente, s.clienteSchema)
  canal('clientes:salvar', cli.salvar as Handler<'clientes:salvar'>)
  canal('clientes:excluir', cli.excluir)

  const usu = crud('usuarios', 'usuarios', usuarios.salvar, usuarios.excluir, s.usuarioSchema)
  canal('usuarios:salvar', usu.salvar as Handler<'usuarios:salvar'>)
  canal('usuarios:excluir', usu.excluir)

  // ---------- Compras e estoque ----------
  const comp = crud('compras', 'compras', compras.salvar, compras.excluir, s.compraEntradaSchema)
  canal('compras:salvar', comp.salvar as Handler<'compras:salvar'>)
  canal('compras:excluir', comp.excluir)
  canal('compras:receber', (i, itens) => {
    const u = exigir('compras')
    const idCompra = id(i)
    const lista = z
      .array(z.object({ produtoId: s.idSchema, quantidade: z.number().int('Use números inteiros').min(0, 'Não pode ser negativo') }))
      .optional()
      .parse(itens)
    const custos = compras.receber(idCompra, u.id, lista)
    const c = auditoria.ler('compras', idCompra)
    auditoria.registrar({
      usuario: u,
      acao: lista ? 'Recebimento parcial' : 'Recebimento',
      entidade: 'Compra',
      entidadeId: idCompra,
      descricao: auditoria.descrever('compras', c),
      alteracoes: custos.map((a) => ({ campo: `Preço de custo — ${a.produto}`, de: moedaBr(a.de), para: moedaBr(a.para) }))
    })
    return custos
  })
  canal('compras:encerrar', (i) => {
    const u = exigir('compras')
    const idCompra = id(i)
    compras.encerrar(idCompra)
    auditoria.registrar({ usuario: u, acao: 'Encerramento', entidade: 'Compra', entidadeId: idCompra, descricao: `${auditoria.descrever('compras', auditoria.ler('compras', idCompra))} encerrada sem receber o restante` })
  })

  canal('vendas:registrar', (d) => vendas.registrar(s.vendaSchema.parse(d), exigir('vendas').id))
  canal('vendas:cancelar', (i, motivo) => {
    const u = exigir('vendasCancelar')
    const idVenda = id(i)
    const m = s.cancelamentoSchema.parse(motivo)
    vendas.cancelar(idVenda, m, u.id)
    const v = banco().prepare('SELECT numero FROM vendas WHERE id = ?').get(idVenda) as { numero: string } | undefined
    auditoria.registrar({ usuario: u, acao: 'Cancelamento', entidade: 'Venda', entidadeId: idVenda, descricao: `Venda ${v?.numero ?? idVenda} cancelada. Motivo: ${m}` })
  })

  canal('inventario:listar', () => {
    exigir('estoque')
    return inventario.listar()
  })
  canal('inventario:obter', (i) => {
    exigir('estoque')
    return inventario.obter(id(i))
  })
  canal('inventario:abrir', (d) => {
    const u = exigir('estoque')
    const dados = z.object({ descricao: z.string().trim().max(200), categoriaId: s.idOuNovoSchema }).parse(d)
    return inventario.abrir(dados, u.id)
  })
  canal('inventario:contar', (i, contado) => {
    exigir('estoque')
    inventario.contar(id(i), z.number().int('Use número inteiro').min(0, 'Não pode ser negativo').max(10_000_000).nullable().parse(contado))
  })
  const numeroInventario = (i: number): string =>
    (banco().prepare('SELECT numero FROM inventarios WHERE id = ?').get(i) as { numero: string } | undefined)?.numero ?? String(i)
  canal('inventario:concluir', (i, o) => {
    const u = exigir('inventarioConcluir')
    const idInv = id(i)
    const opcoes = z.object({ naoContadosZero: z.boolean() }).parse(o)
    const r = inventario.concluir(idInv, opcoes, u.id)
    auditoria.registrar({
      usuario: u,
      acao: 'Conclusão',
      entidade: 'Inventário',
      entidadeId: idInv,
      descricao: `Inventário ${numeroInventario(idInv)} concluído: ${r.ajustados} produto(s) ajustado(s), diferença de ${r.unidades} un. (${moedaBr(r.valor)})${opcoes.naoContadosZero ? '; não contados zerados' : ''}`
    })
    return r
  })
  canal('inventario:cancelar', (i) => {
    const u = exigir('inventarioConcluir')
    const idInv = id(i)
    inventario.cancelar(idInv)
    auditoria.registrar({ usuario: u, acao: 'Cancelamento', entidade: 'Inventário', entidadeId: idInv, descricao: `Inventário ${numeroInventario(idInv)} cancelado` })
  })

  canal('estoque:estornar', (i, motivo) => {
    const u = exigir('estoqueEstornar')
    const idMov = id(i)
    const m = z.string().trim().min(3, 'Informe o motivo do estorno').max(200).parse(motivo)
    estoque.estornar(idMov, m, u.id)
    const mov = banco()
      .prepare('SELECT m.tipo, m.quantidade, m.motivo, m.data, p.codigo, p.nome FROM movimentacoes m JOIN produtos p ON p.id = m.produto_id WHERE m.id = ?')
      .get(idMov) as { tipo: string; quantidade: number; motivo: string; data: string; codigo: string; nome: string } | undefined
    auditoria.registrar({
      usuario: u,
      acao: 'Estorno',
      entidade: 'Movimentação',
      entidadeId: idMov,
      descricao: mov
        ? `Estornou ${mov.tipo} de ${mov.quantidade} un. de ${mov.codigo} — ${mov.nome} (${mov.motivo}). Motivo: ${m}`
        : `Estornou a movimentação #${idMov}. Motivo: ${m}`
    })
  })

  canal('estoque:movimentar', (d) => {
    const u = exigir('estoque')
    estoque.movimentar({ ...s.movimentacaoSchema.parse(d), usuarioId: u.id })
  })

  canal('configuracoes:salvar', (d) => {
    const u = exigir('configuracoes')
    const antes = auditoria.configuracoesAtuais()
    dados.salvarConfiguracoes(s.configuracoesSchema.parse(d))
    const alteracoes = auditoria.diferencas(antes, auditoria.configuracoesAtuais())
    if (alteracoes.length) auditoria.registrar({ usuario: u, acao: 'Alteração', entidade: 'Configurações', descricao: 'Configurações do sistema', alteracoes })
  })

  canal('auditoria:listar', (f) => {
    exigir('auditoria')
    const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined))
    const texto = z.string().max(200).optional()
    const filtros = z.object({ de: data, ate: data, usuario: texto, acao: texto, entidade: texto, busca: texto }).parse(f ?? {})
    return { ...auditoria.listar(filtros), usuarios: auditoria.usuariosComRegistro() }
  })

  // ---------- Relatórios, PDF e impressão ----------
  const pagina = z.object({ paisagem: z.boolean().optional(), numerarPaginas: z.boolean().optional() })
  const html = z.string().min(1).max(20_000_000)
  const nomeArquivo = (v: unknown): string => z.string().min(1).max(150).parse(v).replace(/[\/:*?"<>|]+/g, '-')

  canal('relatorio:pdf', async (h, nome, p) => {
    usuarioLogado()
    const destino = await escolherDestino('Salvar PDF', `${nomeArquivo(nome)}.pdf`, [{ name: 'PDF', extensions: ['pdf'] }])
    return destino ? impressao.gerarPdf(html.parse(h), destino, pagina.parse(p)) : null
  })
  canal('relatorio:imprimir', (h, p) => {
    usuarioLogado()
    return impressao.imprimir(html.parse(h), pagina.parse(p))
  })

  // ---------- Excel ----------
  const planilha = z.object({
    nome: z.string().max(100),
    colunas: z.array(
      z.object({ titulo: z.string(), formato: z.enum(['texto', 'numero', 'moeda', 'data', 'dataHora']).optional(), largura: z.number().optional() })
    ),
    linhas: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(200_000)
  })
  const tipoImportacao = z.enum(['produtos', 'fornecedores', 'clientes'])
  const filtroExcel = [{ name: 'Planilha do Excel', extensions: ['xlsx'] }]

  canal('excel:exportar', async (p, nome) => {
    usuarioLogado()
    const destino = await escolherDestino('Exportar para Excel', `${nomeArquivo(nome)}.xlsx`, filtroExcel)
    return destino ? excel.exportar(planilha.parse(p), destino) : null
  })
  canal('excel:modelo', async (t) => {
    const tipo = tipoImportacao.parse(t)
    exigir(tipo)
    const destino = await escolherDestino('Salvar modelo de importação', `modelo-importacao-${tipo}.xlsx`, filtroExcel)
    return destino ? excel.gerarModelo(tipo, destino) : null
  })
  canal('excel:previa', async (t) => {
    const tipo = tipoImportacao.parse(t)
    const u = exigir(tipo)
    const origem = await escolherArquivo('Importar planilha', filtroExcel)
    return origem ? excel.previa(tipo, origem, u.id) : null
  })
  canal('excel:importar', (token) => {
    const t = z.string().uuid().parse(token)
    const tipo = excel.tipoPendente(t)
    const u = exigir(tipo)
    const r = excel.confirmar(t, u.id)
    auditoria.registrar({
      usuario: u,
      acao: 'Importação',
      entidade: { produtos: 'Produto', fornecedores: 'Fornecedor', clientes: 'Cliente' }[tipo],
      descricao: `Importou ${tipo} do Excel: ${r.criados} incluído(s), ${r.atualizados} atualizado(s), ${r.ignorados} ignorado(s)`
    })
    return r
  })

  // ---------- Backup ----------
  canal('backup:criar', async () => {
    exigir('configuracoes')
    const destino = await escolherDestino('Salvar backup', backup.nomeSugerido(), [{ name: 'Backup do banco (SQLite)', extensions: ['sqlite'] }])
    return destino ? backup.criarBackup(destino) : null
  })
  canal('backup:listar', () => {
    exigir('configuracoes')
    return backup.listarBackups()
  })
  canal('backup:restaurar', async (caminho) => {
    const u = exigir('configuracoes')
    let origem = z.string().min(1).nullable().parse(caminho)
    // Um caminho vindo da interface só é aceito se for um dos backups da pasta do sistema.
    if (origem && !backup.listarBackups().some((b) => b.caminho === origem)) throw new ErroNegocio('Backup não encontrado na pasta do sistema.')
    origem ??= await escolherArquivo('Restaurar backup', [{ name: 'Backup do banco (SQLite)', extensions: ['sqlite', 'db'] }])
    if (!origem) return false
    await backup.restaurar(origem)
    // Gravado já no banco restaurado (o histórico de auditoria volta junto com o backup).
    auditoria.registrar({ usuario: u, acao: 'Restauração de backup', entidade: 'Sistema', descricao: `Banco restaurado a partir de ${basename(origem)}` })
    return true
  })
  canal('backupExterno:estado', () => {
    exigir('configuracoes')
    return backupExterno.estado()
  })
  canal('backupExterno:escolherPasta', async () => {
    exigir('configuracoes')
    const pasta = await escolherPasta('Pasta do backup externo (pendrive, outro disco ou Google Drive/OneDrive)')
    return pasta ? backupExterno.configurar(pasta) : null
  })
  canal('backupExterno:fazerAgora', () => {
    exigir('configuracoes')
    return backupExterno.fazerAgora()
  })
  canal('backupExterno:desativar', () => {
    exigir('configuracoes')
    return backupExterno.desativar()
  })
  canal('backup:abrirPasta', async () => {
    exigir('configuracoes')
    await shell.openPath(backup.pastaDeBackups())
  })
  canal('arquivo:mostrar', (caminho) => {
    usuarioLogado()
    shell.showItemInFolder(z.string().min(1).parse(caminho))
  })

  // ---------- Sincronização ----------
  const conexao = z.object({
    url: z.string().trim().min(1, 'Informe o endereço do servidor').max(300),
    chave: z.string().min(1, 'Informe a chave de cadastro').max(300),
    nome: z.string().trim().min(1, 'Informe o nome deste terminal').max(100),
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{1,6}$/, 'Use de 1 a 6 letras ou números'),
    modo: z.enum(['enviar', 'substituir'])
  })

  canal('sync:estado', () => {
    usuarioLogado()
    return sync.estado()
  })
  canal('sync:conectar', async (d) => {
    const u = exigir('configuracoes')
    const c = conexao.parse(d)
    const r = await sync.conectar(c)
    auditoria.registrar({
      usuario: u,
      acao: 'Conexão ao servidor',
      entidade: 'Sistema',
      descricao: `Terminal "${c.nome}" (${c.codigo}) conectado a ${c.url}${c.modo === 'substituir' ? ' — dados locais substituídos pelos do servidor' : ''}`
    })
    return r
  })
  canal('sync:sincronizar', () => {
    usuarioLogado()
    return sync.sincronizar()
  })
  canal('sync:configurar', (o) => {
    exigir('configuracoes')
    return sync.configurar(z.object({ ativo: z.boolean(), intervalo: z.number().int().min(1).max(240) }).parse(o))
  })
  canal('sync:desconectar', () => {
    const u = exigir('configuracoes')
    const r = sync.desconectar()
    auditoria.registrar({ usuario: u, acao: 'Desconexão do servidor', entidade: 'Sistema', descricao: 'Terminal desconectado do servidor de sincronização' })
    return r
  })
  canal('sync:conflitos', () => {
    usuarioLogado()
    return sync.listarConflitos()
  })
  canal('sync:resolverConflito', (i) => {
    usuarioLogado()
    sync.resolverConflito(id(i))
  })

  // ---------- Atualização do aplicativo ----------
  canal('atualizacao:estado', () => atualizacao.estado())
  canal('atualizacao:verificar', () => {
    usuarioLogado()
    return atualizacao.verificar()
  })
  canal('atualizacao:instalar', () => {
    usuarioLogado()
    atualizacao.instalar()
  })
}

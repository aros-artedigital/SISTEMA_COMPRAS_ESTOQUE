import { join } from 'path'
import type { ConflitoSync, DadosConexao, EstadoSync, ResultadoSync } from '@shared/api'
import { banco } from '../../db/conexao'
import { TABELAS_SYNC } from '../../db/migracao2'
import { ErroNegocio } from '../../erros'
import { janelaPrincipal } from '../../janela'
import { criarBackup, pastaDeBackups } from '../backup'
import { encerrarSessao } from '../sessao'
import { configurado, guardarToken, lerConfig, lerToken, limparConfig, salvarConfig, type ConfigSync } from './config'
import { aplicarRemoto, descrever, desfazerMovimentacao, ErroAplicacao, ErroReferencia, montarDados, type TabelaSync } from './mapa'

// Motor de sincronização: envia a fila local, recebe as alterações dos outros terminais
// e registra o que não pôde ser aplicado em sync_conflitos.

const LOTE_ENVIO = 200
const LOTE_RECEBIMENTO = 500
const TEMPO_LIMITE_MS = 20_000

interface AlteracaoRemota {
  seq: number
  tabela: TabelaSync
  uuid: string
  operacao: 'salvar' | 'excluir'
  dados: Record<string, unknown> | null
  alteradoEm: string
}

// ---------- HTTP ----------

async function requisitar<T>(cfg: Pick<ConfigSync, 'url'>, metodo: 'GET' | 'POST', rota: string, corpo?: unknown, token?: string): Promise<T> {
  const controle = new AbortController()
  const limite = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS)
  let resposta: Response
  try {
    resposta = await fetch(cfg.url + rota, {
      method: metodo,
      signal: controle.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo)
    })
  } catch (e) {
    const motivo = (e as Error).name === 'AbortError' ? 'o servidor demorou demais para responder' : 'sem conexão com o servidor'
    throw new ErroNegocio(`Não foi possível sincronizar: ${motivo}. O sistema continua funcionando normalmente; tente de novo mais tarde.`)
  } finally {
    clearTimeout(limite)
  }
  let json: { ok?: boolean; erro?: string } & T
  try {
    json = (await resposta.json()) as typeof json
  } catch {
    throw new ErroNegocio(`O endereço não respondeu como o servidor de sincronização (HTTP ${resposta.status}). Confira a URL.`)
  }
  if (!resposta.ok || json.ok === false) {
    if (resposta.status === 401) throw new ErroNegocio('Este terminal não está mais autorizado no servidor. Conecte-o novamente.')
    throw new ErroNegocio(json.erro ?? `Erro do servidor (HTTP ${resposta.status}).`)
  }
  return json
}

// ---------- Estado e eventos ----------

let emAndamento: Promise<ResultadoSync> | null = null

function contar(sql: string): number {
  return (banco().prepare(sql).get() as { n: number }).n
}

export function estado(): EstadoSync {
  const cfg = lerConfig()
  return {
    configurado: configurado(cfg),
    ativo: cfg.ativo,
    url: cfg.url,
    nome: cfg.nome,
    codigo: cfg.codigo,
    intervalo: cfg.intervalo,
    ultimaSync: cfg.ultimaSync,
    ultimoErro: cfg.ultimoErro,
    sincronizando: emAndamento !== null,
    pendentes: contar('SELECT COUNT(*) AS n FROM (SELECT DISTINCT tabela, uuid FROM sync_fila)'),
    conflitos: contar('SELECT COUNT(*) AS n FROM sync_conflitos WHERE resolvido = 0')
  }
}

function emitir(canal: 'sync:estado' | 'dados:alterados', dados: unknown): void {
  janelaPrincipal()?.webContents.send(canal, dados)
}
const emitirEstado = (): void => emitir('sync:estado', estado())

function registrarConflito(tabela: string, uuid: string, descricao: string, motivo: string, alteracao?: AlteracaoRemota): void {
  banco()
    .prepare(
      `INSERT INTO sync_conflitos (tabela, uuid, descricao, motivo, em, alteracao) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'), ?)`
    )
    .run(tabela, uuid, descricao, motivo, alteracao ? JSON.stringify(alteracao) : null)
}

export function listarConflitos(): ConflitoSync[] {
  return banco().prepare('SELECT id, tabela, descricao, motivo, em FROM sync_conflitos WHERE resolvido = 0 ORDER BY id DESC').all() as ConflitoSync[]
}

export function resolverConflito(id: number): void {
  banco().prepare('UPDATE sync_conflitos SET resolvido = 1 WHERE id = ?').run(id)
  emitirEstado()
}

/** Roda `fn` gravando alterações do servidor sem que elas voltem para a fila de envio. */
function aplicando<T>(fn: () => T): T {
  const db = banco()
  return db.transaction(() => {
    db.prepare('UPDATE sync_controle SET aplicando = 1 WHERE id = 1').run()
    try {
      return fn()
    } finally {
      db.prepare('UPDATE sync_controle SET aplicando = 0 WHERE id = 1').run()
    }
  })()
}

// ---------- Envio ----------

async function enviar(cfg: ConfigSync, token: string): Promise<{ enviados: number; rejeitados: number }> {
  const db = banco()
  let enviados = 0
  let rejeitados = 0
  for (let lote = 0; lote < 100; lote++) {
    const pendentes = db
      .prepare(
        `SELECT tabela, uuid, MAX(id) AS ate, MAX(alterado_em) AS alterado_em FROM sync_fila
         GROUP BY tabela, uuid ORDER BY MIN(id) LIMIT ${LOTE_ENVIO}`
      )
      .all() as { tabela: TabelaSync; uuid: string; ate: number; alterado_em: string }[]
    if (pendentes.length === 0) break

    const alteracoes = pendentes.map((p) => {
      const dados = montarDados(p.tabela, p.uuid)
      return { tabela: p.tabela, uuid: p.uuid, operacao: dados ? 'salvar' : 'excluir', alteradoEm: p.alterado_em, dados: dados ?? undefined }
    })
    const { resultados } = await requisitar<{ resultados: { tabela: string; uuid: string; status: string; motivo?: string }[] }>(
      cfg,
      'POST',
      '/sync/enviar',
      { alteracoes },
      token
    )

    aplicando(() => {
      const limpar = db.prepare('DELETE FROM sync_fila WHERE tabela = ? AND uuid = ? AND id <= ?')
      resultados.forEach((r, i) => {
        const p = pendentes[i]
        limpar.run(p.tabela, p.uuid, p.ate)
        if (r.status !== 'rejeitado') return enviados++
        rejeitados++
        const descricao = descrever(p.tabela, p.uuid, alteracoes[i].dados)
        if (p.tabela === 'movimentacoes' && /já foi (recebido|devolvido)/.test(r.motivo ?? '')) {
          // Dois terminais receberam a mesma compra (ou cancelaram a mesma venda): a entrada deste é desfeita.
          desfazerMovimentacao(p.uuid, true)
          registrarConflito(p.tabela, p.uuid, descricao, `${r.motivo}. A entrada feita neste terminal foi desfeita.`)
        } else {
          registrarConflito(p.tabela, p.uuid, descricao, `${r.motivo ?? 'Recusado pelo servidor'}. Corrija e salve novamente para reenviar.`)
        }
      })
    })
  }
  return { enviados, rejeitados }
}

// ---------- Recebimento ----------

/** Aplica um lote de alterações remotas; devolve quantas foram aplicadas. */
function aplicarLote(alteracoes: AlteracaoRemota[]): number {
  const db = banco()
  // Edição local mais nova ainda não enviada: ela prevalece e vai no próximo envio.
  const localMaisNova = db.prepare('SELECT 1 FROM sync_fila WHERE tabela = ? AND uuid = ? AND alterado_em > ? LIMIT 1')
  let aplicadas = 0
  for (const a of alteracoes) {
    if (localMaisNova.get(a.tabela, a.uuid, a.alteradoEm)) continue
    try {
      const conflito = db.transaction(() => aplicarRemoto(a.tabela, a.uuid, a.operacao, a.dados))()
      if (conflito) registrarConflito(conflito.tabela, conflito.uuid, conflito.descricao, conflito.motivo)
      aplicadas++
    } catch (e) {
      // Um registro problemático não pode travar a sincronização: vira conflito e o resto segue.
      if (!(e instanceof ErroAplicacao)) console.error('[sync] erro ao aplicar', a.tabela, a.uuid, e)
      const motivo = e instanceof ErroAplicacao ? e.message : `Erro ao gravar neste terminal: ${(e as Error).message}`
      registrarConflito(a.tabela, a.uuid, descrever(a.tabela, a.uuid, a.dados), motivo, e instanceof ErroReferencia ? a : undefined)
    }
  }
  return aplicadas
}

/** Tenta de novo as alterações que chegaram antes do registro de que dependiam. */
function reaplicarPendentes(): number {
  const db = banco()
  const guardadas = db.prepare('SELECT id, alteracao FROM sync_conflitos WHERE resolvido = 0 AND alteracao IS NOT NULL ORDER BY id').all() as {
    id: number
    alteracao: string
  }[]
  let aplicadas = 0
  for (const g of guardadas) {
    const a = JSON.parse(g.alteracao) as AlteracaoRemota
    try {
      db.transaction(() => aplicarRemoto(a.tabela, a.uuid, a.operacao, a.dados))()
      db.prepare('DELETE FROM sync_conflitos WHERE id = ?').run(g.id)
      aplicadas++
    } catch (e) {
      if (!(e instanceof ErroReferencia)) {
        db.prepare('UPDATE sync_conflitos SET alteracao = NULL, motivo = ? WHERE id = ?').run((e as Error).message, g.id)
      }
    }
  }
  return aplicadas
}

async function receber(cfg: ConfigSync, token: string): Promise<number> {
  let recebidos = 0
  let cursor = cfg.cursor
  for (let pagina = 0; pagina < 1000; pagina++) {
    const r = await requisitar<{ alteracoes: AlteracaoRemota[]; ultimoSeq: number; temMais: boolean }>(
      cfg,
      'GET',
      `/sync/receber?desde=${cursor}&limite=${LOTE_RECEBIMENTO}`,
      undefined,
      token
    )
    aplicando(() => {
      recebidos += aplicarLote(r.alteracoes)
      cursor = r.ultimoSeq
      salvarConfig({ cursor })
    })
    if (!r.temMais) break
  }
  aplicando(() => (recebidos += reaplicarPendentes()))
  return recebidos
}

// ---------- Ciclo completo ----------

export function sincronizar(): Promise<ResultadoSync> {
  if (emAndamento) return emAndamento
  const cfg = lerConfig()
  if (!configurado(cfg)) return Promise.reject(new ErroNegocio('A sincronização ainda não foi configurada neste terminal.'))

  emAndamento = (async () => {
    const token = lerToken(cfg)
    try {
      // Primeiro envia (para que as próprias edições mais novas prevaleçam), depois recebe.
      const { enviados, rejeitados } = await enviar(cfg, token)
      const recebidos = await receber(lerConfig(), token)
      salvarConfig({ ultimaSync: new Date().toISOString(), ultimoErro: null })
      if (recebidos > 0 || rejeitados > 0) emitir('dados:alterados', { precisaEntrar: false })
      return { enviados, recebidos, rejeitados }
    } catch (e) {
      salvarConfig({ ultimoErro: (e as Error).message })
      throw e
    }
  })().finally(() => {
    emAndamento = null
    emitirEstado()
  })
  emitirEstado()
  return emAndamento
}

const urlLimpa = (url: string): string => url.trim().replace(/\/+$/, '')

/**
 * Cadastra este terminal no servidor e faz a primeira sincronização.
 * modo "substituir": apaga os dados locais (com backup antes) e baixa tudo do servidor.
 */
export async function conectar(d: DadosConexao): Promise<{ estado: EstadoSync; precisaEntrar: boolean }> {
  const url = urlLimpa(d.url)
  if (!/^https?:\/\//i.test(url)) throw new ErroNegocio('Informe o endereço completo, começando com http:// ou https://', 'url')
  if (emAndamento) throw new ErroNegocio('Aguarde a sincronização em andamento terminar.')

  const status = await requisitar<{ versaoApi: number }>({ url }, 'GET', '/status')
  if (status.versaoApi !== 1) throw new ErroNegocio('Versão do servidor incompatível com este aplicativo.', 'url')

  const cad = await requisitar<{ uuid: string; token: string; nome: string; codigo: string; registros: number }>({ url }, 'POST', '/dispositivos', {
    chave: d.chave,
    nome: d.nome,
    codigo: d.codigo
  })
  const cfg = salvarConfig({
    url,
    ...guardarToken(cad.token),
    terminalUuid: cad.uuid,
    nome: cad.nome,
    codigo: cad.codigo,
    ativo: true,
    cursor: 0,
    ultimaSync: null,
    ultimoErro: null
  })

  if (d.modo === 'substituir' && cad.registros > 0) {
    await substituirPeloServidor(cfg, cad.token)
    emitirEstado()
    return { estado: estado(), precisaEntrar: true }
  }
  await sincronizar()
  return { estado: estado(), precisaEntrar: false }
}

/** Troca todos os dados deste terminal pelos do servidor (com backup antes). */
async function substituirPeloServidor(cfg: ConfigSync, token: string): Promise<void> {
  const todas: AlteracaoRemota[] = []
  let cursor = 0
  for (;;) {
    const r = await requisitar<{ alteracoes: AlteracaoRemota[]; ultimoSeq: number; temMais: boolean }>(
      cfg,
      'GET',
      `/sync/receber?desde=${cursor}&limite=1000`,
      undefined,
      token
    )
    todas.push(...r.alteracoes)
    cursor = r.ultimoSeq
    if (!r.temMais) break
  }

  await criarBackup(join(pastaDeBackups(), `antes-da-sincronizacao_${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`))
  const db = banco()
  aplicando(() => {
    // Apaga na ordem inversa das dependências.
    db.prepare('DELETE FROM inventario_itens').run()
    db.prepare('DELETE FROM inventarios').run()
    db.prepare('DELETE FROM compra_itens').run()
    db.prepare('DELETE FROM venda_itens').run()
    db.prepare('UPDATE movimentacoes SET venda_id = NULL').run()
    db.prepare('DELETE FROM vendas').run()
    for (const t of [...TABELAS_SYNC].reverse()) db.prepare(`DELETE FROM ${t}`).run()
    db.prepare('DELETE FROM recuperacao').run()
    db.prepare('DELETE FROM sync_fila').run()
    db.prepare('DELETE FROM sync_conflitos').run()
    aplicarLote(todas)
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM usuarios WHERE perfil = 'admin' AND ativo = 1`).get() as { n: number }
    if (n === 0) throw new ErroNegocio('O servidor não tem nenhum administrador ativo. Os dados locais foram mantidos.')
    salvarConfig({ cursor, ultimaSync: new Date().toISOString() })
  })
  encerrarSessao()
}

export function configurar(o: { ativo: boolean; intervalo: number }): EstadoSync {
  salvarConfig({ ativo: o.ativo, intervalo: Math.min(240, Math.max(1, Math.round(o.intervalo))) })
  emitirEstado()
  return estado()
}

/** Desliga este terminal do servidor. Os dados locais e as alterações pendentes são mantidos. */
export function desconectar(): EstadoSync {
  limparConfig()
  emitirEstado()
  return estado()
}

// ---------- Sincronização automática ----------

let ultimaTentativa = 0

export function iniciarAgendador(): void {
  const tentar = (): void => {
    const cfg = lerConfig()
    if (!configurado(cfg) || !cfg.ativo || emAndamento) return
    if (Date.now() - ultimaTentativa < cfg.intervalo * 60_000) return
    ultimaTentativa = Date.now()
    sincronizar().catch(() => undefined) // o erro fica registrado em ultimoErro e aparece na interface
  }
  setTimeout(tentar, 5_000) // logo depois de abrir
  setInterval(tentar, 30_000)
}

import type { CaixaResumo, CaixaSessaoResumo, LancamentoCaixa, TipoLancamentoCaixa } from '@shared/api'
import type { FormaPagamento } from '@shared/tipos'
import { banco } from '../db/conexao'
import { ErroNegocio } from '../erros'
import { lerConfiguracoes } from './dados'
import * as map from './mapeadores'
import { lerConfig } from './sync/config'

// Caixa do dia (deste terminal).
// Dinheiro esperado na gaveta = troco + vendas/recebimentos em dinheiro + suprimentos − sangrias − devoluções em dinheiro.
// As outras formas (Pix, cartões...) são conferidas com o extrato/maquininha no fechamento.

const FORMAS: FormaPagamento[] = ['dinheiro', 'pix', 'debito', 'credito', 'boleto', 'outro']
const centavos = (v: number): number => Math.round(v * 100) / 100

const db = () => banco()
const nomeUsuario = (id: number): string => (db().prepare('SELECT nome FROM usuarios WHERE id = ?').get(id) as { nome: string } | undefined)?.nome ?? '—'

function aberta(): map.Linha | undefined {
  return db().prepare(`SELECT * FROM caixa_sessoes WHERE status = 'aberto'`).get() as map.Linha | undefined
}

/** Recusa vendas e recebimentos com o caixa fechado, quando a configuração exige. */
export function exigirAberto(): void {
  if (lerConfiguracoes().exigirCaixaAberto && !aberta()) {
    throw new ErroNegocio('O caixa está fechado. Abra o caixa (menu Caixa) para registrar vendas e recebimentos.')
  }
}

/** Lança no caixa aberto (se não houver caixa aberto, não lança: o movimento continua valendo). */
export function lancar(tipo: TipoLancamentoCaixa, forma: FormaPagamento, valor: number, descricao: string, usuarioId: number): void {
  const s = aberta()
  if (!s || !valor) return
  db()
    .prepare('INSERT INTO caixa_lancamentos (sessao_id, em, tipo, forma, valor, descricao, usuario_nome) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(s.id, map.agoraIso(), tipo, forma, centavos(valor), descricao, nomeUsuario(usuarioId))
}

function proximoNumero(): string {
  const prefixo = `CX-${lerConfig().codigo}`
  const { n } = db().prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM caixa_sessoes').get() as { n: number }
  let numero = `${prefixo}${String(n).padStart(4, '0')}`
  for (let i = n + 1; db().prepare('SELECT 1 FROM caixa_sessoes WHERE numero = ?').get(numero); i++) numero = `${prefixo}${String(i).padStart(4, '0')}`
  return numero
}

export function abrir(troco: number, usuarioId: number): CaixaResumo {
  if (aberta()) throw new ErroNegocio('Já existe um caixa aberto neste computador.')
  const r = db()
    .prepare(`INSERT INTO caixa_sessoes (numero, status, aberto_em, aberto_por_nome, troco) VALUES (?, 'aberto', ?, ?, ?)`)
    .run(proximoNumero(), map.agoraIso(), nomeUsuario(usuarioId), centavos(troco))
  return resumo(Number(r.lastInsertRowid))
}

/** Valor esperado por forma de pagamento (dinheiro inclui o troco). */
function esperadoPorForma(sessao: map.Linha, lancamentos: LancamentoCaixa[]): Record<FormaPagamento, number> {
  const esperado = Object.fromEntries(FORMAS.map((f) => [f, 0])) as Record<FormaPagamento, number>
  esperado.dinheiro = sessao.troco
  for (const l of lancamentos) esperado[l.forma] = centavos((esperado[l.forma] ?? 0) + l.valor)
  return esperado
}

export function resumo(id: number): CaixaResumo {
  const s = db().prepare('SELECT * FROM caixa_sessoes WHERE id = ?').get(id) as map.Linha | undefined
  if (!s) throw new ErroNegocio('Caixa não encontrado.')
  const lancamentos = (db().prepare('SELECT * FROM caixa_lancamentos WHERE sessao_id = ? ORDER BY id').all(id) as map.Linha[]).map(
    (l): LancamentoCaixa => ({ id: l.id, em: l.em, tipo: l.tipo, forma: l.forma, valor: l.valor, descricao: l.descricao, usuario: l.usuario_nome })
  )
  const ler = (v: string | null): Record<FormaPagamento, number> | null => (v ? JSON.parse(v) : null)
  return {
    id: s.id,
    numero: s.numero,
    status: s.status,
    abertoEm: s.aberto_em,
    abertoPor: s.aberto_por_nome,
    troco: s.troco,
    fechadoEm: s.fechado_em ?? null,
    fechadoPor: s.fechado_por_nome ?? null,
    observacao: s.observacao,
    lancamentos,
    esperado: ler(s.esperado) ?? esperadoPorForma(s, lancamentos),
    contado: ler(s.contado)
  }
}

/** Dinheiro esperado na gaveta do caixa aberto (null = caixa fechado). */
export function dinheiroNaGaveta(): number | null {
  const s = aberta()
  return s ? resumo(s.id).esperado.dinheiro : null
}

export function estado(): CaixaResumo | null {
  const s = aberta()
  return s ? resumo(s.id) : null
}

function sessaoAbertaOuErro(): map.Linha {
  const s = aberta()
  if (!s) throw new ErroNegocio('O caixa está fechado.')
  return s
}

export function movimentar(tipo: 'sangria' | 'suprimento', valor: number, motivo: string, usuarioId: number): CaixaResumo {
  const s = sessaoAbertaOuErro()
  if (tipo === 'sangria') {
    const dinheiro = resumo(s.id).esperado.dinheiro
    if (valor > dinheiro + 0.005) throw new ErroNegocio(`Só há ${dinheiro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em dinheiro no caixa.`, 'valor')
  }
  lancar(tipo, 'dinheiro', tipo === 'sangria' ? -valor : valor, motivo, usuarioId)
  return resumo(s.id)
}

export function fechar(contado: Partial<Record<FormaPagamento, number>>, observacao: string, usuarioId: number): CaixaResumo {
  const s = sessaoAbertaOuErro()
  const r = resumo(s.id)
  // O que não foi informado é considerado igual ao esperado (formas sem movimento).
  const conferido = Object.fromEntries(FORMAS.map((f) => [f, centavos(contado[f] ?? r.esperado[f] ?? 0)])) as Record<FormaPagamento, number>
  db()
    .prepare(`UPDATE caixa_sessoes SET status = 'fechado', fechado_em = ?, fechado_por_nome = ?, esperado = ?, contado = ?, observacao = ? WHERE id = ?`)
    .run(map.agoraIso(), nomeUsuario(usuarioId), JSON.stringify(r.esperado), JSON.stringify(conferido), observacao, s.id)
  return resumo(s.id)
}

export function historico(): CaixaSessaoResumo[] {
  const linhas = db().prepare(`SELECT * FROM caixa_sessoes ORDER BY id DESC LIMIT 200`).all() as map.Linha[]
  return linhas.map((s) => {
    const r = resumo(s.id)
    const entradas = r.lancamentos.filter((l) => l.tipo === 'venda' || l.tipo === 'os' || l.tipo === 'conta_receber').reduce((t, l) => t + l.valor, 0)
    const devolucoes = r.lancamentos.filter((l) => l.tipo === 'cancelamento' || l.tipo === 'estorno').reduce((t, l) => t + l.valor, 0)
    const diferenca = r.contado ? centavos(FORMAS.reduce((t, f) => t + (r.contado![f] ?? 0) - (r.esperado[f] ?? 0), 0)) : null
    return { id: r.id, numero: r.numero, status: r.status, abertoEm: r.abertoEm, abertoPor: r.abertoPor, fechadoEm: r.fechadoEm, fechadoPor: r.fechadoPor, recebido: centavos(entradas + devolucoes), diferenca }
  })
}

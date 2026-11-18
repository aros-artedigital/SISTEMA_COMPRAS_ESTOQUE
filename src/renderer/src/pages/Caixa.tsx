import { useCallback, useEffect, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Banknote, Lock, LockOpen, Printer, Wallet } from 'lucide-react'
import type { CaixaResumo, CaixaSessaoResumo } from '@shared/api'
import { rotuloFormaPagamento } from '@shared/dominio'
import * as fmt from '@shared/format'
import type { FormaPagamento } from '@shared/tipos'
import { chamar } from '@/data/api'
import { recarregar, useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { PageHeader } from '@/components/PageHeader'
import { DataTable, type Coluna } from '@/components/DataTable'
import { Modal } from '@/components/Modal'
import { InputMoeda } from '@/components/InputMoeda'
import { Badge, Button, Card, CardHeader, Input, Textarea } from '@/components/ui'
import { executar } from '@/lib/executar'
import { imprimir } from '@/lib/saida'
import { FORMAS_CAIXA, htmlFechamento, rotuloLancamento } from '@/lib/htmlCaixa'

// Caixa do dia deste computador: abertura com troco, lançamentos automáticos de vendas e de
// pagamentos de OS, sangria e suprimento, e fechamento conferindo o valor de cada forma de pagamento.

export default function Caixa() {
  const db = useDb()
  const notificar = useToast()
  const [caixa, setCaixa] = useState<CaixaResumo | null>(null)
  const [carregado, setCarregado] = useState(false)
  const [historico, setHistorico] = useState<CaixaSessaoResumo[]>([])
  const [troco, setTroco] = useState('')
  const [movimento, setMovimento] = useState<'sangria' | 'suprimento' | null>(null)
  const [fechando, setFechando] = useState(false)
  const [detalhe, setDetalhe] = useState<CaixaResumo | null>(null)

  const carregar = useCallback(async () => {
    const [e, h] = await Promise.all([chamar('caixa:estado'), chamar('caixa:historico')])
    setCaixa(e)
    setHistorico(h)
    setCarregado(true)
  }, [])
  // Recarrega quando os dados mudam (venda feita, OS recebida...).
  useEffect(() => {
    void carregar().catch(() => setCarregado(true))
  }, [carregar, db])

  async function abrir(): Promise<void> {
    const valor = Number(troco) || 0
    const ok = await executar(async () => setCaixa(await chamar('caixa:abrir', valor)), { notificar, sucesso: 'Caixa aberto.' })
    if (ok) {
      setTroco('')
      void carregar()
    }
  }

  const imprimirFechamento = (c: CaixaResumo): Promise<void> => imprimir(htmlFechamento(c, db.configuracoes.nomeEmpresa), {}, notificar)

  const colunasHistorico: Coluna<CaixaSessaoResumo>[] = [
    {
      chave: 'numero',
      titulo: 'Caixa',
      render: (h) => (
        <button className="font-medium text-blue-700 hover:underline" onClick={() => void executar(async () => setDetalhe(await chamar('caixa:sessao', h.id)), { notificar })}>
          {h.numero}
        </button>
      )
    },
    { chave: 'abertura', titulo: 'Abertura', render: (h) => `${fmt.dataHora(h.abertoEm)} · ${h.abertoPor}` },
    { chave: 'fechamento', titulo: 'Fechamento', render: (h) => (h.fechadoEm ? `${fmt.dataHora(h.fechadoEm)} · ${h.fechadoPor}` : <Badge cor="azul">Aberto</Badge>) },
    { chave: 'recebido', titulo: 'Recebido', alinhar: 'direita', render: (h) => <span className="tabular-nums">{fmt.moeda(h.recebido)}</span> },
    {
      chave: 'diferenca',
      titulo: 'Diferença',
      alinhar: 'direita',
      render: (h) =>
        h.diferenca === null ? (
          '—'
        ) : Math.abs(h.diferenca) < 0.005 ? (
          <Badge cor="verde">Conferido</Badge>
        ) : (
          <Badge cor={h.diferenca < 0 ? 'vermelho' : 'amarelo'}>{`${h.diferenca > 0 ? 'Sobra' : 'Falta'} ${fmt.moeda(Math.abs(h.diferenca))}`}</Badge>
        )
    }
  ]

  return (
    <>
      <PageHeader
        titulo="Caixa"
        subtitulo="Caixa do dia deste computador: abertura, sangria, suprimento e fechamento"
        acoes={
          caixa && (
            <>
              <Button variante="secundario" icone={<ArrowDownCircle size={16} />} onClick={() => setMovimento('sangria')}>
                Sangria
              </Button>
              <Button variante="secundario" icone={<ArrowUpCircle size={16} />} onClick={() => setMovimento('suprimento')}>
                Suprimento
              </Button>
              <Button icone={<Lock size={16} />} onClick={() => setFechando(true)}>
                Fechar caixa
              </Button>
            </>
          )
        }
      />

      {carregado && !caixa && (
        <Card className="mb-6 max-w-xl">
          <CardHeader titulo="Caixa fechado" icone={LockOpen} />
          <div className="space-y-4 p-5">
            <p className="text-sm text-slate-600">
              Abra o caixa no início do dia informando o troco (dinheiro que já está na gaveta). As vendas e os pagamentos de OS passam a ser lançados nele
              automaticamente.
              {db.configuracoes.exigirCaixaAberto && <strong> Com o caixa fechado, não é possível vender nem receber.</strong>}
            </p>
            <div className="flex items-end gap-3">
              <InputMoeda label="Troco inicial" wrapperClassName="w-48" value={troco} onChange={(e) => setTroco(e.target.value)} />
              <Button icone={<LockOpen size={16} />} onClick={() => void abrir()}>
                Abrir caixa
              </Button>
            </div>
          </div>
        </Card>
      )}

      {caixa && <CaixaAberto caixa={caixa} />}

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Histórico de caixas</h2>
      <DataTable colunas={colunasHistorico} dados={historico} chave={(h) => h.id} nomeItens="caixas" vazio="Nenhum caixa aberto ainda neste computador." />

      {movimento && caixa && (
        <MovimentoModal
          tipo={movimento}
          dinheiro={caixa.esperado.dinheiro}
          onFechar={() => setMovimento(null)}
          onFeito={(c) => {
            setCaixa(c)
            setMovimento(null)
            void carregar()
          }}
        />
      )}
      {fechando && caixa && (
        <FechamentoModal
          caixa={caixa}
          onFechar={() => setFechando(false)}
          onFechado={(c) => {
            setFechando(false)
            setDetalhe(c)
            void carregar()
            void recarregar()
          }}
        />
      )}
      {detalhe && (
        <Modal
          aberto
          titulo={`Caixa ${detalhe.numero}`}
          onFechar={() => setDetalhe(null)}
          tamanho="lg"
          rodape={
            <>
              <Button variante="secundario" icone={<Printer size={16} />} onClick={() => void imprimirFechamento(detalhe)}>
                Imprimir comprovante
              </Button>
              <Button onClick={() => setDetalhe(null)}>Fechar</Button>
            </>
          }
        >
          <Conferencia caixa={detalhe} />
          <Lancamentos caixa={detalhe} />
        </Modal>
      )}
    </>
  )
}

function CaixaAberto({ caixa: c }: { caixa: CaixaResumo }) {
  const formas = FORMAS_CAIXA.filter((f) => f === 'dinheiro' || c.esperado[f])
  const recebido = c.lancamentos.filter((l) => l.tipo !== 'sangria' && l.tipo !== 'suprimento').reduce((t, l) => t + l.valor, 0)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <Wallet size={18} />
        <span>
          <strong>Caixa {c.numero} aberto</strong> em {fmt.dataHora(c.abertoEm)} por {c.abertoPor} · troco inicial {fmt.moeda(c.troco)}
        </span>
        <span className="ml-auto font-semibold">Recebido no caixa: {fmt.moeda(recebido)}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Valores por forma de pagamento">
        {formas.map((f) => (
          <div key={f} className={`rounded-xl border bg-superficie px-4 py-3 shadow-sm ${f === 'dinheiro' ? 'border-emerald-300' : 'border-slate-200'}`}>
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              {f === 'dinheiro' && <Banknote size={14} />} {f === 'dinheiro' ? 'Dinheiro na gaveta' : rotuloFormaPagamento[f]}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{fmt.moeda(c.esperado[f])}</p>
          </div>
        ))}
      </div>
      <Lancamentos caixa={c} />
    </div>
  )
}

function Lancamentos({ caixa: c }: { caixa: CaixaResumo }) {
  const colunas: Coluna<CaixaResumo['lancamentos'][number]>[] = [
    { chave: 'em', titulo: 'Hora', render: (l) => <span className="whitespace-nowrap tabular-nums">{fmt.dataHora(l.em)}</span> },
    { chave: 'tipo', titulo: 'Tipo', render: (l) => <Badge cor={l.valor < 0 ? 'vermelho' : l.tipo === 'suprimento' ? 'azul' : 'verde'}>{rotuloLancamento[l.tipo]}</Badge> },
    { chave: 'descricao', titulo: 'Descrição', render: (l) => l.descricao },
    { chave: 'forma', titulo: 'Forma', render: (l) => rotuloFormaPagamento[l.forma] },
    { chave: 'usuario', titulo: 'Por', render: (l) => <span className="text-slate-500">{l.usuario}</span> },
    { chave: 'valor', titulo: 'Valor', alinhar: 'direita', render: (l) => <span className={`whitespace-nowrap font-medium tabular-nums ${l.valor < 0 ? 'text-red-600' : 'text-slate-800'}`}>{fmt.moeda(l.valor)}</span> }
  ]
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-800">Lançamentos</h3>
      <DataTable colunas={colunas} dados={[...c.lancamentos].reverse()} chave={(l) => l.id} nomeItens="lançamentos" porPagina={10} vazio="Nenhum lançamento ainda." />
    </div>
  )
}

/** Esperado × contado por forma de pagamento (caixa fechado). */
function Conferencia({ caixa: c }: { caixa: CaixaResumo }) {
  const formas = FORMAS_CAIXA.filter((f) => c.esperado[f] || c.contado?.[f])
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">
        Aberto em {fmt.dataHora(c.abertoEm)} por {c.abertoPor} (troco {fmt.moeda(c.troco)}){c.fechadoEm && ` · fechado em ${fmt.dataHora(c.fechadoEm)} por ${c.fechadoPor}`}
      </p>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Forma</th>
            <th className="px-3 py-2 text-right font-medium">Esperado</th>
            <th className="px-3 py-2 text-right font-medium">Contado</th>
            <th className="px-3 py-2 text-right font-medium">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {formas.map((f) => {
            const dif = c.contado ? (c.contado[f] ?? 0) - c.esperado[f] : 0
            return (
              <tr key={f} className="border-t border-slate-100">
                <td className="px-3 py-2">{rotuloFormaPagamento[f]}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt.moeda(c.esperado[f])}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.contado ? fmt.moeda(c.contado[f] ?? 0) : '—'}</td>
                <td className={`px-3 py-2 text-right font-medium tabular-nums ${Math.abs(dif) < 0.005 ? 'text-slate-400' : dif < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                  {Math.abs(dif) < 0.005 ? '—' : fmt.moeda(dif)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {c.observacao && <p className="text-sm text-slate-600">Observação: {c.observacao}</p>}
    </div>
  )
}

function MovimentoModal({ tipo, dinheiro, onFechar, onFeito }: { tipo: 'sangria' | 'suprimento'; dinheiro: number; onFechar: () => void; onFeito: (c: CaixaResumo) => void }) {
  const notificar = useToast()
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState(tipo === 'sangria' ? 'Depósito no banco' : 'Reforço de troco')
  const [erro, setErro] = useState('')
  async function confirmar(): Promise<void> {
    const v = Number(valor) || 0
    if (v <= 0) return setErro('Informe o valor.')
    if (motivo.trim().length < 3) return setErro('Informe o motivo.')
    let r: CaixaResumo | null = null
    const ok = await executar(async () => (r = await chamar('caixa:movimentar', tipo, v, motivo)), {
      notificar,
      sucesso: `${tipo === 'sangria' ? 'Sangria' : 'Suprimento'} de ${fmt.moeda(v)} registrada.`
    })
    if (ok && r) onFeito(r)
  }
  return (
    <Modal
      aberto
      titulo={tipo === 'sangria' ? 'Sangria (retirar dinheiro do caixa)' : 'Suprimento (colocar dinheiro no caixa)'}
      onFechar={onFechar}
      tamanho="sm"
      rodape={
        <>
          <Button variante="secundario" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()}>Confirmar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Dinheiro na gaveta agora: {fmt.moeda(dinheiro)}</p>
        <InputMoeda label="Valor" value={valor} onChange={(e) => (setValor(e.target.value), setErro(''))} autoFocus />
        <Input label="Motivo" value={motivo} onChange={(e) => (setMotivo(e.target.value), setErro(''))} />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </div>
    </Modal>
  )
}

function FechamentoModal({ caixa: c, onFechar, onFechado }: { caixa: CaixaResumo; onFechar: () => void; onFechado: (c: CaixaResumo) => void }) {
  const notificar = useToast()
  const formas = FORMAS_CAIXA.filter((f) => f === 'dinheiro' || c.esperado[f])
  // Dinheiro é contado na gaveta (começa vazio); as outras formas vêm preenchidas para conferir com a maquininha/extrato.
  const [contado, setContado] = useState<Record<string, string>>(() => Object.fromEntries(formas.map((f) => [f, f === 'dinheiro' ? '' : String(c.esperado[f])])))
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')
  const valor = (f: FormaPagamento): number => Number(contado[f]) || 0
  const diferencaTotal = formas.reduce((t, f) => t + valor(f) - c.esperado[f], 0)

  async function confirmar(): Promise<void> {
    if (contado.dinheiro === '') return setErro('Conte o dinheiro da gaveta e informe o valor (0 se não houver).')
    if (Math.abs(diferencaTotal) >= 0.005 && observacao.trim().length < 3) return setErro('Há diferença: explique na observação.')
    let r: CaixaResumo | null = null
    const ok = await executar(async () => (r = await chamar('caixa:fechar', Object.fromEntries(formas.map((f) => [f, valor(f)])), observacao)), {
      notificar,
      sucesso: `Caixa ${c.numero} fechado.`
    })
    if (ok && r) onFechado(r)
  }

  return (
    <Modal
      aberto
      titulo={`Fechar caixa ${c.numero}`}
      onFechar={onFechar}
      tamanho="lg"
      rodape={
        <>
          <Button variante="secundario" onClick={onFechar}>
            Cancelar
          </Button>
          <Button icone={<Lock size={16} />} onClick={() => void confirmar()}>
            Fechar caixa
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Conte o dinheiro da gaveta e confira as outras formas com a maquininha e o extrato. Diferenças ficam registradas no fechamento e na auditoria.
      </p>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Forma</th>
            <th className="px-3 py-2 text-right font-medium">Esperado</th>
            <th className="w-44 px-3 py-2 text-right font-medium">Contado</th>
            <th className="px-3 py-2 text-right font-medium">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {formas.map((f) => {
            const dif = contado[f] === '' ? null : valor(f) - c.esperado[f]
            return (
              <tr key={f} className="border-t border-slate-100">
                <td className="px-3 py-2">{rotuloFormaPagamento[f]}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt.moeda(c.esperado[f])}</td>
                <td className="px-3 py-2">
                  <InputMoeda aria-label={`Contado em ${rotuloFormaPagamento[f]}`} value={contado[f]} onChange={(e) => (setContado((x) => ({ ...x, [f]: e.target.value })), setErro(''))} />
                </td>
                <td className={`px-3 py-2 text-right font-medium tabular-nums ${dif === null || Math.abs(dif) < 0.005 ? 'text-slate-400' : dif < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                  {dif === null ? '—' : Math.abs(dif) < 0.005 ? 'OK' : `${dif > 0 ? 'Sobra' : 'Falta'} ${fmt.moeda(Math.abs(dif))}`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Textarea label="Observação" wrapperClassName="mt-3" placeholder="Obrigatória se houver diferença" value={observacao} onChange={(e) => (setObservacao(e.target.value), setErro(''))} />
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
    </Modal>
  )
}

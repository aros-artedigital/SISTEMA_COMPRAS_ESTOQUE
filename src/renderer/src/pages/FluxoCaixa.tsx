import { useMemo, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Scale, TrendingUp } from 'lucide-react'
import { chavePeriodo, movimentosFluxo, periodosFluxo, type Agrupamento, type MovimentoFluxo, type PeriodoFluxo } from '@shared/fluxoCaixa'
import * as fmt from '@shared/format'
import { useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { DataTable, type Coluna } from '@/components/DataTable'
import { BarraSaida } from '@/components/BarraSaida'
import { GraficoBarras } from '@/components/GraficoBarras'
import { InputMoeda } from '@/components/InputMoeda'
import { Badge, Card, CardHeader, Checkbox, Input, Select } from '@/components/ui'
import { relatorioExcel, relatorioImprimir, relatorioPdf } from '@/lib/saida'
import type { Relatorio } from '@/lib/relatorio'

// Fluxo de caixa: entradas e saídas realizadas e previstas por dia, semana ou mês, com saldo acumulado.

type Atalho = 'mes' | 'proximos30' | 'ultimos30' | 'proximos90' | 'ano' | 'personalizado'

const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function intervalo(a: Atalho): { de: string; ate: string } {
  const h = new Date()
  const mais = (n: number): string => iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() + n))
  switch (a) {
    case 'proximos30':
      return { de: iso(h), ate: mais(30) }
    case 'proximos90':
      return { de: iso(h), ate: mais(90) }
    case 'ultimos30':
      return { de: mais(-30), ate: iso(h) }
    case 'ano':
      return { de: `${h.getFullYear()}-01-01`, ate: `${h.getFullYear()}-12-31` }
    default:
      return { de: iso(new Date(h.getFullYear(), h.getMonth(), 1)), ate: iso(new Date(h.getFullYear(), h.getMonth() + 1, 0)) }
  }
}

const rotuloSituacao = { realizado: 'Realizado', previsto: 'Previsto', atrasado: 'Em atraso' } as const
const corSituacao = { realizado: 'verde', previsto: 'azul', atrasado: 'vermelho' } as const

export default function FluxoCaixa() {
  const db = useDb()
  const notificar = useToast()
  const [atalho, setAtalho] = useState<Atalho>('mes')
  const [periodo, setPeriodo] = useState(intervalo('mes'))
  const [agrupar, setAgrupar] = useState<Agrupamento>('dia')
  const [saldoInicial, setSaldoInicial] = useState('')
  const [comprasSemConta, setComprasSemConta] = useState(true)
  const [tipoMov, setTipoMov] = useState('')
  const hoje = fmt.hojeIso()

  const movimentos = useMemo(() => movimentosFluxo(db, { ...periodo, hoje, comprasSemConta }), [db, periodo, hoje, comprasSemConta])
  const periodos = useMemo(() => periodosFluxo(movimentos, periodo, agrupar, Number(saldoInicial) || 0), [movimentos, periodo, agrupar, saldoInicial])

  const soma = (f: (m: MovimentoFluxo) => boolean): number => Math.round(movimentos.filter(f).reduce((s, m) => s + m.valor, 0) * 100) / 100
  const t = {
    entradas: soma((m) => m.tipo === 'entrada' && m.situacao === 'realizado'),
    saidas: soma((m) => m.tipo === 'saida' && m.situacao === 'realizado'),
    aReceber: soma((m) => m.tipo === 'entrada' && m.situacao !== 'realizado'),
    aPagar: soma((m) => m.tipo === 'saida' && m.situacao !== 'realizado'),
    atrasado: soma((m) => m.situacao === 'atrasado')
  }
  const saldoFinal = periodos.at(-1)?.acumulado ?? (Number(saldoInicial) || 0)
  const empresa = db.configuracoes.nomeEmpresa
  const nomeArquivo = `fluxo-de-caixa_${periodo.de}_a_${periodo.ate}`

  const relatorio = useMemo<Relatorio>(
    () => ({
      titulo: 'Fluxo de caixa',
      filtros: [
        `Período: ${fmt.data(periodo.de)} a ${fmt.data(periodo.ate)} — por ${agrupar === 'dia' ? 'dia' : agrupar === 'semana' ? 'semana' : 'mês'}`,
        `Saldo inicial: ${fmt.moeda(Number(saldoInicial) || 0)}`,
        comprasSemConta ? 'Compras sem conta a pagar contam como pagas na data da compra' : 'Compras sem conta a pagar não entram',
        'Previsto = contas em aberto pelo vencimento; o que venceu e não foi pago entra em "hoje"'
      ],
      colunas: [
        { titulo: 'Período', peso: 0.9 },
        { titulo: 'Entradas', formato: 'moeda' },
        { titulo: 'Saídas', formato: 'moeda' },
        { titulo: 'A receber (previsto)', formato: 'moeda' },
        { titulo: 'A pagar (previsto)', formato: 'moeda' },
        { titulo: 'Saldo do período', formato: 'moeda' },
        { titulo: 'Saldo acumulado', formato: 'moeda', peso: 1.1 }
      ],
      linhas: periodos.map((p) => [p.rotulo, p.entradasRealizadas, p.saidasRealizadas, p.entradasPrevistas, p.saidasPrevistas, p.saldo, p.acumulado]),
      totais: ['Total', t.entradas, t.saidas, t.aReceber, t.aPagar, Math.round((t.entradas + t.aReceber - t.saidas - t.aPagar) * 100) / 100, saldoFinal],
      resumo: [
        { rotulo: 'Entradas realizadas', valor: fmt.moeda(t.entradas) },
        { rotulo: 'Saídas realizadas', valor: fmt.moeda(t.saidas) },
        { rotulo: 'A receber / a pagar', valor: `${fmt.moeda(t.aReceber)} / ${fmt.moeda(t.aPagar)}` },
        { rotulo: 'Saldo final previsto', valor: fmt.moeda(saldoFinal) }
      ]
    }),
    [periodos, periodo, agrupar, saldoInicial, comprasSemConta] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const colunasPeriodo: Coluna<PeriodoFluxo>[] = [
    { chave: 'periodo', titulo: 'Período', render: (p) => <span className={`font-medium ${p.chave === chavePeriodo(hoje, agrupar) ? 'text-blue-700' : ''}`}>{p.rotulo}{p.chave === chavePeriodo(hoje, agrupar) && ' (hoje)'}</span> },
    { chave: 'entradas', titulo: 'Entradas', alinhar: 'direita', render: (p) => <Valor v={p.entradasRealizadas} cor="text-emerald-700" /> },
    { chave: 'saidas', titulo: 'Saídas', alinhar: 'direita', render: (p) => <Valor v={-p.saidasRealizadas} cor="text-red-600" /> },
    { chave: 'aReceber', titulo: 'A receber', alinhar: 'direita', render: (p) => <Valor v={p.entradasPrevistas} cor="text-emerald-600/80 italic" /> },
    { chave: 'aPagar', titulo: 'A pagar', alinhar: 'direita', render: (p) => <Valor v={-p.saidasPrevistas} cor="text-red-500/80 italic" /> },
    { chave: 'saldo', titulo: 'Saldo do período', alinhar: 'direita', render: (p) => <Valor v={p.saldo} cor={p.saldo < 0 ? 'text-red-600' : 'text-slate-800'} /> },
    { chave: 'acumulado', titulo: 'Saldo acumulado', alinhar: 'direita', render: (p) => <span className={`font-semibold tabular-nums ${p.acumulado < 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmt.moeda(p.acumulado)}</span> }
  ]

  const listaMov = movimentos.filter((m) => !tipoMov || (tipoMov === 'entrada' || tipoMov === 'saida' ? m.tipo === tipoMov : m.situacao === tipoMov))
  const colunasMov: Coluna<MovimentoFluxo & { i: number }>[] = [
    { chave: 'data', titulo: 'Data', render: (m) => <span className="whitespace-nowrap tabular-nums">{fmt.data(m.data)}</span> },
    { chave: 'situacao', titulo: 'Situação', render: (m) => <Badge cor={corSituacao[m.situacao]}>{rotuloSituacao[m.situacao]}</Badge> },
    { chave: 'origem', titulo: 'Origem', render: (m) => m.origem },
    {
      chave: 'descricao',
      titulo: 'Descrição',
      render: (m) => (
        <span>
          {m.descricao}
          {m.situacao === 'atrasado' && m.vencimento && <span className="ml-1 text-xs text-red-600">(venceu {fmt.data(m.vencimento)})</span>}
        </span>
      )
    },
    { chave: 'valor', titulo: 'Valor', alinhar: 'direita', render: (m) => <Valor v={m.tipo === 'entrada' ? m.valor : -m.valor} cor={m.tipo === 'entrada' ? 'text-emerald-700' : 'text-red-600'} /> }
  ]

  const exportarMovimentos = (): Promise<void> =>
    relatorioExcel(
      {
        titulo: 'Movimentos do fluxo de caixa',
        filtros: relatorio.filtros,
        colunas: [{ titulo: 'Data', formato: 'data' }, { titulo: 'Tipo' }, { titulo: 'Situação' }, { titulo: 'Origem' }, { titulo: 'Descrição' }, { titulo: 'Vencimento', formato: 'data' }, { titulo: 'Valor', formato: 'moeda' }],
        linhas: listaMov.map((m) => [m.data, m.tipo === 'entrada' ? 'Entrada' : 'Saída', rotuloSituacao[m.situacao], m.origem, m.descricao, m.vencimento, m.tipo === 'entrada' ? m.valor : -m.valor])
      },
      `${nomeArquivo}_movimentos`,
      notificar
    )

  return (
    <>
      <PageHeader titulo="Fluxo de caixa" subtitulo="Entradas e saídas realizadas e previstas, com o saldo ao longo do período" />

      <Filtros>
        <Select
          className="w-48"
          aria-label="Período"
          opcoes={[
            { value: 'mes', label: 'Este mês' },
            { value: 'proximos30', label: 'Próximos 30 dias' },
            { value: 'proximos90', label: 'Próximos 90 dias' },
            { value: 'ultimos30', label: 'Últimos 30 dias' },
            { value: 'ano', label: 'Este ano' },
            { value: 'personalizado', label: 'Personalizado' }
          ]}
          value={atalho}
          onChange={(e) => {
            const a = e.target.value as Atalho
            setAtalho(a)
            if (a !== 'personalizado') {
              setPeriodo(intervalo(a))
              setAgrupar(a === 'ano' || a === 'proximos90' ? 'mes' : 'dia')
            }
          }}
        />
        <Input type="date" aria-label="De" className="w-40" value={periodo.de} onChange={(e) => (setAtalho('personalizado'), setPeriodo((p) => ({ ...p, de: e.target.value })))} />
        <Input type="date" aria-label="Até" className="w-40" value={periodo.ate} onChange={(e) => (setAtalho('personalizado'), setPeriodo((p) => ({ ...p, ate: e.target.value })))} />
        <Select
          className="w-36"
          aria-label="Agrupar por"
          opcoes={[
            { value: 'dia', label: 'Por dia' },
            { value: 'semana', label: 'Por semana' },
            { value: 'mes', label: 'Por mês' }
          ]}
          value={agrupar}
          onChange={(e) => setAgrupar(e.target.value as Agrupamento)}
        />
        <div className="w-44">
          <InputMoeda aria-label="Saldo inicial" placeholder="Saldo inicial" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} />
        </div>
        <div className="ml-auto">
          <BarraSaida
            onExcel={() => relatorioExcel(relatorio, nomeArquivo, notificar)}
            onPdf={() => relatorioPdf(relatorio, empresa, nomeArquivo, notificar)}
            onImprimir={() => relatorioImprimir(relatorio, empresa, notificar)}
          />
        </div>
      </Filtros>
      <div className="-mt-2 mb-4">
        <Checkbox label="Compras recebidas sem conta a pagar contam como pagas na data da compra" checked={comprasSemConta} onChange={setComprasSemConta} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo do fluxo de caixa">
        <Cartao icone={ArrowDownCircle} titulo="Entradas realizadas" valor={t.entradas} cor="text-emerald-700" />
        <Cartao icone={ArrowUpCircle} titulo="Saídas realizadas" valor={-t.saidas} cor="text-red-600" />
        <Cartao icone={TrendingUp} titulo="A receber / a pagar (previsto)" valor={t.aReceber - t.aPagar} cor="text-blue-700" detalhe={`${fmt.moeda(t.aReceber)} a receber · ${fmt.moeda(t.aPagar)} a pagar${t.atrasado ? ` · ${fmt.moeda(t.atrasado)} em atraso` : ''}`} />
        <Cartao icone={Scale} titulo="Saldo final previsto" valor={saldoFinal} cor={saldoFinal < 0 ? 'text-red-600' : 'text-slate-900'} detalhe={`Saldo inicial ${fmt.moeda(Number(saldoInicial) || 0)} + entradas − saídas`} />
      </div>

      <Card className="mb-4">
        <CardHeader titulo={`Entradas e saídas ${agrupar === 'dia' ? 'por dia' : agrupar === 'semana' ? 'por semana' : 'por mês'} (realizadas + previstas)`} />
        <div className="p-5">
          <GraficoBarras
            series={[
              { nome: 'Entradas', cor: '#2a78d6' },
              { nome: 'Saídas', cor: '#eb6834' }
            ]}
            dados={periodos.map((p) => ({ rotulo: p.rotulo, valores: [p.entradasRealizadas + p.entradasPrevistas, p.saidasRealizadas + p.saidasPrevistas] }))}
            formatar={fmt.moeda}
            formatarEixo={(v) => `R$ ${new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v)}`}
          />
        </div>
      </Card>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Por período</h2>
      <DataTable colunas={colunasPeriodo} dados={periodos.filter((p) => agrupar !== 'dia' || p.entradasRealizadas + p.saidasRealizadas + p.entradasPrevistas + p.saidasPrevistas > 0 || p.chave === hoje)} chave={(p) => p.chave} nomeItens="períodos" porPagina={15} vazio="Nenhuma entrada ou saída no período." />

      <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Movimentos</h2>
        <div className="flex items-center gap-2">
          <Select
            className="w-44"
            aria-label="Filtrar movimentos"
            placeholder="Todos"
            opcoes={[
              { value: '', label: 'Todos' },
              { value: 'entrada', label: 'Só entradas' },
              { value: 'saida', label: 'Só saídas' },
              { value: 'realizado', label: 'Realizados' },
              { value: 'previsto', label: 'Previstos' },
              { value: 'atrasado', label: 'Em atraso' }
            ]}
            value={tipoMov}
            onChange={(e) => setTipoMov(e.target.value)}
          />
          <BarraSaida onExcel={() => void exportarMovimentos()} />
        </div>
      </div>
      <DataTable colunas={colunasMov} dados={listaMov.map((m, i) => ({ ...m, i }))} chave={(m) => m.i} nomeItens="movimentos" porPagina={15} vazio="Nenhum movimento no período." />
    </>
  )
}

function Valor({ v, cor }: { v: number; cor: string }) {
  if (Math.abs(v) < 0.005) return <span className="text-slate-300">—</span>
  return <span className={`whitespace-nowrap tabular-nums ${cor}`}>{fmt.moeda(v)}</span>
}

function Cartao({ icone: Icone, titulo, valor, cor, detalhe }: { icone: typeof Scale; titulo: string; valor: number; cor: string; detalhe?: string }) {
  return (
    <div role="group" aria-label={titulo} className="rounded-xl border border-slate-200 bg-superficie px-4 py-3 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Icone size={14} /> {titulo}
      </p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${cor}`}>{fmt.moeda(valor || 0)}</p>
      {detalhe && <p className="text-[11px] text-slate-400">{detalhe}</p>}
    </div>
  )
}

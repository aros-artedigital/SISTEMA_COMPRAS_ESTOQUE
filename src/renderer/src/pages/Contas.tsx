import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ban, Check, FileSpreadsheet, HandCoins, Pencil, Plus, Undo2 } from 'lucide-react'
import {
  CATEGORIAS_PAGAR,
  CATEGORIAS_RECEBER,
  corSituacaoConta,
  descreverConta,
  dividirParcelas,
  FORMAS_RECEBIMENTO,
  pagoConta,
  rotuloFormaPagamento,
  rotuloSituacaoConta,
  saldoConta,
  saldoOS,
  situacaoConta,
  somarMeses,
  totalCompra,
  type SituacaoConta
} from '@shared/dominio'
import { contaSchema } from '@shared/schemas'
import * as fmt from '@shared/format'
import type { Conta, FormaPagamento, OrdemServico } from '@shared/tipos'
import { alterar, useDb } from '@/data/store'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { AcoesLinha, BotaoAcao, DataTable, iconeFicha, type Coluna } from '@/components/DataTable'
import { AcoesLote } from '@/components/AcoesLote'
import { Modal } from '@/components/Modal'
import { InputMoeda } from '@/components/InputMoeda'
import { Badge, Button, Input, SearchInput, Select, Textarea } from '@/components/ui'
import { useForm } from '@/lib/useForm'
import { executar } from '@/lib/executar'
import { exportarExcel } from '@/lib/saida'

// Contas a receber e a pagar (a mesma tela, conforme o tipo).
// A receber: parcelas de vendas a prazo, contas lançadas à mão e as OS entregues com valor em aberto.
// A pagar: contas de fornecedores (de compras ou avulsas) e despesas (aluguel, energia...).

type Tipo = 'receber' | 'pagar'

/** Linha da lista: uma conta ou (a receber) uma OS entregue com saldo. */
type Linha = { chave: string; conta: Conta; os?: undefined } | { chave: string; os: OrdemServico; conta?: undefined }

type Filtro = 'abertas' | 'vencidas' | 'semana' | 'pagas' | 'canceladas' | 'todas'

const TEXTOS = {
  receber: { titulo: 'Contas a receber', sub: 'Vendas a prazo, OS com valor em aberto e outros valores a receber', acao: 'Receber', feito: 'Recebido', pessoa: 'Cliente', mes: 'Recebido no mês' },
  pagar: { titulo: 'Contas a pagar', sub: 'Fornecedores e despesas da empresa', acao: 'Pagar', feito: 'Pago', pessoa: 'Fornecedor', mes: 'Pago no mês' }
}

const emDias = (n: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Contas({ tipo }: { tipo: Tipo }) {
  const db = useDb()
  const { contas, clientes, fornecedores, vendas, compras, ordensServico } = db
  const { pode } = useAuth()
  const notificar = useToast()
  const t = TEXTOS[tipo]
  const hoje = fmt.hojeIso()
  const [params, setParams] = useSearchParams()
  const filtro = (params.get('filtro') as Filtro) || 'abertas'
  const setFiltro = (f: Filtro): void => setParams(f === 'abertas' ? {} : { filtro: f }, { replace: true })
  const [busca, setBusca] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [editando, setEditando] = useState<Conta | null | 'nova'>(null)
  const [baixando, setBaixando] = useState<Linha | null>(null)
  const [detalhe, setDetalhe] = useState<number | null>(null)
  const [selecao, setSelecao] = useState<Set<string | number>>(new Set())

  const pessoa = (l: Linha): string => {
    if (l.os) return clientes.find((c) => c.id === l.os.clienteId)?.nome ?? '—'
    const c = l.conta
    if (c.clienteId) return clientes.find((x) => x.id === c.clienteId)?.nome ?? '—'
    if (c.fornecedorId) {
      const f = fornecedores.find((x) => x.id === c.fornecedorId)
      return f ? f.nomeFantasia || f.razaoSocial : '—'
    }
    return '—'
  }
  const origem = (l: Linha): string => {
    if (l.os) return `OS ${l.os.numero}`
    if (l.conta.vendaId) return `Venda ${vendas.find((v) => v.id === l.conta.vendaId)?.numero ?? ''}`
    if (l.conta.compraId) return `Compra ${compras.find((c) => c.id === l.conta.compraId)?.numero ?? ''}`
    return l.conta.categoria
  }
  const vencimento = (l: Linha): string => (l.os ? (l.os.entregueEm ?? l.os.dataEntrada).slice(0, 10) : l.conta.vencimento)
  const saldo = (l: Linha): number => (l.os ? saldoOS(l.os) : saldoConta(l.conta))
  const valor = (l: Linha): number => (l.os ? saldoOS(l.os) + l.os.pagamentos.filter((p) => !p.estornado).reduce((s, p) => s + p.valor, 0) : l.conta.valor)
  const situacao = (l: Linha): SituacaoConta => (l.os ? (vencimento(l) < hoje ? 'vencida' : 'vence_hoje') : situacaoConta(l.conta, hoje))

  const todas = useMemo<Linha[]>(() => {
    const lista: Linha[] = contas.filter((c) => c.tipo === tipo).map((c) => ({ chave: `c${c.id}`, conta: c }))
    // OS entregues com valor a receber entram aqui também (o recebimento continua sendo o da OS).
    if (tipo === 'receber') for (const o of ordensServico) if (o.status === 'entregue' && saldoOS(o) > 0) lista.push({ chave: `o${o.id}`, os: o })
    return lista
  }, [contas, ordensServico, tipo])

  const lista = useMemo(() => {
    const ate7 = emDias(7)
    return todas
      .filter((l) => {
        const s = situacao(l)
        const aberta = s !== 'paga' && s !== 'cancelada'
        if (filtro === 'abertas' && !aberta) return false
        if (filtro === 'vencidas' && s !== 'vencida' && !(tipo === 'pagar' && s === 'vence_hoje')) return false
        if (filtro === 'semana' && !(aberta && vencimento(l) <= ate7)) return false
        if (filtro === 'pagas' && s !== 'paga') return false
        if (filtro === 'canceladas' && s !== 'cancelada') return false
        if (de && vencimento(l) < de) return false
        if (ate && vencimento(l) > ate) return false
        if (busca && ![l.os ? `OS ${l.os.numero}` : descreverConta(l.conta), pessoa(l), origem(l)].some((x) => fmt.contem(x, busca))) return false
        return true
      })
      .sort((a, b) => vencimento(a).localeCompare(vencimento(b)))
  }, [todas, filtro, busca, de, ate, clientes, fornecedores]) // eslint-disable-line react-hooks/exhaustive-deps

  const resumo = useMemo(() => {
    const abertas = todas.filter((l) => saldo(l) > 0)
    const mes = hoje.slice(0, 7)
    const noMes = contas
      .filter((c) => c.tipo === tipo)
      .flatMap((c) => c.baixas)
      .filter((b) => !b.estornada && b.em.startsWith(mes))
      .reduce((s, b) => s + b.valor + b.juros - b.desconto, 0)
    return {
      aberto: abertas.reduce((s, l) => s + saldo(l), 0),
      vencidas: abertas.filter((l) => situacao(l) === 'vencida'),
      semana: abertas.filter((l) => vencimento(l) <= emDias(7)),
      noMes
    }
  }, [todas, contas, tipo, hoje]) // eslint-disable-line react-hooks/exhaustive-deps

  function exportar(itens: Linha[] = lista): void {
    void exportarExcel(
      {
        nome: t.titulo,
        colunas: [
          { titulo: 'Vencimento', formato: 'data' },
          { titulo: 'Descrição' },
          { titulo: 'Origem' },
          { titulo: t.pessoa },
          { titulo: 'Valor', formato: 'moeda' },
          { titulo: t.feito, formato: 'moeda' },
          { titulo: 'Saldo', formato: 'moeda' },
          { titulo: 'Situação' }
        ],
        linhas: itens.map((l) => [
          vencimento(l),
          l.os ? `OS ${l.os.numero}` : descreverConta(l.conta),
          origem(l),
          pessoa(l),
          valor(l),
          l.os ? valor(l) - saldo(l) : pagoConta(l.conta),
          saldo(l),
          rotuloSituacaoConta[situacao(l)]
        ])
      },
      `${tipo === 'receber' ? 'contas-a-receber' : 'contas-a-pagar'}_${hoje}`,
      notificar
    )
  }

  const colunas: Coluna<Linha>[] = [
    {
      chave: 'vencimento',
      titulo: 'Vencimento',
      render: (l) => <span className={`whitespace-nowrap tabular-nums ${situacao(l) === 'vencida' ? 'font-semibold text-red-600' : ''}`}>{fmt.data(vencimento(l))}</span>
    },
    {
      chave: 'descricao',
      titulo: 'Descrição',
      render: (l) => (
        <div className="min-w-0">
          {l.os ? (
            <p className="font-medium text-slate-800">OS {l.os.numero} — entregue com valor em aberto</p>
          ) : (
            <button className="text-left font-medium text-blue-700 hover:underline" onClick={() => setDetalhe(l.conta.id)}>
              {descreverConta(l.conta)}
            </button>
          )}
          <p className="text-xs text-slate-500">{origem(l)}</p>
        </div>
      )
    },
    { chave: 'pessoa', titulo: t.pessoa, render: (l) => pessoa(l) },
    { chave: 'valor', titulo: 'Valor', alinhar: 'direita', render: (l) => <span className="tabular-nums">{fmt.moeda(valor(l))}</span> },
    { chave: 'saldo', titulo: 'Saldo', alinhar: 'direita', render: (l) => <span className="font-semibold tabular-nums">{fmt.moeda(saldo(l))}</span> },
    { chave: 'situacao', titulo: 'Situação', render: (l) => <Badge cor={corSituacaoConta[situacao(l)]}>{rotuloSituacaoConta[situacao(l)]}</Badge> },
    {
      chave: 'acoes',
      titulo: 'Ações',
      alinhar: 'direita',
      render: (l) => (
        <AcoesLinha
          extra={
            <>
              {saldo(l) > 0 && (l.os ? pode('osEditar') : pode('financeiroEditar')) && <BotaoAcao icone={HandCoins} texto={t.acao} onClick={() => setBaixando(l)} />}
              {l.conta && <BotaoAcao icone={iconeFicha} texto="Detalhes" onClick={() => setDetalhe(l.conta.id)} />}
            </>
          }
        />
      )
    }
  ]

  const cartoes: { f: Filtro; titulo: string; valor: string; detalhe: string; cor: string }[] = [
    { f: 'abertas', titulo: 'Em aberto', valor: fmt.moeda(resumo.aberto), detalhe: `${todas.filter((l) => saldo(l) > 0).length} conta(s)`, cor: 'text-slate-900' },
    {
      f: 'vencidas',
      titulo: 'Vencidas',
      valor: fmt.moeda(resumo.vencidas.reduce((s, l) => s + saldo(l), 0)),
      detalhe: `${resumo.vencidas.length} conta(s)`,
      cor: resumo.vencidas.length ? 'text-red-600' : 'text-slate-500'
    },
    { f: 'semana', titulo: 'Vencem em 7 dias', valor: fmt.moeda(resumo.semana.reduce((s, l) => s + saldo(l), 0)), detalhe: `${resumo.semana.length} conta(s)`, cor: 'text-amber-700' },
    { f: 'pagas', titulo: t.mes, valor: fmt.moeda(resumo.noMes), detalhe: 'Pagamentos registrados neste mês', cor: 'text-emerald-700' }
  ]
  const escolhidas = lista.filter((l) => selecao.has(l.chave))
  const contaDetalhe = detalhe ? contas.find((c) => c.id === detalhe) : undefined

  return (
    <>
      <PageHeader
        titulo={t.titulo}
        subtitulo={t.sub}
        acoes={
          <>
            <Button variante="secundario" icone={<FileSpreadsheet size={16} />} onClick={() => exportar()}>
              Excel
            </Button>
            {pode('financeiroEditar') && (
              <Button data-atalho="novo" icone={<Plus size={16} />} onClick={() => setEditando('nova')}>
                Nova conta
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartoes.map((c) => (
          <button
            key={c.f}
            onClick={() => setFiltro(filtro === c.f && c.f !== 'abertas' ? 'abertas' : c.f)}
            aria-pressed={filtro === c.f}
            className={`rounded-xl border bg-superficie px-4 py-3 text-left shadow-sm transition-colors hover:bg-slate-50 ${filtro === c.f ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}
          >
            <p className="text-xs font-medium text-slate-500">{c.titulo}</p>
            <p className={`text-xl font-bold tabular-nums ${c.cor}`}>{c.valor}</p>
            <p className="text-xs text-slate-400">{c.detalhe}</p>
          </button>
        ))}
      </div>

      <Filtros>
        <SearchInput className="w-72" placeholder={`Descrição, ${t.pessoa.toLowerCase()}, venda, compra...`} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select
          className="w-48"
          aria-label="Situação"
          opcoes={[
            { value: 'abertas', label: 'Em aberto' },
            { value: 'vencidas', label: 'Vencidas' },
            { value: 'semana', label: 'Vencem em 7 dias' },
            { value: 'pagas', label: tipo === 'receber' ? 'Recebidas' : 'Pagas' },
            { value: 'canceladas', label: 'Canceladas' },
            { value: 'todas', label: 'Todas' }
          ]}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as Filtro)}
        />
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>Vencimento de</span>
          <Input type="date" aria-label="Vencimento de" className="w-40" value={de} onChange={(e) => setDe(e.target.value)} />
          <span>até</span>
          <Input type="date" aria-label="Vencimento até" className="w-40" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <span className="ml-auto text-sm text-slate-500">
          {lista.length} conta(s) · saldo {fmt.moeda(lista.reduce((s, l) => s + saldo(l), 0))}
        </span>
      </Filtros>

      <DataTable
        colunas={colunas}
        dados={lista}
        chave={(l) => l.chave}
        nomeItens="contas"
        vazio={filtro === 'abertas' ? `Nenhuma conta ${tipo === 'receber' ? 'a receber' : 'a pagar'} em aberto.` : 'Nenhuma conta com esses filtros.'}
        selecionados={selecao}
        onSelecionar={setSelecao}
        rotuloLinha={(l) => (l.os ? `OS ${l.os.numero}` : descreverConta(l.conta))}
        acoesSelecao={<AcoesLote quantidade={escolhidas.length} nome={['conta', 'contas']} onExcel={() => exportar(escolhidas)} />}
      />

      {editando && <FormConta tipo={tipo} conta={editando === 'nova' ? null : editando} onFechar={() => setEditando(null)} />}
      {baixando && <BaixaModal tipo={tipo} linha={baixando} onFechar={() => setBaixando(null)} />}
      {contaDetalhe && (
        <DetalheConta
          conta={contaDetalhe}
          pessoa={pessoa({ chave: '', conta: contaDetalhe })}
          origem={origem({ chave: '', conta: contaDetalhe })}
          onFechar={() => setDetalhe(null)}
          onEditar={() => {
            setDetalhe(null)
            setEditando(contaDetalhe)
          }}
          onBaixar={() => setBaixando({ chave: '', conta: contaDetalhe })}
        />
      )}
    </>
  )
}

// ---------- Formulário (nova conta em parcelas ou edição) ----------

function FormConta({ tipo, conta, onFechar }: { tipo: Tipo; conta: Conta | null; onFechar: () => void }) {
  const { clientes, fornecedores, compras, contas } = useDb()
  const notificar = useToast()
  const form = useForm(
    {
      tipo,
      descricao: conta?.descricao ?? '',
      categoria: conta?.categoria ?? (tipo === 'pagar' ? '' : 'Outros'),
      clienteId: conta?.clienteId ? String(conta.clienteId) : '',
      fornecedorId: conta?.fornecedorId ? String(conta.fornecedorId) : '',
      compraId: conta?.compraId ? String(conta.compraId) : '',
      valor: conta ? String(conta.valor) : '',
      vencimento: conta?.vencimento ?? emDias(30),
      parcelas: '1',
      observacao: conta?.observacao ?? ''
    },
    contaSchema
  )
  const v = form.values
  const parcelas = Math.max(1, Math.floor(Number(v.parcelas) || 1))
  const total = Number(v.valor) || 0
  const previa = !conta && parcelas > 1 && total > 0 && v.vencimento ? dividirParcelas(total, parcelas).map((x, i) => `${fmt.data(somarMeses(v.vencimento, i))}: ${fmt.moeda(x)}`) : []
  // Compras ainda sem conta a pagar (para lançar a conta da compra).
  const comprasLivres = compras.filter((c) => c.status !== 'cancelada' && (c.id === conta?.compraId || !contas.some((x) => x.compraId === c.id && x.status !== 'cancelada')))
  const daVenda = !!conta?.vendaId

  async function salvar(): Promise<void> {
    const dados = form.validate()
    if (!dados) return
    let lista: Conta[] = []
    const ok = await executar(async () => (lista = await alterar('contas:salvar', conta?.id ?? null, dados)), { notificar, form })
    if (ok) {
      notificar('sucesso', conta ? 'Conta atualizada.' : lista.length > 1 ? `${lista.length} parcelas lançadas.` : 'Conta lançada.')
      onFechar()
    }
  }

  return (
    <Modal
      aberto
      titulo={conta ? 'Editar conta' : tipo === 'receber' ? 'Nova conta a receber' : 'Nova conta a pagar'}
      onFechar={onFechar}
      tamanho="lg"
      rodape={
        <>
          <Button variante="secundario" onClick={onFechar}>
            Cancelar
          </Button>
          <Button icone={<Check size={16} />} onClick={() => void salvar()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        {tipo === 'pagar' && (
          <Select
            label="Compra (opcional)"
            wrapperClassName="col-span-2"
            placeholder="Conta avulsa (sem compra)"
            opcoes={[{ value: '', label: 'Conta avulsa (sem compra)' }, ...comprasLivres.map((c) => ({ value: c.id, label: `${c.numero} — ${fornecedores.find((f) => f.id === c.fornecedorId)?.razaoSocial ?? ''} — ${fmt.moeda(totalCompra(c))}` }))]}
            value={v.compraId}
            onChange={(e) => {
              form.set('compraId', e.target.value)
              const c = compras.find((x) => x.id === Number(e.target.value))
              if (c) {
                form.set('fornecedorId', String(c.fornecedorId))
                form.set('descricao', `Compra ${c.numero}`)
                form.set('categoria', 'Fornecedores')
                if (!conta) form.set('valor', String(Math.round(totalCompra(c) * 100) / 100))
              }
            }}
          />
        )}
        <Input label="Descrição" obrigatorio wrapperClassName="col-span-2" {...form.bind('descricao')} />
        {tipo === 'receber' ? (
          <Select
            label="Cliente"
            obrigatorio
            placeholder="Selecione o cliente..."
            disabled={daVenda}
            opcoes={clientes.filter((c) => c.ativo || c.id === conta?.clienteId).map((c) => ({ value: c.id, label: c.nome }))}
            {...form.bind('clienteId')}
          />
        ) : (
          <Select
            label="Fornecedor"
            placeholder="(nenhum)"
            opcoes={[{ value: '', label: '(nenhum)' }, ...fornecedores.filter((f) => f.ativo || f.id === conta?.fornecedorId).map((f) => ({ value: f.id, label: f.nomeFantasia || f.razaoSocial }))]}
            {...form.bind('fornecedorId')}
          />
        )}
        <Input label="Categoria" list="categorias-conta" {...form.bind('categoria')} />
        <datalist id="categorias-conta">
          {(tipo === 'pagar' ? CATEGORIAS_PAGAR : CATEGORIAS_RECEBER).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <InputMoeda label={!conta && parcelas > 1 ? 'Valor total' : 'Valor'} obrigatorio {...form.bind('valor')} />
        <Input label={!conta && parcelas > 1 ? '1º vencimento' : 'Vencimento'} obrigatorio type="date" {...form.bind('vencimento')} />
        {!conta && <Input label="Parcelas (mensais)" type="number" min="1" max="48" {...form.bind('parcelas')} />}
        <Textarea label="Observação" wrapperClassName="col-span-2" {...form.bind('observacao')} />
      </div>
      {daVenda && <p className="mt-2 text-xs text-slate-500">Parcela de venda a prazo: o valor e o cliente vêm da venda; dá para mudar o vencimento.</p>}
      {previa.length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
          <p className="mb-1 font-medium text-slate-700">{parcelas} parcelas mensais:</p>
          <p className="text-slate-600">{previa.join(' · ')}</p>
        </div>
      )}
    </Modal>
  )
}

// ---------- Receber / pagar ----------

function BaixaModal({ tipo, linha, onFechar }: { tipo: Tipo; linha: Linha; onFechar: () => void }) {
  const notificar = useToast()
  const saldo = linha.os ? saldoOS(linha.os) : saldoConta(linha.conta)
  const [valor, setValor] = useState(String(saldo))
  const [forma, setForma] = useState<Exclude<FormaPagamento, 'prazo'> | ''>('')
  const [juros, setJuros] = useState('')
  const [desconto, setDesconto] = useState('')
  const [erro, setErro] = useState('')
  const v = Number(valor) || 0
  const liquido = v + (Number(juros) || 0) - (Number(desconto) || 0)
  const titulo = linha.os ? `OS ${linha.os.numero}` : descreverConta(linha.conta)

  async function confirmar(): Promise<void> {
    if (!forma) return setErro('Escolha a forma de pagamento.')
    if (v <= 0) return setErro('Informe o valor.')
    if (v > saldo + 0.005) return setErro(`O valor passa do saldo (${fmt.moeda(saldo)}).`)
    const acao = linha.os
      ? () => alterar('os:receber', linha.os.id, [{ forma, valor: v }])
      : () => alterar('contas:baixar', linha.conta.id, { valor: v, juros: Number(juros) || 0, desconto: Number(desconto) || 0, forma })
    const ok = await executar(acao, { notificar, sucesso: `${tipo === 'receber' ? 'Recebido' : 'Pago'} ${fmt.moeda(liquido)} — ${titulo}.` })
    if (ok) onFechar()
  }

  return (
    <Modal
      aberto
      titulo={`${tipo === 'receber' ? 'Receber' : 'Pagar'} — ${titulo}`}
      onFechar={onFechar}
      tamanho="sm"
      rodape={
        <>
          <Button variante="secundario" onClick={onFechar}>
            Cancelar
          </Button>
          <Button icone={<HandCoins size={16} />} onClick={() => void confirmar()}>
            {tipo === 'receber' ? 'Confirmar recebimento' : 'Confirmar pagamento'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Saldo: <strong>{fmt.moeda(saldo)}</strong>. Pode ser um valor menor (pagamento parcial).
        </p>
        <InputMoeda label={linha.os ? 'Valor' : 'Valor (abate da conta)'} value={valor} onChange={(e) => (setValor(e.target.value), setErro(''))} />
        <Select
          label="Forma de pagamento"
          placeholder="Escolha..."
          opcoes={FORMAS_RECEBIMENTO.map((f) => ({ value: f, label: rotuloFormaPagamento[f] }))}
          value={forma}
          onChange={(e) => (setForma(e.target.value as Exclude<FormaPagamento, 'prazo'>), setErro(''))}
        />
        {!linha.os && (
          <div className="grid grid-cols-2 gap-3">
            <InputMoeda label="Juros / multa" value={juros} onChange={(e) => setJuros(e.target.value)} />
            <InputMoeda label="Desconto" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
          </div>
        )}
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-right text-sm">
          {tipo === 'receber' ? 'Valor recebido' : 'Valor pago'}: <strong className="text-base tabular-nums">{fmt.moeda(liquido)}</strong>
        </p>
        <p className="text-xs text-slate-500">
          {tipo === 'receber' ? 'Com o caixa aberto, o recebimento entra no caixa.' : 'Pagamento em dinheiro sai do caixa aberto; nas outras formas, não mexe no caixa.'}
        </p>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </div>
    </Modal>
  )
}

// ---------- Detalhes: pagamentos, estorno, edição e cancelamento ----------

function DetalheConta({ conta: c, pessoa, origem, onFechar, onEditar, onBaixar }: { conta: Conta; pessoa: string; origem: string; onFechar: () => void; onEditar: () => void; onBaixar: () => void }) {
  const { pode } = useAuth()
  const notificar = useToast()
  const [estornando, setEstornando] = useState<number | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  useEffect(() => setMotivo(''), [estornando, cancelando])
  const s = situacaoConta(c)
  const temPagamento = c.baixas.some((b) => !b.estornada)

  async function estornar(id: number): Promise<void> {
    if (motivo.trim().length < 3) return notificar('aviso', 'Informe o motivo do estorno.')
    const ok = await executar(() => alterar('contas:estornarBaixa', c.id, id, motivo), { notificar, sucesso: 'Pagamento estornado.' })
    if (ok) setEstornando(null)
  }
  async function cancelar(): Promise<void> {
    if (motivo.trim().length < 3) return notificar('aviso', 'Informe o motivo do cancelamento.')
    const ok = await executar(() => alterar('contas:cancelar', c.id, motivo), { notificar, sucesso: 'Conta cancelada.' })
    if (ok) setCancelando(false)
  }

  return (
    <Modal
      aberto
      titulo={descreverConta(c)}
      onFechar={onFechar}
      tamanho="lg"
      rodape={
        <>
          {c.status === 'aberta' && !temPagamento && !c.vendaId && pode('financeiroExcluir') && (
            <Button variante="perigo" icone={<Ban size={16} />} className="mr-auto" onClick={() => setCancelando(true)}>
              Cancelar conta
            </Button>
          )}
          {c.status === 'aberta' && !temPagamento && pode('financeiroEditar') && (
            <Button variante="secundario" icone={<Pencil size={16} />} onClick={onEditar}>
              Editar
            </Button>
          )}
          {saldoConta(c) > 0 && pode('financeiroEditar') && (
            <Button icone={<HandCoins size={16} />} onClick={onBaixar}>
              {c.tipo === 'receber' ? 'Receber' : 'Pagar'}
            </Button>
          )}
          <Button variante="secundario" onClick={onFechar}>
            Fechar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <Campo rotulo={c.tipo === 'receber' ? 'Cliente' : 'Fornecedor'} valor={pessoa} />
        <Campo rotulo="Origem" valor={origem || '—'} />
        <Campo rotulo="Vencimento" valor={fmt.data(c.vencimento)} />
        <div>
          <p className="text-xs text-slate-500">Situação</p>
          <Badge cor={corSituacaoConta[s]}>{rotuloSituacaoConta[s]}</Badge>
        </div>
        <Campo rotulo="Valor" valor={fmt.moeda(c.valor)} />
        <Campo rotulo={c.tipo === 'receber' ? 'Recebido' : 'Pago'} valor={fmt.moeda(pagoConta(c))} />
        <Campo rotulo="Saldo" valor={fmt.moeda(saldoConta(c))} />
        <Campo rotulo="Categoria" valor={c.categoria || '—'} />
      </div>
      {c.observacao && <p className="mt-3 text-sm text-slate-600">Observação: {c.observacao}</p>}
      {c.status === 'cancelada' && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">Cancelada: {c.motivoCancelamento}</p>}

      <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-800">{c.tipo === 'receber' ? 'Recebimentos' : 'Pagamentos'}</h3>
      {c.baixas.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum ainda.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {c.baixas.map((b) => (
            <li key={b.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className={b.estornada ? 'text-slate-400 line-through' : 'text-slate-700'}>
                  {fmt.dataHora(b.em)} · {rotuloFormaPagamento[b.forma]} · {b.usuario}
                  {(b.juros > 0 || b.desconto > 0) && (
                    <span className="ml-1 text-xs text-slate-500">
                      ({[b.juros ? `juros ${fmt.moeda(b.juros)}` : '', b.desconto ? `desconto ${fmt.moeda(b.desconto)}` : ''].filter(Boolean).join(', ')})
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span className={`font-medium tabular-nums ${b.estornada ? 'text-slate-400 line-through' : ''}`}>{fmt.moeda(b.valor)}</span>
                  {!b.estornada && c.status !== 'cancelada' && pode('financeiroEditar') && estornando !== b.id && (
                    <button className="text-xs font-medium text-red-600 hover:underline" onClick={() => setEstornando(b.id)}>
                      Estornar
                    </button>
                  )}
                </span>
              </div>
              {b.estornada && <p className="text-xs text-slate-500">Estornado: {b.motivoEstorno}</p>}
              {estornando === b.id && (
                <div className="mt-1.5 flex items-center gap-2">
                  <Input aria-label="Motivo do estorno" className="h-8 min-w-0 flex-1" placeholder="Motivo do estorno" value={motivo} autoFocus onChange={(e) => setMotivo(e.target.value)} />
                  <Button tamanho="sm" variante="perigo" icone={<Undo2 size={13} />} onClick={() => void estornar(b.id)}>
                    Estornar
                  </Button>
                  <Button tamanho="sm" variante="fantasma" onClick={() => setEstornando(null)}>
                    Voltar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {cancelando && (
        <div className="mt-4 space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
          <p className="text-sm text-red-800">A conta fica registrada como cancelada (não é apagada).</p>
          <Input label="Motivo do cancelamento" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button tamanho="sm" variante="secundario" onClick={() => setCancelando(false)}>
              Voltar
            </Button>
            <Button tamanho="sm" variante="perigo" onClick={() => void cancelar()}>
              Confirmar cancelamento
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{rotulo}</p>
      <p className="font-medium text-slate-800">{valor}</p>
    </div>
  )
}

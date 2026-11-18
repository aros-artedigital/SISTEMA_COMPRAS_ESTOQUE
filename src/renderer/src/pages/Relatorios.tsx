import { useMemo, useState } from 'react'
import { useDb } from '@/data/store'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { DataTable, type Coluna } from '@/components/DataTable'
import { BarraSaida } from '@/components/BarraSaida'
import { Checkbox, Input, Select } from '@/components/ui'
import { alinhadoADireita, formatar, type Relatorio, type Valor } from '@/lib/relatorio'
import { relatorioExcel, relatorioImprimir, relatorioPdf } from '@/lib/saida'
import {
  descreverEquipamento,
  diasDeConserto,
  pagoOS,
  rotuloTipoPagamentoOS,
  totalOS,
  totalPecasOS,
  totalServicosOS,
  recebidaEmParte,
  rotuloFormaPagamento, rotuloStatusCompra, rotuloTipoMov, situacaoEstoque, subtotalVenda, totalCompra, totalVenda } from '@shared/dominio'
import * as fmt from '@shared/format'
import { calcularSugestao } from '@shared/sugestaoCompra'
import type { FormaPagamento, OrdemServico, StatusCompra, TipoMovimentacao } from '@shared/tipos'

type Aba = 'vendas' | 'os' | 'estoque' | 'reposicao' | 'compras' | 'movimentacoes'

const abas: { id: Aba; titulo: string; descricao: string }[] = [
  { id: 'vendas', titulo: 'Vendas', descricao: 'Por venda, por cliente ou por produto' },
  { id: 'os', titulo: 'Ordens de serviço', descricao: 'Serviços, técnicos, peças e recebimentos' },
  { id: 'estoque', titulo: 'Posição de estoque', descricao: 'Saldo e valor de cada produto' },
  { id: 'reposicao', titulo: 'Sugestão de compra', descricao: 'Produtos no mínimo ou abaixo dele' },
  { id: 'compras', titulo: 'Compras', descricao: 'Compras por período, fornecedor e status' },
  { id: 'movimentacoes', titulo: 'Movimentações', descricao: 'Entradas, saídas e ajustes no período' }
]

const inicioDoAno = (): string => `${new Date().getFullYear()}-01-01`
const inicioDoMes = (): string => fmt.hojeIso().slice(0, 8) + '01'

export default function Relatorios() {
  const [aba, setAba] = useState<Aba>('vendas')
  const { pode } = useAuth()
  return (
    <>
      <PageHeader titulo="Relatórios" subtitulo="Consulte, exporte para Excel, salve em PDF ou imprima" />
      <div className="mb-5 flex gap-1 rounded-xl border border-slate-200 bg-superficie p-1 shadow-sm" role="tablist">
        {abas.filter((a) => a.id !== 'os' || pode('os')).map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={`flex-1 rounded-lg px-4 py-2.5 text-left transition-colors ${aba === a.id ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <span className="block text-sm font-semibold">{a.titulo}</span>
            <span className={`block text-xs ${aba === a.id ? 'text-blue-100' : 'text-slate-400'}`}>{a.descricao}</span>
          </button>
        ))}
      </div>
      {aba === 'vendas' && <RelatorioVendas />}
      {aba === 'os' && <RelatorioOS />}
      {aba === 'estoque' && <PosicaoEstoque />}
      {aba === 'reposicao' && <SugestaoCompra />}
      {aba === 'compras' && <RelatorioCompras />}
      {aba === 'movimentacoes' && <RelatorioMovimentacoes />}
    </>
  )
}

/** Tabela na tela + botões de saída para qualquer relatório. */
function Visualizacao({ relatorio, arquivo, filtros }: { relatorio: Relatorio; arquivo: string; filtros: React.ReactNode }) {
  const { configuracoes } = useDb()
  const notificar = useToast()
  const empresa = configuracoes.nomeEmpresa
  const nome = `${arquivo}_${fmt.hojeIso()}`

  const colunas: Coluna<{ i: number; v: Valor[] }>[] = relatorio.colunas.map((c, idx) => ({
    chave: String(idx),
    titulo: c.titulo,
    alinhar: alinhadoADireita(c.formato) ? 'direita' : 'esquerda',
    render: (l) => <span className={alinhadoADireita(c.formato) ? 'tabular-nums' : ''}>{formatar(l.v[idx], c.formato)}</span>
  }))

  return (
    <>
      <Filtros>
        {filtros}
        <div className="ml-auto">
          <BarraSaida
            onExcel={() => relatorioExcel(relatorio, nome, notificar)}
            onPdf={() => relatorioPdf(relatorio, empresa, nome, notificar)}
            onImprimir={() => relatorioImprimir(relatorio, empresa, notificar)}
          />
        </div>
      </Filtros>

      {relatorio.resumo && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {relatorio.resumo.map((r) => (
            <div key={r.rotulo} className="rounded-xl border border-slate-200 bg-superficie px-4 py-3 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{r.rotulo}</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{r.valor}</p>
            </div>
          ))}
        </div>
      )}

      <DataTable colunas={colunas} dados={relatorio.linhas.map((v, i) => ({ i, v }))} chave={(l) => l.i} porPagina={15} vazio="Nenhum registro para os filtros selecionados." />
      {relatorio.totais && relatorio.linhas.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-end gap-x-6 gap-y-1 rounded-lg bg-slate-100 px-4 py-2 text-sm">
          {relatorio.colunas.map((c, i) =>
            relatorio.totais![i] !== null && i > 0 ? (
              <span key={i}>
                <span className="text-slate-500">{c.titulo}: </span>
                <strong className="tabular-nums text-slate-800">{formatar(relatorio.totais![i], c.formato)}</strong>
              </span>
            ) : null
          )}
        </div>
      )}
    </>
  )
}

// ---------- Posição de estoque ----------

function PosicaoEstoque() {
  const { produtos, categorias, unidades } = useDb()
  const [categoria, setCategoria] = useState('')
  const [situacao, setSituacao] = useState('')
  const [incluirInativos, setIncluirInativos] = useState(false)

  const relatorio = useMemo<Relatorio>(() => {
    const lista = produtos
      .filter((p) => (incluirInativos || p.ativo) && (!categoria || p.categoriaId === Number(categoria)) && (!situacao || situacaoEstoque(p) === situacao))
      .sort((a, b) => a.nome.localeCompare(b.nome))
    const nomeCat = (id: number): string => categorias.find((c) => c.id === id)?.nome ?? ''
    const sigla = (id: number): string => unidades.find((u) => u.id === id)?.sigla ?? ''
    const valorCusto = lista.reduce((s, p) => s + p.estoque * p.precoCusto, 0)
    const valorVenda = lista.reduce((s, p) => s + p.estoque * p.precoVenda, 0)
    const unidadesTotal = lista.reduce((s, p) => s + p.estoque, 0)
    return {
      titulo: 'Posição de estoque',
      filtros: [
        categoria ? `Categoria: ${nomeCat(Number(categoria))}` : 'Todas as categorias',
        situacao ? `Situação: ${{ ok: 'normal', baixo: 'estoque baixo', zerado: 'sem estoque' }[situacao]}` : 'Todas as situações',
        incluirInativos ? 'Inclui inativos' : 'Somente ativos'
      ],
      colunas: [
        { titulo: 'Código', peso: 0.8 },
        { titulo: 'Produto', peso: 2.4 },
        { titulo: 'Categoria', peso: 1.3 },
        { titulo: 'Un.', peso: 0.5 },
        { titulo: 'Estoque', formato: 'numero', peso: 0.8 },
        { titulo: 'Mínimo', formato: 'numero', peso: 0.8 },
        { titulo: 'Custo unit.', formato: 'moeda', peso: 1 },
        { titulo: 'Valor (custo)', formato: 'moeda', peso: 1.1 },
        { titulo: 'Preço venda', formato: 'moeda', peso: 1 }
      ],
      linhas: lista.map((p) => [p.codigo, p.nome, nomeCat(p.categoriaId), sigla(p.unidadeId), p.estoque, p.estoqueMinimo, p.precoCusto, p.estoque * p.precoCusto, p.precoVenda]),
      totais: ['Total', null, null, null, unidadesTotal, null, null, valorCusto, null],
      resumo: [
        { rotulo: 'Produtos', valor: fmt.numero(lista.length) },
        { rotulo: 'Unidades em estoque', valor: fmt.numero(unidadesTotal) },
        { rotulo: 'Valor a preço de custo', valor: fmt.moeda(valorCusto) },
        { rotulo: 'Valor a preço de venda', valor: fmt.moeda(valorVenda) }
      ]
    }
  }, [produtos, categorias, unidades, categoria, situacao, incluirInativos])

  return (
    <Visualizacao
      relatorio={relatorio}
      arquivo="posicao-estoque"
      filtros={
        <>
          <Select className="w-48" placeholder="Todas as categorias" opcoes={categorias.map((c) => ({ value: c.id, label: c.nome }))} value={categoria} onChange={(e) => setCategoria(e.target.value)} />
          <Select
            className="w-52"
            placeholder="Todas as situações"
            opcoes={[
              { value: 'ok', label: 'Normal' },
              { value: 'baixo', label: 'Estoque baixo' },
              { value: 'zerado', label: 'Sem estoque' }
            ]}
            value={situacao}
            onChange={(e) => setSituacao(e.target.value)}
          />
          <Checkbox label="Incluir inativos" checked={incluirInativos} onChange={setIncluirInativos} />
        </>
      }
    />
  )
}

// ---------- Sugestão de compra ----------

function SugestaoCompra() {
  const db = useDb()
  const { fornecedores, unidades } = db
  const [diasConsumo, setDiasConsumo] = useState('90')
  const [diasCobertura, setDiasCobertura] = useState('30')

  const relatorio = useMemo<Relatorio>(() => {
    const lista = calcularSugestao(db, { diasConsumo: Number(diasConsumo), diasCobertura: Number(diasCobertura), somenteAbaixoMinimo: true })
    const forn = (id: number | null): string => (id ? (fornecedores.find((f) => f.id === id)?.nomeFantasia || fornecedores.find((f) => f.id === id)?.razaoSocial || '') : '')
    const total = lista.reduce((s, x) => s + x.sugerido * x.custo, 0)
    return {
      titulo: 'Sugestão de compra',
      filtros: [
        `Consumo dos últimos ${diasConsumo} dias, compra para ${diasCobertura} dias`,
        'Comprar = mínimo + consumo × dias − estoque − já pedido',
        'Custo de referência: última compra (ou custo cadastrado)'
      ],
      colunas: [
        { titulo: 'Código', peso: 0.8 },
        { titulo: 'Produto', peso: 2.2 },
        { titulo: 'Un.', peso: 0.5 },
        { titulo: 'Estoque', formato: 'numero', peso: 0.8 },
        { titulo: 'Mínimo', formato: 'numero', peso: 0.8 },
        { titulo: 'Consumo/dia', formato: 'numero', peso: 0.9 },
        { titulo: 'Já pedido', formato: 'numero', peso: 0.8 },
        { titulo: 'Comprar', formato: 'numero', peso: 0.9 },
        { titulo: 'Custo ref.', formato: 'moeda', peso: 1 },
        { titulo: 'Subtotal', formato: 'moeda', peso: 1.1 },
        { titulo: 'Último fornecedor', peso: 1.5 }
      ],
      linhas: lista.map((x) => [
        x.produto.codigo,
        x.produto.nome,
        unidades.find((u) => u.id === x.produto.unidadeId)?.sigla ?? '',
        x.produto.estoque,
        x.produto.estoqueMinimo,
        x.consumoDiario,
        x.aCaminho,
        x.sugerido,
        x.custo,
        x.sugerido * x.custo,
        forn(x.fornecedorId)
      ]),
      totais: ['Total', null, null, null, null, null, null, lista.reduce((s, x) => s + x.sugerido, 0), null, total, null],
      resumo: [
        { rotulo: 'Produtos a repor', valor: fmt.numero(lista.length) },
        { rotulo: 'Sem estoque', valor: fmt.numero(lista.filter((x) => x.produto.estoque <= 0).length) },
        { rotulo: 'Investimento estimado', valor: fmt.moeda(total) },
        { rotulo: 'Para gerar os pedidos', valor: 'Compras → Sugerir compra' }
      ]
    }
  }, [db, fornecedores, unidades, diasConsumo, diasCobertura])

  return (
    <Visualizacao
      relatorio={relatorio}
      arquivo="sugestao-compra"
      filtros={
        <>
          <Select
            className="w-56"
            aria-label="Período de consumo"
            opcoes={[30, 60, 90, 180].map((n) => ({ value: n, label: `Consumo de ${n} dias` }))}
            value={diasConsumo}
            onChange={(e) => setDiasConsumo(e.target.value)}
          />
          <Select
            className="w-48"
            aria-label="Dias de cobertura"
            opcoes={[15, 30, 45, 60, 90].map((n) => ({ value: n, label: `Comprar para ${n} dias` }))}
            value={diasCobertura}
            onChange={(e) => setDiasCobertura(e.target.value)}
          />
        </>
      }
    />
  )
}

// ---------- Compras ----------

function RelatorioCompras() {
  const { compras, fornecedores } = useDb()
  const [de, setDe] = useState(inicioDoAno())
  const [ate, setAte] = useState(fmt.hojeIso())
  const [fornecedor, setFornecedor] = useState('')
  const [status, setStatus] = useState('')

  const relatorio = useMemo<Relatorio>(() => {
    const nomeF = (id: number): string => fornecedores.find((f) => f.id === id)?.nomeFantasia || fornecedores.find((f) => f.id === id)?.razaoSocial || ''
    const lista = compras
      .filter((c) => (!de || c.data >= de) && (!ate || c.data <= ate) && (!fornecedor || c.fornecedorId === Number(fornecedor)) && (!status || c.status === status))
      .sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id)
    const validas = lista.filter((c) => c.status !== 'cancelada')
    const total = validas.reduce((s, c) => s + totalCompra(c), 0)
    const recebido = validas.filter((c) => c.status === 'recebida').reduce((s, c) => s + totalCompra(c), 0)
    return {
      titulo: 'Relatório de compras',
      filtros: [
        `Período: ${de ? fmt.data(de) : 'início'} a ${ate ? fmt.data(ate) : 'hoje'}`,
        fornecedor ? `Fornecedor: ${nomeF(Number(fornecedor))}` : 'Todos os fornecedores',
        status ? `Status: ${rotuloStatusCompra[status as StatusCompra]}` : 'Todos os status (total exclui canceladas)'
      ],
      colunas: [
        { titulo: 'Número', peso: 0.9 },
        { titulo: 'Data', formato: 'data', peso: 0.9 },
        { titulo: 'Fornecedor', peso: 2 },
        { titulo: 'Status', peso: 1.1 },
        { titulo: 'Itens', formato: 'numero', peso: 0.6 },
        { titulo: 'Total', formato: 'moeda', peso: 1.1 }
      ],
      linhas: lista.map((c) => [c.numero, c.data, nomeF(c.fornecedorId), recebidaEmParte(c) ? 'Recebida em parte' : rotuloStatusCompra[c.status], c.itens.length, totalCompra(c)]),
      totais: ['Total', null, null, null, null, total],
      resumo: [
        { rotulo: 'Compras', valor: fmt.numero(lista.length) },
        { rotulo: 'Valor total', valor: fmt.moeda(total) },
        { rotulo: 'Já recebido', valor: fmt.moeda(recebido) },
        { rotulo: 'Ticket médio', valor: fmt.moeda(validas.length ? total / validas.length : 0) }
      ]
    }
  }, [compras, fornecedores, de, ate, fornecedor, status])

  return (
    <Visualizacao
      relatorio={relatorio}
      arquivo="compras"
      filtros={
        <>
          <Periodo de={de} ate={ate} setDe={setDe} setAte={setAte} />
          <Select
            className="w-48"
            placeholder="Todos os fornecedores"
            opcoes={fornecedores.map((f) => ({ value: f.id, label: f.nomeFantasia || f.razaoSocial }))}
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
          />
          <Select
            className="w-40"
            placeholder="Todos os status"
            opcoes={(Object.keys(rotuloStatusCompra) as StatusCompra[]).map((s) => ({ value: s, label: rotuloStatusCompra[s] }))}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          />
        </>
      }
    />
  )
}

// ---------- Movimentações ----------

function RelatorioMovimentacoes() {
  const { movimentacoes, produtos, usuarios } = useDb()
  const [de, setDe] = useState(inicioDoMes())
  const [ate, setAte] = useState(fmt.hojeIso())
  const [tipo, setTipo] = useState('')
  const [produto, setProduto] = useState('')

  const relatorio = useMemo<Relatorio>(() => {
    const lista = movimentacoes
      .filter(
        (m) =>
          (!de || m.data.slice(0, 10) >= de) &&
          (!ate || m.data.slice(0, 10) <= ate) &&
          (!tipo || m.tipo === tipo) &&
          (!produto || m.produtoId === Number(produto))
      )
      .sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id)
    const p = (id: number) => produtos.find((x) => x.id === id)
    const soma = (t: TipoMovimentacao): number => lista.filter((m) => m.tipo === t).reduce((s, m) => s + m.quantidade, 0)
    return {
      titulo: 'Movimentações de estoque',
      filtros: [
        `Período: ${de ? fmt.data(de) : 'início'} a ${ate ? fmt.data(ate) : 'hoje'}`,
        tipo ? `Tipo: ${rotuloTipoMov[tipo as TipoMovimentacao]}` : 'Todos os tipos',
        produto ? `Produto: ${p(Number(produto))?.nome ?? ''}` : 'Todos os produtos'
      ],
      colunas: [
        { titulo: 'Data', formato: 'dataHora', peso: 1.2 },
        { titulo: 'Código', peso: 0.8 },
        { titulo: 'Produto', peso: 2 },
        { titulo: 'Tipo', peso: 0.8 },
        { titulo: 'Qtd.', formato: 'numero', peso: 0.7 },
        { titulo: 'Saldo', formato: 'numero', peso: 0.7 },
        { titulo: 'Motivo', peso: 1.8 },
        { titulo: 'Usuário', peso: 1.2 }
      ],
      linhas: lista.map((m) => [
        m.data,
        p(m.produtoId)?.codigo ?? '',
        p(m.produtoId)?.nome ?? '',
        rotuloTipoMov[m.tipo],
        m.tipo === 'saida' ? -m.quantidade : m.quantidade,
        m.saldoApos,
        m.motivo,
        usuarios.find((u) => u.id === m.usuarioId)?.nome ?? ''
      ]),
      resumo: [
        { rotulo: 'Movimentações', valor: fmt.numero(lista.length) },
        { rotulo: 'Entradas (un.)', valor: fmt.numero(soma('entrada')) },
        { rotulo: 'Saídas (un.)', valor: fmt.numero(soma('saida')) },
        { rotulo: 'Ajustes (un.)', valor: fmt.numero(soma('ajuste')) }
      ]
    }
  }, [movimentacoes, produtos, usuarios, de, ate, tipo, produto])

  return (
    <Visualizacao
      relatorio={relatorio}
      arquivo="movimentacoes"
      filtros={
        <>
          <Periodo de={de} ate={ate} setDe={setDe} setAte={setAte} />
          <Select
            className="w-36"
            placeholder="Todos os tipos"
            opcoes={(['entrada', 'saida', 'ajuste'] as const).map((t) => ({ value: t, label: rotuloTipoMov[t] }))}
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          />
          <Select
            className="w-56"
            placeholder="Todos os produtos"
            opcoes={produtos.map((x) => ({ value: x.id, label: `${x.codigo} — ${x.nome}` }))}
            value={produto}
            onChange={(e) => setProduto(e.target.value)}
          />
        </>
      }
    />
  )
}

// ---------- Vendas ----------

function RelatorioVendas() {
  const { vendas, clientes, produtos } = useDb()
  const [de, setDe] = useState(inicioDoMes())
  const [ate, setAte] = useState(fmt.hojeIso())
  const [agrupar, setAgrupar] = useState<'venda' | 'cliente' | 'produto'>('venda')
  const [forma, setForma] = useState('')
  const [cliente, setCliente] = useState('')

  const relatorio = useMemo<Relatorio>(() => {
    const nomeCliente = (id: number | null): string => (id ? (clientes.find((c) => c.id === id)?.nome ?? '') : 'Consumidor final')
    // Canceladas não entram em nenhum total.
    const lista = vendas
      .filter(
        (v) =>
          v.status === 'concluida' &&
          (!de || v.data.slice(0, 10) >= de) &&
          (!ate || v.data.slice(0, 10) <= ate) &&
          (!forma || v.formaPagamento === forma) &&
          (!cliente || String(v.clienteId ?? 0) === cliente)
      )
      .sort((a, b) => a.data.localeCompare(b.data))
    const total = lista.reduce((s, v) => s + totalVenda(v), 0)
    const descontos = lista.reduce((s, v) => s + v.desconto, 0)
    const unidades = lista.reduce((s, v) => s + v.itens.reduce((x, i) => x + i.quantidade, 0), 0)
    const filtros = [
      `Período: ${de ? fmt.data(de) : 'início'} a ${ate ? fmt.data(ate) : 'hoje'}`,
      forma ? `Pagamento: ${rotuloFormaPagamento[forma as FormaPagamento]}` : 'Todas as formas de pagamento',
      cliente ? `Cliente: ${nomeCliente(Number(cliente) || null)}` : 'Todos os clientes',
      'Vendas canceladas não entram'
    ]
    const resumo = [
      { rotulo: 'Vendas', valor: fmt.numero(lista.length) },
      { rotulo: 'Faturamento', valor: fmt.moeda(total) },
      { rotulo: 'Ticket médio', valor: fmt.moeda(lista.length ? total / lista.length : 0) },
      { rotulo: 'Descontos dados', valor: fmt.moeda(descontos) }
    ]

    if (agrupar === 'cliente') {
      const grupos = new Map<string, { nome: string; vendas: number; total: number; ultima: string }>()
      for (const v of lista) {
        const chave = String(v.clienteId ?? 0)
        const g = grupos.get(chave) ?? { nome: nomeCliente(v.clienteId), vendas: 0, total: 0, ultima: '' }
        g.vendas++
        g.total += totalVenda(v)
        g.ultima = v.data > g.ultima ? v.data : g.ultima
        grupos.set(chave, g)
      }
      const linhas = [...grupos.values()].sort((a, b) => b.total - a.total)
      return {
        titulo: 'Vendas por cliente',
        filtros,
        resumo,
        colunas: [
          { titulo: 'Cliente', peso: 2.5 },
          { titulo: 'Vendas', formato: 'numero' },
          { titulo: 'Total', formato: 'moeda', peso: 1.2 },
          { titulo: 'Ticket médio', formato: 'moeda', peso: 1.2 },
          { titulo: 'Última compra', formato: 'data' }
        ],
        linhas: linhas.map((g) => [g.nome, g.vendas, g.total, g.total / g.vendas, g.ultima]),
        totais: ['Total', lista.length, total, null, null]
      }
    }

    if (agrupar === 'produto') {
      // Desconto da venda rateado entre os itens, proporcional ao valor de cada um.
      const grupos = new Map<number, { quantidade: number; total: number }>()
      for (const v of lista) {
        const fator = subtotalVenda(v) ? totalVenda(v) / subtotalVenda(v) : 0
        for (const i of v.itens) {
          const g = grupos.get(i.produtoId) ?? { quantidade: 0, total: 0 }
          g.quantidade += i.quantidade
          g.total += i.quantidade * i.valorUnitario * fator
          grupos.set(i.produtoId, g)
        }
      }
      const linhas = [...grupos.entries()].sort((a, b) => b[1].total - a[1].total)
      return {
        titulo: 'Produtos mais vendidos',
        filtros: [...filtros, 'Valores já com o desconto rateado'],
        resumo: [...resumo.slice(0, 2), { rotulo: 'Unidades vendidas', valor: fmt.numero(unidades) }, { rotulo: 'Produtos diferentes', valor: fmt.numero(grupos.size) }],
        colunas: [
          { titulo: 'Código', peso: 0.8 },
          { titulo: 'Produto', peso: 2.4 },
          { titulo: 'Quantidade', formato: 'numero' },
          { titulo: 'Total vendido', formato: 'moeda', peso: 1.2 },
          { titulo: 'Preço médio', formato: 'moeda' },
          { titulo: '% do faturamento', peso: 0.9 }
        ],
        linhas: linhas.map(([id, g]) => {
          const p = produtos.find((x) => x.id === id)
          return [p?.codigo ?? '', p?.nome ?? '', g.quantidade, g.total, g.total / g.quantidade, total ? `${((g.total / total) * 100).toFixed(1).replace('.', ',')}%` : '']
        }),
        totais: ['Total', null, unidades, total, null, null]
      }
    }

    return {
      titulo: 'Relatório de vendas',
      filtros,
      resumo,
      colunas: [
        { titulo: 'Número', peso: 0.9 },
        { titulo: 'Data', formato: 'dataHora', peso: 1.2 },
        { titulo: 'Cliente', peso: 2 },
        { titulo: 'Pagamento', peso: 1.1 },
        { titulo: 'Itens', formato: 'numero', peso: 0.6 },
        { titulo: 'Desconto', formato: 'moeda' },
        { titulo: 'Total', formato: 'moeda', peso: 1.1 }
      ],
      linhas: lista.map((v) => [v.numero, v.data, nomeCliente(v.clienteId), rotuloFormaPagamento[v.formaPagamento], v.itens.reduce((s, i) => s + i.quantidade, 0), v.desconto, totalVenda(v)]),
      totais: ['Total', null, null, null, unidades, descontos, total]
    }
  }, [vendas, clientes, produtos, de, ate, agrupar, forma, cliente])

  return (
    <Visualizacao
      relatorio={relatorio}
      arquivo={{ venda: 'vendas', cliente: 'vendas-por-cliente', produto: 'produtos-mais-vendidos' }[agrupar]}
      filtros={
        <>
          <Select
            className="w-44"
            opcoes={[
              { value: 'venda', label: 'Por venda' },
              { value: 'cliente', label: 'Por cliente' },
              { value: 'produto', label: 'Por produto' }
            ]}
            value={agrupar}
            onChange={(e) => setAgrupar(e.target.value as typeof agrupar)}
          />
          <Periodo de={de} ate={ate} setDe={setDe} setAte={setAte} />
          <Select
            className="w-44"
            placeholder="Todos os pagamentos"
            opcoes={(Object.keys(rotuloFormaPagamento) as FormaPagamento[]).map((f) => ({ value: f, label: rotuloFormaPagamento[f] }))}
            value={forma}
            onChange={(e) => setForma(e.target.value)}
          />
          <Select
            className="w-48"
            placeholder="Todos os clientes"
            opcoes={[{ value: '0', label: 'Consumidor final' }, ...clientes.map((c) => ({ value: c.id, label: c.nome }))]}
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
          />
        </>
      }
    />
  )
}

// ---------- Ordens de serviço ----------

type VisaoOS = 'os' | 'tecnico' | 'pecas' | 'recebimentos' | 'recusadas'

function RelatorioOS() {
  const { ordensServico, clientes, usuarios, produtos } = useDb()
  const [de, setDe] = useState(inicioDoMes())
  const [ate, setAte] = useState(fmt.hojeIso())
  const [visao, setVisao] = useState<VisaoOS>('os')

  const relatorio = useMemo<Relatorio>(() => {
    const noPeriodo = (iso: string | null | undefined): boolean => !!iso && (!de || iso.slice(0, 10) >= de) && (!ate || iso.slice(0, 10) <= ate)
    const nomeCliente = (id: number): string => clientes.find((c) => c.id === id)?.nome ?? ''
    const nomeTecnico = (id: number | null): string => (id ? (usuarios.find((u) => u.id === id)?.nome ?? '') : 'Sem técnico')
    const periodo = `Período: ${de ? fmt.data(de) : 'início'} a ${ate ? fmt.data(ate) : 'hoje'}`
    // Faturamento de serviços = OS entregues no período (pela data de entrega).
    const entregues = ordensServico.filter((o) => o.status === 'entregue' && noPeriodo(o.entregueEm)).sort((a, b) => (a.entregueEm ?? '').localeCompare(b.entregueEm ?? ''))
    const total = entregues.reduce((s, o) => s + totalOS(o), 0)
    const dias = entregues.map(diasDeConserto).filter((d): d is number => d !== null)
    const media = dias.length ? dias.reduce((s, d) => s + d, 0) / dias.length : 0
    const resumo = [
      { rotulo: 'OS entregues', valor: fmt.numero(entregues.length) },
      { rotulo: 'Faturamento', valor: fmt.moeda(total) },
      { rotulo: 'Ticket médio', valor: fmt.moeda(entregues.length ? total / entregues.length : 0) },
      { rotulo: 'Tempo médio de conserto', valor: `${media.toFixed(1).replace('.', ',')} dia(s)` }
    ]

    if (visao === 'tecnico') {
      const grupos = new Map<string, { nome: string; os: OrdemServico[] }>()
      for (const o of entregues) {
        const chave = String(o.tecnicoId ?? 0)
        const g = grupos.get(chave) ?? { nome: nomeTecnico(o.tecnicoId), os: [] }
        g.os.push(o)
        grupos.set(chave, g)
      }
      const linhas = [...grupos.values()]
        .map((g) => {
          const t = g.os.reduce((s, o) => s + totalOS(o), 0)
          const d = g.os.map(diasDeConserto).filter((x): x is number => x !== null)
          return { nome: g.nome, qtd: g.os.length, servicos: g.os.reduce((s, o) => s + totalServicosOS(o), 0), total: t, dias: d.length ? d.reduce((s, x) => s + x, 0) / d.length : 0 }
        })
        .sort((a, b) => b.total - a.total)
      return {
        titulo: 'Ordens de serviço por técnico',
        filtros: [periodo, 'OS entregues no período'],
        resumo,
        colunas: [
          { titulo: 'Técnico', peso: 2 },
          { titulo: 'OS entregues', formato: 'numero' },
          { titulo: 'Mão de obra', formato: 'moeda' },
          { titulo: 'Total', formato: 'moeda' },
          { titulo: 'Ticket médio', formato: 'moeda' },
          { titulo: 'Dias (média)', formato: 'numero' }
        ],
        linhas: linhas.map((g) => [g.nome, g.qtd, g.servicos, g.total, g.total / g.qtd, Math.round(g.dias * 10) / 10]),
        totais: ['Total', entregues.length, entregues.reduce((s, o) => s + totalServicosOS(o), 0), total, null, null]
      }
    }

    if (visao === 'pecas') {
      const grupos = new Map<number, { quantidade: number; total: number; os: number }>()
      for (const o of entregues) {
        for (const i of o.itens) {
          if (i.tipo !== 'peca' || i.produtoId === null) continue
          const g = grupos.get(i.produtoId) ?? { quantidade: 0, total: 0, os: 0 }
          g.quantidade += i.quantidade
          g.total += i.quantidade * i.valorUnitario
          g.os++
          grupos.set(i.produtoId, g)
        }
      }
      const linhas = [...grupos.entries()].sort((a, b) => b[1].quantidade - a[1].quantidade || b[1].total - a[1].total)
      const unidades = linhas.reduce((s, [, g]) => s + g.quantidade, 0)
      const valor = linhas.reduce((s, [, g]) => s + g.total, 0)
      return {
        titulo: 'Peças mais usadas nas OS',
        filtros: [periodo, 'OS entregues no período'],
        resumo: [resumo[0], { rotulo: 'Peças usadas', valor: fmt.numero(unidades) }, { rotulo: 'Valor em peças', valor: fmt.moeda(valor) }, { rotulo: 'Peças diferentes', valor: fmt.numero(linhas.length) }],
        colunas: [
          { titulo: 'Código', peso: 0.8 },
          { titulo: 'Peça', peso: 2.4 },
          { titulo: 'Quantidade', formato: 'numero' },
          { titulo: 'Em quantas OS', formato: 'numero' },
          { titulo: 'Valor cobrado', formato: 'moeda' }
        ],
        linhas: linhas.map(([id, g]) => {
          const p = produtos.find((x) => x.id === id)
          return [p?.codigo ?? '', p?.nome ?? '', g.quantidade, g.os, g.total]
        }),
        totais: ['Total', null, unidades, null, valor]
      }
    }

    if (visao === 'recebimentos') {
      // O que entrou no caixa pelas OS no período (pela data do pagamento), sem os estornados.
      const pagamentos = ordensServico
        .flatMap((o) => o.pagamentos.filter((p) => !p.estornado && noPeriodo(p.em)).map((p) => ({ o, p })))
        .sort((a, b) => a.p.em.localeCompare(b.p.em))
      const soma = pagamentos.reduce((s, { p }) => s + p.valor, 0)
      const porForma = new Map<FormaPagamento, number>()
      for (const { p } of pagamentos) porForma.set(p.forma, (porForma.get(p.forma) ?? 0) + p.valor)
      const principais = [...porForma.entries()].sort((a, b) => b[1] - a[1])
      return {
        titulo: 'Recebimentos das ordens de serviço',
        filtros: [periodo, 'Sinais e pagamentos pela data do recebimento; estornos não entram'],
        resumo: [
          { rotulo: 'Recebido', valor: fmt.moeda(soma) },
          { rotulo: 'Pagamentos', valor: fmt.numero(pagamentos.length) },
          ...principais.slice(0, 2).map(([f, v]) => ({ rotulo: rotuloFormaPagamento[f], valor: fmt.moeda(v) }))
        ],
        colunas: [
          { titulo: 'Data', formato: 'dataHora', peso: 1.2 },
          { titulo: 'OS', peso: 0.9 },
          { titulo: 'Cliente', peso: 2 },
          { titulo: 'Tipo', peso: 0.8 },
          { titulo: 'Forma', peso: 1.1 },
          { titulo: 'Recebido por', peso: 1.2 },
          { titulo: 'Valor', formato: 'moeda' }
        ],
        linhas: pagamentos.map(({ o, p }) => [p.em, o.numero, nomeCliente(o.clienteId), rotuloTipoPagamentoOS[p.tipo], rotuloFormaPagamento[p.forma], p.usuario, p.valor]),
        totais: ['Total', null, null, null, null, null, soma]
      }
    }

    if (visao === 'recusadas') {
      // Canceladas no período (pela data do cancelamento), com o motivo informado.
      const canceladas = ordensServico
        .map((o) => ({ o, h: [...o.historico].reverse().find((h) => h.status === 'cancelada') }))
        .filter(({ o, h }) => o.status === 'cancelada' && h && noPeriodo(h.em))
        .sort((a, b) => a.h!.em.localeCompare(b.h!.em))
      const orcado = canceladas.reduce((s, { o }) => s + totalOS(o), 0)
      return {
        titulo: 'Ordens de serviço canceladas (orçamentos recusados)',
        filtros: [periodo, 'Pela data do cancelamento'],
        resumo: [
          { rotulo: 'OS canceladas', valor: fmt.numero(canceladas.length) },
          { rotulo: 'Valor orçado', valor: fmt.moeda(orcado) },
          { rotulo: 'Com orçamento', valor: fmt.numero(canceladas.filter(({ o }) => totalOS(o) > 0).length) },
          { rotulo: 'Sem orçamento', valor: fmt.numero(canceladas.filter(({ o }) => totalOS(o) === 0).length) }
        ],
        colunas: [
          { titulo: 'OS', peso: 0.9 },
          { titulo: 'Cancelada em', formato: 'data' },
          { titulo: 'Cliente', peso: 1.8 },
          { titulo: 'Equipamento', peso: 1.8 },
          { titulo: 'Motivo', peso: 2.4 },
          { titulo: 'Valor orçado', formato: 'moeda' }
        ],
        linhas: canceladas.map(({ o, h }) => [o.numero, h!.em, nomeCliente(o.clienteId), descreverEquipamento(o), h!.observacao, totalOS(o)]),
        totais: ['Total', null, null, null, null, orcado]
      }
    }

    return {
      titulo: 'Ordens de serviço entregues',
      filtros: [periodo, 'Pela data de entrega'],
      resumo,
      colunas: [
        { titulo: 'OS', peso: 0.8 },
        { titulo: 'Entregue em', formato: 'data' },
        { titulo: 'Cliente', peso: 1.6 },
        { titulo: 'Técnico', peso: 1.2 },
        { titulo: 'Peças', formato: 'moeda' },
        { titulo: 'Mão de obra', formato: 'moeda' },
        { titulo: 'Desconto', formato: 'moeda' },
        { titulo: 'Total', formato: 'moeda' },
        { titulo: 'Recebido', formato: 'moeda' },
        { titulo: 'Dias', formato: 'numero', peso: 0.5 }
      ],
      linhas: entregues.map((o) => [o.numero, o.entregueEm, nomeCliente(o.clienteId), o.tecnicoId ? nomeTecnico(o.tecnicoId) : '', totalPecasOS(o), totalServicosOS(o), o.desconto, totalOS(o), pagoOS(o), diasDeConserto(o)]),
      totais: [
        'Total',
        null,
        null,
        null,
        entregues.reduce((s, o) => s + totalPecasOS(o), 0),
        entregues.reduce((s, o) => s + totalServicosOS(o), 0),
        entregues.reduce((s, o) => s + o.desconto, 0),
        total,
        entregues.reduce((s, o) => s + pagoOS(o), 0),
        null
      ]
    }
  }, [ordensServico, clientes, usuarios, produtos, de, ate, visao])

  return (
    <Visualizacao
      relatorio={relatorio}
      arquivo={{ os: 'os-entregues', tecnico: 'os-por-tecnico', pecas: 'pecas-mais-usadas', recebimentos: 'recebimentos-os', recusadas: 'os-canceladas' }[visao]}
      filtros={
        <>
          <Select
            className="w-56"
            aria-label="Visão do relatório de OS"
            opcoes={[
              { value: 'os', label: 'OS entregues' },
              { value: 'tecnico', label: 'Por técnico' },
              { value: 'pecas', label: 'Peças mais usadas' },
              { value: 'recebimentos', label: 'Recebimentos' },
              { value: 'recusadas', label: 'Canceladas / recusadas' }
            ]}
            value={visao}
            onChange={(e) => setVisao(e.target.value as VisaoOS)}
          />
          <Periodo de={de} ate={ate} setDe={setDe} setAte={setAte} />
        </>
      }
    />
  )
}

function Periodo({ de, ate, setDe, setAte }: { de: string; ate: string; setDe: (v: string) => void; setAte: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-600">
      <span>De</span>
      <Input type="date" className="w-40" value={de} onChange={(e) => setDe(e.target.value)} />
      <span>até</span>
      <Input type="date" className="w-40" value={ate} onChange={(e) => setAte(e.target.value)} />
    </div>
  )
}

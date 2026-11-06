import { useMemo, useState } from 'react'
import { useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { DataTable, type Coluna } from '@/components/DataTable'
import { BarraSaida } from '@/components/BarraSaida'
import { Checkbox, Input, Select } from '@/components/ui'
import { alinhadoADireita, formatar, type Relatorio, type Valor } from '@/lib/relatorio'
import { relatorioExcel, relatorioImprimir, relatorioPdf } from '@/lib/saida'
import { recebidaEmParte, rotuloFormaPagamento, rotuloStatusCompra, rotuloTipoMov, situacaoEstoque, subtotalVenda, totalCompra, totalVenda } from '@shared/dominio'
import * as fmt from '@shared/format'
import type { FormaPagamento, StatusCompra, TipoMovimentacao } from '@shared/tipos'

type Aba = 'vendas' | 'estoque' | 'reposicao' | 'compras' | 'movimentacoes'

const abas: { id: Aba; titulo: string; descricao: string }[] = [
  { id: 'vendas', titulo: 'Vendas', descricao: 'Por venda, por cliente ou por produto' },
  { id: 'estoque', titulo: 'Posição de estoque', descricao: 'Saldo e valor de cada produto' },
  { id: 'reposicao', titulo: 'Sugestão de compra', descricao: 'Produtos no mínimo ou abaixo dele' },
  { id: 'compras', titulo: 'Compras', descricao: 'Compras por período, fornecedor e status' },
  { id: 'movimentacoes', titulo: 'Movimentações', descricao: 'Entradas, saídas e ajustes no período' }
]

const inicioDoAno = (): string => `${new Date().getFullYear()}-01-01`
const inicioDoMes = (): string => fmt.hojeIso().slice(0, 8) + '01'

export default function Relatorios() {
  const [aba, setAba] = useState<Aba>('vendas')
  return (
    <>
      <PageHeader titulo="Relatórios" subtitulo="Consulte, exporte para Excel, salve em PDF ou imprima" />
      <div className="mb-5 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="tablist">
        {abas.map((a) => (
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
            <div key={r.rotulo} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
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
  const { produtos, compras, fornecedores, unidades } = useDb()
  const [fator, setFator] = useState('2')

  const relatorio = useMemo<Relatorio>(() => {
    const multiplicador = Math.max(1, Number(fator) || 2)
    // Última compra (não cancelada) de cada produto: fornecedor e custo de referência.
    const ultima = new Map<number, { fornecedorId: number; valor: number; data: string }>()
    for (const c of [...compras].filter((c) => c.status !== 'cancelada').sort((a, b) => a.data.localeCompare(b.data))) {
      for (const i of c.itens) ultima.set(i.produtoId, { fornecedorId: c.fornecedorId, valor: i.valorUnitario, data: c.data })
    }
    const lista = produtos
      .filter((p) => p.ativo && situacaoEstoque(p) !== 'ok')
      .map((p) => {
        const u = ultima.get(p.id)
        const sugerido = Math.max(1, p.estoqueMinimo * multiplicador - p.estoque)
        const custo = u?.valor ?? p.precoCusto
        return { p, u, sugerido, custo }
      })
      .sort((a, b) => a.p.estoque - a.p.estoqueMinimo - (b.p.estoque - b.p.estoqueMinimo))
    const forn = (id?: number): string => (id ? (fornecedores.find((f) => f.id === id)?.nomeFantasia || fornecedores.find((f) => f.id === id)?.razaoSocial || '') : '')
    const total = lista.reduce((s, x) => s + x.sugerido * x.custo, 0)
    return {
      titulo: 'Sugestão de compra',
      filtros: [`Repor até ${multiplicador}× o estoque mínimo`, 'Custo de referência: última compra (ou custo cadastrado)'],
      colunas: [
        { titulo: 'Código', peso: 0.8 },
        { titulo: 'Produto', peso: 2.2 },
        { titulo: 'Un.', peso: 0.5 },
        { titulo: 'Estoque', formato: 'numero', peso: 0.8 },
        { titulo: 'Mínimo', formato: 'numero', peso: 0.8 },
        { titulo: 'Comprar', formato: 'numero', peso: 0.9 },
        { titulo: 'Custo ref.', formato: 'moeda', peso: 1 },
        { titulo: 'Subtotal', formato: 'moeda', peso: 1.1 },
        { titulo: 'Último fornecedor', peso: 1.5 }
      ],
      linhas: lista.map(({ p, u, sugerido, custo }) => [
        p.codigo,
        p.nome,
        unidades.find((x) => x.id === p.unidadeId)?.sigla ?? '',
        p.estoque,
        p.estoqueMinimo,
        sugerido,
        custo,
        sugerido * custo,
        forn(u?.fornecedorId)
      ]),
      totais: ['Total', null, null, null, null, lista.reduce((s, x) => s + x.sugerido, 0), null, total, null],
      resumo: [
        { rotulo: 'Produtos a repor', valor: fmt.numero(lista.length) },
        { rotulo: 'Sem estoque', valor: fmt.numero(lista.filter((x) => x.p.estoque <= 0).length) },
        { rotulo: 'Investimento estimado', valor: fmt.moeda(total) }
      ]
    }
  }, [produtos, compras, fornecedores, unidades, fator])

  return (
    <Visualizacao
      relatorio={relatorio}
      arquivo="sugestao-compra"
      filtros={
        <Select
          className="w-64"
          opcoes={[1.5, 2, 3, 4].map((n) => ({ value: n, label: `Repor até ${String(n).replace('.', ',')}× o mínimo` }))}
          value={fator}
          onChange={(e) => setFator(e.target.value)}
        />
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

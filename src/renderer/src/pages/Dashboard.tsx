import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, DollarSign, Package, PackageCheck, Receipt, ShoppingCart, XCircle } from 'lucide-react'
import { useDb } from '@/data/store'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { Badge, Card, CardHeader } from '@/components/ui'
import { GraficoBarras } from '@/components/GraficoBarras'
import { corStatusCompra, rotuloStatusCompra, situacaoEstoque, totalCompra, totalVenda } from '@shared/dominio'
import * as fmt from '@shared/format'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

export default function Dashboard() {
  const { produtos, compras, movimentacoes, fornecedores, categorias, vendas, configuracoes } = useDb()
  const { usuario, pode } = useAuth()

  const indicadores = useMemo(() => {
    const ativos = produtos.filter((p) => p.ativo)
    const mesAtual = fmt.hojeIso().slice(0, 7)
    const comprasMes = compras.filter((c) => c.data.startsWith(mesAtual) && c.status !== 'cancelada')
    return {
      produtos: ativos.length,
      unidades: ativos.reduce((s, p) => s + p.estoque, 0),
      comprasMes: comprasMes.length,
      totalComprasMes: comprasMes.reduce((s, c) => s + totalCompra(c), 0),
      valorEstoque: ativos.reduce((s, p) => s + p.estoque * p.precoCusto, 0),
      pendentes: compras.filter((c) => c.status === 'pedido').length,
      vendasMes: vendas.filter((v) => v.status === 'concluida' && v.data.startsWith(mesAtual))
    }
  }, [produtos, compras, vendas])

  // Entradas e saídas dos últimos 6 meses, valorizadas a preço de custo.
  const grafico = useMemo(() => {
    const hoje = new Date()
    const meses = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - 5 + i, 1)
      return { chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, rotulo: MESES[d.getMonth()] }
    })
    const custo = new Map(produtos.map((p) => [p.id, p.precoCusto]))
    return meses.map(({ chave, rotulo }) => {
      const doMes = movimentacoes.filter((m) => m.data.startsWith(chave))
      const soma = (tipo: 'entrada' | 'saida'): number =>
        doMes.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.quantidade * (custo.get(m.produtoId) ?? 0), 0)
      return { rotulo, valores: [soma('entrada'), soma('saida')] }
    })
  }, [produtos, movimentacoes])

  const meses6 = useMemo(() => {
    const hoje = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - 5 + i, 1)
      return { chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, rotulo: MESES[d.getMonth()] }
    })
  }, [])

  // Valor comprado por mês (compras não canceladas, pela data da compra).
  const comprasPorMes = useMemo(
    () =>
      meses6.map(({ chave, rotulo }) => ({
        rotulo,
        valores: [compras.filter((c) => c.status !== 'cancelada' && c.data.startsWith(chave)).reduce((s, c) => s + totalCompra(c), 0)]
      })),
    [compras, meses6]
  )

  // Produtos com mais saídas nos últimos 90 dias.
  const maisSaidas = useMemo(() => {
    const limite = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const total = new Map<number, number>()
    for (const m of movimentacoes) if (m.tipo === 'saida' && m.data.slice(0, 10) >= limite) total.set(m.produtoId, (total.get(m.produtoId) ?? 0) + m.quantidade)
    return [...total.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, qtd]) => ({ rotulo: produtos.find((p) => p.id === id)?.nome ?? '—', valor: qtd, texto: `${fmt.numero(qtd)} un.` }))
  }, [movimentacoes, produtos])

  const porCategoria = useMemo(() => {
    const total = new Map<number, number>()
    for (const p of produtos) if (p.ativo) total.set(p.categoriaId, (total.get(p.categoriaId) ?? 0) + p.estoque * p.precoCusto)
    return [...total.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, v]) => ({ rotulo: categorias.find((c) => c.id === id)?.nome ?? '—', valor: v, texto: fmt.moeda(v) }))
  }, [produtos, categorias])

  const alertas = produtos
    .filter((p) => p.ativo && situacaoEstoque(p) !== 'ok')
    .sort((a, b) => a.estoque - a.estoqueMinimo - (b.estoque - b.estoqueMinimo))

  const ultimasCompras = [...compras].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5)
  const nomeFornecedor = (id: number): string => fornecedores.find((f) => f.id === id)?.nomeFantasia ?? '—'

  return (
    <>
      <PageHeader titulo={`Olá, ${usuario?.nome.split(' ')[0]}`} subtitulo="Resumo do estoque e das compras" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          titulo="Vendas no mês"
          valor={fmt.moeda(indicadores.vendasMes.reduce((s, v) => s + totalVenda(v), 0))}
          detalhe={`${indicadores.vendasMes.length} venda(s)`}
          icone={Receipt}
          corIcone="bg-sky-50 text-sky-600"
        />
        <StatCard titulo="Produtos ativos" valor={fmt.numero(indicadores.produtos)} detalhe={`${produtos.length - indicadores.produtos} inativos`} icone={Package} />
        <StatCard titulo="Unidades em estoque" valor={fmt.numero(indicadores.unidades)} detalhe={`${alertas.length} abaixo do mínimo`} icone={PackageCheck} corIcone="bg-emerald-50 text-emerald-600" />
        <StatCard titulo="Compras no mês" valor={fmt.numero(indicadores.comprasMes)} detalhe={`${fmt.moeda(indicadores.totalComprasMes)} · ${indicadores.pendentes} pendente(s)`} icone={ShoppingCart} corIcone="bg-violet-50 text-violet-600" />
        <StatCard titulo="Valor em estoque" valor={fmt.moeda(indicadores.valorEstoque)} detalhe="A preço de custo" icone={DollarSign} corIcone="bg-amber-50 text-amber-600" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader titulo="Movimentações (últimos 6 meses, a preço de custo)" />
          <div className="p-5">
            <GraficoBarras
              series={[
                { nome: 'Entradas', cor: '#2a78d6' },
                { nome: 'Saídas', cor: '#eb6834' }
              ]}
              dados={grafico}
              formatar={fmt.moeda}
              formatarEixo={(v) => `R$ ${compacto.format(v)}`}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            titulo="Alertas de estoque mínimo"
            acao={configuracoes.alertarEstoqueMinimo && alertas.length > 0 && <Badge cor="vermelho">{alertas.length}</Badge>}
          />
          {!configuracoes.alertarEstoqueMinimo ? (
            <p className="p-5 text-sm text-slate-500">Alertas desativados nas configurações.</p>
          ) : alertas.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Nenhum produto abaixo do mínimo.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {alertas.slice(0, 6).map((p) => {
                const zerado = situacaoEstoque(p) === 'zerado'
                return (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                    {zerado ? <XCircle size={18} className="shrink-0 text-red-600" /> : <AlertTriangle size={18} className="shrink-0 text-amber-500" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{p.nome}</p>
                      <p className="text-xs text-slate-500">
                        {zerado ? 'Sem estoque' : 'Estoque baixo'} · mínimo {p.estoqueMinimo}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold tabular-nums ${zerado ? 'text-red-600' : 'text-amber-700'}`}>{p.estoque}</span>
                  </li>
                )
              })}
            </ul>
          )}
          {pode('produtos') && alertas.length > 0 && (
            <div className="border-t border-slate-100 px-5 py-2.5 text-right">
              <Link to="/produtos?filtro=baixo" className="text-xs font-medium text-blue-600 hover:underline">
                Ver todos
              </Link>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader titulo="Compras por mês (R$)" />
          <div className="p-5">
            <GraficoBarras
              series={[{ nome: 'Compras', cor: '#2a78d6' }]}
              dados={comprasPorMes}
              formatar={fmt.moeda}
              formatarEixo={(v) => `R$ ${compacto.format(v)}`}
              altura={200}
            />
          </div>
        </Card>
        <Card>
          <CardHeader titulo="Mais saídas (últimos 90 dias)" />
          <BarrasHorizontais itens={maisSaidas} vazio="Nenhuma saída nos últimos 90 dias." />
        </Card>
        <Card>
          <CardHeader titulo="Valor em estoque por categoria" />
          <BarrasHorizontais itens={porCategoria} vazio="Sem estoque valorizado." />
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          titulo="Últimas compras"
          acao={pode('compras') && <Link to="/compras" className="text-xs font-medium text-blue-600 hover:underline">Ver compras</Link>}
        />
        <table className="w-full text-sm">
          <tbody>
            {ultimasCompras.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className="px-5 py-3 font-medium text-slate-800">{c.numero}</td>
                <td className="px-5 py-3 text-slate-600">{fmt.data(c.data)}</td>
                <td className="px-5 py-3 text-slate-600">{nomeFornecedor(c.fornecedorId)}</td>
                <td className="px-5 py-3"><Badge cor={corStatusCompra[c.status]}>{rotuloStatusCompra[c.status]}</Badge></td>
                <td className="px-5 py-3 text-right font-medium tabular-nums text-slate-800">{fmt.moeda(totalCompra(c))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}

/** Ranking simples em barras horizontais; o valor fica em texto ao lado (a cor não carrega informação sozinha). */
function BarrasHorizontais({ itens, vazio }: { itens: { rotulo: string; valor: number; texto: string }[]; vazio: string }) {
  if (itens.length === 0) return <p className="p-5 text-sm text-slate-500">{vazio}</p>
  const max = Math.max(...itens.map((i) => i.valor))
  return (
    <ul className="space-y-3 p-5">
      {itens.map((i) => (
        <li key={i.rotulo}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{i.rotulo}</span>
            <span className="shrink-0 font-medium tabular-nums text-slate-900">{i.texto}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (i.valor / max) * 100)}%`, background: '#2a78d6' }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

import { useMemo, useState } from 'react'
import { useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import type { Relatorio } from '@/lib/relatorio'
import { relatorioExcel, relatorioImprimir, relatorioPdf } from '@/lib/saida'
import { corStatusCompra, corStatusVenda, corTipoMov, recebidaEmParte, rotuloStatusCompra, rotuloStatusVenda, rotuloTipoMov, situacaoEstoque, subtotalVenda, totalVenda } from '@shared/dominio'
import * as fmt from '@shared/format'
import { BarraSaida } from './BarraSaida'
import { GraficoSaldo } from './GraficoSaldo'
import { Modal } from './Modal'
import { Badge } from './ui'

type Aba = 'movimentacoes' | 'compras' | 'vendas'

/** Ficha do produto: dados, indicadores, saldo ao longo do tempo e todo o histórico. */
export function FichaProduto({ produtoId, onFechar }: { produtoId: number | null; onFechar: () => void }) {
  const db = useDb()
  const notificar = useToast()
  const [aba, setAba] = useState<Aba>('movimentacoes')
  const p = db.produtos.find((x) => x.id === produtoId)

  const dados = useMemo(() => {
    if (!p) return null
    // Saldo recalculado somando as movimentações em ordem: sempre fecha com o estoque atual
    // (o "saldo após" gravado pode não refletir ajustes de saldo inicial datados no passado).
    let acumulado = 0
    const movs = db.movimentacoes
      .filter((m) => m.produtoId === p.id)
      .sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id)
      .map((m) => ({ ...m, saldo: (acumulado += m.tipo === 'saida' ? -m.quantidade : m.quantidade) }))
    const estornadas = new Set(db.movimentacoes.filter((m) => m.estornoDe).map((m) => m.estornoDe!))
    const compras = db.compras
      .filter((c) => c.itens.some((i) => i.produtoId === p.id))
      .map((c) => ({ c, item: c.itens.find((i) => i.produtoId === p.id)! }))
      .sort((a, b) => b.c.data.localeCompare(a.c.data))
    const vendas = db.vendas
      .filter((v) => v.itens.some((i) => i.produtoId === p.id))
      .map((v) => {
        const item = v.itens.find((i) => i.produtoId === p.id)!
        // Desconto da venda rateado proporcionalmente ao valor do item.
        const fator = subtotalVenda(v) ? totalVenda(v) / subtotalVenda(v) : 0
        return { v, item, valor: item.quantidade * item.valorUnitario * fator }
      })
      .sort((a, b) => b.v.data.localeCompare(a.v.data))
    const limite = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
    const vendas90 = vendas.filter((x) => x.v.status === 'concluida' && x.v.data.slice(0, 10) >= limite)
    const vendidas90 = vendas90.reduce((s, x) => s + x.item.quantidade, 0)
    const ultimaCompra = compras.find((x) => x.c.status !== 'cancelada')
    return {
      movs,
      estornadas,
      compras,
      vendas,
      vendidas90,
      faturado90: vendas90.reduce((s, x) => s + x.valor, 0),
      ultimaCompra,
      // Quantos dias o estoque atual dura no ritmo de vendas dos últimos 90 dias.
      cobertura: vendidas90 > 0 ? Math.floor(p.estoque / (vendidas90 / 90)) : null
    }
  }, [db, p])

  if (!p || !dados) return null
  const categoria = db.categorias.find((c) => c.id === p.categoriaId)?.nome ?? '—'
  const unidade = db.unidades.find((u) => u.id === p.unidadeId)?.sigla ?? ''
  const margem = p.precoCusto > 0 ? ((p.precoVenda - p.precoCusto) / p.precoCusto) * 100 : null
  const s = situacaoEstoque(p)
  const nomeFornecedor = (id: number): string => db.fornecedores.find((f) => f.id === id)?.nomeFantasia || db.fornecedores.find((f) => f.id === id)?.razaoSocial || '—'
  const nomeCliente = (id: number | null): string => (id ? (db.clientes.find((c) => c.id === id)?.nome ?? '—') : 'Consumidor final')
  const nomeUsuario = (id: number): string => db.usuarios.find((u) => u.id === id)?.nome ?? '—'

  // Kardex (movimentações com saldo) para PDF, Excel e impressão.
  const kardex: Relatorio = {
    titulo: `Ficha do produto — ${p.codigo} ${p.nome}`,
    filtros: [`Categoria: ${categoria}`, `Saldo atual: ${fmt.numero(p.estoque)} ${unidade}`, `Custo: ${fmt.moeda(p.precoCusto)}`, `Preço de venda: ${fmt.moeda(p.precoVenda)}`],
    resumo: [
      { rotulo: 'Saldo atual', valor: `${fmt.numero(p.estoque)} ${unidade}` },
      { rotulo: 'Valor em estoque', valor: fmt.moeda(p.estoque * p.precoCusto) },
      { rotulo: 'Vendido (90 dias)', valor: `${fmt.numero(dados.vendidas90)} ${unidade}` },
      { rotulo: 'Faturado (90 dias)', valor: fmt.moeda(dados.faturado90) }
    ],
    colunas: [
      { titulo: 'Data', formato: 'dataHora', peso: 1.2 },
      { titulo: 'Tipo', peso: 0.8 },
      { titulo: 'Entrada', formato: 'numero', peso: 0.7 },
      { titulo: 'Saída', formato: 'numero', peso: 0.7 },
      { titulo: 'Saldo', formato: 'numero', peso: 0.7 },
      { titulo: 'Motivo', peso: 2.2 },
      { titulo: 'Usuário', peso: 1.2 }
    ],
    linhas: dados.movs.map((m) => {
      const delta = m.tipo === 'saida' ? -m.quantidade : m.quantidade
      return [m.data, rotuloTipoMov[m.tipo], delta > 0 ? delta : null, delta < 0 ? -delta : null, m.saldo, m.motivo, nomeUsuario(m.usuarioId)]
    })
  }
  const nomeArquivo = `ficha-${p.codigo}`

  const cartao = (titulo: string, valor: string, detalhe?: string, cor = 'text-slate-900') => (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${cor}`}>{valor}</p>
      {detalhe && <p className="text-xs text-slate-500">{detalhe}</p>}
    </div>
  )

  const abas: { id: Aba; titulo: string; n: number }[] = [
    { id: 'movimentacoes', titulo: 'Movimentações', n: dados.movs.length },
    { id: 'compras', titulo: 'Compras', n: dados.compras.length },
    { id: 'vendas', titulo: 'Vendas', n: dados.vendas.length }
  ]

  return (
    <Modal
      aberto
      titulo={`${p.codigo} — ${p.nome}`}
      onFechar={onFechar}
      tamanho="xl"
      rodape={
        <>
          <span className="mr-auto self-center text-xs text-slate-500">PDF, Excel e impressão trazem o histórico de movimentações (kardex).</span>
          <BarraSaida
            onExcel={() => relatorioExcel(kardex, nomeArquivo, notificar)}
            onPdf={() => relatorioPdf(kardex, db.configuracoes.nomeEmpresa, nomeArquivo, notificar)}
            onImprimir={() => relatorioImprimir(kardex, db.configuracoes.nomeEmpresa, notificar)}
          />
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <Badge>{categoria}</Badge>
        {p.codigoBarras && <span className="font-mono text-xs text-slate-500">EAN {p.codigoBarras}</span>}
        {!p.ativo && <Badge cor="vermelho">Inativo</Badge>}
        {s === 'zerado' ? <Badge cor="vermelho">Sem estoque</Badge> : s === 'baixo' ? <Badge cor="amarelo">Estoque baixo</Badge> : <Badge cor="verde">Estoque normal</Badge>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cartao('Saldo atual', `${fmt.numero(p.estoque)} ${unidade}`, `mínimo ${fmt.numero(p.estoqueMinimo)}`, s === 'ok' ? 'text-slate-900' : 'text-red-600')}
        {cartao('Custo', fmt.moeda(p.precoCusto), dados.ultimaCompra ? `última compra ${fmt.moeda(dados.ultimaCompra.item.valorUnitario)}` : 'sem compras')}
        {cartao('Preço de venda', fmt.moeda(p.precoVenda), margem !== null ? `margem ${margem.toFixed(1).replace('.', ',')}%` : undefined)}
        {cartao('Valor em estoque', fmt.moeda(p.estoque * p.precoCusto), 'a preço de custo')}
        {cartao('Vendido (90 dias)', `${fmt.numero(dados.vendidas90)} ${unidade}`, fmt.moeda(dados.faturado90))}
        {cartao('Cobertura', dados.cobertura === null ? '—' : `${fmt.numero(dados.cobertura)} dias`, dados.cobertura === null ? 'sem vendas em 90 dias' : 'no ritmo de vendas atual')}
      </div>

      <div className="mb-5 rounded-lg border border-slate-200 p-3">
        <p className="mb-1 text-sm font-semibold text-slate-800">Saldo ao longo do tempo</p>
        <GraficoSaldo pontos={dados.movs.map((m) => ({ data: m.data, saldo: m.saldo }))} minimo={p.estoqueMinimo} />
      </div>

      <div className="mb-3 flex gap-1 border-b border-slate-200" role="tablist">
        {abas.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${aba === a.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {a.titulo} <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{a.n}</span>
          </button>
        ))}
      </div>

      <div className="max-h-[38vh] overflow-y-auto">
        {aba === 'movimentacoes' && (
          <Tabela
            vazio="Nenhuma movimentação."
            cabecalho={['Data', 'Tipo', 'Qtd.', 'Saldo', 'Motivo', 'Usuário']}
            direita={[2, 3]}
            linhas={[...dados.movs].reverse().map((m) => {
              const delta = m.tipo === 'saida' ? -m.quantidade : m.quantidade
              return [
                fmt.dataHora(m.data),
                <span key="t" className="flex gap-1">
                  <Badge cor={corTipoMov[m.tipo]}>{rotuloTipoMov[m.tipo]}</Badge>
                  {dados.estornadas.has(m.id) && <Badge>Estornada</Badge>}
                  {m.estornoDe && <Badge cor="roxo">Estorno</Badge>}
                </span>,
                <span key="q" className={delta < 0 ? 'text-red-600' : 'text-emerald-700'}>{`${delta > 0 ? '+' : ''}${fmt.numero(delta)}`}</span>,
                fmt.numero(m.saldo),
                m.motivo,
                nomeUsuario(m.usuarioId)
              ]
            })}
          />
        )}
        {aba === 'compras' && (
          <Tabela
            vazio="Este produto ainda não foi comprado."
            cabecalho={['Compra', 'Data', 'Fornecedor', 'Pedido', 'Recebido', 'Preço unit.', 'Status']}
            direita={[3, 4, 5]}
            linhas={dados.compras.map(({ c, item }) => [
              c.numero,
              fmt.data(c.data),
              nomeFornecedor(c.fornecedorId),
              fmt.numero(item.quantidade),
              fmt.numero(item.quantidadeRecebida ?? 0),
              fmt.moeda(item.valorUnitario),
              recebidaEmParte(c) ? <Badge key="s" cor="amarelo">Parcial</Badge> : <Badge key="s" cor={corStatusCompra[c.status]}>{rotuloStatusCompra[c.status]}</Badge>
            ])}
          />
        )}
        {aba === 'vendas' && (
          <Tabela
            vazio="Este produto ainda não foi vendido."
            cabecalho={['Venda', 'Data', 'Cliente', 'Qtd.', 'Preço unit.', 'Total (c/ desconto)', 'Status']}
            direita={[3, 4, 5]}
            linhas={dados.vendas.map(({ v, item, valor }) => [
              v.numero,
              fmt.dataHora(v.data),
              nomeCliente(v.clienteId),
              fmt.numero(item.quantidade),
              fmt.moeda(item.valorUnitario),
              fmt.moeda(valor),
              <Badge key="s" cor={corStatusVenda[v.status]}>{rotuloStatusVenda[v.status]}</Badge>
            ])}
          />
        )}
      </div>
    </Modal>
  )
}

function Tabela({ cabecalho, linhas, direita, vazio }: { cabecalho: string[]; linhas: React.ReactNode[][]; direita: number[]; vazio: string }) {
  if (linhas.length === 0) return <p className="py-8 text-center text-sm text-slate-500">{vazio}</p>
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-slate-50 text-slate-600">
        <tr>
          {cabecalho.map((c, i) => (
            <th key={c} className={`px-3 py-2 font-medium ${direita.includes(i) ? 'text-right' : 'text-left'}`}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i} className="border-t border-slate-100">
            {l.map((v, j) => (
              <td key={j} className={`px-3 py-2 text-slate-700 ${direita.includes(j) ? 'text-right tabular-nums' : ''}`}>{v}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

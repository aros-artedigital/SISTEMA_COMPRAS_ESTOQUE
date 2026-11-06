import { useEffect, useMemo, useState } from 'react'
import { Ban, CheckCircle2, FileDown, FileSpreadsheet, Plus, Printer, Trash2 } from 'lucide-react'
import { alterar, useDb } from '@/data/store'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { DataTable, type Coluna } from '@/components/DataTable'
import { LeitorCodigo } from '@/components/LeitorCodigo'
import { Modal } from '@/components/Modal'
import { Badge, Button, Input, SearchInput, Select, Textarea } from '@/components/ui'
import { executar } from '@/lib/executar'
import { htmlRecibo } from '@/lib/recibo'
import { exportarExcel, imprimir, salvarPdf } from '@/lib/saida'
import { corStatusVenda, rotuloFormaPagamento, rotuloStatusVenda, subtotalVenda, totalVenda } from '@shared/dominio'
import * as fmt from '@shared/format'
import type { FormaPagamento, Produto, StatusVenda, Venda } from '@shared/tipos'

const FORMAS = Object.keys(rotuloFormaPagamento) as FormaPagamento[]
const inicioDoMes = (): string => fmt.hojeIso().slice(0, 8) + '01'

export default function Vendas() {
  const db = useDb()
  const { vendas, clientes } = db
  const notificar = useToast()
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [forma, setForma] = useState('')
  const [de, setDe] = useState(inicioDoMes())
  const [ate, setAte] = useState(fmt.hojeIso())
  const [nova, setNova] = useState(false)
  const [detalhe, setDetalhe] = useState<Venda | null>(null)
  const [concluida, setConcluida] = useState<Venda | null>(null)

  // F2 abre uma nova venda (atalho de caixa).
  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'F2') {
        e.preventDefault()
        setNova(true)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  const nomeCliente = (id: number | null): string => (id ? (clientes.find((c) => c.id === id)?.nome ?? '—') : 'Consumidor final')

  const lista = useMemo(
    () =>
      vendas
        .filter(
          (v) =>
            (!busca || fmt.contem(v.numero, busca) || fmt.contem(nomeCliente(v.clienteId), busca)) &&
            (!status || v.status === status) &&
            (!forma || v.formaPagamento === forma) &&
            (!de || v.data.slice(0, 10) >= de) &&
            (!ate || v.data.slice(0, 10) <= ate)
        )
        .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id),
    [vendas, clientes, busca, status, forma, de, ate] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const validas = lista.filter((v) => v.status === 'concluida')
  const total = validas.reduce((s, v) => s + totalVenda(v), 0)

  // Mantém o detalhe aberto atualizado (ex.: depois de cancelar).
  const detalheAtual = detalhe ? (vendas.find((v) => v.id === detalhe.id) ?? detalhe) : null

  const recibo = {
    imprimir: (v: Venda) => imprimir(htmlRecibo(v, db), {}, notificar),
    pdf: (v: Venda) => salvarPdf(htmlRecibo(v, db), `recibo-${v.numero}`, {}, notificar)
  }

  const colunas: Coluna<Venda>[] = [
    { chave: 'numero', titulo: 'Número', render: (v) => <span className="font-medium text-slate-800">{v.numero}</span> },
    { chave: 'data', titulo: 'Data', render: (v) => <span className="tabular-nums">{fmt.dataHora(v.data)}</span> },
    { chave: 'cliente', titulo: 'Cliente', render: (v) => <span className={v.clienteId ? '' : 'text-slate-500'}>{nomeCliente(v.clienteId)}</span> },
    { chave: 'itens', titulo: 'Itens', alinhar: 'direita', render: (v) => v.itens.reduce((s, i) => s + i.quantidade, 0) },
    { chave: 'forma', titulo: 'Pagamento', render: (v) => rotuloFormaPagamento[v.formaPagamento] },
    { chave: 'total', titulo: 'Total', alinhar: 'direita', render: (v) => <span className="font-medium tabular-nums">{fmt.moeda(totalVenda(v))}</span> },
    { chave: 'status', titulo: 'Status', render: (v) => <Badge cor={corStatusVenda[v.status]}>{rotuloStatusVenda[v.status]}</Badge> },
    {
      chave: 'acoes',
      titulo: 'Ações',
      alinhar: 'direita',
      render: (v) => (
        <div className="flex justify-end gap-1.5">
          <button onClick={() => void recibo.imprimir(v)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            Recibo
          </button>
          <button onClick={() => setDetalhe(v)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            Ver
          </button>
        </div>
      )
    }
  ]

  function exportar(): void {
    void exportarExcel(
      {
        nome: 'Vendas',
        colunas: [
          { titulo: 'Número' },
          { titulo: 'Data', formato: 'dataHora' },
          { titulo: 'Cliente' },
          { titulo: 'Pagamento' },
          { titulo: 'Subtotal', formato: 'moeda' },
          { titulo: 'Desconto', formato: 'moeda' },
          { titulo: 'Total', formato: 'moeda' },
          { titulo: 'Status' }
        ],
        linhas: lista.map((v) => [v.numero, v.data, nomeCliente(v.clienteId), rotuloFormaPagamento[v.formaPagamento], subtotalVenda(v), v.desconto, totalVenda(v), rotuloStatusVenda[v.status]])
      },
      `vendas_${fmt.hojeIso()}`,
      notificar
    )
  }

  return (
    <>
      <PageHeader
        titulo="Vendas"
        subtitulo="Vendas a clientes, com baixa automática no estoque"
        acoes={
          <>
            <Button variante="secundario" icone={<FileSpreadsheet size={16} />} onClick={exportar}>Excel</Button>
            <Button icone={<Plus size={16} />} onClick={() => setNova(true)}>
              Nova venda <kbd className="ml-1 rounded bg-white/20 px-1 text-[10px]">F2</kbd>
            </Button>
          </>
        }
      />

      <Filtros>
        <SearchInput className="w-64" placeholder="Número ou cliente..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select className="w-36" placeholder="Todos os status" opcoes={(['concluida', 'cancelada'] as StatusVenda[]).map((s) => ({ value: s, label: rotuloStatusVenda[s] }))} value={status} onChange={(e) => setStatus(e.target.value)} />
        <Select className="w-44" placeholder="Todos os pagamentos" opcoes={FORMAS.map((f) => ({ value: f, label: rotuloFormaPagamento[f] }))} value={forma} onChange={(e) => setForma(e.target.value)} />
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>De</span>
          <Input type="date" className="w-40" value={de} onChange={(e) => setDe(e.target.value)} />
          <span>até</span>
          <Input type="date" className="w-40" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <span className="ml-auto text-sm text-slate-500">
          {validas.length} venda(s) · <strong className="text-slate-800">{fmt.moeda(total)}</strong>
        </span>
      </Filtros>

      <DataTable colunas={colunas} dados={lista} chave={(v) => v.id} vazio="Nenhuma venda no período. Use Nova venda (F2) para registrar." />

      <NovaVendaModal
        aberto={nova}
        onFechar={() => setNova(false)}
        onConcluida={(v) => {
          setNova(false)
          setConcluida(v)
        }}
      />

      <Modal
        aberto={concluida !== null}
        titulo="Venda concluída"
        onFechar={() => setConcluida(null)}
        tamanho="sm"
        rodape={
          <>
            <Button variante="secundario" icone={<FileDown size={16} />} onClick={() => concluida && void recibo.pdf(concluida)}>PDF</Button>
            <Button variante="secundario" icone={<Printer size={16} />} onClick={() => concluida && void recibo.imprimir(concluida)}>Imprimir recibo</Button>
            <Button
              icone={<Plus size={16} />}
              onClick={() => {
                setConcluida(null)
                setNova(true)
              }}
            >
              Nova venda
            </Button>
          </>
        }
      >
        {concluida && (
          <div className="flex flex-col items-center py-2 text-center">
            <CheckCircle2 size={40} className="mb-2 text-emerald-600" />
            <p className="text-sm text-slate-600">Venda {concluida.numero} registrada e estoque atualizado.</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{fmt.moeda(totalVenda(concluida))}</p>
            <p className="text-sm text-slate-500">{rotuloFormaPagamento[concluida.formaPagamento]}</p>
          </div>
        )}
      </Modal>

      {detalheAtual && (
        <DetalheVenda
          venda={detalheAtual}
          nomeCliente={nomeCliente(detalheAtual.clienteId)}
          onFechar={() => setDetalhe(null)}
          onRecibo={() => void recibo.imprimir(detalheAtual)}
          onPdf={() => void recibo.pdf(detalheAtual)}
        />
      )}
    </>
  )
}

// ---------- Nova venda ----------

interface Linha {
  chave: number
  produtoId: number
  quantidade: string
  valorUnitario: string
}
let chaveLinha = 1

function NovaVendaModal({ aberto, onFechar, onConcluida }: { aberto: boolean; onFechar: () => void; onConcluida: (v: Venda) => void }) {
  const { produtos, clientes } = useDb()
  const notificar = useToast()
  const [clienteId, setClienteId] = useState('')
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('dinheiro')
  const [desconto, setDesconto] = useState('')
  const [observacao, setObservacao] = useState('')
  const [itens, setItens] = useState<Linha[]>([])
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!aberto) return
    setClienteId('')
    setFormaPagamento('dinheiro')
    setDesconto('')
    setObservacao('')
    setItens([])
    setErro('')
  }, [aberto])

  const produto = (id: number): Produto | undefined => produtos.find((p) => p.id === id)

  function adicionar(p: Produto): void {
    setErro('')
    setItens((l) => {
      const existente = l.find((i) => i.produtoId === p.id)
      if (existente) return l.map((i) => (i === existente ? { ...i, quantidade: String((Number(i.quantidade) || 0) + 1) } : i))
      return [...l, { chave: chaveLinha++, produtoId: p.id, quantidade: '1', valorUnitario: String(p.precoVenda) }]
    })
  }

  const subtotal = itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valorUnitario) || 0), 0)
  const valorDesconto = Number(desconto.replace(',', '.')) || 0
  const total = Math.max(0, subtotal - valorDesconto)
  const semSaldo = itens.filter((i) => (Number(i.quantidade) || 0) > (produto(i.produtoId)?.estoque ?? 0))

  async function finalizar(): Promise<void> {
    if (itens.length === 0) return setErro('Adicione ao menos um produto.')
    const convertidos = itens.map((i) => ({ produtoId: i.produtoId, quantidade: Number(i.quantidade), valorUnitario: Number(i.valorUnitario.replace(',', '.')) }))
    if (convertidos.some((i) => !Number.isInteger(i.quantidade) || i.quantidade <= 0)) return setErro('Quantidades devem ser inteiras e maiores que zero.')
    if (convertidos.some((i) => !(i.valorUnitario >= 0))) return setErro('Informe o preço de todos os itens.')
    if (valorDesconto < 0 || valorDesconto > subtotal) return setErro('Desconto inválido.')
    let venda: Venda | null = null
    const ok = await executar(
      async () => {
        venda = await alterar('vendas:registrar', {
          clienteId: clienteId ? Number(clienteId) : null,
          formaPagamento,
          desconto: valorDesconto,
          observacao,
          itens: convertidos
        })
      },
      { notificar }
    )
    if (ok && venda) onConcluida(venda)
  }

  return (
    <Modal
      aberto={aberto}
      titulo="Nova venda"
      onFechar={onFechar}
      tamanho="xl"
      rodape={
        <>
          <span className="mr-auto self-center text-sm text-slate-500">
            {itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0)} item(ns)
          </span>
          <Button variante="secundario" onClick={onFechar}>Cancelar</Button>
          <Button icone={<CheckCircle2 size={16} />} onClick={finalizar} disabled={itens.length === 0 || semSaldo.length > 0}>
            Finalizar venda · {fmt.moeda(total)}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-3">
          <LeitorCodigo autoFocus onEncontrar={adicionar} placeholder="Leia o código de barras ou digite o código e tecle Enter" />
          <Select
            placeholder="...ou escolha um produto"
            opcoes={produtos.filter((p) => p.ativo).map((p) => ({ value: p.id, label: `${p.codigo} — ${p.nome} (${fmt.numero(p.estoque)} em estoque)` }))}
            value=""
            onChange={(e) => {
              const p = produto(Number(e.target.value))
              if (p) adicionar(p)
            }}
          />
          <div className="max-h-[42vh] overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Produto</th>
                  <th className="w-24 px-2 py-2 text-right font-medium">Qtd.</th>
                  <th className="w-32 px-2 py-2 text-right font-medium">Preço (R$)</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">Subtotal</th>
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-slate-500">Leia ou escolha os produtos vendidos.</td>
                  </tr>
                )}
                {itens.map((i) => {
                  const p = produto(i.produtoId)
                  const falta = (Number(i.quantidade) || 0) > (p?.estoque ?? 0)
                  return (
                    <tr key={i.chave} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-800">{p?.nome}</p>
                        <p className={`text-xs ${falta ? 'font-medium text-red-600' : 'text-slate-400'}`}>
                          {p?.codigo} · {falta ? `só há ${fmt.numero(p?.estoque ?? 0)} em estoque` : `${fmt.numero(p?.estoque ?? 0)} em estoque`}
                        </p>
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          aria-label={`Quantidade de ${p?.nome}`}
                          className={`w-full text-right ${falta ? 'border-red-400' : ''}`}
                          value={i.quantidade}
                          onChange={(e) => setItens((l) => l.map((x) => (x.chave === i.chave ? { ...x, quantidade: e.target.value } : x)))}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          aria-label={`Preço de ${p?.nome}`}
                          className="w-full text-right"
                          value={i.valorUnitario}
                          onChange={(e) => setItens((l) => l.map((x) => (x.chave === i.chave ? { ...x, valorUnitario: e.target.value } : x)))}
                        />
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">{fmt.moeda((Number(i.quantidade) || 0) * (Number(i.valorUnitario) || 0))}</td>
                      <td className="pr-2 text-center">
                        <button onClick={() => setItens((l) => l.filter((x) => x.chave !== i.chave))} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remover item">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {(erro || semSaldo.length > 0) && (
            <p className="text-sm text-red-600">{erro || 'Há itens com quantidade maior que o estoque disponível.'}</p>
          )}
        </div>

        <div className="space-y-4">
          <Select
            label="Cliente"
            placeholder="Consumidor final (sem cadastro)"
            opcoes={clientes.filter((c) => c.ativo).map((c) => ({ value: c.id, label: `${c.nome} — ${c.documento}` }))}
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
          />
          <Select label="Forma de pagamento" opcoes={FORMAS.map((f) => ({ value: f, label: rotuloFormaPagamento[f] }))} value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento)} />
          <Input label="Desconto (R$)" type="number" min="0" step="0.01" placeholder="0,00" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
          <Textarea label="Observação" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
            <p className="flex justify-between text-slate-600"><span>Subtotal</span><span className="tabular-nums">{fmt.moeda(subtotal)}</span></p>
            {valorDesconto > 0 && <p className="flex justify-between text-slate-600"><span>Desconto</span><span className="tabular-nums">- {fmt.moeda(valorDesconto)}</span></p>}
            <p className="flex justify-between border-t border-slate-200 pt-1 text-lg font-bold text-slate-900"><span>Total</span><span className="tabular-nums">{fmt.moeda(total)}</span></p>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ---------- Detalhe e cancelamento ----------

function DetalheVenda({ venda: v, nomeCliente, onFechar, onRecibo, onPdf }: { venda: Venda; nomeCliente: string; onFechar: () => void; onRecibo: () => void; onPdf: () => void }) {
  const { produtos, usuarios } = useDb()
  const { pode } = useAuth()
  const notificar = useToast()
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')

  async function cancelar(): Promise<void> {
    if (motivo.trim().length < 3) return setErro('Informe o motivo do cancelamento.')
    const ok = await executar(() => alterar('vendas:cancelar', v.id, motivo), { notificar, sucesso: `Venda ${v.numero} cancelada. Itens devolvidos ao estoque.` })
    if (ok) setCancelando(false)
  }

  return (
    <Modal
      aberto
      titulo={`Venda ${v.numero}`}
      onFechar={onFechar}
      tamanho="lg"
      rodape={
        cancelando ? (
          <>
            <Button variante="secundario" onClick={() => setCancelando(false)}>Voltar</Button>
            <Button variante="perigo" icone={<Ban size={16} />} onClick={cancelar}>Confirmar cancelamento</Button>
          </>
        ) : (
          <>
            {v.status === 'concluida' && pode('vendasCancelar') && (
              <Button variante="perigo" icone={<Ban size={16} />} className="mr-auto" onClick={() => setCancelando(true)}>Cancelar venda</Button>
            )}
            <Button variante="secundario" icone={<FileDown size={16} />} onClick={onPdf}>PDF</Button>
            <Button variante="secundario" icone={<Printer size={16} />} onClick={onRecibo}>Imprimir recibo</Button>
            <Button onClick={onFechar}>Fechar</Button>
          </>
        )
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-slate-500">Data</p><p className="font-medium text-slate-800">{fmt.dataHora(v.data)}</p></div>
        <div><p className="text-xs text-slate-500">Cliente</p><p className="font-medium text-slate-800">{nomeCliente}</p></div>
        <div><p className="text-xs text-slate-500">Pagamento</p><p className="font-medium text-slate-800">{rotuloFormaPagamento[v.formaPagamento]}</p></div>
        <div><p className="text-xs text-slate-500">Atendente</p><p className="font-medium text-slate-800">{usuarios.find((u) => u.id === v.usuarioId)?.nome ?? '—'}</p></div>
      </div>
      {v.status === 'cancelada' && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          Cancelada em {v.canceladaEm ? fmt.dataHora(v.canceladaEm) : '—'}: {v.motivoCancelamento}
        </p>
      )}
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Produto</th>
            <th className="px-3 py-2 text-right font-medium">Qtd.</th>
            <th className="px-3 py-2 text-right font-medium">Preço</th>
            <th className="px-3 py-2 text-right font-medium">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {v.itens.map((i) => (
            <tr key={i.produtoId} className="border-t border-slate-100">
              <td className="px-3 py-2">{produtos.find((p) => p.id === i.produtoId)?.nome ?? '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt.numero(i.quantidade)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt.moeda(i.valorUnitario)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt.moeda(i.quantidade * i.valorUnitario)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="text-sm">
          {v.desconto > 0 && (
            <tr className="border-t border-slate-200">
              <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">Desconto</td>
              <td className="px-3 py-1.5 text-right tabular-nums">- {fmt.moeda(v.desconto)}</td>
            </tr>
          )}
          <tr className="border-t border-slate-200 bg-slate-50">
            <td colSpan={3} className="px-3 py-2 text-right font-semibold text-slate-700">Total</td>
            <td className="px-3 py-2 text-right text-base font-bold tabular-nums text-slate-900">{fmt.moeda(totalVenda(v))}</td>
          </tr>
        </tfoot>
      </table>
      {v.observacao && <p className="mt-3 text-sm text-slate-600">Observação: {v.observacao}</p>}
      {cancelando && (
        <div className="mt-4 space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
          <p className="text-sm text-red-800">Os itens voltam ao estoque e a venda fica marcada como cancelada (não é apagada).</p>
          <Input
            label="Motivo do cancelamento"
            autoFocus
            value={motivo}
            error={erro}
            onChange={(e) => {
              setMotivo(e.target.value)
              setErro('')
            }}
          />
        </div>
      )}
    </Modal>
  )
}

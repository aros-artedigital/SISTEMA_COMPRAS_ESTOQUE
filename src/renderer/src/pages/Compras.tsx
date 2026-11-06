import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, PackageCheck, PackageX, Plus, Tags, Trash2 } from 'lucide-react'
import { alterar, useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { AcoesLinha, DataTable, type Coluna } from '@/components/DataTable'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { Badge, Button, Input, SearchInput, Select, Textarea } from '@/components/ui'
import { corStatusCompra, faltaReceber, recebidaEmParte, rotuloStatusCompra, totalCompra } from '@shared/dominio'
import { compraSchema } from '@shared/schemas'
import { useForm } from '@/lib/useForm'
import { executar } from '@/lib/executar'
import { exportarExcel } from '@/lib/saida'
import { EtiquetasModal, type ItemEtiqueta } from '@/components/EtiquetasModal'
import { LeitorCodigo } from '@/components/LeitorCodigo'
import * as fmt from '@shared/format'
import type { Compra, ItemCompra, StatusCompra } from '@shared/tipos'

interface LinhaItem {
  chave: number
  produtoId: string
  quantidade: string
  valorUnitario: string
}

let chaveLinha = 1
const novaLinha = (): LinhaItem => ({ chave: chaveLinha++, produtoId: '', quantidade: '1', valorUnitario: '' })

export default function Compras() {
  const { compras, fornecedores, produtos } = useDb()
  const notificar = useToast()

  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [fornecedor, setFornecedor] = useState('')

  const [editando, setEditando] = useState<Compra | null>(null)
  const [aberto, setAberto] = useState(false)
  const [itens, setItens] = useState<LinhaItem[]>([])
  const [erroItens, setErroItens] = useState('')
  const [statusForm, setStatusForm] = useState<StatusCompra>('rascunho')
  const [excluindo, setExcluindo] = useState<Compra | null>(null)
  const [recebendo, setRecebendo] = useState<Compra | null>(null)
  const [etiquetas, setEtiquetas] = useState<{ numero: string; itens: ItemEtiqueta[] } | null>(null)
  const form = useForm({ fornecedorId: '', data: fmt.hojeIso(), observacao: '' }, compraSchema)

  const nomeFornecedor = (id: number): string => fornecedores.find((f) => f.id === id)?.nomeFantasia || fornecedores.find((f) => f.id === id)?.razaoSocial || '—'

  const lista = useMemo(
    () =>
      compras
        .filter(
          (c) =>
            (!busca || fmt.contem(c.numero, busca) || fmt.contem(nomeFornecedor(c.fornecedorId), busca)) &&
            (!status || c.status === status) &&
            (!fornecedor || c.fornecedorId === Number(fornecedor))
        )
        .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id),
    [compras, fornecedores, busca, status, fornecedor] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const somenteLeitura = editando !== null && (editando.status === 'recebida' || editando.status === 'cancelada' || recebidaEmParte(editando))

  function abrir(c: Compra | null): void {
    setEditando(c)
    setErroItens('')
    if (c) {
      form.reset({ fornecedorId: String(c.fornecedorId), data: c.data, observacao: c.observacao })
      setItens(c.itens.map((i) => ({ chave: chaveLinha++, produtoId: String(i.produtoId), quantidade: String(i.quantidade), valorUnitario: String(i.valorUnitario) })))
      setStatusForm(c.status)
    } else {
      form.reset({ fornecedorId: '', data: fmt.hojeIso(), observacao: '' })
      setItens([novaLinha()])
      setStatusForm('rascunho')
    }
    setAberto(true)
  }

  function alterarItem(chave: number, campo: keyof Omit<LinhaItem, 'chave'>, valor: string): void {
    setErroItens('')
    setItens((lista) =>
      lista.map((l) => {
        if (l.chave !== chave) return l
        const nova = { ...l, [campo]: valor }
        // Ao escolher o produto, sugere o último preço de custo.
        if (campo === 'produtoId' && !l.valorUnitario) {
          const p = produtos.find((x) => x.id === Number(valor))
          if (p) nova.valorUnitario = String(p.precoCusto)
        }
        return nova
      })
    )
  }

  /** Leitor de código: adiciona o produto ou soma 1 na quantidade se ele já estiver na compra. */
  function adicionarPorCodigo(p: { id: number; precoCusto: number }): void {
    setErroItens('')
    setItens((lista) => {
      const existente = lista.find((l) => l.produtoId === String(p.id))
      if (existente) return lista.map((l) => (l === existente ? { ...l, quantidade: String((Number(l.quantidade) || 0) + 1) } : l))
      const nova = { produtoId: String(p.id), quantidade: '1', valorUnitario: String(p.precoCusto) }
      const vazia = lista.find((l) => !l.produtoId)
      return vazia ? lista.map((l) => (l === vazia ? { ...l, ...nova } : l)) : [...lista, { ...novaLinha(), ...nova }]
    })
  }

  function validarItens(): ItemCompra[] | null {
    const validos = itens.filter((l) => l.produtoId)
    if (validos.length === 0) {
      setErroItens('Adicione ao menos um produto.')
      return null
    }
    const ids = validos.map((l) => l.produtoId)
    if (new Set(ids).size !== ids.length) {
      setErroItens('O mesmo produto aparece em mais de uma linha.')
      return null
    }
    const convertidos = validos.map((l) => ({ produtoId: Number(l.produtoId), quantidade: Number(l.quantidade), valorUnitario: Number(l.valorUnitario) }))
    if (convertidos.some((i) => !Number.isInteger(i.quantidade) || i.quantidade <= 0)) {
      setErroItens('Quantidades devem ser números inteiros maiores que zero.')
      return null
    }
    if (convertidos.some((i) => !(i.valorUnitario >= 0) || Number.isNaN(i.valorUnitario))) {
      setErroItens('Informe o valor unitário de todos os itens.')
      return null
    }
    return convertidos
  }

  async function salvar(): Promise<void> {
    const cabecalho = form.validate()
    const itensValidos = validarItens()
    if (!cabecalho || !itensValidos) return
    // Compras recebidas ficam somente leitura, então o status aqui nunca é "recebida".
    const dados = { ...cabecalho, itens: itensValidos, status: statusForm as Exclude<StatusCompra, 'recebida'> }
    let numero = editando?.numero
    const ok = await executar(
      async () => {
        const salva = await alterar('compras:salvar', editando?.id ?? null, dados)
        numero = salva.numero
      },
      { notificar, form }
    )
    if (ok) {
      notificar('sucesso', `Compra ${numero} ${editando ? 'atualizada' : 'cadastrada'}.`)
      setAberto(false)
    }
  }

  async function excluir(): Promise<void> {
    if (!excluindo) return
    const alvo = excluindo
    setExcluindo(null)
    await executar(() => alterar('compras:excluir', alvo.id), { notificar, sucesso: `Compra ${alvo.numero} excluída.` })
  }

  function exportar(): void {
    void exportarExcel(
      {
        nome: 'Compras',
        colunas: [
          { titulo: 'Número' },
          { titulo: 'Data', formato: 'data' },
          { titulo: 'Fornecedor' },
          { titulo: 'Status' },
          { titulo: 'Itens', formato: 'numero' },
          { titulo: 'Total', formato: 'moeda' },
          { titulo: 'Observação' }
        ],
        linhas: lista.map((c) => [c.numero, c.data, nomeFornecedor(c.fornecedorId), recebidaEmParte(c) ? 'Recebida em parte' : rotuloStatusCompra[c.status], c.itens.length, totalCompra(c), c.observacao])
      },
      `compras_${fmt.hojeIso()}`,
      notificar
    )
  }

  const totalForm = itens.reduce((s, l) => s + (Number(l.quantidade) || 0) * (Number(l.valorUnitario) || 0), 0)

  const colunas: Coluna<Compra>[] = [
    { chave: 'numero', titulo: 'Número', render: (c) => <span className="font-medium text-slate-800">{c.numero}</span> },
    { chave: 'data', titulo: 'Data', render: (c) => <span className="tabular-nums">{fmt.data(c.data)}</span> },
    { chave: 'fornecedor', titulo: 'Fornecedor', render: (c) => nomeFornecedor(c.fornecedorId) },
    { chave: 'itens', titulo: 'Itens', alinhar: 'direita', render: (c) => c.itens.length },
    { chave: 'total', titulo: 'Total', alinhar: 'direita', render: (c) => <span className="font-medium tabular-nums">{fmt.moeda(totalCompra(c))}</span> },
    {
      chave: 'status',
      titulo: 'Status',
      render: (c) => (recebidaEmParte(c) ? <Badge cor="amarelo">Parcial</Badge> : <Badge cor={corStatusCompra[c.status]}>{rotuloStatusCompra[c.status]}</Badge>)
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      alinhar: 'direita',
      render: (c) => (
        <AcoesLinha
          extra={
            c.status === 'pedido' ? (
              <button
                onClick={() => setRecebendo(c)}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              >
                <PackageCheck size={14} /> Receber
              </button>
            ) : (
              c.status === 'recebida' && (
                <button
                  onClick={() => setEtiquetas({ numero: c.numero, itens: c.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidadeRecebida ?? i.quantidade })) })}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  title="Etiquetas dos itens recebidos"
                >
                  <Tags size={14} /> Etiquetas
                </button>
              )
            )
          }
          onEditar={() => abrir(c)}
          onExcluir={c.status !== 'recebida' && !recebidaEmParte(c) ? () => setExcluindo(c) : undefined}
        />
      )
    }
  ]

  return (
    <>
      <PageHeader
        titulo="Compras"
        subtitulo="Pedidos de compra e recebimento de mercadorias"
        acoes={
          <>
            <Button variante="secundario" icone={<FileSpreadsheet size={16} />} onClick={exportar}>
              Excel
            </Button>
            <Button icone={<Plus size={16} />} onClick={() => abrir(null)}>Nova Compra</Button>
          </>
        }
      />

      <Filtros>
        <SearchInput className="w-72" placeholder="Número ou fornecedor..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select
          className="w-44"
          placeholder="Todos os status"
          opcoes={(Object.keys(rotuloStatusCompra) as StatusCompra[]).map((s) => ({ value: s, label: rotuloStatusCompra[s] }))}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        />
        <Select
          className="w-52"
          placeholder="Todos os fornecedores"
          opcoes={fornecedores.map((f) => ({ value: f.id, label: f.nomeFantasia || f.razaoSocial }))}
          value={fornecedor}
          onChange={(e) => setFornecedor(e.target.value)}
        />
        <span className="ml-auto text-sm text-slate-500">
          {lista.length} compra(s) · {fmt.moeda(lista.filter((c) => c.status !== 'cancelada').reduce((s, c) => s + totalCompra(c), 0))}
        </span>
      </Filtros>

      <DataTable colunas={colunas} dados={lista} chave={(c) => c.id} />

      <Modal
        aberto={aberto}
        titulo={editando ? `Compra ${editando.numero}` : 'Nova compra'}
        onFechar={() => setAberto(false)}
        tamanho="xl"
        rodape={
          somenteLeitura ? (
            <Button variante="secundario" onClick={() => setAberto(false)}>Fechar</Button>
          ) : (
            <>
              <Button variante="secundario" onClick={() => setAberto(false)}>Cancelar</Button>
              <Button onClick={salvar}>Salvar compra</Button>
            </>
          )
        }
      >
        {somenteLeitura && (
          <p className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
            Compra {rotuloStatusCompra[editando!.status].toLowerCase()}: apenas visualização.
          </p>
        )}
        <fieldset disabled={somenteLeitura} className="space-y-5">
          <div className="grid grid-cols-4 gap-4">
            <Select
              label="Fornecedor"
              obrigatorio
              wrapperClassName="col-span-2"
              placeholder="Selecione..."
              opcoes={fornecedores
                .filter((f) => f.ativo || f.id === editando?.fornecedorId)
                .map((f) => ({ value: f.id, label: f.nomeFantasia || f.razaoSocial }))}
              {...form.bind('fornecedorId')}
            />
            <Input label="Data" obrigatorio type="date" {...form.bind('data')} />
            <Select
              label="Status"
              opcoes={
                somenteLeitura
                  ? [{ value: statusForm, label: rotuloStatusCompra[statusForm] }]
                  : (['rascunho', 'pedido', 'cancelada'] as const).map((s) => ({ value: s, label: rotuloStatusCompra[s] }))
              }
              value={statusForm}
              onChange={(e) => setStatusForm(e.target.value as StatusCompra)}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Itens da compra</h3>
              {!somenteLeitura && (
                <Button tamanho="sm" variante="secundario" icone={<Plus size={14} />} onClick={() => setItens((l) => [...l, novaLinha()])}>
                  Adicionar item
                </Button>
              )}
            </div>
            {!somenteLeitura && (
              <div className="mb-2">
                <LeitorCodigo onEncontrar={adicionarPorCodigo} placeholder="Leia o código de barras para adicionar o item (soma 1 se já estiver na lista)" />
              </div>
            )}
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Produto</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">Qtd.</th>
                    <th className="w-36 px-3 py-2 text-right font-medium">Valor unit. (R$)</th>
                    <th className="w-32 px-3 py-2 text-right font-medium">Subtotal</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {itens.map((l) => (
                    <tr key={l.chave} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <Select
                          placeholder="Selecione o produto..."
                          opcoes={produtos
                            .filter((p) => p.ativo || p.id === Number(l.produtoId))
                            .map((p) => ({ value: p.id, label: `${p.codigo} — ${p.nome}` }))}
                          value={l.produtoId}
                          onChange={(e) => alterarItem(l.chave, 'produtoId', e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input type="number" min="1" step="1" className="w-full text-right" value={l.quantidade} onChange={(e) => alterarItem(l.chave, 'quantidade', e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <Input type="number" min="0" step="0.01" className="w-full text-right" value={l.valorUnitario} onChange={(e) => alterarItem(l.chave, 'valorUnitario', e.target.value)} />
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-800">
                        {fmt.moeda((Number(l.quantidade) || 0) * (Number(l.valorUnitario) || 0))}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {!somenteLeitura && (
                          <button
                            onClick={() => setItens((lista) => lista.filter((x) => x.chave !== l.chave))}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="Remover item"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td colSpan={3} className="px-3 py-2.5 text-right font-medium text-slate-600">Total da compra</td>
                    <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums text-slate-900">{fmt.moeda(totalForm)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            {erroItens && <p className="mt-2 text-xs text-red-600">{erroItens}</p>}
          </div>

          <Textarea label="Observação" {...form.bind('observacao')} />
        </fieldset>
      </Modal>

      <EtiquetasModal
        aberto={etiquetas !== null}
        titulo={`Etiquetas da compra ${etiquetas?.numero ?? ''}`}
        inicial={etiquetas?.itens ?? []}
        onFechar={() => setEtiquetas(null)}
      />

      <ReceberCompraModal compra={recebendo} onFechar={() => setRecebendo(null)} />

      <ConfirmDialog
        aberto={!!excluindo}
        mensagem={<>Excluir a compra <strong>{excluindo?.numero}</strong>?</>}
        onConfirmar={excluir}
        onCancelar={() => setExcluindo(null)}
      />
    </>
  )
}

// ---------- Recebimento (inteiro ou em partes) ----------

function ReceberCompraModal({ compra, onFechar }: { compra: Compra | null; onFechar: () => void }) {
  const { produtos } = useDb()
  const notificar = useToast()
  const [agora, setAgora] = useState<Record<number, string>>({})
  const [erro, setErro] = useState('')
  const [encerrando, setEncerrando] = useState(false)

  // Ao abrir, sugere receber tudo o que falta de cada item.
  useEffect(() => {
    if (compra) setAgora(Object.fromEntries(compra.itens.map((i) => [i.produtoId, String(faltaReceber(i))])))
    setErro('')
  }, [compra])

  if (!compra) return null
  const parcial = recebidaEmParte(compra)
  const quantidades = compra.itens.map((i) => ({ produtoId: i.produtoId, quantidade: Math.floor(Number(agora[i.produtoId]) || 0) }))
  const recebendoAgora = quantidades.reduce((s, q) => s + q.quantidade, 0)
  const faltaTotal = compra.itens.reduce((s, i) => s + faltaReceber(i), 0)
  const completa = compra.itens.every((i) => (quantidades.find((q) => q.produtoId === i.produtoId)?.quantidade ?? 0) >= faltaReceber(i))

  async function confirmar(): Promise<void> {
    const invalido = compra!.itens.find((i) => {
      const q = Number(agora[i.produtoId] || 0)
      return !Number.isInteger(q) || q < 0 || q > faltaReceber(i)
    })
    if (invalido) return setErro(`Quantidade inválida para "${produtos.find((p) => p.id === invalido.produtoId)?.nome}": de 0 até ${faltaReceber(invalido)}.`)
    if (recebendoAgora === 0) return setErro('Informe a quantidade que chegou de pelo menos um item.')
    let custos: { produto: string; de: number; para: number }[] = []
    const ok = await executar(async () => (custos = await alterar('compras:receber', compra!.id, quantidades.filter((q) => q.quantidade > 0))), { notificar })
    if (!ok) return
    const resumo = custos
      .slice(0, 3)
      .map((c) => `${c.produto}: ${fmt.moeda(c.de)} → ${fmt.moeda(c.para)}`)
      .join('; ')
    const mais = custos.length > 3 ? ` e mais ${custos.length - 3}` : ''
    const situacao = completa ? 'recebida' : `recebida em parte (faltam ${faltaTotal - recebendoAgora} un.)`
    notificar('sucesso', `Compra ${compra!.numero} ${situacao}. Estoque atualizado.${custos.length ? ` Custo atualizado — ${resumo}${mais}.` : ''}`)
    onFechar()
  }

  async function encerrar(): Promise<void> {
    setEncerrando(false)
    const ok = await executar(() => alterar('compras:encerrar', compra!.id), { notificar, sucesso: `Compra ${compra!.numero} encerrada. O que faltou ficou anotado na observação.` })
    if (ok) onFechar()
  }

  return (
    <Modal
      aberto
      titulo={`Receber compra ${compra.numero}`}
      onFechar={onFechar}
      tamanho="lg"
      rodape={
        <>
          {parcial && (
            <Button variante="secundario" icone={<PackageX size={16} />} className="mr-auto" onClick={() => setEncerrando(true)}>
              Encerrar sem o restante
            </Button>
          )}
          <Button variante="secundario" onClick={onFechar}>Cancelar</Button>
          <Button icone={<PackageCheck size={16} />} onClick={confirmar} disabled={recebendoAgora === 0}>
            {completa ? 'Receber tudo' : `Receber ${fmt.numero(recebendoAgora)} un. (parcial)`}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Confira o que chegou e ajuste as quantidades se o fornecedor entregou só uma parte. O restante continua pendente para um próximo recebimento.
      </p>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Produto</th>
            <th className="px-3 py-2 text-right font-medium">Pedido</th>
            <th className="px-3 py-2 text-right font-medium">Já recebido</th>
            <th className="px-3 py-2 text-right font-medium">Falta</th>
            <th className="w-32 px-3 py-2 text-right font-medium">Chegou agora</th>
          </tr>
        </thead>
        <tbody>
          {compra.itens.map((i) => {
            const p = produtos.find((x) => x.id === i.produtoId)
            const falta = faltaReceber(i)
            return (
              <tr key={i.produtoId} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-800">{p?.nome}</p>
                  <p className="font-mono text-xs text-slate-400">{p?.codigo}</p>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt.numero(i.quantidade)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmt.numero(i.quantidadeRecebida ?? 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{fmt.numero(falta)}</td>
                <td className="px-3 py-2">
                  {falta === 0 ? (
                    <span className="block text-right text-xs text-emerald-700">completo</span>
                  ) : (
                    <Input
                      type="number"
                      min="0"
                      max={falta}
                      step="1"
                      aria-label={`Quantidade recebida agora de ${p?.nome}`}
                      className="w-full text-right"
                      value={agora[i.produtoId] ?? ''}
                      onChange={(e) => {
                        setErro('')
                        setAgora((a) => ({ ...a, [i.produtoId]: e.target.value }))
                      }}
                    />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}

      <ConfirmDialog
        aberto={encerrando}
        titulo="Encerrar compra"
        textoConfirmar="Encerrar"
        tom="primario"
        mensagem="O que ainda falta não vai mais chegar: a compra fica como recebida, nada mais entra no estoque, e o que faltou é anotado na observação."
        onConfirmar={encerrar}
        onCancelar={() => setEncerrando(false)}
      />
    </Modal>
  )
}

import { useMemo, useState } from 'react'
import { PackageCheck, Plus, Trash2 } from 'lucide-react'
import { alterar, useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { AcoesLinha, DataTable, type Coluna } from '@/components/DataTable'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { Badge, Button, Input, SearchInput, Select, Textarea } from '@/components/ui'
import { corStatusCompra, rotuloStatusCompra, totalCompra } from '@shared/dominio'
import { compraSchema } from '@shared/schemas'
import { useForm } from '@/lib/useForm'
import { executar } from '@/lib/executar'
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

  const somenteLeitura = editando !== null && (editando.status === 'recebida' || editando.status === 'cancelada')

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

  async function receber(): Promise<void> {
    if (!recebendo) return
    const alvo = recebendo
    setRecebendo(null)
    await executar(() => alterar('compras:receber', alvo.id), {
      notificar,
      sucesso: `Compra ${alvo.numero} recebida. Estoque atualizado.`
    })
  }

  async function excluir(): Promise<void> {
    if (!excluindo) return
    const alvo = excluindo
    setExcluindo(null)
    await executar(() => alterar('compras:excluir', alvo.id), { notificar, sucesso: `Compra ${alvo.numero} excluída.` })
  }

  const totalForm = itens.reduce((s, l) => s + (Number(l.quantidade) || 0) * (Number(l.valorUnitario) || 0), 0)

  const colunas: Coluna<Compra>[] = [
    { chave: 'numero', titulo: 'Número', render: (c) => <span className="font-medium text-slate-800">{c.numero}</span> },
    { chave: 'data', titulo: 'Data', render: (c) => <span className="tabular-nums">{fmt.data(c.data)}</span> },
    { chave: 'fornecedor', titulo: 'Fornecedor', render: (c) => nomeFornecedor(c.fornecedorId) },
    { chave: 'itens', titulo: 'Itens', alinhar: 'direita', render: (c) => c.itens.length },
    { chave: 'total', titulo: 'Total', alinhar: 'direita', render: (c) => <span className="font-medium tabular-nums">{fmt.moeda(totalCompra(c))}</span> },
    { chave: 'status', titulo: 'Status', render: (c) => <Badge cor={corStatusCompra[c.status]}>{rotuloStatusCompra[c.status]}</Badge> },
    {
      chave: 'acoes',
      titulo: 'Ações',
      alinhar: 'direita',
      render: (c) => (
        <AcoesLinha
          extra={
            c.status === 'pedido' && (
              <button
                onClick={() => setRecebendo(c)}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              >
                <PackageCheck size={14} /> Receber
              </button>
            )
          }
          onEditar={() => abrir(c)}
          onExcluir={c.status !== 'recebida' ? () => setExcluindo(c) : undefined}
        />
      )
    }
  ]

  return (
    <>
      <PageHeader
        titulo="Compras"
        subtitulo="Pedidos de compra e recebimento de mercadorias"
        acoes={<Button icone={<Plus size={16} />} onClick={() => abrir(null)}>Nova Compra</Button>}
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

      <ConfirmDialog
        aberto={!!recebendo}
        titulo="Receber mercadorias"
        textoConfirmar="Confirmar recebimento"
        tom="primario"
        mensagem={
          <>
            Confirmar o recebimento da compra <strong>{recebendo?.numero}</strong>? Será dada entrada de {recebendo?.itens.length} item(ns) no estoque.
          </>
        }
        onConfirmar={receber}
        onCancelar={() => setRecebendo(null)}
      />

      <ConfirmDialog
        aberto={!!excluindo}
        mensagem={<>Excluir a compra <strong>{excluindo?.numero}</strong>?</>}
        onConfirmar={excluir}
        onCancelar={() => setExcluindo(null)}
      />
    </>
  )
}

import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileSpreadsheet, Plus, Tags, Upload } from 'lucide-react'
import { alterar, useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { AcoesLinha, DataTable, type Coluna } from '@/components/DataTable'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { Badge, Button, Checkbox, Input, SearchInput, Select } from '@/components/ui'
import { situacaoEstoque } from '@shared/dominio'
import { produtoSchema } from '@shared/schemas'
import { useForm } from '@/lib/useForm'
import { executar } from '@/lib/executar'
import { exportarExcel } from '@/lib/saida'
import { EtiquetasModal } from '@/components/EtiquetasModal'
import { ImportarModal } from '@/components/ImportarModal'
import { FichaProduto } from '@/components/FichaProduto'
import { buscarPorCodigo } from '@/components/LeitorCodigo'
import * as fmt from '@shared/format'
import type { Produto } from '@shared/tipos'

const vazio = {
  codigo: '',
  codigoBarras: '',
  nome: '',
  categoriaId: '',
  unidadeId: '',
  precoCusto: '',
  precoVenda: '',
  estoque: '0',
  estoqueMinimo: '',
  ativo: true
}

export default function Produtos() {
  const { produtos, categorias, unidades, configuracoes } = useDb()
  const notificar = useToast()
  const [params, setParams] = useSearchParams()

  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const filtroEstoque = params.get('filtro') ?? ''

  const [editando, setEditando] = useState<Produto | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [excluindo, setExcluindo] = useState<Produto | null>(null)
  const [importando, setImportando] = useState(false)
  const [ficha, setFicha] = useState<number | null>(null)
  const [etiquetas, setEtiquetas] = useState<{ produtoId: number; quantidade: number }[] | null>(null)
  const form = useForm(vazio, produtoSchema)

  const nomeCategoria = (id: number): string => categorias.find((c) => c.id === id)?.nome ?? '—'
  const siglaUnidade = (id: number): string => unidades.find((u) => u.id === id)?.sigla ?? ''

  const lista = useMemo(
    () =>
      produtos.filter(
        (p) =>
          (!busca || fmt.contem(p.nome, busca) || fmt.contem(p.codigo, busca) || p.codigoBarras.includes(busca.trim())) &&
          (!categoria || p.categoriaId === Number(categoria)) &&
          (filtroEstoque !== 'baixo' || (p.ativo && situacaoEstoque(p) !== 'ok')) &&
          (filtroEstoque !== 'inativos' || !p.ativo)
      ),
    [produtos, busca, categoria, filtroEstoque]
  )

  // Mesmas colunas do modelo de importação: dá para exportar, editar no Excel e importar de volta.
  function exportar(): void {
    void exportarExcel(
      {
        nome: 'Produtos',
        colunas: [
          { titulo: 'Código' },
          { titulo: 'Nome' },
          { titulo: 'Código de barras' },
          { titulo: 'Categoria' },
          { titulo: 'Unidade' },
          { titulo: 'Preço de custo', formato: 'moeda' },
          { titulo: 'Preço de venda', formato: 'moeda' },
          { titulo: 'Estoque mínimo', formato: 'numero' },
          { titulo: 'Estoque', formato: 'numero' },
          { titulo: 'Ativo' }
        ],
        linhas: lista.map((p) => [p.codigo, p.nome, p.codigoBarras, nomeCategoria(p.categoriaId), siglaUnidade(p.unidadeId), p.precoCusto, p.precoVenda, p.estoqueMinimo, p.estoque, p.ativo ? 'Sim' : 'Não'])
      },
      `produtos_${fmt.hojeIso()}`,
      notificar
    )
  }

  function abrirEtiquetas(): void {
    // Com filtro ativo, já traz os produtos filtrados (1 etiqueta de cada).
    const filtrado = busca || categoria || filtroEstoque
    setEtiquetas(filtrado && lista.length <= 100 ? lista.filter((p) => p.ativo).map((p) => ({ produtoId: p.id, quantidade: 1 })) : [])
  }

  function abrirNovo(): void {
    const proximo = `P${String(produtos.reduce((m, p) => Math.max(m, p.id), 0) + 1).padStart(4, '0')}`
    form.reset({ ...vazio, codigo: proximo, estoqueMinimo: String(configuracoes.estoqueMinimoPadrao) })
    setEditando(null)
    setModalAberto(true)
  }

  function abrirEdicao(p: Produto): void {
    form.reset({
      codigo: p.codigo,
      codigoBarras: p.codigoBarras,
      nome: p.nome,
      categoriaId: String(p.categoriaId),
      unidadeId: String(p.unidadeId),
      precoCusto: String(p.precoCusto),
      precoVenda: String(p.precoVenda),
      estoque: String(p.estoque),
      estoqueMinimo: String(p.estoqueMinimo),
      ativo: p.ativo
    })
    setEditando(p)
    setModalAberto(true)
  }

  async function salvar(): Promise<void> {
    const dados = form.validate()
    if (!dados) return
    // Na edição o saldo é ignorado pelo banco: só muda por movimentação.
    const ok = await executar(() => alterar('produtos:salvar', editando?.id ?? null, dados), {
      notificar,
      form,
      sucesso: editando ? 'Produto atualizado.' : 'Produto cadastrado.'
    })
    if (ok) setModalAberto(false)
  }

  async function excluir(): Promise<void> {
    if (!excluindo) return
    const alvo = excluindo
    setExcluindo(null)
    await executar(() => alterar('produtos:excluir', alvo.id), { notificar, sucesso: 'Produto excluído.' })
  }

  const colunas: Coluna<Produto>[] = [
    { chave: 'codigo', titulo: 'Código', render: (p) => <span className="font-mono text-xs text-slate-600">{p.codigo}</span>, largura: '90px' },
    {
      chave: 'nome',
      titulo: 'Nome',
      render: (p) => (
        <span className="flex items-center gap-2">
          <button onClick={() => setFicha(p.id)} className="text-left font-medium text-slate-800 hover:text-blue-700 hover:underline" title="Abrir a ficha do produto">
            {p.nome}
          </button>
          {!p.ativo && <Badge>Inativo</Badge>}
        </span>
      )
    },
    { chave: 'categoria', titulo: 'Categoria', render: (p) => nomeCategoria(p.categoriaId) },
    {
      chave: 'estoque',
      titulo: 'Estoque',
      alinhar: 'direita',
      render: (p) => {
        const s = situacaoEstoque(p)
        const cls = s === 'zerado' ? 'text-red-600' : s === 'baixo' ? 'text-amber-700' : 'text-slate-800'
        return (
          <span className={`font-medium tabular-nums ${cls}`} title={`Mínimo: ${p.estoqueMinimo}`}>
            {fmt.numero(p.estoque)} <span className="text-xs font-normal text-slate-400">{siglaUnidade(p.unidadeId)}</span>
          </span>
        )
      }
    },
    { chave: 'preco', titulo: 'Preço', alinhar: 'direita', render: (p) => <span className="tabular-nums">{fmt.moeda(p.precoVenda)}</span> },
    {
      chave: 'situacao',
      titulo: 'Situação',
      render: (p) => {
        const s = situacaoEstoque(p)
        return s === 'zerado' ? <Badge cor="vermelho">Sem estoque</Badge> : s === 'baixo' ? <Badge cor="amarelo">Estoque baixo</Badge> : <Badge cor="verde">Normal</Badge>
      }
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      alinhar: 'direita',
      render: (p) => (
        <AcoesLinha
          extra={
            <button onClick={() => setFicha(p.id)} className="rounded-md border border-slate-300 bg-superficie px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
              Ficha
            </button>
          }
          onEditar={() => abrirEdicao(p)}
          onExcluir={() => setExcluindo(p)}
        />
      )
    }
  ]

  const margem =
    Number(form.values.precoCusto) > 0 && Number(form.values.precoVenda) > 0
      ? ((Number(form.values.precoVenda) - Number(form.values.precoCusto)) / Number(form.values.precoCusto)) * 100
      : null

  return (
    <>
      <PageHeader
        titulo="Produtos"
        subtitulo="Listagem de produtos cadastrados"
        acoes={
          <>
            <Button variante="secundario" icone={<Upload size={16} />} onClick={() => setImportando(true)}>Importar</Button>
            <Button variante="secundario" icone={<FileSpreadsheet size={16} />} onClick={exportar}>Excel</Button>
            <Button variante="secundario" icone={<Tags size={16} />} onClick={abrirEtiquetas}>Etiquetas</Button>
            <Button data-atalho="novo" icone={<Plus size={16} />} onClick={abrirNovo}>Novo Produto</Button>
          </>
        }
      />

      <Filtros>
        <SearchInput
          className="w-80"
          placeholder="Pesquisar por nome, código ou código de barras..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            // Leitor de código de barras: código exato + Enter abre o produto.
            const p = e.key === 'Enter' ? buscarPorCodigo(produtos, busca) : undefined
            if (p) {
              setBusca('')
              abrirEdicao(p)
            }
          }}
        />
        <Select
          className="w-48"
          placeholder="Todas as categorias"
          opcoes={categorias.map((c) => ({ value: c.id, label: c.nome }))}
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        />
        <Select
          className="w-48"
          placeholder="Todas as situações"
          opcoes={[
            { value: 'baixo', label: 'Abaixo do mínimo' },
            { value: 'inativos', label: 'Inativos' }
          ]}
          value={filtroEstoque}
          onChange={(e) => setParams(e.target.value ? { filtro: e.target.value } : {})}
        />
        <span className="ml-auto text-sm text-slate-500">{lista.length} produto(s)</span>
      </Filtros>

      <DataTable colunas={colunas} dados={lista} chave={(p) => p.id} vazio="Nenhum produto encontrado com esses filtros." />

      <Modal
        aberto={modalAberto}
        titulo={editando ? `Editar produto — ${editando.nome}` : 'Novo produto'}
        onFechar={() => setModalAberto(false)}
        tamanho="lg"
        rodape={
          <>
            <Button variante="secundario" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </>
        }
      >
        <div className="grid grid-cols-6 gap-4">
          <Input label="Código" obrigatorio wrapperClassName="col-span-2" {...form.bind('codigo')} />
          <Input
            label="Código de barras"
            wrapperClassName="col-span-4"
            placeholder="EAN-13 (leitor ou digitação)"
            inputMode="numeric"
            {...form.bind('codigoBarras')}
          />
          <Input label="Nome" obrigatorio wrapperClassName="col-span-6" {...form.bind('nome')} />
          <Select
            label="Categoria"
            obrigatorio
            wrapperClassName="col-span-3"
            placeholder="Selecione..."
            opcoes={categorias.map((c) => ({ value: c.id, label: c.nome }))}
            {...form.bind('categoriaId')}
          />
          <Select
            label="Unidade de medida"
            obrigatorio
            wrapperClassName="col-span-3"
            placeholder="Selecione..."
            opcoes={unidades.map((u) => ({ value: u.id, label: `${u.sigla} — ${u.nome}` }))}
            {...form.bind('unidadeId')}
          />
          <Input label="Preço de custo (R$)" obrigatorio type="number" step="0.01" min="0" wrapperClassName="col-span-2" {...form.bind('precoCusto')} />
          <Input
            label="Preço de venda (R$)"
            obrigatorio
            type="number"
            step="0.01"
            min="0"
            wrapperClassName="col-span-2"
            hint={margem !== null ? `Margem: ${margem.toFixed(1).replace('.', ',')}%` : undefined}
            {...form.bind('precoVenda')}
          />
          <div className="col-span-2" />
          <Input
            label={editando ? 'Estoque atual' : 'Estoque inicial'}
            type="number"
            min="0"
            wrapperClassName="col-span-2"
            disabled={!!editando}
            hint={editando ? 'Altere pela tela de Movimentações' : 'Gera uma entrada no histórico'}
            {...form.bind('estoque')}
          />
          <Input label="Estoque mínimo" obrigatorio type="number" min="0" wrapperClassName="col-span-2" {...form.bind('estoqueMinimo')} />
          <div className="col-span-2 flex items-end pb-2.5">
            <Checkbox label="Produto ativo" checked={form.values.ativo} onChange={(v) => form.set('ativo', v)} />
          </div>
        </div>
      </Modal>

      <ImportarModal tipo="produtos" aberto={importando} onFechar={() => setImportando(false)} />
      {ficha !== null && <FichaProduto produtoId={ficha} onFechar={() => setFicha(null)} />}
      <EtiquetasModal aberto={etiquetas !== null} inicial={etiquetas ?? []} onFechar={() => setEtiquetas(null)} />

      <ConfirmDialog
        aberto={!!excluindo}
        mensagem={<>Deseja excluir o produto <strong>{excluindo?.nome}</strong>? Esta ação não pode ser desfeita.</>}
        onConfirmar={excluir}
        onCancelar={() => setExcluindo(null)}
      />
    </>
  )
}

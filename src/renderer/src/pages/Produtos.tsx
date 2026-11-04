import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { db, useDb } from '@/data/store'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { AcoesLinha, DataTable, type Coluna } from '@/components/DataTable'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { Badge, Button, Checkbox, Input, SearchInput, Select } from '@/components/ui'
import { situacaoEstoque } from '@/lib/dominio'
import { produtoSchema } from '@/lib/schemas'
import { useForm } from '@/lib/useForm'
import * as fmt from '@/lib/format'
import type { Produto } from '@/types'

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
  const { produtos, categorias, unidades, movimentacoes, compras, configuracoes } = useDb()
  const { usuario } = useAuth()
  const notificar = useToast()
  const [params, setParams] = useSearchParams()

  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const filtroEstoque = params.get('filtro') ?? ''

  const [editando, setEditando] = useState<Produto | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [excluindo, setExcluindo] = useState<Produto | null>(null)
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

  function abrirNovo(): void {
    const proximo = `P${String(produtos.length + 1).padStart(4, '0')}`
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

  function salvar(): void {
    const dados = form.validate()
    if (!dados) return
    const duplicado = produtos.find((p) => p.codigo.toLowerCase() === dados.codigo.toLowerCase() && p.id !== editando?.id)
    if (duplicado) return form.setError('codigo', 'Já existe um produto com este código')

    if (editando) {
      // O saldo só muda por movimentação; aqui ele é ignorado.
      db.atualizar('produtos', editando.id, { ...dados, estoque: editando.estoque })
      notificar('sucesso', 'Produto atualizado.')
    } else {
      const novo = db.criar('produtos', { ...dados, estoque: 0 })
      if (dados.estoque > 0 && usuario) {
        db.movimentar({ produtoId: novo.id, tipo: 'entrada', quantidade: dados.estoque, motivo: 'Estoque inicial', usuarioId: usuario.id })
      }
      notificar('sucesso', 'Produto cadastrado.')
    }
    setModalAberto(false)
  }

  function excluir(): void {
    if (!excluindo) return
    const emUso =
      movimentacoes.some((m) => m.produtoId === excluindo.id) || compras.some((c) => c.itens.some((i) => i.produtoId === excluindo.id))
    if (emUso) {
      notificar('aviso', `"${excluindo.nome}" possui histórico de compras ou movimentações. Inative o produto em vez de excluir.`)
    } else {
      db.excluir('produtos', excluindo.id)
      notificar('sucesso', 'Produto excluído.')
    }
    setExcluindo(null)
  }

  const colunas: Coluna<Produto>[] = [
    { chave: 'codigo', titulo: 'Código', render: (p) => <span className="font-mono text-xs text-slate-600">{p.codigo}</span>, largura: '90px' },
    {
      chave: 'nome',
      titulo: 'Nome',
      render: (p) => (
        <span className="flex items-center gap-2">
          <span className="font-medium text-slate-800">{p.nome}</span>
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
    { chave: 'acoes', titulo: 'Ações', alinhar: 'direita', render: (p) => <AcoesLinha onEditar={() => abrirEdicao(p)} onExcluir={() => setExcluindo(p)} /> }
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
        acoes={<Button icone={<Plus size={16} />} onClick={abrirNovo}>Novo Produto</Button>}
      />

      <Filtros>
        <SearchInput className="w-80" placeholder="Pesquisar por nome, código ou código de barras..." value={busca} onChange={(e) => setBusca(e.target.value)} />
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

      <ConfirmDialog
        aberto={!!excluindo}
        mensagem={<>Deseja excluir o produto <strong>{excluindo?.nome}</strong>? Esta ação não pode ser desfeita.</>}
        onConfirmar={excluir}
        onCancelar={() => setExcluindo(null)}
      />
    </>
  )
}

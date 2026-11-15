import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ban, CheckCircle2, FileSpreadsheet, FolderInput, Plus, Tags, Trash2, Upload } from 'lucide-react'
import { alterar, useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { AcoesLinha, BotaoAcao, DataTable, iconeFicha, type Coluna } from '@/components/DataTable'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { Badge, Button, Checkbox, Input, SearchInput, Select } from '@/components/ui'
import { InputMoeda } from '@/components/InputMoeda'
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
import type { OperacaoLoteProduto } from '@shared/api'

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
  const [selecionados, setSelecionados] = useState<Set<string | number>>(new Set())
  const [excluindoLote, setExcluindoLote] = useState(false)
  const [trocandoCategoria, setTrocandoCategoria] = useState(false)
  const [novaCategoria, setNovaCategoria] = useState('')

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
  function exportar(itens: Produto[] = lista): void {
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
        linhas: itens.map((p) => [p.codigo, p.nome, p.codigoBarras, nomeCategoria(p.categoriaId), siglaUnidade(p.unidadeId), p.precoCusto, p.precoVenda, p.estoqueMinimo, p.estoque, p.ativo ? 'Sim' : 'Não'])
      },
      `produtos_${fmt.hojeIso()}`,
      notificar
    )
  }

  const escolhidos = lista.filter((p) => selecionados.has(p.id))

  /** Ação em lote: mostra o resumo (feitos e o que não deu, com o motivo) e limpa a seleção. */
  async function emLote(operacao: OperacaoLoteProduto, verbo: string): Promise<void> {
    const ids = escolhidos.map((p) => p.id)
    let r: { feitos: number; falhas: { item: string; motivo: string }[] } | null = null
    const ok = await executar(async () => (r = await alterar('produtos:emLote', ids, operacao)), { notificar })
    if (!ok || !r) return
    const { feitos, falhas } = r as { feitos: number; falhas: { item: string; motivo: string }[] }
    if (feitos) notificar('sucesso', `${feitos} produto${feitos > 1 ? 's' : ''} ${verbo}${feitos > 1 ? 's' : ''}.`)
    if (falhas.length) {
      const lista = falhas
        .slice(0, 3)
        .map((f) => `${f.item}: ${f.motivo}`)
        .join(' · ')
      notificar('aviso', `${falhas.length} não ${falhas.length > 1 ? 'puderam' : 'pôde'} ser ${verbo}${falhas.length > 1 ? 's' : ''} — ${lista}${falhas.length > 3 ? ' …' : ''}`)
    }
    setSelecionados(new Set(falhas.length ? escolhidos.filter((p) => falhas.some((f) => f.item.startsWith(`${p.codigo} —`))).map((p) => p.id) : []))
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
          extra={<BotaoAcao icone={iconeFicha} texto="Ficha" titulo="Histórico completo do produto" onClick={() => setFicha(p.id)} />}
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
            <Button variante="secundario" icone={<FileSpreadsheet size={16} />} onClick={() => exportar()}>Excel</Button>
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

      <DataTable
        colunas={colunas}
        dados={lista}
        chave={(p) => p.id}
        nomeItens="produtos"
        vazio="Nenhum produto encontrado com esses filtros."
        selecionados={selecionados}
        onSelecionar={setSelecionados}
        rotuloLinha={(p) => `${p.codigo} ${p.nome}`}
        acoesSelecao={
          <>
            <Button tamanho="sm" variante="secundario" icone={<CheckCircle2 size={14} />} onClick={() => void emLote({ tipo: 'ativar' }, 'ativado')}>
              Ativar
            </Button>
            <Button tamanho="sm" variante="secundario" icone={<Ban size={14} />} onClick={() => void emLote({ tipo: 'inativar' }, 'inativado')}>
              Inativar
            </Button>
            <Button
              tamanho="sm"
              variante="secundario"
              icone={<FolderInput size={14} />}
              onClick={() => {
                setNovaCategoria('')
                setTrocandoCategoria(true)
              }}
            >
              Mudar categoria
            </Button>
            <Button tamanho="sm" variante="secundario" icone={<Tags size={14} />} onClick={() => setEtiquetas(escolhidos.map((p) => ({ produtoId: p.id, quantidade: 1 })))}>
              Etiquetas
            </Button>
            <Button tamanho="sm" variante="secundario" icone={<FileSpreadsheet size={14} />} onClick={() => exportar(escolhidos)}>
              Excel
            </Button>
            <Button tamanho="sm" variante="perigo" icone={<Trash2 size={14} />} onClick={() => setExcluindoLote(true)}>
              Excluir
            </Button>
          </>
        }
      />

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
          <InputMoeda label="Preço de custo (R$)" obrigatorio wrapperClassName="col-span-2" {...form.bind('precoCusto')} />
          <InputMoeda
            label="Preço de venda (R$)"
            obrigatorio
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
        aberto={excluindoLote}
        titulo="Excluir produtos selecionados"
        textoConfirmar={`Excluir ${escolhidos.length}`}
        mensagem={
          <>
            Excluir <strong>{escolhidos.length} produto{escolhidos.length > 1 ? 's' : ''}</strong>? Produtos com movimentações, compras ou vendas no histórico não
            podem ser excluídos — esses serão mantidos (você pode inativá-los).
          </>
        }
        onConfirmar={() => {
          setExcluindoLote(false)
          void emLote({ tipo: 'excluir' }, 'excluído')
        }}
        onCancelar={() => setExcluindoLote(false)}
      />

      <Modal
        aberto={trocandoCategoria}
        titulo="Mudar categoria"
        tamanho="sm"
        onFechar={() => setTrocandoCategoria(false)}
        rodape={
          <>
            <Button variante="secundario" onClick={() => setTrocandoCategoria(false)}>Cancelar</Button>
            <Button
              disabled={!novaCategoria}
              onClick={() => {
                setTrocandoCategoria(false)
                void emLote({ tipo: 'categoria', categoriaId: Number(novaCategoria) }, 'alterado')
              }}
            >
              Aplicar
            </Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-slate-600">
          Os <strong>{escolhidos.length}</strong> produto{escolhidos.length > 1 ? 's selecionados passam' : ' selecionado passa'} para a categoria:
        </p>
        <Select label="Nova categoria" placeholder="Selecione..." opcoes={categorias.map((c) => ({ value: c.id, label: c.nome }))} value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} />
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

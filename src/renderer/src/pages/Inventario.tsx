import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Ban, CheckCircle2, ClipboardCheck, ClipboardList, Plus } from 'lucide-react'
import type { InventarioDetalhe, InventarioResumo, ItemInventario } from '@shared/api'
import { chamar, ErroApp } from '@/data/api'
import { alterar, useDb } from '@/data/store'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { BarraSaida } from '@/components/BarraSaida'
import { DataTable, type Coluna } from '@/components/DataTable'
import { LeitorCodigo } from '@/components/LeitorCodigo'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { Badge, Button, Card, Checkbox, Input, SearchInput, Select } from '@/components/ui'
import { executar } from '@/lib/executar'
import { formatar, type Relatorio } from '@/lib/relatorio'
import { relatorioExcel, relatorioImprimir, relatorioPdf } from '@/lib/saida'
import * as fmt from '@shared/format'

const rotuloStatus = { aberto: 'Em contagem', concluido: 'Concluído', cancelado: 'Cancelado' } as const
const corStatus = { aberto: 'azul', concluido: 'verde', cancelado: 'cinza' } as const

export default function Inventario() {
  const [lista, setLista] = useState<InventarioResumo[]>([])
  const [atual, setAtual] = useState<InventarioDetalhe | null>(null)
  const [iniciando, setIniciando] = useState(false)
  const notificar = useToast()

  const carregar = useCallback(async (abrirId?: number) => {
    try {
      const l = await chamar('inventario:listar')
      setLista(l)
      const alvo = abrirId ?? l.find((i) => i.status === 'aberto')?.id
      setAtual(alvo ? await chamar('inventario:obter', alvo) : null)
    } catch (e) {
      notificar('erro', e instanceof ErroApp ? e.message : 'Não foi possível carregar os inventários.')
    }
  }, [notificar])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (atual?.status === 'aberto') return <Contagem inventario={atual} onAtualizar={setAtual} onFim={(id) => void carregar(id)} />

  return (
    <>
      <PageHeader
        titulo="Inventário"
        subtitulo="Contagem do estoque físico, com ajuste automático das diferenças"
        acoes={<Button data-atalho="novo" icone={<Plus size={16} />} onClick={() => setIniciando(true)}>Iniciar contagem</Button>}
      />

      {atual ? (
        <RelatorioInventario inventario={atual} onVoltar={() => setAtual(null)} />
      ) : (
        <Historico lista={lista} onAbrir={(id) => void carregar(id)} />
      )}

      <NovoInventario
        aberto={iniciando}
        onFechar={() => setIniciando(false)}
        onIniciado={(inv) => {
          setIniciando(false)
          setAtual(inv)
          void carregar(inv.id)
        }}
      />
    </>
  )
}

// ---------- Histórico ----------

function Historico({ lista, onAbrir }: { lista: InventarioResumo[]; onAbrir: (id: number) => void }) {
  const colunas: Coluna<InventarioResumo>[] = [
    { chave: 'numero', titulo: 'Número', render: (i) => <span className="font-medium text-slate-800">{i.numero}</span> },
    { chave: 'descricao', titulo: 'Descrição', render: (i) => i.descricao || <span className="text-slate-400">—</span> },
    { chave: 'inicio', titulo: 'Início', render: (i) => <span className="tabular-nums">{fmt.dataHora(i.criadoEm)}</span> },
    { chave: 'fim', titulo: 'Conclusão', render: (i) => (i.concluidoEm ? <span className="tabular-nums">{fmt.dataHora(i.concluidoEm)}</span> : '—') },
    { chave: 'contados', titulo: 'Contados', alinhar: 'direita', render: (i) => `${i.contados} de ${i.itens}` },
    { chave: 'ajustados', titulo: 'Ajustados', alinhar: 'direita', render: (i) => (i.status === 'concluido' ? i.ajustados : '—') },
    { chave: 'status', titulo: 'Status', render: (i) => <Badge cor={corStatus[i.status]}>{rotuloStatus[i.status]}</Badge> },
    {
      chave: 'acoes',
      titulo: '',
      alinhar: 'direita',
      render: (i) => (
        <button onClick={() => onAbrir(i.id)} className="rounded-md border border-slate-300 bg-superficie px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
          Ver
        </button>
      )
    }
  ]
  if (lista.length === 0) {
    return (
      <Card className="p-10 text-center">
        <ClipboardList size={40} className="mx-auto mb-3 text-slate-300" />
        <p className="font-medium text-slate-800">Nenhum inventário ainda</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Clique em <strong>Iniciar contagem</strong>, conte os produtos (digitando ou com o leitor de código de barras) e conclua: o sistema ajusta o
          estoque de cada produto com diferença.
        </p>
      </Card>
    )
  }
  return <DataTable colunas={colunas} dados={lista} chave={(i) => i.id} />
}

function NovoInventario({ aberto, onFechar, onIniciado }: { aberto: boolean; onFechar: () => void; onIniciado: (i: InventarioDetalhe) => void }) {
  const { categorias } = useDb()
  const notificar = useToast()
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('')

  async function iniciar(): Promise<void> {
    let inv: InventarioDetalhe | null = null
    const ok = await executar(async () => (inv = await chamar('inventario:abrir', { descricao, categoriaId: categoria ? Number(categoria) : null })), { notificar })
    if (ok && inv) {
      setDescricao('')
      setCategoria('')
      onIniciado(inv)
    }
  }

  return (
    <Modal
      aberto={aberto}
      titulo="Iniciar contagem"
      onFechar={onFechar}
      tamanho="sm"
      rodape={
        <>
          <Button variante="secundario" onClick={onFechar}>Cancelar</Button>
          <Button icone={<ClipboardCheck size={16} />} onClick={iniciar}>Iniciar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Descrição" placeholder="Ex.: Inventário de novembro" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        <Select
          label="Produtos a contar"
          placeholder="Todos os produtos ativos"
          opcoes={categorias.map((c) => ({ value: c.id, label: `Só a categoria ${c.nome}` }))}
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        />
        <p className="text-xs text-slate-500">
          Evite vender ou receber mercadorias durante a contagem: ao concluir, a quantidade contada substitui o saldo do sistema naquele momento.
        </p>
      </div>
    </Modal>
  )
}

// ---------- Contagem ----------

function Contagem({ inventario: inv, onAtualizar, onFim }: { inventario: InventarioDetalhe; onAtualizar: (i: InventarioDetalhe) => void; onFim: (id: number) => void }) {
  const { produtos, categorias } = useDb()
  const { pode } = useAuth()
  const notificar = useToast()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('')
  const [destaque, setDestaque] = useState<number | null>(null)
  const [concluindo, setConcluindo] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [naoContadosZero, setNaoContadosZero] = useState(false)
  // As gravações vão em fila: leituras rápidas do leitor não se perdem nem chegam fora de ordem.
  const fila = useRef(Promise.resolve())

  const produto = (id: number) => produtos.find((p) => p.id === id)

  function gravar(item: ItemInventario, contado: number | null): void {
    onAtualizar({ ...inv, lista: inv.lista.map((i) => (i.id === item.id ? { ...i, contado } : i)), contados: inv.contados + (item.contado === null && contado !== null ? 1 : item.contado !== null && contado === null ? -1 : 0) })
    fila.current = fila.current
      .then(() => chamar('inventario:contar', item.id, contado))
      .catch((e) => notificar('erro', e instanceof ErroApp ? e.message : 'Não foi possível gravar a contagem.'))
  }

  function lido(produtoId: number): void {
    const item = inv.lista.find((i) => i.produtoId === produtoId)
    if (!item) return notificar('aviso', `"${produto(produtoId)?.nome}" não faz parte deste inventário.`)
    gravar(item, (item.contado ?? 0) + 1)
    setDestaque(produtoId)
    setBusca('')
    setFiltro('')
  }

  const linhas = useMemo(
    () =>
      inv.lista
        .map((i) => ({ ...i, p: produto(i.produtoId) }))
        .filter(({ p, contado }) => {
          if (!p) return false
          if (busca && !fmt.contem(p.nome, busca) && !fmt.contem(p.codigo, busca) && !p.codigoBarras.includes(busca.trim())) return false
          if (filtro === 'pendentes') return contado === null
          if (filtro === 'divergentes') return contado !== null && contado !== p.estoque
          return true
        })
        .sort((a, b) => (a.produtoId === destaque ? -1 : b.produtoId === destaque ? 1 : a.p!.nome.localeCompare(b.p!.nome))),
    [inv.lista, produtos, busca, filtro, destaque] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const contados = inv.lista.filter((i) => i.contado !== null)
  const divergentes = contados.filter((i) => i.contado !== produto(i.produtoId)?.estoque)
  const valorDiferenca = contados.reduce((s, i) => {
    const p = produto(i.produtoId)
    return s + (p ? (i.contado! - p.estoque) * p.precoCusto : 0)
  }, 0)
  const naoContados = inv.itens - inv.contados

  async function concluir(): Promise<void> {
    await fila.current
    let msg = ''
    const ok = await executar(
      async () => {
        const r = await alterar('inventario:concluir', inv.id, { naoContadosZero })
        msg = r.ajustados
          ? `${inv.numero} concluído: ${r.ajustados} produto(s) ajustado(s), diferença de ${fmt.numero(r.unidades)} un. (${fmt.moeda(r.valor)}).`
          : `${inv.numero} concluído: o estoque físico bate com o sistema.`
      },
      { notificar }
    )
    if (!ok) return
    setConcluindo(false)
    notificar('sucesso', msg)
    onFim(inv.id)
  }

  async function cancelar(): Promise<void> {
    setCancelando(false)
    const ok = await executar(() => chamar('inventario:cancelar', inv.id), { notificar, sucesso: `${inv.numero} cancelado. Nenhum ajuste foi feito.` })
    if (ok) onFim(inv.id)
  }

  const colunas: Coluna<(typeof linhas)[number]>[] = [
    { chave: 'codigo', titulo: 'Código', largura: '90px', render: (l) => <span className="font-mono text-xs text-slate-600">{l.p!.codigo}</span> },
    {
      chave: 'produto',
      titulo: 'Produto',
      render: (l) => (
        <span className={l.produtoId === destaque ? 'font-semibold text-blue-700' : 'font-medium text-slate-800'}>
          {l.p!.nome}
          {l.produtoId === destaque && <span className="ml-2 text-xs font-normal text-blue-500">último lido</span>}
        </span>
      )
    },
    { chave: 'sistema', titulo: 'No sistema', alinhar: 'direita', render: (l) => <span className="tabular-nums text-slate-600">{fmt.numero(l.p!.estoque)}</span> },
    {
      chave: 'contado',
      titulo: 'Contado',
      alinhar: 'direita',
      largura: '130px',
      render: (l) => <CampoContagem key={`${l.id}-${l.contado}`} valor={l.contado} nome={l.p!.nome} onSalvar={(v) => gravar(l, v)} />
    },
    {
      chave: 'dif',
      titulo: 'Diferença',
      alinhar: 'direita',
      render: (l) => {
        if (l.contado === null) return <span className="text-slate-400">—</span>
        const d = l.contado - l.p!.estoque
        return <span className={`font-medium tabular-nums ${d === 0 ? 'text-emerald-700' : d < 0 ? 'text-red-600' : 'text-amber-700'}`}>{d === 0 ? 'OK' : `${d > 0 ? '+' : ''}${fmt.numero(d)}`}</span>
      }
    },
    {
      chave: 'valor',
      titulo: 'Valor (custo)',
      alinhar: 'direita',
      render: (l) => (l.contado === null || l.contado === l.p!.estoque ? '' : <span className="tabular-nums text-slate-600">{fmt.moeda((l.contado - l.p!.estoque) * l.p!.precoCusto)}</span>)
    }
  ]

  return (
    <>
      <PageHeader
        titulo={`Inventário ${inv.numero}`}
        subtitulo={`${inv.descricao ? `${inv.descricao} · ` : ''}${inv.categoriaId ? `Categoria ${categorias.find((c) => c.id === inv.categoriaId)?.nome ?? ''} · ` : ''}iniciado em ${fmt.dataHora(inv.criadoEm)} por ${inv.criadoPor}`}
        acoes={
          pode('inventarioConcluir') && (
            <>
              <Button variante="secundario" icone={<Ban size={16} />} onClick={() => setCancelando(true)}>Cancelar</Button>
              <Button icone={<CheckCircle2 size={16} />} onClick={() => setConcluindo(true)} disabled={inv.contados === 0}>Concluir inventário</Button>
            </>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Contados</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {inv.contados} <span className="text-sm font-normal text-slate-500">de {inv.itens}</span>
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${(inv.contados / inv.itens) * 100}%` }} />
          </div>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Com diferença</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{divergentes.length}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Diferença em valor</p>
          <p className={`mt-1 text-xl font-bold ${valorDiferenca < 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmt.moeda(valorDiferenca)}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Falta contar</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{naoContados}</p>
        </Card>
      </div>

      <div className="mb-4">
        <LeitorCodigo autoFocus somenteAtivos={false} onEncontrar={(p) => lido(p.id)} placeholder="Leia o código de barras de cada unidade (soma 1 na contagem) ou digite o código e tecle Enter" />
      </div>

      <Filtros>
        <SearchInput className="w-72" placeholder="Pesquisar produto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select
          className="w-48"
          placeholder="Todos os produtos"
          opcoes={[
            { value: 'pendentes', label: 'Ainda não contados' },
            { value: 'divergentes', label: 'Com diferença' }
          ]}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
        <span className="ml-auto text-xs text-slate-500">As contagens são gravadas na hora: dá para fechar o sistema e continuar depois.</span>
      </Filtros>

      <DataTable colunas={colunas} dados={linhas} chave={(l) => l.id} porPagina={25} vazio="Nenhum produto com esse filtro." />

      <Modal
        aberto={concluindo}
        titulo={`Concluir ${inv.numero}`}
        onFechar={() => setConcluindo(false)}
        tamanho="sm"
        rodape={
          <>
            <Button variante="secundario" onClick={() => setConcluindo(false)}>Voltar</Button>
            <Button icone={<CheckCircle2 size={16} />} onClick={concluir}>Concluir e ajustar estoque</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            Será lançado um <strong>ajuste de estoque</strong> para cada produto contado com diferença ({divergentes.length} hoje, somando{' '}
            {fmt.moeda(valorDiferenca)} a preço de custo). Depois de concluído, o inventário não pode mais ser alterado.
          </p>
          {naoContados > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
              <p className="mb-2">{naoContados} produto(s) não foram contados.</p>
              <Checkbox label="Considerar os não contados como zero (zera o estoque deles)" checked={naoContadosZero} onChange={setNaoContadosZero} />
              <p className="mt-1 text-xs">Sem marcar, o estoque dos não contados fica como está.</p>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        aberto={cancelando}
        titulo="Cancelar inventário"
        textoConfirmar="Cancelar inventário"
        mensagem="As contagens deste inventário serão descartadas e nenhum ajuste será feito."
        onConfirmar={cancelar}
        onCancelar={() => setCancelando(false)}
      />
    </>
  )
}

/** Campo de quantidade: grava ao sair do campo ou com Enter. Vazio = não contado. */
function CampoContagem({ valor, nome, onSalvar }: { valor: number | null; nome: string; onSalvar: (v: number | null) => void }) {
  const [texto, setTexto] = useState(valor === null ? '' : String(valor))
  function salvar(): void {
    const t = texto.trim()
    const v = t === '' ? null : Math.floor(Number(t))
    if (v !== null && (!Number.isFinite(v) || v < 0)) return setTexto(valor === null ? '' : String(valor))
    if (v !== valor) onSalvar(v)
  }
  return (
    <input
      type="number"
      min="0"
      step="1"
      aria-label={`Quantidade contada de ${nome}`}
      value={texto}
      placeholder="—"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      className={`h-9 w-24 rounded-lg border px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-100 ${valor === null ? 'border-slate-300 bg-superficie' : 'border-blue-300 bg-blue-50/50'}`}
    />
  )
}

// ---------- Relatório de um inventário encerrado ----------

function RelatorioInventario({ inventario: inv, onVoltar }: { inventario: InventarioDetalhe; onVoltar: () => void }) {
  const { produtos, configuracoes } = useDb()
  const notificar = useToast()
  const [soDiferencas, setSoDiferencas] = useState(true)

  const relatorio = useMemo<Relatorio>(() => {
    const itens = inv.lista
      .map((i) => ({ ...i, p: produtos.find((x) => x.id === i.produtoId) }))
      .filter((i) => i.p && (!soDiferencas || (i.ajuste !== null && i.ajuste !== 0)))
      .sort((a, b) => (a.ajuste ?? 0) - (b.ajuste ?? 0))
    const valor = itens.reduce((s, i) => s + (i.ajuste ?? 0) * i.p!.precoCusto, 0)
    return {
      titulo: `Inventário ${inv.numero}`,
      filtros: [
        inv.descricao || 'Sem descrição',
        `${rotuloStatus[inv.status]}${inv.concluidoEm ? ` em ${fmt.dataHora(inv.concluidoEm)}` : ''}${inv.concluidoPor ? ` por ${inv.concluidoPor}` : ''}`,
        inv.naoContadosZero ? 'Não contados considerados zero' : 'Não contados mantidos',
        soDiferencas ? 'Só produtos com diferença' : 'Todos os produtos'
      ],
      resumo: [
        { rotulo: 'Produtos', valor: fmt.numero(inv.itens) },
        { rotulo: 'Contados', valor: fmt.numero(inv.contados) },
        { rotulo: 'Ajustados', valor: fmt.numero(inv.ajustados) },
        { rotulo: 'Diferença (custo)', valor: fmt.moeda(valor) }
      ],
      colunas: [
        { titulo: 'Código', peso: 0.8 },
        { titulo: 'Produto', peso: 2.4 },
        { titulo: 'Sistema', formato: 'numero' },
        { titulo: 'Contado', formato: 'numero' },
        { titulo: 'Diferença', formato: 'numero' },
        { titulo: 'Valor (custo)', formato: 'moeda', peso: 1.1 }
      ],
      linhas: itens.map((i) => [i.p!.codigo, i.p!.nome, i.saldoSistema, i.contado, i.ajuste, i.ajuste ? i.ajuste * i.p!.precoCusto : null]),
      totais: ['Total', null, null, null, itens.reduce((s, i) => s + (i.ajuste ?? 0), 0), valor]
    }
  }, [inv, produtos, soDiferencas])

  const nome = `inventario-${inv.numero}`
  return (
    <>
      <Filtros>
        <Button variante="secundario" onClick={onVoltar}>← Todos os inventários</Button>
        <Badge cor={corStatus[inv.status]}>{rotuloStatus[inv.status]}</Badge>
        <Checkbox label="Só produtos com diferença" checked={soDiferencas} onChange={setSoDiferencas} />
        <div className="ml-auto">
          <BarraSaida
            onExcel={() => relatorioExcel(relatorio, nome, notificar)}
            onPdf={() => relatorioPdf(relatorio, configuracoes.nomeEmpresa, nome, notificar)}
            onImprimir={() => relatorioImprimir(relatorio, configuracoes.nomeEmpresa, notificar)}
          />
        </div>
      </Filtros>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {relatorio.resumo!.map((r) => (
          <Card key={r.rotulo} className="px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{r.rotulo}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{r.valor}</p>
          </Card>
        ))}
      </div>
      <DataTable
        colunas={relatorio.colunas.map((c, idx) => ({
          chave: String(idx),
          titulo: c.titulo,
          alinhar: c.formato === 'numero' || c.formato === 'moeda' ? 'direita' : 'esquerda',
          render: (l: { v: (string | number | null)[] }) => <span className="tabular-nums">{formatar(l.v[idx], c.formato)}</span>
        }))}
        dados={relatorio.linhas.map((v, i) => ({ i, v }))}
        chave={(l) => l.i}
        porPagina={20}
        vazio={inv.status === 'cancelado' ? 'Inventário cancelado: nenhum ajuste foi feito.' : 'Nenhuma diferença: o estoque físico bateu com o sistema.'}
      />
    </>
  )
}

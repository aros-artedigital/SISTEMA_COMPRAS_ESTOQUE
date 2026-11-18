import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, FileDown, FileSpreadsheet, History, KeyRound, Lock, Pencil, Plus, Printer, Trash2, Wrench } from 'lucide-react'
import { alterar, useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { AcoesLinha, BotaoAcao, DataTable, iconeFicha, type Coluna } from '@/components/DataTable'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { Badge, Button, Input, SearchInput, Select, Textarea } from '@/components/ui'
import { InputMoeda } from '@/components/InputMoeda'
import { LeitorCodigo } from '@/components/LeitorCodigo'
import { AcoesLote } from '@/components/AcoesLote'
import { EditorSenha, erroSenha, VerSenha } from '@/components/SenhaEquipamento'
import {
  corStatusOS,
  descreverEquipamento,
  ETAPAS_OS,
  osAtrasada,
  osEmAndamento,
  proximosStatusOS,
  rotuloSenhaOS,
  rotuloStatusOS,
  subtotalOS,
  TIPOS_EQUIPAMENTO,
  totalOS
} from '@shared/dominio'
import { osSchema } from '@shared/schemas'
import { useForm } from '@/lib/useForm'
import { executar } from '@/lib/executar'
import { useLote } from '@/lib/lote'
import { exportarExcel, imprimir, salvarPdf } from '@/lib/saida'
import { htmlOS } from '@/lib/htmlOS'
import * as fmt from '@shared/format'
import type { ItemOS, OrdemServico, SenhaOS, StatusOS } from '@shared/tipos'

// Ordens de serviço (assistência técnica): recepção do equipamento, diagnóstico, orçamento,
// execução e entrega. As peças saem do estoque quando a OS fica pronta.

interface LinhaItem {
  chave: number
  tipo: 'peca' | 'servico'
  produtoId: string
  descricao: string
  quantidade: string
  valorUnitario: string
}

let chaveLinha = 1
const novaLinha = (tipo: LinhaItem['tipo']): LinhaItem => ({ chave: chaveLinha++, tipo, produtoId: '', descricao: '', quantidade: '1', valorUnitario: '' })

const vazio = {
  clienteId: '',
  tecnicoId: '',
  previsao: '',
  equipTipo: '',
  equipMarca: '',
  equipModelo: '',
  equipSerie: '',
  acessorios: '',
  estadoFisico: '',
  defeito: '',
  diagnostico: '',
  laudo: '',
  observacao: '',
  desconto: '',
  garantiaDias: '90'
}

/** Filtros da lista além dos status: "em andamento" (todas abertas) e "atrasadas". */
type Filtro = '' | 'andamento' | 'atrasadas' | StatusOS

export default function OrdensServico() {
  const { pode } = useAuth()
  const db = useDb()
  const { ordensServico, clientes, usuarios, produtos } = db
  const notificar = useToast()
  const [params, setParams] = useSearchParams()

  const [busca, setBusca] = useState('')
  const filtro = (params.get('filtro') ?? '') as Filtro
  const setFiltro = (f: string): void => setParams(f ? { filtro: f } : {}, { replace: true })

  const [editando, setEditando] = useState<OrdemServico | null>(null)
  const [aberto, setAberto] = useState(false)
  const [itens, setItens] = useState<LinhaItem[]>([])
  const [erroItens, setErroItens] = useState('')
  // Senha do equipamento: null = não mexeu (ao editar, a senha atual é mantida e nunca é carregada na tela).
  const [senha, setSenha] = useState<SenhaOS | null>(null)
  const [erroSenhaForm, setErroSenhaForm] = useState('')
  const [fichaId, setFichaId] = useState<number | null>(null)
  const [excluindo, setExcluindo] = useState<OrdemServico | null>(null)
  const form = useForm(vazio, osSchema)

  const hoje = fmt.hojeIso()
  const nomeCliente = (id: number): string => clientes.find((c) => c.id === id)?.nome ?? '—'
  const nomeUsuario = (id: number | null): string => (id ? (usuarios.find((u) => u.id === id)?.nome ?? '—') : '—')

  const lista = useMemo(
    () =>
      ordensServico
        .filter((o) => {
          if (filtro === 'andamento' && !osEmAndamento(o.status)) return false
          if (filtro === 'atrasadas' && !osAtrasada(o, hoje)) return false
          if (filtro && filtro !== 'andamento' && filtro !== 'atrasadas' && o.status !== filtro) return false
          if (!busca) return true
          return [o.numero, nomeCliente(o.clienteId), descreverEquipamento(o), o.equipSerie, o.defeito].some((t) => fmt.contem(t, busca))
        })
        .sort((a, b) => b.dataEntrada.localeCompare(a.dataEntrada) || b.id - a.id),
    [ordensServico, clientes, busca, filtro, hoje] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const contagem = useMemo(
    () => ({
      andamento: ordensServico.filter((o) => osEmAndamento(o.status)).length,
      prontas: ordensServico.filter((o) => o.status === 'pronta').length,
      atrasadas: ordensServico.filter((o) => osAtrasada(o, hoje)).length
    }),
    [ordensServico, hoje]
  )

  function abrir(o: OrdemServico | null): void {
    setEditando(o)
    setErroItens('')
    if (o) {
      form.reset({
        clienteId: String(o.clienteId),
        tecnicoId: o.tecnicoId ? String(o.tecnicoId) : '',
        previsao: o.previsao ?? '',
        equipTipo: o.equipTipo,
        equipMarca: o.equipMarca,
        equipModelo: o.equipModelo,
        equipSerie: o.equipSerie,
        acessorios: o.acessorios,
        estadoFisico: o.estadoFisico,
        defeito: o.defeito,
        diagnostico: o.diagnostico,
        laudo: o.laudo,
        observacao: o.observacao,
        desconto: o.desconto ? String(o.desconto) : '',
        garantiaDias: String(o.garantiaDias)
      })
      setItens(
        o.itens.map((i) => ({
          chave: chaveLinha++,
          tipo: i.tipo,
          produtoId: i.produtoId ? String(i.produtoId) : '',
          descricao: i.descricao,
          quantidade: String(i.quantidade),
          valorUnitario: String(i.valorUnitario)
        }))
      )
    } else {
      form.reset(vazio)
      setItens([])
    }
    setSenha(null)
    setErroSenhaForm('')
    setFichaId(null)
    setAberto(true)
  }

  function alterarItem(chave: number, campo: keyof Omit<LinhaItem, 'chave' | 'tipo'>, valor: string): void {
    setErroItens('')
    setItens((l) =>
      l.map((x) => {
        if (x.chave !== chave) return x
        const nova = { ...x, [campo]: valor }
        // Ao escolher a peça, sugere o preço de venda do produto.
        if (campo === 'produtoId' && !x.valorUnitario) {
          const p = produtos.find((p) => p.id === Number(valor))
          if (p) nova.valorUnitario = String(p.precoVenda)
        }
        return nova
      })
    )
  }

  /** Leitor de código: adiciona a peça ou soma 1 se ela já estiver na OS. */
  function adicionarPorCodigo(p: { id: number; precoVenda: number }): void {
    setErroItens('')
    setItens((l) => {
      const existente = l.find((x) => x.tipo === 'peca' && x.produtoId === String(p.id))
      if (existente) return l.map((x) => (x === existente ? { ...x, quantidade: String((Number(x.quantidade) || 0) + 1) } : x))
      return [...l, { ...novaLinha('peca'), produtoId: String(p.id), valorUnitario: String(p.precoVenda) }]
    })
  }

  function validarItens(): ItemOS[] | null {
    const preenchidos = itens.filter((l) => (l.tipo === 'peca' ? l.produtoId : l.descricao.trim()) || l.valorUnitario)
    const convertidos: ItemOS[] = []
    for (const l of preenchidos) {
      if (l.tipo === 'peca' && !l.produtoId) return setErroItens('Escolha o produto de cada peça.'), null
      if (l.tipo === 'servico' && !l.descricao.trim()) return setErroItens('Descreva cada serviço.'), null
      const quantidade = Number(l.quantidade)
      const valorUnitario = Number(l.valorUnitario)
      if (!Number.isInteger(quantidade) || quantidade <= 0) return setErroItens('Quantidades devem ser números inteiros maiores que zero.'), null
      if (l.valorUnitario === '' || Number.isNaN(valorUnitario) || valorUnitario < 0) return setErroItens('Informe o valor de cada peça e serviço.'), null
      convertidos.push({ tipo: l.tipo, produtoId: l.tipo === 'peca' ? Number(l.produtoId) : null, descricao: l.tipo === 'servico' ? l.descricao.trim() : '', quantidade, valorUnitario })
    }
    return convertidos
  }

  async function salvar(): Promise<void> {
    const dados = form.validate()
    const itensValidos = validarItens()
    const problemaSenha = senha ? erroSenha(senha) : null
    setErroSenhaForm(problemaSenha ?? '')
    if (!dados || !itensValidos || problemaSenha) return
    // Só manda a senha quando ela foi mexida (e não é "sem senha" numa OS que já não tinha).
    const enviarSenha = senha && !(senha.tipo === 'nenhuma' && (editando?.senhaTipo ?? 'nenhuma') === 'nenhuma') ? senha : undefined
    let salva: OrdemServico | null = null
    const ok = await executar(async () => (salva = await alterar('os:salvar', editando?.id ?? null, { ...dados, itens: itensValidos, senha: enviarSenha })), { notificar, form })
    if (ok && salva) {
      const o = salva as OrdemServico
      notificar('sucesso', `Ordem de serviço ${o.numero} ${editando ? 'atualizada' : 'aberta'}.`)
      setAberto(false)
      if (!editando) setFichaId(o.id)
    }
  }

  async function excluir(): Promise<void> {
    if (!excluindo) return
    const alvo = excluindo
    setExcluindo(null)
    await executar(() => alterar('os:excluir', alvo.id), { notificar, sucesso: `Ordem de serviço ${alvo.numero} excluída.` })
  }

  function exportar(itensExportar: OrdemServico[] = lista): void {
    void exportarExcel(
      {
        nome: 'Ordens de serviço',
        colunas: [
          { titulo: 'Número' },
          { titulo: 'Entrada', formato: 'dataHora' },
          { titulo: 'Cliente' },
          { titulo: 'Equipamento' },
          { titulo: 'Nº de série / IMEI' },
          { titulo: 'Defeito' },
          { titulo: 'Técnico' },
          { titulo: 'Previsão', formato: 'data' },
          { titulo: 'Status' },
          { titulo: 'Total', formato: 'moeda' }
        ],
        linhas: itensExportar.map((o) => [
          o.numero,
          o.dataEntrada,
          nomeCliente(o.clienteId),
          descreverEquipamento(o),
          o.equipSerie,
          o.defeito,
          o.tecnicoId ? nomeUsuario(o.tecnicoId) : '',
          o.previsao,
          rotuloStatusOS[o.status],
          totalOS(o)
        ])
      },
      `ordens-servico_${fmt.hojeIso()}`,
      notificar
    )
  }

  const lote = useLote(notificar, { nome: ['ordem de serviço', 'ordens de serviço'], feminino: true })
  const escolhidas = lista.filter((o) => lote.selecionados.has(o.id))

  const colunas: Coluna<OrdemServico>[] = [
    {
      chave: 'numero',
      titulo: 'Número',
      render: (o) => (
        <button className="font-medium text-blue-700 hover:underline" onClick={() => setFichaId(o.id)} title="Abrir a ficha da OS">
          {o.numero}
        </button>
      )
    },
    { chave: 'entrada', titulo: 'Entrada', render: (o) => <span className="tabular-nums">{fmt.data(o.dataEntrada)}</span> },
    { chave: 'cliente', titulo: 'Cliente', render: (o) => nomeCliente(o.clienteId) },
    {
      chave: 'equipamento',
      titulo: 'Equipamento',
      render: (o) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate text-slate-800">
            {descreverEquipamento(o)}
            {o.senhaTipo !== 'nenhuma' && <Lock size={12} className="shrink-0 text-slate-400" aria-label="Tem senha cadastrada" />}
          </p>
          <p className="truncate text-xs text-slate-500">{o.defeito}</p>
        </div>
      )
    },
    { chave: 'tecnico', titulo: 'Técnico', render: (o) => <span className="text-slate-600">{nomeUsuario(o.tecnicoId)}</span> },
    {
      chave: 'previsao',
      titulo: 'Previsão',
      render: (o) =>
        o.previsao ? <span className={`tabular-nums ${osAtrasada(o, hoje) ? 'font-semibold text-red-600' : ''}`}>{fmt.data(o.previsao)}</span> : <span className="text-slate-400">—</span>
    },
    { chave: 'total', titulo: 'Total', alinhar: 'direita', render: (o) => <span className="font-medium tabular-nums">{fmt.moeda(totalOS(o))}</span> },
    {
      chave: 'status',
      titulo: 'Status',
      render: (o) => (
        <span className="inline-flex items-center gap-1">
          <Badge cor={corStatusOS[o.status]}>{rotuloStatusOS[o.status]}</Badge>
          {osAtrasada(o, hoje) && <Badge cor="vermelho">Atrasada</Badge>}
        </span>
      )
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      alinhar: 'direita',
      render: (o) => (
        <AcoesLinha
          extra={<BotaoAcao icone={iconeFicha} texto="Ficha" titulo="Abrir a ficha da OS (andamento, impressão)" onClick={() => setFichaId(o.id)} />}
          onEditar={pode('osEditar') && osEmAndamento(o.status) ? () => abrir(o) : undefined}
          onExcluir={pode('osExcluir') && !o.estoqueBaixado && o.status !== 'entregue' ? () => setExcluindo(o) : undefined}
        />
      )
    }
  ]

  const subtotalForm = itens.reduce((s, l) => s + (Number(l.quantidade) || 0) * (Number(l.valorUnitario) || 0), 0)
  const totalForm = Math.max(0, subtotalForm - (Number(form.values.desconto) || 0))
  const ficha = fichaId ? ordensServico.find((o) => o.id === fichaId) : undefined

  const opcoesFiltro = [
    { value: 'andamento', label: `Em andamento (${contagem.andamento})` },
    { value: 'atrasadas', label: `Atrasadas (${contagem.atrasadas})` },
    ...(Object.keys(rotuloStatusOS) as StatusOS[]).map((s) => ({ value: s, label: rotuloStatusOS[s] }))
  ]

  return (
    <>
      <PageHeader
        titulo="Ordens de Serviço"
        subtitulo="Assistência técnica: entrada do equipamento, diagnóstico, orçamento, execução e entrega"
        acoes={
          <>
            <Button variante="secundario" icone={<FileSpreadsheet size={16} />} onClick={() => exportar()}>
              Excel
            </Button>
            {pode('osEditar') && (
              <Button data-atalho="novo" icone={<Plus size={16} />} onClick={() => abrir(null)}>
                Nova OS
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(
          [
            { f: 'andamento', titulo: 'Em andamento', valor: contagem.andamento, cor: 'text-blue-700' },
            { f: 'pronta', titulo: 'Prontas para retirada', valor: contagem.prontas, cor: 'text-emerald-700' },
            { f: 'atrasadas', titulo: 'Atrasadas', valor: contagem.atrasadas, cor: contagem.atrasadas ? 'text-red-600' : 'text-slate-500' }
          ] as const
        ).map((c) => (
          <button
            key={c.f}
            onClick={() => setFiltro(filtro === c.f ? '' : c.f)}
            aria-pressed={filtro === c.f}
            className={`rounded-xl border bg-superficie px-4 py-3 text-left shadow-sm transition-colors hover:bg-slate-50 ${filtro === c.f ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}
          >
            <p className="text-xs font-medium text-slate-500">{c.titulo}</p>
            <p className={`text-2xl font-bold tabular-nums ${c.cor}`}>{c.valor}</p>
          </button>
        ))}
      </div>

      <Filtros>
        <SearchInput className="w-80" placeholder="Número, cliente, equipamento, série/IMEI..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select className="w-56" aria-label="Filtrar por status" placeholder="Todos os status" opcoes={opcoesFiltro} value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <span className="ml-auto text-sm text-slate-500">
          {lista.length} OS · {fmt.moeda(lista.filter((o) => o.status !== 'cancelada').reduce((s, o) => s + totalOS(o), 0))}
        </span>
      </Filtros>

      <DataTable
        colunas={colunas}
        dados={lista}
        chave={(o) => o.id}
        nomeItens="ordens de serviço"
        vazio={ordensServico.length ? 'Nenhuma OS encontrada com esses filtros.' : 'Nenhuma ordem de serviço ainda. Clique em "Nova OS" para registrar a entrada de um equipamento.'}
        selecionados={lote.selecionados}
        onSelecionar={lote.setSelecionados}
        rotuloLinha={(o) => o.numero}
        acoesSelecao={
          <AcoesLote
            quantidade={escolhidas.length}
            nome={['ordem de serviço', 'ordens de serviço']}
            onExcel={() => exportar(escolhidas)}
            onExcluir={pode('osExcluir') ? () => void lote.emLote(() => alterar('cadastros:emLote', 'os', escolhidas.map((o) => o.id), 'excluir'), 'excluído') : undefined}
            avisoExcluir="OS entregues ou que já usaram peças do estoque não podem ser excluídas — essas serão mantidas (você pode cancelá-las)."
          />
        }
      />

      {/* ---------- Formulário ---------- */}
      <Modal
        aberto={aberto}
        titulo={editando ? `Editar OS ${editando.numero}` : 'Nova ordem de serviço'}
        onFechar={() => setAberto(false)}
        tamanho="xl"
        rodape={
          <>
            <Button variante="secundario" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button icone={<Check size={16} />} onClick={salvar}>
              {editando ? 'Salvar alterações' : 'Abrir OS'}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <Secao titulo="Cliente e prazos">
            <div className="grid grid-cols-4 gap-4">
              <Select
                label="Cliente"
                obrigatorio
                wrapperClassName="col-span-2"
                placeholder="Selecione o cliente..."
                opcoes={clientes.filter((c) => c.ativo || c.id === editando?.clienteId).map((c) => ({ value: c.id, label: `${c.nome} — ${c.documento}` }))}
                {...form.bind('clienteId')}
              />
              <Select
                label="Técnico responsável"
                placeholder="(nenhum)"
                opcoes={usuarios.filter((u) => u.ativo || u.id === editando?.tecnicoId).map((u) => ({ value: u.id, label: u.nome }))}
                {...form.bind('tecnicoId')}
              />
              <Input label="Previsão de entrega" type="date" {...form.bind('previsao')} />
            </div>
          </Secao>

          <Secao titulo="Equipamento">
            <div className="grid grid-cols-4 gap-4">
              <Input label="Tipo" obrigatorio list="tipos-equipamento" placeholder="Celular, notebook..." {...form.bind('equipTipo')} />
              <datalist id="tipos-equipamento">
                {TIPOS_EQUIPAMENTO.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <Input label="Marca" {...form.bind('equipMarca')} />
              <Input label="Modelo" {...form.bind('equipModelo')} />
              <Input label="Nº de série / IMEI" {...form.bind('equipSerie')} />
              <Input label="Acessórios entregues" wrapperClassName="col-span-2" placeholder="Carregador, capa, cartão de memória..." {...form.bind('acessorios')} />
              <Input label="Estado físico" wrapperClassName="col-span-2" placeholder="Riscos, trincas, amassados..." {...form.bind('estadoFisico')} />
            </div>
          </Secao>

          <Secao titulo="Senha do equipamento">
            {senha === null && editando && editando.senhaTipo !== 'nenhuma' ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="flex items-center gap-1.5 text-slate-700">
                  <Lock size={14} /> {rotuloSenhaOS[editando.senhaTipo]} cadastrada (não aparece aqui).
                </span>
                <Button tamanho="sm" variante="secundario" icone={<KeyRound size={14} />} onClick={() => setSenha({ tipo: editando.senhaTipo, valor: '' })}>
                  Trocar senha
                </Button>
                <Button tamanho="sm" variante="fantasma" onClick={() => setSenha({ tipo: 'nenhuma', valor: '' })}>
                  Remover senha
                </Button>
              </div>
            ) : (
              <>
                <EditorSenha
                  valor={senha ?? { tipo: 'nenhuma', valor: '' }}
                  erro={erroSenhaForm}
                  onChange={(s) => {
                    setSenha(s)
                    setErroSenhaForm('')
                  }}
                />
                {senha !== null && editando && editando.senhaTipo !== 'nenhuma' && (
                  <button className="mt-2 text-xs font-medium text-blue-700 hover:underline" onClick={() => setSenha(null)}>
                    Manter a senha atual
                  </button>
                )}
              </>
            )}
          </Secao>

          <Secao titulo="Problema e solução">
            <div className="grid grid-cols-3 gap-4">
              <Textarea label="Defeito relatado pelo cliente *" {...form.bind('defeito')} />
              <Textarea label="Diagnóstico técnico" {...form.bind('diagnostico')} />
              <Textarea label="Laudo / serviço realizado" {...form.bind('laudo')} />
            </div>
          </Secao>

          <Secao
            titulo="Peças e serviços (orçamento)"
            acao={
              <div className="flex gap-2">
                <Button tamanho="sm" variante="secundario" icone={<Plus size={14} />} onClick={() => setItens((l) => [...l, novaLinha('peca')])}>
                  Adicionar peça
                </Button>
                <Button tamanho="sm" variante="secundario" icone={<Wrench size={14} />} onClick={() => setItens((l) => [...l, novaLinha('servico')])}>
                  Adicionar serviço
                </Button>
              </div>
            }
          >
            <div className="mb-2">
              <LeitorCodigo onEncontrar={adicionarPorCodigo} placeholder="Leia o código de barras da peça para adicioná-la (soma 1 se já estiver na lista)" />
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="w-24 px-3 py-2 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium">Peça (do estoque) ou serviço</th>
                    <th className="w-24 px-3 py-2 text-right font-medium">Qtd.</th>
                    <th className="w-36 px-3 py-2 text-right font-medium">Valor unit. (R$)</th>
                    <th className="w-32 px-3 py-2 text-right font-medium">Subtotal</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                        Sem peças ou serviços ainda. Você pode abrir a OS agora e preencher o orçamento depois do diagnóstico.
                      </td>
                    </tr>
                  )}
                  {itens.map((l) => {
                    const p = l.tipo === 'peca' ? produtos.find((x) => x.id === Number(l.produtoId)) : undefined
                    return (
                      <tr key={l.chave} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <Badge cor={l.tipo === 'peca' ? 'azul' : 'roxo'}>{l.tipo === 'peca' ? 'Peça' : 'Serviço'}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          {l.tipo === 'peca' ? (
                            <>
                              <Select
                                aria-label="Peça"
                                placeholder="Selecione a peça..."
                                opcoes={produtos.filter((x) => x.ativo || x.id === Number(l.produtoId)).map((x) => ({ value: x.id, label: `${x.codigo} — ${x.nome} (estoque: ${x.estoque})` }))}
                                value={l.produtoId}
                                onChange={(e) => alterarItem(l.chave, 'produtoId', e.target.value)}
                              />
                              {p && Number(l.quantidade) > p.estoque && (
                                <p className="mt-1 text-xs text-amber-700">Estoque atual: {p.estoque}. A OS só poderá ficar pronta com saldo suficiente.</p>
                              )}
                            </>
                          ) : (
                            <Input
                              aria-label="Descrição do serviço"
                              className="w-full"
                              placeholder="Ex.: troca de tela, limpeza interna, formatação..."
                              value={l.descricao}
                              onChange={(e) => alterarItem(l.chave, 'descricao', e.target.value)}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            aria-label="Quantidade"
                            type="number"
                            min="1"
                            step="1"
                            className="w-full text-right"
                            value={l.quantidade}
                            onChange={(e) => alterarItem(l.chave, 'quantidade', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <InputMoeda aria-label="Valor unitário" value={l.valorUnitario} onChange={(e) => alterarItem(l.chave, 'valorUnitario', e.target.value)} />
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-800">{fmt.moeda((Number(l.quantidade) || 0) * (Number(l.valorUnitario) || 0))}</td>
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={() => setItens((lista) => lista.filter((x) => x.chave !== l.chave))}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="Remover item"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {erroItens && <p className="mt-2 text-xs text-red-600">{erroItens}</p>}
            <div className="mt-3 flex flex-wrap items-end justify-end gap-4">
              <InputMoeda label="Desconto" wrapperClassName="w-40" {...form.bind('desconto')} />
              <Input label="Garantia (dias)" type="number" min="0" step="1" wrapperClassName="w-32" {...form.bind('garantiaDias')} />
              <div className="min-w-[12rem] rounded-lg bg-slate-50 px-4 py-2 text-right">
                <p className="text-xs text-slate-500">Subtotal {fmt.moeda(subtotalForm)}</p>
                <p className="text-lg font-bold tabular-nums text-slate-900">Total {fmt.moeda(totalForm)}</p>
              </div>
            </div>
          </Secao>

          <Textarea label="Observações" {...form.bind('observacao')} />
        </div>
      </Modal>

      {ficha && <FichaOS os={ficha} onFechar={() => setFichaId(null)} onEditar={pode('osEditar') && osEmAndamento(ficha.status) ? () => abrir(ficha) : undefined} />}

      <ConfirmDialog
        aberto={!!excluindo}
        mensagem={
          <>
            Excluir a OS <strong>{excluindo?.numero}</strong>? O histórico dela também é apagado. Para manter o registro, prefira cancelar.
          </>
        }
        onConfirmar={excluir}
        onCancelar={() => setExcluindo(null)}
      />
    </>
  )
}

function Secao({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5">
        <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  )
}

// ---------- Ficha: andamento, histórico e impressão ----------

const rotuloAcao = (de: StatusOS, para: StatusOS): string => {
  if (para === 'em_execucao' && de === 'pronta') return 'Reabrir (volta para em execução)'
  if (para === 'pronta') return 'Pronta — serviço concluído'
  if (para === 'entregue') return 'Entregue ao cliente'
  if (para === 'cancelada') return 'Cancelar a OS'
  return rotuloStatusOS[para]
}

/** Próximo passo natural do atendimento (sugerido na ficha). */
function proximoNatural(s: StatusOS): StatusOS | '' {
  const i = ETAPAS_OS.indexOf(s)
  return i >= 0 && i < ETAPAS_OS.length - 1 ? ETAPAS_OS[i + 1] : ''
}

function FichaOS({ os: o, onFechar, onEditar }: { os: OrdemServico; onFechar: () => void; onEditar?: () => void }) {
  const db = useDb()
  const { pode } = useAuth()
  const notificar = useToast()
  const [novo, setNovo] = useState<StatusOS | ''>(proximoNatural(o.status))
  const [obs, setObs] = useState('')
  const [erroObs, setErroObs] = useState('')

  useEffect(() => {
    setNovo(proximoNatural(o.status))
    setObs('')
    setErroObs('')
  }, [o.status])

  const cliente = db.clientes.find((c) => c.id === o.clienteId)
  const tecnico = o.tecnicoId ? db.usuarios.find((u) => u.id === o.tecnicoId)?.nome : undefined
  const pecas = o.itens.filter((i) => i.tipo === 'peca')
  const destinos = proximosStatusOS(o.status)
  const atrasada = osAtrasada(o, fmt.hojeIso())

  const aviso = (() => {
    if (!novo || !pecas.length) return ''
    if ((novo === 'pronta' || novo === 'entregue') && !o.estoqueBaixado) return pecas.length === 1 ? 'A peça da OS será baixada do estoque.' : `As ${pecas.length} peças da OS serão baixadas do estoque.`
    if ((novo === 'cancelada' || osEmAndamento(novo)) && o.estoqueBaixado) return pecas.length === 1 ? 'A peça volta para o estoque.' : 'As peças voltam para o estoque.'
    return ''
  })()

  async function aplicar(): Promise<void> {
    if (!novo) return
    if (novo === 'cancelada' && obs.trim().length < 3) return setErroObs('Informe o motivo do cancelamento.')
    await executar(() => alterar('os:status', o.id, novo, obs), { notificar, sucesso: `${o.numero}: ${rotuloStatusOS[novo].toLowerCase()}.${aviso ? ` ${aviso.replace('será baixada', 'foi baixada').replace('serão baixadas', 'foram baixadas').replace('voltam', 'voltaram').replace('volta para', 'voltou para')}` : ''}` })
  }

  const saida = {
    imprimir: () => imprimir(htmlOS(o, db), {}, notificar),
    pdf: () => salvarPdf(htmlOS(o, db), `OS-${o.numero}`, {}, notificar)
  }

  const etapaAtual = ETAPAS_OS.indexOf(o.status)

  return (
    <Modal
      aberto
      titulo={`Ordem de serviço ${o.numero}`}
      onFechar={onFechar}
      tamanho="xl"
      rodape={
        <>
          {onEditar && (
            <Button variante="secundario" icone={<Pencil size={16} />} className="mr-auto" onClick={onEditar}>
              Editar
            </Button>
          )}
          <Button variante="secundario" icone={<FileDown size={16} />} onClick={() => void saida.pdf()}>
            PDF
          </Button>
          <Button variante="secundario" icone={<Printer size={16} />} onClick={() => void saida.imprimir()}>
            Imprimir OS
          </Button>
          <Button onClick={onFechar}>Fechar</Button>
        </>
      }
    >
      {/* Etapas do atendimento */}
      {o.status === 'cancelada' ? (
        <p className="mb-5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">Esta OS foi cancelada.</p>
      ) : (
        <ol className="mb-5 flex items-center gap-1" aria-label="Etapas do atendimento">
          {ETAPAS_OS.map((s, i) => {
            const feito = i < etapaAtual
            const atual = i === etapaAtual
            return (
              <li key={s} className="flex flex-1 items-center gap-1" aria-current={atual ? 'step' : undefined}>
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    atual ? 'bg-blue-600 text-white ring-4 ring-blue-100' : feito ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {feito ? <Check size={14} /> : i + 1}
                </span>
                <span className={`text-xs leading-tight ${atual ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{rotuloStatusOS[s]}</span>
                {i < ETAPAS_OS.length - 1 && <span className={`mx-1 h-0.5 flex-1 ${feito ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
              </li>
            )
          })}
        </ol>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <Info rotulo="Cliente" valor={cliente?.nome ?? '—'} extra={cliente?.telefone} />
            <Info rotulo="Entrada" valor={fmt.dataHora(o.dataEntrada)} />
            <Info rotulo="Previsão" valor={o.previsao ? fmt.data(o.previsao) : '—'} destaque={atrasada ? 'Atrasada' : undefined} />
            <Info rotulo="Técnico" valor={tecnico ?? '—'} />
          </div>

          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-semibold text-slate-800">{descreverEquipamento(o)}</p>
            <dl className="mt-1 grid grid-cols-1 gap-x-6 gap-y-1 text-slate-600 sm:grid-cols-2">
              {o.equipSerie && <Par rotulo="Série / IMEI" valor={o.equipSerie} />}
              {o.acessorios && <Par rotulo="Acessórios" valor={o.acessorios} />}
              {o.estadoFisico && <Par rotulo="Estado físico" valor={o.estadoFisico} />}
            </dl>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <Texto rotulo="Defeito relatado" valor={o.defeito} />
            <Texto rotulo="Diagnóstico" valor={o.diagnostico} />
            <Texto rotulo="Laudo / serviço realizado" valor={o.laudo} />
          </div>

          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Peça / serviço</th>
                <th className="px-3 py-2 text-right font-medium">Qtd.</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {o.itens.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                    Orçamento ainda não preenchido.
                  </td>
                </tr>
              )}
              {o.itens.map((i, n) => (
                <tr key={n} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <span className="mr-2">
                      <Badge cor={i.tipo === 'peca' ? 'azul' : 'roxo'}>{i.tipo === 'peca' ? 'Peça' : 'Serviço'}</Badge>
                    </span>
                    {i.tipo === 'peca' ? (db.produtos.find((p) => p.id === i.produtoId)?.nome ?? '—') : i.descricao}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.numero(i.quantidade)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.moeda(i.valorUnitario)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.moeda(i.quantidade * i.valorUnitario)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {o.desconto > 0 && (
                <tr className="border-t border-slate-200">
                  <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">
                    Subtotal {fmt.moeda(subtotalOS(o))} · Desconto
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">- {fmt.moeda(o.desconto)}</td>
                </tr>
              )}
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={3} className="px-3 py-2 text-right font-semibold text-slate-700">
                  Total {o.garantiaDias > 0 && <span className="font-normal text-slate-500">· garantia de {o.garantiaDias} dias</span>}
                </td>
                <td className="px-3 py-2 text-right text-base font-bold tabular-nums text-slate-900">{fmt.moeda(totalOS(o))}</td>
              </tr>
            </tfoot>
          </table>
          {pecas.length > 0 && (
            <p className="text-xs text-slate-500">{o.estoqueBaixado ? 'As peças já foram baixadas do estoque.' : 'As peças saem do estoque quando a OS ficar pronta.'}</p>
          )}
          {o.observacao && <p className="text-sm text-slate-600">Observações: {o.observacao}</p>}
        </div>

        <aside className="space-y-4">
          {pode('osEditar') && destinos.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Atualizar andamento</h3>
              <div className="space-y-2">
                <Select
                  aria-label="Novo status"
                  placeholder="Escolha o novo status..."
                  opcoes={destinos.map((d) => ({ value: d, label: rotuloAcao(o.status, d) }))}
                  value={novo}
                  onChange={(e) => {
                    setNovo(e.target.value as StatusOS)
                    setErroObs('')
                  }}
                />
                <Input
                  aria-label="Observação do andamento"
                  className="w-full"
                  placeholder={novo === 'cancelada' ? 'Motivo do cancelamento (obrigatório)' : 'Observação (opcional)'}
                  value={obs}
                  error={erroObs}
                  onChange={(e) => {
                    setObs(e.target.value)
                    setErroObs('')
                  }}
                />
                {erroObs && <p className="text-xs text-red-600">{erroObs}</p>}
                {aviso && <p className="text-xs text-amber-800">{aviso}</p>}
                {(novo === 'entregue' || novo === 'cancelada') && o.senhaTipo !== 'nenhuma' && db.configuracoes.apagarSenhaOs && (
                  <p className="text-xs text-slate-600">A senha do equipamento será apagada (o aparelho volta para o cliente).</p>
                )}
                <Button className="w-full" variante={novo === 'cancelada' ? 'perigo' : 'primario'} disabled={!novo} onClick={aplicar}>
                  Atualizar status
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 p-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <KeyRound size={15} className="text-blue-600" /> Senha do equipamento
            </h3>
            <VerSenha osId={o.id} tipo={o.senhaTipo} />
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <History size={15} className="text-blue-600" /> Histórico
            </h3>
            <ol className="relative space-y-3 border-l border-slate-200 pl-4">
              {[...o.historico].reverse().map((h, n) => (
                <li key={n} className="text-sm">
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-blue-500" />
                  <p className="font-medium text-slate-800">{rotuloStatusOS[h.status]}</p>
                  <p className="text-xs text-slate-500">
                    {fmt.dataHora(h.em)} · {h.usuario}
                  </p>
                  {h.observacao && <p className="text-xs text-slate-600">{h.observacao}</p>}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </Modal>
  )
}

function Info({ rotulo, valor, extra, destaque }: { rotulo: string; valor: string; extra?: string; destaque?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{rotulo}</p>
      <p className="font-medium text-slate-800">
        {valor} {destaque && <Badge cor="vermelho">{destaque}</Badge>}
      </p>
      {extra && <p className="text-xs text-slate-500">{extra}</p>}
    </div>
  )
}

function Par({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="inline text-slate-500">{rotulo}: </dt>
      <dd className="inline">{valor}</dd>
    </div>
  )
}

function Texto({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">{rotulo}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-slate-800">{valor || <span className="text-slate-400">—</span>}</p>
    </div>
  )
}

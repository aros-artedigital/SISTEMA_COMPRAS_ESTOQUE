import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { db, RegraNegocioError, useDb } from '@/data/store'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { DataTable, type Coluna } from '@/components/DataTable'
import { Modal } from '@/components/Modal'
import { Badge, Button, Input, SearchInput, Select } from '@/components/ui'
import { corTipoMov, rotuloTipoMov } from '@/lib/dominio'
import { movimentacaoSchema } from '@/lib/schemas'
import { useForm } from '@/lib/useForm'
import * as fmt from '@/lib/format'
import type { Movimentacao, TipoMovimentacao } from '@/types'

const vazio = { produtoId: '', tipo: 'saida' as TipoMovimentacao, quantidade: '', motivo: '' }

const dicaTipo: Record<TipoMovimentacao, string> = {
  entrada: 'Entrada avulsa (devolução, bonificação...). Compras dão entrada automaticamente ao serem recebidas.',
  saida: 'Saída por venda, consumo interno, perda etc.',
  ajuste: 'Correção de inventário: informe a diferença (ex.: -2 ou 3).'
}

export default function Movimentacoes() {
  const { movimentacoes, produtos, usuarios } = useDb()
  const { usuario } = useAuth()
  const notificar = useToast()

  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [aberto, setAberto] = useState(false)
  const form = useForm(vazio, movimentacaoSchema)

  const produto = (id: number) => produtos.find((p) => p.id === id)

  const lista = useMemo(
    () =>
      movimentacoes
        .filter((m) => {
          const p = produto(m.produtoId)
          return (
            (!busca || (p && (fmt.contem(p.nome, busca) || fmt.contem(p.codigo, busca))) || fmt.contem(m.motivo, busca)) &&
            (!tipo || m.tipo === tipo) &&
            (!de || m.data.slice(0, 10) >= de) &&
            (!ate || m.data.slice(0, 10) <= ate)
          )
        })
        .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id),
    [movimentacoes, produtos, busca, tipo, de, ate] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const selecionado = produto(Number(form.values.produtoId))

  function salvar(): void {
    const dados = form.validate()
    if (!dados || !usuario) return
    if (dados.tipo !== 'ajuste' && dados.quantidade < 0) return form.setError('quantidade', 'Informe uma quantidade positiva')
    try {
      db.movimentar({ ...dados, usuarioId: usuario.id })
      notificar('sucesso', 'Movimentação registrada.')
      setAberto(false)
    } catch (e) {
      if (e instanceof RegraNegocioError) form.setError('quantidade', e.message)
      else throw e
    }
  }

  const colunas: Coluna<Movimentacao>[] = [
    { chave: 'data', titulo: 'Data', largura: '150px', render: (m) => <span className="tabular-nums text-slate-600">{fmt.dataHora(m.data)}</span> },
    {
      chave: 'produto',
      titulo: 'Produto',
      render: (m) => {
        const p = produto(m.produtoId)
        return p ? (
          <span>
            <span className="font-medium text-slate-800">{p.nome}</span> <span className="font-mono text-xs text-slate-400">{p.codigo}</span>
          </span>
        ) : (
          '—'
        )
      }
    },
    { chave: 'tipo', titulo: 'Tipo', render: (m) => <Badge cor={corTipoMov[m.tipo]}>{rotuloTipoMov[m.tipo]}</Badge> },
    {
      chave: 'qtd',
      titulo: 'Quantidade',
      alinhar: 'direita',
      render: (m) => {
        const sinal = m.tipo === 'saida' ? -m.quantidade : m.quantidade
        return (
          <span className={`font-medium tabular-nums ${sinal < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {sinal > 0 ? '+' : ''}
            {fmt.numero(sinal)}
          </span>
        )
      }
    },
    { chave: 'motivo', titulo: 'Motivo', render: (m) => m.motivo },
    { chave: 'usuario', titulo: 'Usuário', render: (m) => <span className="text-slate-500">{usuarios.find((u) => u.id === m.usuarioId)?.nome ?? '—'}</span> }
  ]

  return (
    <>
      <PageHeader
        titulo="Movimentações de Estoque"
        subtitulo="Histórico de entradas, saídas e ajustes de inventário"
        acoes={
          <Button
            icone={<Plus size={16} />}
            onClick={() => {
              form.reset(vazio)
              setAberto(true)
            }}
          >
            Nova movimentação
          </Button>
        }
      />

      <Filtros>
        <SearchInput className="w-72" placeholder="Produto, código ou motivo..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select
          className="w-40"
          placeholder="Todos os tipos"
          opcoes={(['entrada', 'saida', 'ajuste'] as const).map((t) => ({ value: t, label: rotuloTipoMov[t] }))}
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        />
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>De</span>
          <Input type="date" className="w-40" value={de} onChange={(e) => setDe(e.target.value)} />
          <span>até</span>
          <Input type="date" className="w-40" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <span className="ml-auto text-sm text-slate-500">{lista.length} registro(s)</span>
      </Filtros>

      <DataTable colunas={colunas} dados={lista} chave={(m) => m.id} porPagina={12} />

      <Modal
        aberto={aberto}
        titulo="Nova movimentação"
        onFechar={() => setAberto(false)}
        rodape={
          <>
            <Button variante="secundario" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar}>Registrar</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Produto"
            obrigatorio
            wrapperClassName="col-span-2"
            placeholder="Selecione..."
            opcoes={produtos.filter((p) => p.ativo).map((p) => ({ value: p.id, label: `${p.codigo} — ${p.nome}` }))}
            {...form.bind('produtoId')}
          />
          {selecionado && (
            <p className="col-span-2 -mt-2 text-xs text-slate-500">
              Saldo atual: <strong className="text-slate-700">{fmt.numero(selecionado.estoque)}</strong> · mínimo {selecionado.estoqueMinimo}
            </p>
          )}
          <Select
            label="Tipo"
            obrigatorio
            opcoes={(['entrada', 'saida', 'ajuste'] as const).map((t) => ({ value: t, label: rotuloTipoMov[t] }))}
            value={form.values.tipo}
            onChange={(e) => form.set('tipo', e.target.value as TipoMovimentacao)}
          />
          <Input label={form.values.tipo === 'ajuste' ? 'Diferença' : 'Quantidade'} obrigatorio type="number" step="1" {...form.bind('quantidade')} />
          <p className="col-span-2 -mt-1 text-xs text-slate-500">{dicaTipo[form.values.tipo]}</p>
          <Input label="Motivo" obrigatorio wrapperClassName="col-span-2" placeholder="Ex.: Venda balcão, inventário mensal..." {...form.bind('motivo')} />
        </div>
      </Modal>
    </>
  )
}

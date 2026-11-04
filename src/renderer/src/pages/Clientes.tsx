import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { db, useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { AcoesLinha, DataTable, type Coluna } from '@/components/DataTable'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { Badge, Button, Checkbox, Input, SearchInput, Select } from '@/components/ui'
import { UFS } from '@/lib/dominio'
import { clienteSchema } from '@/lib/schemas'
import { useForm } from '@/lib/useForm'
import * as fmt from '@/lib/format'
import type { Cliente } from '@/types'

const vazio = { nome: '', tipo: 'PF' as Cliente['tipo'], documento: '', telefone: '', email: '', cidade: '', uf: '', ativo: true }

export default function Clientes() {
  const { clientes } = useDb()
  const notificar = useToast()
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [aberto, setAberto] = useState(false)
  const [excluindo, setExcluindo] = useState<Cliente | null>(null)
  const form = useForm(vazio, clienteSchema)

  const lista = useMemo(
    () =>
      clientes.filter(
        (c) =>
          (!busca || fmt.contem(c.nome, busca) || fmt.contem(c.email, busca) || fmt.somenteDigitos(c.documento).includes(fmt.somenteDigitos(busca) || '#')) &&
          (!tipo || c.tipo === tipo)
      ),
    [clientes, busca, tipo]
  )

  function abrir(c: Cliente | null): void {
    form.reset(c ? { ...c } : vazio)
    setEditando(c)
    setAberto(true)
  }

  function salvar(): void {
    const dados = form.validate()
    if (!dados) return
    if (clientes.some((c) => fmt.somenteDigitos(c.documento) === fmt.somenteDigitos(dados.documento) && c.id !== editando?.id)) {
      return form.setError('documento', 'Documento já cadastrado')
    }
    if (editando) db.atualizar('clientes', editando.id, dados)
    else db.criar('clientes', dados)
    notificar('sucesso', editando ? 'Cliente atualizado.' : 'Cliente cadastrado.')
    setAberto(false)
  }

  function excluir(): void {
    if (!excluindo) return
    db.excluir('clientes', excluindo.id)
    notificar('sucesso', 'Cliente excluído.')
    setExcluindo(null)
  }

  const pf = form.values.tipo === 'PF'

  const colunas: Coluna<Cliente>[] = [
    {
      chave: 'nome',
      titulo: 'Nome',
      render: (c) => (
        <span className="flex items-center gap-2 font-medium text-slate-800">
          {c.nome} {!c.ativo && <Badge>Inativo</Badge>}
        </span>
      )
    },
    { chave: 'tipo', titulo: 'Tipo', render: (c) => <Badge cor={c.tipo === 'PF' ? 'azul' : 'roxo'}>{c.tipo === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}</Badge> },
    { chave: 'documento', titulo: 'CPF/CNPJ', render: (c) => <span className="tabular-nums">{c.documento}</span> },
    { chave: 'contato', titulo: 'Contato', render: (c) => <div className="text-xs"><p>{c.telefone}</p><p className="text-slate-500">{c.email}</p></div> },
    { chave: 'cidade', titulo: 'Cidade', render: (c) => (c.cidade ? `${c.cidade}/${c.uf}` : '—') },
    { chave: 'acoes', titulo: 'Ações', alinhar: 'direita', render: (c) => <AcoesLinha onEditar={() => abrir(c)} onExcluir={() => setExcluindo(c)} /> }
  ]

  return (
    <>
      <PageHeader
        titulo="Clientes"
        subtitulo="Pessoas e empresas atendidas"
        acoes={<Button icone={<Plus size={16} />} onClick={() => abrir(null)}>Novo Cliente</Button>}
      />
      <Filtros>
        <SearchInput className="w-80" placeholder="Pesquisar por nome, e-mail ou documento..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select
          className="w-44"
          placeholder="Todos os tipos"
          opcoes={[
            { value: 'PF', label: 'Pessoa física' },
            { value: 'PJ', label: 'Pessoa jurídica' }
          ]}
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        />
        <span className="ml-auto text-sm text-slate-500">{lista.length} cliente(s)</span>
      </Filtros>
      <DataTable colunas={colunas} dados={lista} chave={(c) => c.id} />

      <Modal
        aberto={aberto}
        titulo={editando ? 'Editar cliente' : 'Novo cliente'}
        onFechar={() => setAberto(false)}
        tamanho="lg"
        rodape={
          <>
            <Button variante="secundario" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </>
        }
      >
        <div className="grid grid-cols-6 gap-4">
          <Select
            label="Tipo"
            wrapperClassName="col-span-2"
            opcoes={[
              { value: 'PF', label: 'Pessoa física' },
              { value: 'PJ', label: 'Pessoa jurídica' }
            ]}
            value={form.values.tipo}
            onChange={(e) => {
              form.set('tipo', e.target.value as Cliente['tipo'])
              form.set('documento', '')
            }}
          />
          <Input
            label={pf ? 'CPF' : 'CNPJ'}
            obrigatorio
            wrapperClassName="col-span-4"
            placeholder={pf ? '000.000.000-00' : '00.000.000/0000-00'}
            {...form.bind('documento')}
            onChange={(e) => form.set('documento', pf ? fmt.mascaraCpf(e.target.value) : fmt.mascaraCnpj(e.target.value))}
          />
          <Input label={pf ? 'Nome completo' : 'Razão social'} obrigatorio wrapperClassName="col-span-6" {...form.bind('nome')} />
          <Input
            label="Telefone"
            wrapperClassName="col-span-2"
            {...form.bind('telefone')}
            onChange={(e) => form.set('telefone', fmt.mascaraTelefone(e.target.value))}
          />
          <Input label="E-mail" type="email" wrapperClassName="col-span-4" {...form.bind('email')} />
          <Input label="Cidade" wrapperClassName="col-span-4" {...form.bind('cidade')} />
          <Select label="UF" wrapperClassName="col-span-2" placeholder="—" opcoes={UFS.map((u) => ({ value: u, label: u }))} {...form.bind('uf')} />
          <div className="col-span-6">
            <Checkbox label="Cliente ativo" checked={form.values.ativo} onChange={(v) => form.set('ativo', v)} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        aberto={!!excluindo}
        mensagem={<>Excluir o cliente <strong>{excluindo?.nome}</strong>?</>}
        onConfirmar={excluir}
        onCancelar={() => setExcluindo(null)}
      />
    </>
  )
}

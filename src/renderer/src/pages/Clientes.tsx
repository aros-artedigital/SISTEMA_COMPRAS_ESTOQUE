import { useMemo, useState } from 'react'
import { FileSpreadsheet, Plus, Upload } from 'lucide-react'
import { alterar, useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { AcoesLinha, DataTable, type Coluna } from '@/components/DataTable'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { Badge, Button, Checkbox, Input, SearchInput, Select } from '@/components/ui'
import { totalVenda, UFS } from '@shared/dominio'
import { clienteSchema } from '@shared/schemas'
import { useForm } from '@/lib/useForm'
import { executar } from '@/lib/executar'
import { exportarExcel } from '@/lib/saida'
import { ImportarModal } from '@/components/ImportarModal'
import * as fmt from '@shared/format'
import type { Cliente } from '@shared/tipos'

const vazio = { nome: '', tipo: 'PF' as Cliente['tipo'], documento: '', telefone: '', email: '', cidade: '', uf: '', ativo: true }

export default function Clientes() {
  const { clientes, vendas } = useDb()
  const notificar = useToast()
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [aberto, setAberto] = useState(false)
  const [importando, setImportando] = useState(false)
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

  async function salvar(): Promise<void> {
    const dados = form.validate()
    if (!dados) return
    const ok = await executar(() => alterar('clientes:salvar', editando?.id ?? null, dados), {
      notificar,
      form,
      sucesso: editando ? 'Cliente atualizado.' : 'Cliente cadastrado.'
    })
    if (ok) setAberto(false)
  }

  async function excluir(): Promise<void> {
    if (!excluindo) return
    const alvo = excluindo
    setExcluindo(null)
    await executar(() => alterar('clientes:excluir', alvo.id), { notificar, sucesso: 'Cliente excluído.' })
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
    {
      chave: 'vendas',
      titulo: 'Compras feitas',
      alinhar: 'direita',
      render: (c) => {
        const doCliente = vendas.filter((v) => v.clienteId === c.id && v.status === 'concluida')
        return doCliente.length ? (
          <span className="text-xs">
            <span className="block font-medium tabular-nums text-slate-800">{fmt.moeda(doCliente.reduce((s, v) => s + totalVenda(v), 0))}</span>
            <span className="text-slate-500">{doCliente.length} venda(s)</span>
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )
      }
    },
    { chave: 'acoes', titulo: 'Ações', alinhar: 'direita', render: (c) => <AcoesLinha onEditar={() => abrir(c)} onExcluir={() => setExcluindo(c)} /> }
  ]

  return (
    <>
      <PageHeader
        titulo="Clientes"
        subtitulo="Pessoas e empresas atendidas"
        acoes={
          <>
            <Button variante="secundario" icone={<Upload size={16} />} onClick={() => setImportando(true)}>Importar</Button>
            <Button
              variante="secundario"
              icone={<FileSpreadsheet size={16} />}
              onClick={() =>
                exportarExcel({ nome: 'Clientes', colunas: [{ titulo: 'Nome' }, { titulo: 'Tipo (PF/PJ)' }, { titulo: 'CPF/CNPJ' }, { titulo: 'Telefone' }, { titulo: 'E-mail' }, { titulo: 'Cidade' }, { titulo: 'UF' }, { titulo: 'Ativo' }], linhas: lista.map((c) => [c.nome, c.tipo, c.documento, c.telefone, c.email, c.cidade, c.uf, c.ativo ? 'Sim' : 'Não']) }, `clientes_${fmt.hojeIso()}`, notificar)
              }
            >
              Excel
            </Button>
            <Button data-atalho="novo" icone={<Plus size={16} />} onClick={() => abrir(null)}>Novo Cliente</Button>
          </>
        }
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

      <ImportarModal tipo="clientes" aberto={importando} onFechar={() => setImportando(false)} />

      <ConfirmDialog
        aberto={!!excluindo}
        mensagem={<>Excluir o cliente <strong>{excluindo?.nome}</strong>?</>}
        onConfirmar={excluir}
        onCancelar={() => setExcluindo(null)}
      />
    </>
  )
}

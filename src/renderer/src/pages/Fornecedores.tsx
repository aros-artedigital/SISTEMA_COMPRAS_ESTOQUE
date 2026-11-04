import { useMemo, useState } from 'react'
import { FileSpreadsheet, Plus, Upload } from 'lucide-react'
import { alterar, useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { AcoesLinha, DataTable, type Coluna } from '@/components/DataTable'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { Badge, Button, Checkbox, Input, SearchInput, Select } from '@/components/ui'
import { UFS } from '@shared/dominio'
import { fornecedorSchema } from '@shared/schemas'
import { useForm } from '@/lib/useForm'
import { executar } from '@/lib/executar'
import { exportarExcel } from '@/lib/saida'
import { ImportarModal } from '@/components/ImportarModal'
import * as fmt from '@shared/format'
import type { Fornecedor } from '@shared/tipos'

const vazio = { razaoSocial: '', nomeFantasia: '', cnpj: '', telefone: '', email: '', cidade: '', uf: '', ativo: true }

export default function Fornecedores() {
  const { fornecedores, compras } = useDb()
  const notificar = useToast()
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Fornecedor | null>(null)
  const [aberto, setAberto] = useState(false)
  const [importando, setImportando] = useState(false)
  const [excluindo, setExcluindo] = useState<Fornecedor | null>(null)
  const form = useForm(vazio, fornecedorSchema)

  const lista = useMemo(
    () =>
      fornecedores.filter(
        (f) => !busca || fmt.contem(f.razaoSocial, busca) || fmt.contem(f.nomeFantasia, busca) || fmt.somenteDigitos(f.cnpj).includes(fmt.somenteDigitos(busca) || '#')
      ),
    [fornecedores, busca]
  )

  function abrir(f: Fornecedor | null): void {
    form.reset(f ? { ...f } : vazio)
    setEditando(f)
    setAberto(true)
  }

  async function salvar(): Promise<void> {
    const dados = form.validate()
    if (!dados) return
    const ok = await executar(() => alterar('fornecedores:salvar', editando?.id ?? null, dados), {
      notificar,
      form,
      sucesso: editando ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.'
    })
    if (ok) setAberto(false)
  }

  async function excluir(): Promise<void> {
    if (!excluindo) return
    const alvo = excluindo
    setExcluindo(null)
    await executar(() => alterar('fornecedores:excluir', alvo.id), { notificar, sucesso: 'Fornecedor excluído.' })
  }

  const colunas: Coluna<Fornecedor>[] = [
    {
      chave: 'nome',
      titulo: 'Fornecedor',
      render: (f) => (
        <div>
          <p className="flex items-center gap-2 font-medium text-slate-800">
            {f.nomeFantasia || f.razaoSocial} {!f.ativo && <Badge>Inativo</Badge>}
          </p>
          {f.nomeFantasia && <p className="text-xs text-slate-500">{f.razaoSocial}</p>}
        </div>
      )
    },
    { chave: 'cnpj', titulo: 'CNPJ', render: (f) => <span className="tabular-nums">{f.cnpj}</span> },
    { chave: 'contato', titulo: 'Contato', render: (f) => <div className="text-xs"><p>{f.telefone}</p><p className="text-slate-500">{f.email}</p></div> },
    { chave: 'cidade', titulo: 'Cidade', render: (f) => (f.cidade ? `${f.cidade}/${f.uf}` : '—') },
    { chave: 'compras', titulo: 'Compras', alinhar: 'direita', render: (f) => compras.filter((c) => c.fornecedorId === f.id).length },
    { chave: 'acoes', titulo: 'Ações', alinhar: 'direita', render: (f) => <AcoesLinha onEditar={() => abrir(f)} onExcluir={() => setExcluindo(f)} /> }
  ]

  return (
    <>
      <PageHeader
        titulo="Fornecedores"
        subtitulo="Empresas das quais você compra mercadorias"
        acoes={
          <>
            <Button variante="secundario" icone={<Upload size={16} />} onClick={() => setImportando(true)}>Importar</Button>
            <Button
              variante="secundario"
              icone={<FileSpreadsheet size={16} />}
              onClick={() =>
                exportarExcel({ nome: 'Fornecedores', colunas: [{ titulo: 'Razão social' }, { titulo: 'Nome fantasia' }, { titulo: 'CNPJ' }, { titulo: 'Telefone' }, { titulo: 'E-mail' }, { titulo: 'Cidade' }, { titulo: 'UF' }, { titulo: 'Ativo' }], linhas: lista.map((f) => [f.razaoSocial, f.nomeFantasia, f.cnpj, f.telefone, f.email, f.cidade, f.uf, f.ativo ? 'Sim' : 'Não']) }, `fornecedores_${fmt.hojeIso()}`, notificar)
              }
            >
              Excel
            </Button>
            <Button icone={<Plus size={16} />} onClick={() => abrir(null)}>Novo Fornecedor</Button>
          </>
        }
      />
      <Filtros>
        <SearchInput className="w-80" placeholder="Pesquisar por nome ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span className="ml-auto text-sm text-slate-500">{lista.length} fornecedor(es)</span>
      </Filtros>
      <DataTable colunas={colunas} dados={lista} chave={(f) => f.id} />

      <Modal
        aberto={aberto}
        titulo={editando ? 'Editar fornecedor' : 'Novo fornecedor'}
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
          <Input label="Razão social" obrigatorio wrapperClassName="col-span-4" {...form.bind('razaoSocial')} />
          <Input
            label="CNPJ"
            obrigatorio
            wrapperClassName="col-span-2"
            placeholder="00.000.000/0000-00"
            {...form.bind('cnpj')}
            onChange={(e) => form.set('cnpj', fmt.mascaraCnpj(e.target.value))}
          />
          <Input label="Nome fantasia" wrapperClassName="col-span-3" {...form.bind('nomeFantasia')} />
          <Input
            label="Telefone"
            wrapperClassName="col-span-3"
            placeholder="(00) 0000-0000"
            {...form.bind('telefone')}
            onChange={(e) => form.set('telefone', fmt.mascaraTelefone(e.target.value))}
          />
          <Input label="E-mail" type="email" wrapperClassName="col-span-6" {...form.bind('email')} />
          <Input label="Cidade" wrapperClassName="col-span-4" {...form.bind('cidade')} />
          <Select label="UF" wrapperClassName="col-span-2" placeholder="—" opcoes={UFS.map((u) => ({ value: u, label: u }))} {...form.bind('uf')} />
          <div className="col-span-6">
            <Checkbox label="Fornecedor ativo" checked={form.values.ativo} onChange={(v) => form.set('ativo', v)} />
          </div>
        </div>
      </Modal>

      <ImportarModal tipo="fornecedores" aberto={importando} onFechar={() => setImportando(false)} />

      <ConfirmDialog
        aberto={!!excluindo}
        mensagem={<>Excluir o fornecedor <strong>{excluindo?.nomeFantasia || excluindo?.razaoSocial}</strong>?</>}
        onConfirmar={excluir}
        onCancelar={() => setExcluindo(null)}
      />
    </>
  )
}

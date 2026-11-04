import { useState } from 'react'
import { Plus } from 'lucide-react'
import { db, useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { PageHeader } from '@/components/PageHeader'
import { AcoesLinha, DataTable } from '@/components/DataTable'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { Button, Input } from '@/components/ui'
import { categoriaSchema, unidadeSchema } from '@/lib/schemas'
import { useForm } from '@/lib/useForm'
import type { Categoria, Unidade } from '@/types'

export default function CategoriasUnidades() {
  return (
    <>
      <PageHeader titulo="Categorias e Unidades" subtitulo="Tabelas auxiliares usadas no cadastro de produtos" />
      <div className="grid gap-6 xl:grid-cols-2">
        <SecaoCategorias />
        <SecaoUnidades />
      </div>
    </>
  )
}

function SecaoCategorias() {
  const { categorias, produtos } = useDb()
  const notificar = useToast()
  const [editando, setEditando] = useState<Categoria | null>(null)
  const [aberto, setAberto] = useState(false)
  const [excluindo, setExcluindo] = useState<Categoria | null>(null)
  const form = useForm({ nome: '', descricao: '' }, categoriaSchema)

  const qtdProdutos = (id: number): number => produtos.filter((p) => p.categoriaId === id).length

  function abrir(c: Categoria | null): void {
    form.reset(c ? { nome: c.nome, descricao: c.descricao } : { nome: '', descricao: '' })
    setEditando(c)
    setAberto(true)
  }

  function salvar(): void {
    const dados = form.validate()
    if (!dados) return
    if (categorias.some((c) => c.nome.toLowerCase() === dados.nome.toLowerCase() && c.id !== editando?.id)) {
      return form.setError('nome', 'Categoria já cadastrada')
    }
    if (editando) db.atualizar('categorias', editando.id, dados)
    else db.criar('categorias', dados)
    notificar('sucesso', editando ? 'Categoria atualizada.' : 'Categoria cadastrada.')
    setAberto(false)
  }

  function excluir(): void {
    if (!excluindo) return
    if (qtdProdutos(excluindo.id) > 0) notificar('aviso', 'Categoria em uso por produtos. Mova os produtos antes de excluir.')
    else {
      db.excluir('categorias', excluindo.id)
      notificar('sucesso', 'Categoria excluída.')
    }
    setExcluindo(null)
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Categorias</h2>
        <Button tamanho="sm" icone={<Plus size={14} />} onClick={() => abrir(null)}>Nova categoria</Button>
      </div>
      <DataTable
        dados={categorias}
        chave={(c) => c.id}
        colunas={[
          { chave: 'nome', titulo: 'Nome', render: (c) => <span className="font-medium text-slate-800">{c.nome}</span> },
          { chave: 'descricao', titulo: 'Descrição', render: (c) => <span className="text-slate-500">{c.descricao || '—'}</span> },
          { chave: 'produtos', titulo: 'Produtos', alinhar: 'direita', render: (c) => qtdProdutos(c.id) },
          { chave: 'acoes', titulo: '', alinhar: 'direita', render: (c) => <AcoesLinha onEditar={() => abrir(c)} onExcluir={() => setExcluindo(c)} /> }
        ]}
      />

      <Modal
        aberto={aberto}
        titulo={editando ? 'Editar categoria' : 'Nova categoria'}
        onFechar={() => setAberto(false)}
        tamanho="sm"
        rodape={
          <>
            <Button variante="secundario" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Nome" obrigatorio autoFocus {...form.bind('nome')} />
          <Input label="Descrição" {...form.bind('descricao')} />
        </div>
      </Modal>

      <ConfirmDialog
        aberto={!!excluindo}
        mensagem={<>Excluir a categoria <strong>{excluindo?.nome}</strong>?</>}
        onConfirmar={excluir}
        onCancelar={() => setExcluindo(null)}
      />
    </section>
  )
}

function SecaoUnidades() {
  const { unidades, produtos } = useDb()
  const notificar = useToast()
  const [editando, setEditando] = useState<Unidade | null>(null)
  const [aberto, setAberto] = useState(false)
  const [excluindo, setExcluindo] = useState<Unidade | null>(null)
  const form = useForm({ sigla: '', nome: '' }, unidadeSchema)

  const emUso = (id: number): boolean => produtos.some((p) => p.unidadeId === id)

  function abrir(u: Unidade | null): void {
    form.reset(u ? { sigla: u.sigla, nome: u.nome } : { sigla: '', nome: '' })
    setEditando(u)
    setAberto(true)
  }

  function salvar(): void {
    const dados = form.validate()
    if (!dados) return
    if (unidades.some((u) => u.sigla === dados.sigla && u.id !== editando?.id)) return form.setError('sigla', 'Sigla já cadastrada')
    if (editando) db.atualizar('unidades', editando.id, dados)
    else db.criar('unidades', dados)
    notificar('sucesso', editando ? 'Unidade atualizada.' : 'Unidade cadastrada.')
    setAberto(false)
  }

  function excluir(): void {
    if (!excluindo) return
    if (emUso(excluindo.id)) notificar('aviso', 'Unidade em uso por produtos.')
    else {
      db.excluir('unidades', excluindo.id)
      notificar('sucesso', 'Unidade excluída.')
    }
    setExcluindo(null)
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Unidades de medida</h2>
        <Button tamanho="sm" icone={<Plus size={14} />} onClick={() => abrir(null)}>Nova unidade</Button>
      </div>
      <DataTable
        dados={unidades}
        chave={(u) => u.id}
        colunas={[
          { chave: 'sigla', titulo: 'Sigla', largura: '90px', render: (u) => <span className="font-mono font-medium text-slate-800">{u.sigla}</span> },
          { chave: 'nome', titulo: 'Nome', render: (u) => u.nome },
          { chave: 'acoes', titulo: '', alinhar: 'direita', render: (u) => <AcoesLinha onEditar={() => abrir(u)} onExcluir={() => setExcluindo(u)} /> }
        ]}
      />

      <Modal
        aberto={aberto}
        titulo={editando ? 'Editar unidade' : 'Nova unidade'}
        onFechar={() => setAberto(false)}
        tamanho="sm"
        rodape={
          <>
            <Button variante="secundario" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Sigla" obrigatorio autoFocus maxLength={5} {...form.bind('sigla')} />
          <Input label="Nome" obrigatorio {...form.bind('nome')} />
        </div>
      </Modal>

      <ConfirmDialog
        aberto={!!excluindo}
        mensagem={<>Excluir a unidade <strong>{excluindo?.sigla}</strong>?</>}
        onConfirmar={excluir}
        onCancelar={() => setExcluindo(null)}
      />
    </section>
  )
}

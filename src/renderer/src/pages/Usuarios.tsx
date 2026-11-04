import { useState } from 'react'
import { Plus } from 'lucide-react'
import { db, useDb } from '@/data/store'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { PageHeader } from '@/components/PageHeader'
import { AcoesLinha, DataTable, type Coluna } from '@/components/DataTable'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { Badge, Button, Checkbox, Input, Select } from '@/components/ui'
import { nomePerfil, pode, type Recurso } from '@/lib/permissoes'
import { usuarioSchema } from '@/lib/schemas'
import { useForm } from '@/lib/useForm'
import type { Perfil, Usuario } from '@/types'

const vazio = { nome: '', email: '', login: '', senha: '', perfil: 'operador' as Perfil, ativo: true }
const corPerfil = { admin: 'roxo', gerente: 'azul', operador: 'cinza' } as const

const recursos: { recurso: Recurso; nome: string }[] = [
  { recurso: 'dashboard', nome: 'Início' },
  { recurso: 'produtos', nome: 'Produtos' },
  { recurso: 'cadastros', nome: 'Categorias e Unidades' },
  { recurso: 'estoque', nome: 'Movimentações' },
  { recurso: 'compras', nome: 'Compras' },
  { recurso: 'fornecedores', nome: 'Fornecedores' },
  { recurso: 'clientes', nome: 'Clientes' },
  { recurso: 'usuarios', nome: 'Usuários' },
  { recurso: 'configuracoes', nome: 'Configurações' }
]
const perfis: Perfil[] = ['admin', 'gerente', 'operador']

export default function Usuarios() {
  const { usuarios } = useDb()
  const { usuario: logado } = useAuth()
  const notificar = useToast()
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [aberto, setAberto] = useState(false)
  const [excluindo, setExcluindo] = useState<Usuario | null>(null)
  const form = useForm(vazio, usuarioSchema)

  function abrir(u: Usuario | null): void {
    form.reset(u ? { ...u, senha: '' } : vazio)
    setEditando(u)
    setAberto(true)
  }

  function salvar(): void {
    const dados = form.validate()
    if (!dados) return
    if (usuarios.some((u) => u.login === dados.login && u.id !== editando?.id)) return form.setError('login', 'Login já em uso')
    if (!editando && dados.senha.length < 6) return form.setError('senha', 'Mínimo de 6 caracteres')
    if (editando && dados.senha && dados.senha.length < 6) return form.setError('senha', 'Mínimo de 6 caracteres')
    if (editando?.id === logado?.id && (!dados.ativo || dados.perfil !== 'admin')) {
      return form.setError('perfil', 'Você não pode remover o próprio acesso de administrador')
    }

    if (editando) {
      db.atualizar('usuarios', editando.id, { ...dados, senha: dados.senha || editando.senha })
      notificar('sucesso', 'Usuário atualizado.')
    } else {
      db.criar('usuarios', dados)
      notificar('sucesso', 'Usuário cadastrado.')
    }
    setAberto(false)
  }

  function excluir(): void {
    if (!excluindo) return
    if (excluindo.id === logado?.id) notificar('erro', 'Você não pode excluir o próprio usuário.')
    else {
      db.excluir('usuarios', excluindo.id)
      notificar('sucesso', 'Usuário excluído.')
    }
    setExcluindo(null)
  }

  const colunas: Coluna<Usuario>[] = [
    {
      chave: 'nome',
      titulo: 'Nome',
      render: (u) => (
        <div>
          <p className="flex items-center gap-2 font-medium text-slate-800">
            {u.nome} {u.id === logado?.id && <span className="text-xs font-normal text-slate-400">(você)</span>}
          </p>
          <p className="text-xs text-slate-500">{u.email}</p>
        </div>
      )
    },
    { chave: 'login', titulo: 'Login', render: (u) => <span className="font-mono text-xs">{u.login}</span> },
    { chave: 'perfil', titulo: 'Perfil', render: (u) => <Badge cor={corPerfil[u.perfil]}>{nomePerfil[u.perfil]}</Badge> },
    { chave: 'status', titulo: 'Status', render: (u) => (u.ativo ? <Badge cor="verde">Ativo</Badge> : <Badge>Inativo</Badge>) },
    {
      chave: 'acoes',
      titulo: 'Ações',
      alinhar: 'direita',
      render: (u) => <AcoesLinha onEditar={() => abrir(u)} onExcluir={u.id !== logado?.id ? () => setExcluindo(u) : undefined} />
    }
  ]

  return (
    <>
      <PageHeader
        titulo="Usuários"
        subtitulo="Contas de acesso ao sistema e seus perfis"
        acoes={<Button icone={<Plus size={16} />} onClick={() => abrir(null)}>Novo Usuário</Button>}
      />

      <DataTable colunas={colunas} dados={usuarios} chave={(u) => u.id} />

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-800">Permissões por perfil</h2>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Tela</th>
              {perfis.map((p) => (
                <th key={p} className="px-4 py-3 text-center font-semibold text-slate-700">{nomePerfil[p]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recursos.map((r) => (
              <tr key={r.recurso} className="border-t border-slate-100">
                <td className="px-4 py-2.5 text-slate-700">{r.nome}</td>
                {perfis.map((p) => (
                  <td key={p} className="px-4 py-2.5 text-center">
                    {pode(p, r.recurso) ? <span className="font-medium text-emerald-700">✓ Sim</span> : <span className="text-slate-400">— Não</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        aberto={aberto}
        titulo={editando ? 'Editar usuário' : 'Novo usuário'}
        onFechar={() => setAberto(false)}
        rodape={
          <>
            <Button variante="secundario" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Nome" obrigatorio wrapperClassName="col-span-2" {...form.bind('nome')} />
          <Input label="E-mail" obrigatorio type="email" wrapperClassName="col-span-2" {...form.bind('email')} />
          <Input label="Login" obrigatorio {...form.bind('login')} onChange={(e) => form.set('login', e.target.value.toLowerCase())} />
          <Input
            label="Senha"
            obrigatorio={!editando}
            type="password"
            hint={editando ? 'Deixe em branco para manter a atual' : 'Mínimo de 6 caracteres'}
            {...form.bind('senha')}
          />
          <Select
            label="Perfil"
            obrigatorio
            opcoes={perfis.map((p) => ({ value: p, label: nomePerfil[p] }))}
            value={form.values.perfil}
            error={form.errors.perfil}
            onChange={(e) => form.set('perfil', e.target.value as Perfil)}
          />
          <div className="flex items-end pb-2.5">
            <Checkbox label="Usuário ativo" checked={form.values.ativo} onChange={(v) => form.set('ativo', v)} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        aberto={!!excluindo}
        mensagem={<>Excluir o usuário <strong>{excluindo?.nome}</strong>?</>}
        onConfirmar={excluir}
        onCancelar={() => setExcluindo(null)}
      />
    </>
  )
}

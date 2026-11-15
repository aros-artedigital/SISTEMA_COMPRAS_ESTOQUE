import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Plus } from 'lucide-react'
import { alterar, useDb } from '@/data/store'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { PageHeader } from '@/components/PageHeader'
import { AcoesLinha, DataTable, type Coluna } from '@/components/DataTable'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { Badge, Button, Checkbox, Input, Select } from '@/components/ui'
import {
  GRUPOS_PERMISSAO,
  nomeDoUsuarioPerfil,
  nomePerfil,
  permissoesDoPerfil,
  podePerfil,
  SO_ADMIN,
  type Recurso
} from '@shared/permissoes'
import { usuarioSchema } from '@shared/schemas'
import { useForm } from '@/lib/useForm'
import { executar } from '@/lib/executar'
import type { Perfil, Usuario } from '@shared/tipos'

const vazio = { nome: '', email: '', login: '', senha: '', perfil: 'operador' as Perfil, ativo: true }
const corPerfil = { admin: 'roxo', gerente: 'azul', operador: 'cinza' } as const
type PerfilTela = Perfil | 'personalizado'

const perfis: Perfil[] = ['admin', 'gerente', 'operador']

export default function Usuarios() {
  const { usuarios } = useDb()
  const { usuario: logado } = useAuth()
  const notificar = useToast()
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [aberto, setAberto] = useState(false)
  const [excluindo, setExcluindo] = useState<Usuario | null>(null)
  const form = useForm(vazio, usuarioSchema)
  const [personalizado, setPersonalizado] = useState(false)
  const [permissoes, setPermissoes] = useState<Set<Recurso>>(new Set())

  function abrir(u: Usuario | null): void {
    form.reset(u ? { nome: u.nome, email: u.email, login: u.login, senha: '', perfil: u.perfil, ativo: u.ativo } : vazio)
    setPersonalizado(!!u?.permissoes)
    setPermissoes(new Set(u?.permissoes ?? []))
    setEditando(u)
    setAberto(true)
  }

  async function salvar(): Promise<void> {
    const dados = form.validate()
    if (!dados) return
    if (personalizado && permissoes.size === 0) return notificar('aviso', 'Marque pelo menos uma permissão para o perfil personalizado.')
    // Personalizado = perfil base "operador" + a lista marcada (o administrador nunca é personalizado).
    const envio = personalizado ? { ...dados, perfil: 'operador' as Perfil, permissoes: [...permissoes] } : { ...dados, permissoes: null }
    const ok = await executar(() => alterar('usuarios:salvar', editando?.id ?? null, envio), {
      notificar,
      form,
      sucesso: editando ? 'Usuário atualizado.' : 'Usuário cadastrado.'
    })
    if (ok) setAberto(false)
  }

  async function excluir(): Promise<void> {
    if (!excluindo) return
    const alvo = excluindo
    setExcluindo(null)
    await executar(() => alterar('usuarios:excluir', alvo.id), { notificar, sucesso: 'Usuário excluído.' })
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
    {
      chave: 'perfil',
      titulo: 'Perfil',
      render: (u) => (
        <span title={u.permissoes ? `${u.permissoes.length} permissões escolhidas` : undefined}>
          <Badge cor={u.permissoes ? 'amarelo' : corPerfil[u.perfil]}>{nomeDoUsuarioPerfil(u)}</Badge>
        </span>
      )
    },
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
        acoes={<Button data-atalho="novo" icone={<Plus size={16} />} onClick={() => abrir(null)}>Novo Usuário</Button>}
      />

      <DataTable colunas={colunas} dados={usuarios} chave={(u) => u.id} />

      <h2 className="mb-1 mt-8 text-lg font-semibold text-slate-800">Permissões por perfil</h2>
      <p className="mb-3 text-sm text-slate-500">
        Para combinações diferentes, escolha o perfil <strong>Personalizado</strong> no cadastro do usuário e marque o que ele pode fazer.
      </p>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-superficie shadow-sm">
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
            {GRUPOS_PERMISSAO.map((g) => (
              <tr key={g.tela} className="border-t border-slate-100">
                <td className="px-4 py-2.5 text-slate-700">{g.tela}</td>
                {perfis.map((p) => {
                  const acoes = [
                    podePerfil(p, g.ver) && 'Ver',
                    g.editar && podePerfil(p, g.editar) && 'Cadastrar/editar',
                    g.excluir && podePerfil(p, g.excluir) && 'Excluir',
                    ...(g.extras ?? []).filter((e) => podePerfil(p, e.recurso)).map((e) => e.nome)
                  ].filter(Boolean)
                  return (
                    <td key={p} className="px-4 py-2.5 text-center text-xs">
                      {podePerfil(p, g.ver) ? <span className="font-medium text-emerald-700">✓ {acoes.join(' · ')}</span> : <span className="text-slate-400">— Não</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        aberto={aberto}
        titulo={editando ? 'Editar usuário' : 'Novo usuário'}
        tamanho={personalizado ? 'lg' : 'md'}
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
            opcoes={[...perfis.map((p) => ({ value: p, label: nomePerfil[p] })), { value: 'personalizado', label: 'Personalizado (escolher permissões)' }]}
            value={personalizado ? 'personalizado' : form.values.perfil}
            error={form.errors.perfil}
            onChange={(e) => {
              const v = e.target.value as PerfilTela
              if (v === 'personalizado') {
                // Começa com as permissões do perfil que estava escolhido (sem as de administrador).
                if (!personalizado) setPermissoes(new Set(permissoesDoPerfil(form.values.perfil === 'admin' ? 'gerente' : form.values.perfil).filter((r) => !SO_ADMIN.includes(r))))
                setPersonalizado(true)
                form.set('perfil', 'operador')
              } else {
                setPersonalizado(false)
                form.set('perfil', v)
              }
            }}
          />
          <div className="flex items-end pb-2.5">
            <Checkbox label="Usuário ativo" checked={form.values.ativo} onChange={(v) => form.set('ativo', v)} />
          </div>
          {personalizado && (
            <div className="col-span-2">
              <EditorPermissoes valor={permissoes} onChange={setPermissoes} />
            </div>
          )}
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

/** Grade de permissões do perfil personalizado: uma linha por tela, com ver / cadastrar e editar / excluir / outras. */
function EditorPermissoes({ valor, onChange }: { valor: Set<Recurso>; onChange: (v: Set<Recurso>) => void }) {
  function alternar(recurso: Recurso, ver: Recurso, dependentes: Recurso[]): void {
    const s = new Set(valor)
    if (s.has(recurso)) {
      s.delete(recurso)
      // Sem "ver", as outras ações da tela também saem.
      if (recurso === ver) dependentes.forEach((d) => s.delete(d))
    } else {
      s.add(recurso)
      s.add(ver)
    }
    onChange(s)
  }
  const caixa = (recurso: Recurso, ver: Recurso, dependentes: Recurso[], rotulo: string) => (
    <input
      type="checkbox"
      aria-label={rotulo}
      checked={valor.has(recurso)}
      onChange={() => alternar(recurso, ver, dependentes)}
      className="h-4 w-4 cursor-pointer accent-blue-600"
    />
  )
  return (
    <div className="rounded-xl border border-slate-200">
      <p className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">
        <SlidersHorizontal size={16} className="text-blue-600" /> O que este usuário pode fazer
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500">
            <th className="px-4 py-2 text-left font-medium">Tela</th>
            <th className="px-2 py-2 text-center font-medium">Ver</th>
            <th className="px-2 py-2 text-center font-medium">Cadastrar e editar</th>
            <th className="px-2 py-2 text-center font-medium">Excluir</th>
            <th className="px-4 py-2 text-left font-medium">Outras ações</th>
          </tr>
        </thead>
        <tbody>
          {GRUPOS_PERMISSAO.map((g) => {
            const soAdmin = SO_ADMIN.includes(g.ver)
            const dependentes = [g.editar, g.excluir, ...(g.extras ?? []).map((e) => e.recurso)].filter(Boolean) as Recurso[]
            return (
              <tr key={g.tela} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-700">{g.tela}</td>
                {soAdmin ? (
                  <td colSpan={4} className="px-2 py-2 text-xs text-slate-400">
                    Só administradores
                  </td>
                ) : (
                  <>
                    <td className="px-2 py-2 text-center">{caixa(g.ver, g.ver, dependentes, `${g.tela}: ver`)}</td>
                    <td className="px-2 py-2 text-center">{g.editar ? caixa(g.editar, g.ver, dependentes, `${g.tela}: cadastrar e editar`) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-2 text-center">{g.excluir ? caixa(g.excluir, g.ver, dependentes, `${g.tela}: excluir`) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-1">
                        {(g.extras ?? []).map((e) => (
                          <label key={e.recurso} className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                            {caixa(e.recurso, g.ver, dependentes, e.nome)} {e.nome}
                          </label>
                        ))}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

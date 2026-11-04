import { KeyRound, Save } from 'lucide-react'
import { alterar } from '@/data/store'
import { chamar } from '@/data/api'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Button, Card, CardHeader, Input } from '@/components/ui'
import { nomePerfil } from '@shared/permissoes'
import { perfilSchema, senhaSchema } from '@shared/schemas'
import { useForm } from '@/lib/useForm'
import { executar } from '@/lib/executar'

export default function Perfil() {
  const { usuario } = useAuth()
  const notificar = useToast()
  const dados = useForm({ nome: usuario?.nome ?? '', email: usuario?.email ?? '' }, perfilSchema)
  const senha = useForm({ atual: '', nova: '', confirmar: '' }, senhaSchema)

  if (!usuario) return null

  async function salvarDados(): Promise<void> {
    const v = dados.validate()
    if (!v) return
    await executar(() => alterar('auth:atualizarPerfil', v), { notificar, form: dados, sucesso: 'Dados atualizados.' })
  }

  async function trocarSenha(): Promise<void> {
    const v = senha.validate()
    if (!v) return
    const ok = await executar(() => chamar('auth:trocarSenha', v.atual, v.nova), { notificar, form: senha, sucesso: 'Senha alterada.' })
    if (ok) senha.reset({ atual: '', nova: '', confirmar: '' })
  }

  return (
    <>
      <PageHeader titulo="Meu Perfil" subtitulo="Seus dados de acesso" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader titulo="Dados pessoais" acao={<Badge cor="azul">{nomePerfil[usuario.perfil]}</Badge>} />
          <div className="space-y-4 p-5">
            <Input label="Nome" obrigatorio {...dados.bind('nome')} />
            <Input label="E-mail" obrigatorio type="email" {...dados.bind('email')} />
            <Input label="Login" value={usuario.login} disabled hint="O login só pode ser alterado pelo administrador" />
            <div className="flex justify-end">
              <Button icone={<Save size={16} />} onClick={salvarDados}>Salvar</Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader titulo="Alterar senha" />
          <div className="space-y-4 p-5">
            <Input label="Senha atual" type="password" obrigatorio {...senha.bind('atual')} />
            <Input label="Nova senha" type="password" obrigatorio hint="Mínimo de 6 caracteres" {...senha.bind('nova')} />
            <Input label="Confirmar nova senha" type="password" obrigatorio {...senha.bind('confirmar')} />
            <div className="flex justify-end">
              <Button icone={<KeyRound size={16} />} onClick={trocarSenha}>Alterar senha</Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}

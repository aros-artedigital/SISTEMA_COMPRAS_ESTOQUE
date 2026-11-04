import { KeyRound, Save } from 'lucide-react'
import { db } from '@/data/store'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Button, Card, CardHeader, Input } from '@/components/ui'
import { nomePerfil } from '@/lib/permissoes'
import { senhaSchema } from '@/lib/schemas'
import { useForm } from '@/lib/useForm'
import { z } from 'zod'

const dadosSchema = z.object({
  nome: z.string().trim().min(1, 'Nome é obrigatório'),
  email: z.string().trim().email('E-mail inválido')
})

export default function Perfil() {
  const { usuario } = useAuth()
  const notificar = useToast()
  const dados = useForm({ nome: usuario?.nome ?? '', email: usuario?.email ?? '' }, dadosSchema)
  const senha = useForm({ atual: '', nova: '', confirmar: '' }, senhaSchema)

  if (!usuario) return null

  function salvarDados(): void {
    const v = dados.validate()
    if (!v || !usuario) return
    db.atualizar('usuarios', usuario.id, v)
    notificar('sucesso', 'Dados atualizados.')
  }

  function trocarSenha(): void {
    const v = senha.validate()
    if (!v || !usuario) return
    if (v.atual !== usuario.senha) return senha.setError('atual', 'Senha atual incorreta')
    db.atualizar('usuarios', usuario.id, { senha: v.nova })
    senha.reset({ atual: '', nova: '', confirmar: '' })
    notificar('sucesso', 'Senha alterada.')
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

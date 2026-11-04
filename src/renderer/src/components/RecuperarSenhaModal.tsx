import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { z } from 'zod'
import { chamar } from '@/data/api'
import { useToast } from '@/contexts/ToastContext'
import { executar } from '@/lib/executar'
import { useForm } from '@/lib/useForm'
import { Modal } from './Modal'
import { Button, Input } from './ui'

const schema = z
  .object({
    login: z.string().trim().min(1, 'Informe o login do administrador'),
    codigo: z
      .string()
      .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .refine((v) => v.length === 16, 'O código tem 16 letras e números (ex.: ABCD-EFGH-JKLM-NPQR)'),
    nova: z.string().min(6, 'Mínimo de 6 caracteres'),
    confirmar: z.string()
  })
  .refine((d) => d.nova === d.confirmar, { path: ['confirmar'], message: 'As senhas não conferem' })

const vazio = { login: '', codigo: '', nova: '', confirmar: '' }

/** Tela de login → "Esqueci minha senha": redefine a senha de um administrador com o código de recuperação. */
export function RecuperarSenhaModal({ aberto, onFechar, onRecuperado }: { aberto: boolean; onFechar: () => void; onRecuperado: (login: string) => void }) {
  const notificar = useToast()
  const form = useForm(vazio, schema)
  const [enviando, setEnviando] = useState(false)

  function fechar(): void {
    form.reset(vazio)
    onFechar()
  }

  async function redefinir(): Promise<void> {
    const d = form.validate()
    if (!d) return
    setEnviando(true)
    const ok = await executar(() => chamar('auth:recuperar', d.login, d.codigo, d.nova), { notificar, form })
    setEnviando(false)
    if (!ok) return
    notificar('sucesso', 'Senha redefinida. O código foi usado: gere um novo em Configurações depois de entrar.')
    onRecuperado(d.login)
    fechar()
  }

  return (
    <Modal
      aberto={aberto}
      titulo="Esqueci minha senha"
      onFechar={fechar}
      rodape={
        <>
          <Button variante="secundario" onClick={fechar}>Cancelar</Button>
          <Button icone={<KeyRound size={16} />} onClick={redefinir} disabled={enviando}>Redefinir senha</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          <p>
            <strong className="text-slate-800">Operadores e gerentes:</strong> peçam a um administrador para definir uma nova senha em Usuários.
          </p>
          <p className="mt-1">
            <strong className="text-slate-800">Administradores:</strong> usem o código de recuperação criado em Configurações (aquele guardado em papel
            ou PDF). Cada código vale uma única vez.
          </p>
        </div>
        <Input label="Login do administrador" obrigatorio autoFocus {...form.bind('login')} />
        <Input
          label="Código de recuperação"
          obrigatorio
          placeholder="XXXX-XXXX-XXXX-XXXX"
          className="font-mono uppercase tracking-wider"
          autoComplete="off"
          {...form.bind('codigo')}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Nova senha" obrigatorio type="password" {...form.bind('nova')} />
          <Input label="Confirmar nova senha" obrigatorio type="password" {...form.bind('confirmar')} />
        </div>
      </div>
    </Modal>
  )
}

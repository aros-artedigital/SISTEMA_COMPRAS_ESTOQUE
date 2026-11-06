import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Boxes, Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button, Input } from '@/components/ui'
import { RecuperarSenhaModal } from '@/components/RecuperarSenhaModal'

export default function Login() {
  const { usuario, entrar } = useAuth()
  const navigate = useNavigate()
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [verSenha, setVerSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [recuperando, setRecuperando] = useState(false)

  if (usuario) return <Navigate to="/" replace />

  async function enviar(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!login.trim() || !senha) {
      setErro('Informe login e senha.')
      return
    }
    setEntrando(true)
    const falha = await entrar(login, senha)
    setEntrando(false)
    if (falha) setErro(falha)
    else navigate('/', { replace: true })
  }

  return (
    <div className="flex h-screen">
      <div className="hidden w-1/2 flex-col justify-between bg-sidebar p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600">
            <Boxes size={24} />
          </div>
          <span className="text-xl font-bold">Estoque e Compras</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">
            Controle completo do seu
            <br />
            <span className="text-sky-400">estoque e compras.</span>
          </h1>
          <p className="mt-4 max-w-md text-slate-300">
            Produtos, fornecedores, pedidos de compra e movimentações em um só lugar, funcionando direto no seu computador.
          </p>
        </div>
        <p className="text-xs text-slate-400">Sistema de Estoque e Compras · v0.5.1</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-slate-50 p-8">
        <form onSubmit={enviar} className="w-full max-w-sm">
          <h2 className="text-2xl font-bold text-slate-900">Entrar</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500">Acesse com seu usuário e senha.</p>

          <div className="space-y-4">
            <Input label="Login" autoFocus value={login} onChange={(e) => { setLogin(e.target.value); setErro('') }} placeholder="seu.login" />
            <div className="relative">
              <Input
                label="Senha"
                type={verSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => { setSenha(e.target.value); setErro('') }}
                placeholder="••••••"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setVerSenha((v) => !v)}
                className="absolute bottom-2.5 right-3 text-slate-400 hover:text-slate-600"
                aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {verSenha ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

            <Button type="submit" className="w-full" icone={<LogIn size={16} />} disabled={entrando}>
              {entrando ? 'Entrando...' : 'Entrar'}
            </Button>
            <button type="button" onClick={() => setRecuperando(true)} className="block w-full text-center text-sm text-blue-600 hover:underline">
              Esqueci minha senha
            </button>
          </div>

          {/* Só em desenvolvimento: o app instalado não tem os usuários de demonstração. */}
          {import.meta.env.DEV && (
            <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
              <p className="mb-1 font-semibold text-slate-600">Usuários de demonstração</p>
              <p>admin / admin123 · gerente / gerente123 · operador / operador123</p>
            </div>
          )}
        </form>
        <RecuperarSenhaModal
          aberto={recuperando}
          onFechar={() => setRecuperando(false)}
          onRecuperado={(l) => {
            setLogin(l)
            setSenha('')
            setErro('')
          }}
        />
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ShieldAlert, X } from 'lucide-react'
import type { AvisosSeguranca as Avisos } from '@shared/api'
import { chamar } from '@/data/api'

/** Lembretes de segurança: senha padrão de instalação e falta de código de recuperação. */
export function AvisosSeguranca() {
  const { pathname } = useLocation()
  const [avisos, setAvisos] = useState<Avisos | null>(null)
  const [dispensado, setDispensado] = useState(false)

  // Reavalia ao navegar (ex.: depois de trocar a senha em Meu perfil).
  useEffect(() => {
    chamar('auth:avisos').then(setAvisos, () => setAvisos(null))
  }, [pathname])

  if (!avisos || dispensado || (!avisos.senhaPadrao && !avisos.semCodigoRecuperacao && avisos.backupExternoAtrasado === null)) return null

  return (
    <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900">
      <ShieldAlert size={16} className="shrink-0" />
      <span className="flex flex-wrap gap-x-4 gap-y-1">
        {avisos.senhaPadrao && (
          <span>
            Você está usando a senha padrão.{' '}
            <Link to="/perfil" className="font-semibold underline underline-offset-2">
              Trocar senha
            </Link>
          </span>
        )}
        {avisos.backupExternoAtrasado !== null && (
          <span>
            {avisos.backupExternoAtrasado < 0 ? 'O backup externo ainda não conseguiu fazer nenhuma cópia.' : `O último backup externo foi há ${avisos.backupExternoAtrasado} dias.`}{' '}
            Conecte o pendrive ou confira a pasta.{' '}
            <Link to="/configuracoes" className="font-semibold underline underline-offset-2">
              Ver backup
            </Link>
          </span>
        )}
        {avisos.semCodigoRecuperacao && (
          <span>
            Crie um código de recuperação para não perder o acesso.{' '}
            <Link to="/configuracoes" className="font-semibold underline underline-offset-2">
              Criar agora
            </Link>
          </span>
        )}
      </span>
      <button onClick={() => setDispensado(true)} className="ml-auto rounded p-1 opacity-60 hover:opacity-100" aria-label="Dispensar aviso">
        <X size={16} />
      </button>
    </div>
  )
}

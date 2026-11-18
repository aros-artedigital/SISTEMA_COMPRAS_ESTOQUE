import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, Lock, RotateCcw } from 'lucide-react'
import { pontosDoDesenho, rotuloSenhaOS } from '@shared/dominio'
import type { SenhaOS, TipoSenhaOS } from '@shared/tipos'
import { chamar } from '@/data/api'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { executar } from '@/lib/executar'
import { SenhaDesenho } from './SenhaDesenho'
import { Button, Input } from './ui'

// Senha do equipamento na ordem de serviço: editor (formulário) e visualização protegida (ficha).

const TIPOS: TipoSenhaOS[] = ['nenhuma', 'desenho', 'pin', 'texto']

/** Confere a senha antes de enviar; devolve a mensagem de erro ou null. */
export function erroSenha(s: SenhaOS): string | null {
  if (s.tipo === 'desenho' && pontosDoDesenho(s.valor).length < 4) return 'O desenho precisa ligar pelo menos 4 pontos.'
  if (s.tipo === 'pin' && !/^\d{4,16}$/.test(s.valor)) return 'O PIN deve ter de 4 a 16 números.'
  if (s.tipo === 'texto' && !s.valor) return 'Informe a senha do equipamento.'
  if (s.tipo === 'texto' && s.valor.length > 64) return 'Máximo de 64 caracteres.'
  return null
}

const sequencia = (pontos: number[]): string => pontos.join(' → ')

export function EditorSenha({ valor, onChange, erro }: { valor: SenhaOS; onChange: (s: SenhaOS) => void; erro?: string }) {
  const pontos = pontosDoDesenho(valor.valor)
  return (
    <div className="space-y-3">
      <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-0.5 text-sm" role="radiogroup" aria-label="Tipo de senha do equipamento">
        {TIPOS.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={valor.tipo === t}
            onClick={() => onChange({ tipo: t, valor: '' })}
            className={`rounded-md px-3 py-1.5 font-medium ${valor.tipo === t ? 'bg-superficie text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {rotuloSenhaOS[t]}
          </button>
        ))}
      </div>

      {valor.tipo === 'desenho' && (
        <div className="flex flex-wrap items-start gap-4">
          <SenhaDesenho pontos={pontos} onChange={(p) => onChange({ tipo: 'desenho', valor: p.join('-') })} />
          <div className="max-w-xs space-y-2 text-sm text-slate-600">
            <p>Desenhe o padrão arrastando o mouse pelos pontos (ou clique nos pontos na ordem). O ponto verde é o início.</p>
            <p className="font-medium text-slate-800" aria-live="polite">
              {pontos.length ? `Sequência: ${sequencia(pontos)}` : 'Nenhum ponto marcado.'}
            </p>
            <Button tamanho="sm" variante="secundario" icone={<RotateCcw size={14} />} onClick={() => onChange({ tipo: 'desenho', valor: '' })} disabled={!pontos.length}>
              Limpar desenho
            </Button>
          </div>
        </div>
      )}
      {valor.tipo === 'pin' && (
        <Input
          label="PIN do equipamento"
          inputMode="numeric"
          autoComplete="off"
          wrapperClassName="max-w-xs"
          className="font-mono tracking-widest"
          value={valor.valor}
          onChange={(e) => onChange({ tipo: 'pin', valor: e.target.value.replace(/\D/g, '').slice(0, 16) })}
        />
      )}
      {valor.tipo === 'texto' && (
        <Input
          label="Senha do equipamento"
          autoComplete="off"
          wrapperClassName="max-w-sm"
          className="font-mono"
          value={valor.valor}
          maxLength={64}
          onChange={(e) => onChange({ tipo: 'texto', valor: e.target.value })}
        />
      )}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      {valor.tipo !== 'nenhuma' && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Lock size={12} /> Só quem tem a permissão "Ver senha do equipamento" consegue ver depois. A senha não sai na impressão.
        </p>
      )}
    </div>
  )
}

/** Ficha da OS: mostra que há senha e, para quem pode, revela sob demanda (registrado na auditoria). */
export function VerSenha({ osId, tipo }: { osId: number; tipo: TipoSenhaOS }) {
  const { pode } = useAuth()
  const notificar = useToast()
  const [senha, setSenha] = useState<SenhaOS | null>(null)

  // Trocou de OS ou a senha mudou (ex.: apagada ao entregar): esconde de novo.
  useEffect(() => setSenha(null), [osId, tipo])

  if (tipo === 'nenhuma') return <p className="text-sm text-slate-500">Nenhuma senha informada.</p>
  if (!pode('osSenha')) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-slate-600">
        <Lock size={14} /> {rotuloSenhaOS[tipo]} cadastrada. Você não tem permissão para ver.
      </p>
    )
  }
  if (!senha) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm text-slate-600">{rotuloSenhaOS[tipo]} cadastrada.</p>
        <Button
          tamanho="sm"
          variante="secundario"
          icone={<Eye size={14} />}
          onClick={() => void executar(async () => setSenha(await chamar('os:verSenha', osId)), { notificar })}
        >
          Mostrar senha
        </Button>
        <p className="text-[11px] text-slate-400">Cada visualização fica registrada na auditoria.</p>
      </div>
    )
  }
  const pontos = pontosDoDesenho(senha.valor)
  return (
    <div className="space-y-2">
      {senha.tipo === 'desenho' ? (
        <>
          <SenhaDesenho pontos={pontos} tamanho={170} rotulo="Desenho da senha do equipamento" />
          <p className="text-sm font-medium text-slate-800">Sequência: {sequencia(pontos)}</p>
        </>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 font-mono text-lg tracking-widest text-white" aria-label="Senha do equipamento">
          <KeyRound size={16} className="text-amber-300" /> {senha.valor || '—'}
        </p>
      )}
      <Button tamanho="sm" variante="fantasma" icone={<EyeOff size={14} />} onClick={() => setSenha(null)}>
        Ocultar
      </Button>
    </div>
  )
}

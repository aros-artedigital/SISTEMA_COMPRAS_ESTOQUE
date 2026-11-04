import { useEffect, useState } from 'react'
import type { EstadoAtualizacao, EstadoSync } from '@shared/api'
import { aoEvento, chamar } from './api'

/** Estado da sincronização, atualizado em tempo real pelo processo principal. */
export function useEstadoSync(): EstadoSync | null {
  const [estado, setEstado] = useState<EstadoSync | null>(null)
  useEffect(() => {
    chamar('sync:estado').then(setEstado, () => setEstado(null))
    return aoEvento('sync:estado', setEstado)
  }, [])
  return estado
}

export function useAtualizacao(): EstadoAtualizacao | null {
  const [estado, setEstado] = useState<EstadoAtualizacao | null>(null)
  useEffect(() => {
    chamar('atualizacao:estado').then(setEstado, () => setEstado(null))
    return aoEvento('atualizacao:estado', setEstado)
  }, [])
  return estado
}

/** "agora", "há 5 min", "há 2 h", "há 3 dias". */
export function haQuantoTempo(iso: string | null): string {
  if (!iso) return 'nunca'
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 48 * 60) return `há ${Math.floor(min / 60)} h`
  return `há ${Math.floor(min / 1440)} dias`
}

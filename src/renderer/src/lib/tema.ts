import { useSyncExternalStore } from 'react'

// Tema da interface: claro, escuro ou automático (segue o Windows).
// Fica guardado neste computador (cada terminal escolhe o seu).

export type Tema = 'claro' | 'escuro' | 'automatico'

const CHAVE = 'tema'
const midia = window.matchMedia('(prefers-color-scheme: dark)')
const ouvintes = new Set<() => void>()

function lerSalvo(): Tema {
  try {
    const v = localStorage.getItem(CHAVE)
    return v === 'claro' || v === 'escuro' ? v : 'automatico'
  } catch {
    return 'automatico'
  }
}

let atual: Tema = lerSalvo()

export const escuroEfetivo = (t: Tema = atual): boolean => t === 'escuro' || (t === 'automatico' && midia.matches)

function aplicar(): void {
  document.documentElement.classList.toggle('dark', escuroEfetivo())
  ouvintes.forEach((f) => f())
}

export function definirTema(t: Tema): void {
  atual = t
  try {
    localStorage.setItem(CHAVE, t)
  } catch {
    // sem armazenamento: vale só até fechar o app
  }
  aplicar()
}

/** Atalho: troca entre claro e escuro a partir do que está na tela. */
export const alternarTema = (): void => definirTema(escuroEfetivo() ? 'claro' : 'escuro')

/** Chamado uma vez ao abrir o app, antes de desenhar a tela. */
export function iniciarTema(): void {
  midia.addEventListener('change', () => atual === 'automatico' && aplicar())
  aplicar()
}

export function useTema(): { tema: Tema; escuro: boolean } {
  // A "foto" inclui o resultado efetivo: no modo automático o Windows pode trocar sozinho.
  const foto = useSyncExternalStore(
    (f) => {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    () => `${atual}|${escuroEfetivo()}`
  )
  const [tema, escuro] = foto.split('|')
  return { tema: tema as Tema, escuro: escuro === 'true' }
}

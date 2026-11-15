import { useSyncExternalStore } from 'react'
import { TEMA_PADRAO } from '@shared/temas'
import { canais, coresMenu, escala, TONS } from './cores'

// Aparência da interface:
//  • modo claro, escuro ou automático (segue o Windows) e tamanho da letra — escolhas de quem
//    usa este computador (ficam guardadas aqui);
//  • cores do tema (principal e secundária) — da empresa, vêm das configurações. A última usada
//    fica guardada aqui também, para a tela de login já abrir com as cores certas.

export type Modo = 'claro' | 'escuro' | 'automatico'
export type Fonte = 'pequena' | 'normal' | 'grande'
export interface Cores {
  principal: string
  secundaria: string
}

const TAMANHO_FONTE: Record<Fonte, string> = { pequena: '14px', normal: '16px', grande: '18px' }

const midia = window.matchMedia('(prefers-color-scheme: dark)')
const ouvintes = new Set<() => void>()

function ler<T extends string>(chave: string, validos: readonly T[], padrao: T): T {
  try {
    const v = localStorage.getItem(chave) as T | null
    return v && validos.includes(v) ? v : padrao
  } catch {
    return padrao
  }
}
function lerCores(): Cores | null {
  try {
    const c = JSON.parse(localStorage.getItem('cores') ?? 'null') as Cores | null
    return c && /^#[0-9a-f]{6}$/i.test(c.principal) && /^#[0-9a-f]{6}$/i.test(c.secundaria) ? c : null
  } catch {
    return null
  }
}
function gravar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    // sem armazenamento: vale só até fechar o app
  }
}

let modo: Modo = ler('tema', ['claro', 'escuro', 'automatico'] as const, 'automatico')
let fonte: Fonte = ler('fonte', ['pequena', 'normal', 'grande'] as const, 'normal')
let cores: Cores | null = lerCores()

export const escuroEfetivo = (m: Modo = modo): boolean => m === 'escuro' || (m === 'automatico' && midia.matches)

// No modo escuro, os tons claros da cor principal viram fundos escuros e vice-versa (como no tema.css).
const ESPELHO: Record<string, string> = { 50: '950', 100: '900', 200: '800', 300: '700', 400: '400', 500: '500', 600: '600', 700: '400', 800: '300', 900: '200', 950: '100' }

/**
 * As cores do tema entram numa folha de estilo própria, carregada depois do tema.css, com os
 * mesmos seletores dele — assim valem também no menu lateral (.paleta-clara), que é sempre escuro.
 */
function montarFolhaDeCores(): void {
  let folha = document.getElementById('cores-tema')
  const padrao = !cores || (cores.principal.toLowerCase() === TEMA_PADRAO.principal && cores.secundaria.toLowerCase() === TEMA_PADRAO.secundaria)
  if (padrao) {
    // Tema padrão: valem as cores originais do tema.css.
    folha?.remove()
    return
  }
  if (!folha) {
    folha = document.createElement('style')
    folha.id = 'cores-tema'
  }
  // Sempre no fim do <head>, depois das folhas do app.
  document.head.appendChild(folha)
  const tons = escala(cores!.principal)
  const principal = (escuro: boolean): string => TONS.map((t) => `--c-blue-${t}: ${canais(tons[escuro ? ESPELHO[t] : t])};`).join(' ')
  const menu = coresMenu(cores!.secundaria)
  folha.textContent = [
    `:root, .paleta-clara { ${principal(false)} --c-sidebar: ${canais(menu.fundo)}; --c-sidebar-hover: ${canais(menu.hover)}; --c-sidebar-borda: ${canais(menu.borda)}; }`,
    `.dark { ${principal(true)} }`,
    `.dark .paleta-clara { ${principal(false)} }`
  ].join('\n')
}

function aplicar(): void {
  document.documentElement.classList.toggle('dark', escuroEfetivo())
  document.documentElement.style.fontSize = TAMANHO_FONTE[fonte]
  montarFolhaDeCores()
  ouvintes.forEach((f) => f())
}

export function definirModo(m: Modo): void {
  modo = m
  gravar('tema', m)
  aplicar()
}

/** Atalho: troca entre claro e escuro a partir do que está na tela. */
export const alternarModo = (): void => definirModo(escuroEfetivo() ? 'claro' : 'escuro')

export function definirFonte(f: Fonte): void {
  fonte = f
  gravar('fonte', f)
  aplicar()
}

/** Aplica as cores do tema da empresa. `lembrar` = guardar para a próxima abertura (não usar em pré-visualização). */
export function aplicarCores(c: Cores, lembrar = true): void {
  cores = c
  if (lembrar) gravar('cores', JSON.stringify(c))
  aplicar()
}

/** Chamado uma vez ao abrir o app, antes de desenhar a tela. */
export function iniciarTema(): void {
  midia.addEventListener('change', () => modo === 'automatico' && aplicar())
  aplicar()
}

export function useAparencia(): { modo: Modo; escuro: boolean; fonte: Fonte } {
  // A "foto" inclui o resultado efetivo: no modo automático o Windows pode trocar sozinho.
  const foto = useSyncExternalStore(
    (f) => {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    () => `${modo}|${escuroEfetivo()}|${fonte}`
  )
  const [m, e, f] = foto.split('|')
  return { modo: m as Modo, escuro: e === 'true', fonte: f as Fonte }
}

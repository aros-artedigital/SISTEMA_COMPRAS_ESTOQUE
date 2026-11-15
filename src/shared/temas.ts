// Temas de cores do sistema. A cor principal pinta botões, links e o item ativo do menu;
// a secundária é o fundo do menu lateral. Vale para a empresa toda (fica nas configurações).

export type IdTema = 'azul' | 'verde' | 'roxo' | 'grafite' | 'vinho' | 'personalizado'

export interface Tema {
  id: Exclude<IdTema, 'personalizado'>
  nome: string
  principal: string
  secundaria: string
}

export const TEMAS: Tema[] = [
  { id: 'azul', nome: 'Azul clássico', principal: '#2563eb', secundaria: '#13294b' },
  { id: 'verde', nome: 'Verde floresta', principal: '#059669', secundaria: '#0f3a2c' },
  { id: 'roxo', nome: 'Roxo real', principal: '#7c3aed', secundaria: '#2a1650' },
  { id: 'grafite', nome: 'Grafite e ciano', principal: '#0e7490', secundaria: '#1e2530' },
  { id: 'vinho', nome: 'Vinho', principal: '#be123c', secundaria: '#3f0d1e' }
]

export const TEMA_PADRAO = TEMAS[0]

/** Cores efetivas de uma configuração (o tema pronto ou as cores escolhidas). */
export function coresDoTema(tema: IdTema, principal: string, secundaria: string): { principal: string; secundaria: string } {
  const pronto = TEMAS.find((t) => t.id === tema)
  return pronto ? { principal: pronto.principal, secundaria: pronto.secundaria } : { principal, secundaria }
}

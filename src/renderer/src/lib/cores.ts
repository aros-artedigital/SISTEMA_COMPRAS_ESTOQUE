// Cálculos de cor para os temas: a partir de uma cor escolhida, gera a escala de tons
// (50 a 950) que as telas usam, e garante contraste com o texto que vai por cima.

type RGB = [number, number, number]

export const TONS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const

export function hexParaRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const rgbParaHex = (c: RGB): string => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** Mistura a cor com outra (t = 0 mantém a original; t = 1 vira a outra). */
const misturar = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const BRANCO: RGB = [255, 255, 255]
const PRETO: RGB = [0, 0, 0]

function luminancia([r, g, b]: RGB): number {
  const canal = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

export function contraste(a: RGB, b: RGB): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

/** Escurece a cor só o necessário para o texto por cima atingir o contraste mínimo. */
export function garantirContraste(cor: RGB, texto: RGB, minimo: number): RGB {
  let c = cor
  for (let i = 0; i < 20 && contraste(c, texto) < minimo; i++) c = misturar(c, PRETO, 0.06)
  return c
}

/** Quanto a cor base (que vira o tom 600) se mistura com branco (tons claros) ou preto (tons escuros). */
const MISTURA: Record<(typeof TONS)[number], [RGB, number]> = {
  50: [BRANCO, 0.94],
  100: [BRANCO, 0.87],
  200: [BRANCO, 0.74],
  300: [BRANCO, 0.56],
  400: [BRANCO, 0.32],
  500: [BRANCO, 0.12],
  600: [BRANCO, 0],
  700: [PRETO, 0.16],
  800: [PRETO, 0.32],
  900: [PRETO, 0.46],
  950: [PRETO, 0.62]
}

/** Escala completa (tom → "r g b") a partir da cor principal. Botões usam o 600 com texto branco. */
export function escala(hex: string): Record<string, RGB> {
  const base = garantirContraste(hexParaRgb(hex), BRANCO, 3.2)
  return Object.fromEntries(TONS.map((t) => [t, misturar(base, ...MISTURA[t])]))
}

/** Cores do menu lateral: fundo (escurecido se preciso para o texto claro), destaque ao passar o mouse e borda. */
export function coresMenu(hex: string): { fundo: RGB; hover: RGB; borda: RGB } {
  const fundo = garantirContraste(hexParaRgb(hex), hexParaRgb('#cbd5e1'), 7)
  return { fundo, hover: misturar(fundo, BRANCO, 0.08), borda: misturar(fundo, BRANCO, 0.1) }
}

export const canais = (c: RGB): string => c.map((v) => Math.round(v)).join(' ')

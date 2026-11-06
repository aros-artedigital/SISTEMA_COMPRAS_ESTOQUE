// Gera src/renderer/src/tema.css: as cores do Tailwind viram variáveis CSS (canais "r g b"),
// com uma versão clara (padrão) e uma escura (classe .dark no <html>).
// Uso: node scripts/gerar-tema.mjs   (rode de novo se mudar o mapeamento abaixo)
import { writeFileSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const cores = require('tailwindcss/colors')
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

export const FAMILIAS = ['slate', 'red', 'blue', 'amber', 'emerald', 'violet', 'sky']
const TONS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

// Cinzas do modo escuro: a escala se inverte (fundo escuro, texto claro), com ajustes para
// o fundo da página (100) ficar mais escuro que os cartões e as bordas (200) aparecerem.
const slateEscuro = {
  50: '#1b2537',
  100: '#0d1421',
  200: '#2a3649',
  300: '#3b4a60',
  400: '#6b7a90',
  500: '#8b9ab0',
  600: '#a5b2c4',
  700: '#c3cddb',
  800: '#dbe2ec',
  900: '#edf1f6',
  950: '#f8fafc'
}
// Cores (vermelho, azul...): fundos claros viram escuros e textos escuros viram claros;
// os tons do meio (botões) ficam iguais.
const espelho = { 50: '950', 100: '900', 200: '800', 300: '700', 400: '400', 500: '500', 600: '600', 700: '400', 800: '300', 900: '200', 950: '100' }

function variaveis(escuro) {
  const linhas = []
  for (const f of FAMILIAS) {
    for (const t of TONS) {
      const hex = !escuro ? cores[f][t] : f === 'slate' ? slateEscuro[t] : cores[f][espelho[t]]
      linhas.push(`  --c-${f}-${t}: ${rgb(hex)};`)
    }
  }
  linhas.push(`  --c-superficie: ${rgb(escuro ? '#151e2d' : '#ffffff')};`)
  return linhas.join('\n')
}

const css = `/* Gerado por scripts/gerar-tema.mjs — não edite à mão. */
:root,
.paleta-clara {
${variaveis(false)}
  color-scheme: light;
}

.dark {
${variaveis(true)}
  color-scheme: dark;
}

/* Áreas que são escuras nos dois temas (menu lateral) mantêm a paleta clara. */
.dark .paleta-clara {
  color-scheme: dark;
}
`
writeFileSync(join(raiz, 'src/renderer/src/tema.css'), css)
console.log('tema.css gerado')

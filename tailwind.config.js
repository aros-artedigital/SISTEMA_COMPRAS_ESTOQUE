// As cores usadas nas telas vêm de variáveis CSS (src/renderer/src/tema.css),
// para o modo escuro trocar a paleta inteira sem repetir classes "dark:" em cada tela.
const familias = ['slate', 'red', 'blue', 'amber', 'emerald', 'violet', 'sky']
const tons = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
const variavel = (nome) => `rgb(var(--c-${nome}) / <alpha-value>)`
const paleta = Object.fromEntries(familias.map((f) => [f, Object.fromEntries(tons.map((t) => [t, variavel(`${f}-${t}`)]))]))

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ...paleta,
        // Fundo de cartões, campos e janelas (branco no tema claro).
        superficie: variavel('superficie'),
        sidebar: {
          DEFAULT: '#13294b',
          hover: '#1c3a66',
          border: '#1f3b63'
        }
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}

import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    // Só o better-sqlite3 (módulo nativo) fica fora do bundle; o resto vai embutido em out/main,
    // assim o instalador não depende da árvore de node_modules.
    plugins: [externalizeDepsPlugin({ include: ['better-sqlite3'] })]
  },
  preload: {
    resolve: { alias: shared },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        ...shared
      }
    },
    plugins: [react()]
  }
})

// Gera build/icon.png (512×512, fundo transparente) a partir de build/icon.svg,
// renderizando o SVG numa janela do próprio Electron. Uso: node scripts/gerar-icone.mjs

import { _electron as electron } from 'playwright-core'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const svg = readFileSync('build/icon.svg', 'utf8')
const pasta = mkdtempSync(join(tmpdir(), 'icone-'))
const main = join(pasta, 'main.cjs')
writeFileSync(
  main,
  `const { app, BrowserWindow } = require('electron')
   app.whenReady().then(() => {
     const w = new BrowserWindow({ width: 512, height: 512, frame: false, transparent: true, useContentSize: true, show: true })
     w.loadURL('data:text/html,' + encodeURIComponent('<html><body style="margin:0;background:transparent">' + ${JSON.stringify(svg)} + '</body></html>'))
   })`
)

const app = await electron.launch({ args: [main] })
const page = await app.firstWindow()
await page.waitForSelector('svg')
await page.setViewportSize({ width: 512, height: 512 })
await page.locator('svg').screenshot({ path: 'build/icon.png', omitBackground: true })
await app.close()
rmSync(pasta, { recursive: true, force: true })
console.log('build/icon.png gerado')

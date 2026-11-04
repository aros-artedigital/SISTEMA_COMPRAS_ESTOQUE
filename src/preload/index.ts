import { contextBridge } from 'electron'

// Ponte segura entre o processo principal e a interface.
// Na fase 2, as chamadas ao banco SQLite (via ipcRenderer.invoke) serão expostas aqui.
const api = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)

import { contextBridge, ipcRenderer } from 'electron'

// Ponte segura entre o processo principal e a interface.
// A interface só consegue chamar canais registrados no main (src/main/ipc.ts),
// que validam os dados e checam permissões antes de tocar no banco.
const api = {
  invoke: (canal: string, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(canal, ...args),
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)

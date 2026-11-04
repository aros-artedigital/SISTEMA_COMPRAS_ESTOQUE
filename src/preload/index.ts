import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

// Ponte segura entre o processo principal e a interface.
// A interface só consegue chamar canais registrados no main (src/main/ipc.ts),
// que validam os dados e checam permissões antes de tocar no banco.

// Eventos que o main pode enviar sem ser chamado (status da sincronização, atualização...).
const EVENTOS = ['sync:estado', 'dados:alterados', 'atualizacao:estado']

const api = {
  invoke: (canal: string, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(canal, ...args),
  /** Escuta um evento do processo principal; retorna a função que cancela a escuta. */
  aoEvento: (canal: string, callback: (dados: unknown) => void): (() => void) => {
    if (!EVENTOS.includes(canal)) throw new Error(`Evento desconhecido: ${canal}`)
    const ouvinte = (_e: IpcRendererEvent, dados: unknown): void => callback(dados)
    ipcRenderer.on(canal, ouvinte)
    return () => ipcRenderer.removeListener(canal, ouvinte)
  },
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)

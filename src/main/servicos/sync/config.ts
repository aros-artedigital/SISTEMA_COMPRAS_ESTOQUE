import { safeStorage } from 'electron'
import { banco } from '../../db/conexao'

// Configuração de sincronização deste terminal. Fica só no banco local (não é sincronizada).

export interface ConfigSync {
  url: string
  /** Token do terminal, criptografado pelo Windows (DPAPI) quando disponível. */
  token: string
  tokenCifrado: boolean
  terminalUuid: string
  nome: string
  codigo: string
  ativo: boolean
  intervalo: number
  cursor: number
  ultimaSync: string | null
  ultimoErro: string | null
}

const padrao: ConfigSync = {
  url: '',
  token: '',
  tokenCifrado: false,
  terminalUuid: '',
  nome: '',
  codigo: '',
  ativo: false,
  intervalo: 5,
  cursor: 0,
  ultimaSync: null,
  ultimoErro: null
}

export function lerConfig(): ConfigSync {
  const linha = banco().prepare('SELECT dados FROM sync_config WHERE id = 1').get() as { dados: string } | undefined
  return { ...padrao, ...(linha ? JSON.parse(linha.dados) : {}) }
}

export function salvarConfig(parcial: Partial<ConfigSync>): ConfigSync {
  const nova = { ...lerConfig(), ...parcial }
  banco()
    .prepare('INSERT INTO sync_config (id, dados) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET dados = excluded.dados')
    .run(JSON.stringify(nova))
  return nova
}

export function limparConfig(): void {
  banco().prepare('DELETE FROM sync_config WHERE id = 1').run()
}

export function guardarToken(token: string): Pick<ConfigSync, 'token' | 'tokenCifrado'> {
  if (safeStorage.isEncryptionAvailable()) return { token: safeStorage.encryptString(token).toString('base64'), tokenCifrado: true }
  return { token, tokenCifrado: false }
}

export function lerToken(cfg: ConfigSync): string {
  if (!cfg.token) return ''
  return cfg.tokenCifrado ? safeStorage.decryptString(Buffer.from(cfg.token, 'base64')) : cfg.token
}

export const configurado = (cfg: ConfigSync): boolean => Boolean(cfg.url && cfg.token)

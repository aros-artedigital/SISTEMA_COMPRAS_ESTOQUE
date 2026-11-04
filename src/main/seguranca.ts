import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

// Hash de senha com scrypt (nativo do Node, sem dependências).
// Formato salvo: scrypt$<salt hex>$<hash hex>

const TAMANHO = 64

export function gerarHash(senha: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(senha, salt, TAMANHO)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verificarSenha(senha: string, salvo: string): boolean {
  const [alg, saltHex, hashHex] = salvo.split('$')
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false
  const esperado = Buffer.from(hashHex, 'hex')
  const calculado = scryptSync(senha, Buffer.from(saltHex, 'hex'), esperado.length)
  return timingSafeEqual(esperado, calculado)
}

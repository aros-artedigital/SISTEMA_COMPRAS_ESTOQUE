const moedaFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const numeroFmt = new Intl.NumberFormat('pt-BR')

export const moeda = (v: number): string => moedaFmt.format(v)
export const numero = (v: number): string => numeroFmt.format(v)

/** "2026-11-03" ou "2026-11-03T11:30:00" → "03/11/2026" */
export function data(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** "2026-11-03T11:30:00" → "03/11/2026 11:30" */
export function dataHora(iso: string): string {
  return `${data(iso)} ${iso.slice(11, 16)}`
}

export function hojeIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const somenteDigitos = (v: string): string => v.replace(/\D/g, '')

export function mascaraCpf(v: string): string {
  return somenteDigitos(v)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function mascaraCnpj(v: string): string {
  return somenteDigitos(v)
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export function mascaraTelefone(v: string): string {
  const d = somenteDigitos(v).slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

/** Comparação de texto sem acento e sem diferenciar maiúsculas. */
export function contem(texto: string, busca: string): boolean {
  const norm = (s: string): string =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
  return norm(texto).includes(norm(busca.trim()))
}

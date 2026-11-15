import type { EnderecoCep } from '@shared/api'
import { somenteDigitos } from '@shared/format'
import { ErroNegocio } from '../erros'

// Busca de endereço pelo CEP no ViaCEP (serviço público e gratuito, sem cadastro).
// Feita pelo processo principal: a interface não acessa a internet diretamente.
// Sem internet, o usuário continua podendo digitar o endereço à mão.

const URL_VIACEP = (cep: string): string => `https://viacep.com.br/ws/${cep}/json/`
const cache = new Map<string, EnderecoCep>()

export async function buscar(cepDigitado: string): Promise<EnderecoCep> {
  const cep = somenteDigitos(cepDigitado)
  if (cep.length !== 8) throw new ErroNegocio('CEP deve ter 8 dígitos.', 'cep')
  const guardado = cache.get(cep)
  if (guardado) return guardado

  let resposta: Response
  try {
    resposta = await fetch(URL_VIACEP(cep), { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } })
  } catch {
    throw new ErroNegocio('Não foi possível consultar o CEP (sem internet?). Preencha o endereço manualmente.', 'cep')
  }
  if (!resposta.ok) throw new ErroNegocio('O serviço de CEP não respondeu. Preencha o endereço manualmente.', 'cep')
  const d = (await resposta.json()) as Record<string, string | boolean>
  if (d.erro) throw new ErroNegocio('CEP não encontrado.', 'cep')

  const endereco: EnderecoCep = {
    cep: `${cep.slice(0, 5)}-${cep.slice(5)}`,
    logradouro: String(d.logradouro ?? ''),
    complemento: String(d.complemento ?? ''),
    bairro: String(d.bairro ?? ''),
    cidade: String(d.localidade ?? ''),
    uf: String(d.uf ?? '')
  }
  cache.set(cep, endereco)
  return endereco
}

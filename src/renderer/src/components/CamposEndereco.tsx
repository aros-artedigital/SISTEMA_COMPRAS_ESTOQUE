import { useRef, useState } from 'react'
import { CheckCircle2, Loader2, Search } from 'lucide-react'
import { chamar } from '@/data/api'
import { UFS } from '@shared/dominio'
import * as fmt from '@shared/format'
import { Input, Select } from './ui'

// Bloco de endereço com busca de CEP: ao completar os 8 dígitos (ou clicar na lupa), consulta o
// ViaCEP e preenche rua, bairro, cidade e UF; o cursor vai para o número. Sem internet ou CEP
// desconhecido, aparece um aviso e o endereço é digitado normalmente.

export interface Endereco {
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

interface Props {
  valores: Endereco
  erros: Partial<Record<keyof Endereco, string>>
  onChange: (campo: keyof Endereco, valor: string) => void
}

type Estado = { tipo: 'buscando' } | { tipo: 'ok' } | { tipo: 'aviso'; mensagem: string } | null

export function CamposEndereco({ valores, erros, onChange }: Props) {
  const [estado, setEstado] = useState<Estado>(null)
  const numero = useRef<HTMLInputElement>(null)
  const ultima = useRef('')

  async function buscar(cep: string): Promise<void> {
    const digitos = fmt.somenteDigitos(cep)
    if (digitos.length !== 8) return setEstado({ tipo: 'aviso', mensagem: 'Digite os 8 números do CEP.' })
    ultima.current = digitos
    setEstado({ tipo: 'buscando' })
    try {
      const e = await chamar('cep:buscar', digitos)
      if (ultima.current !== digitos) return // o usuário já mudou o CEP
      onChange('logradouro', e.logradouro)
      onChange('bairro', e.bairro)
      onChange('cidade', e.cidade)
      onChange('uf', e.uf)
      if (e.complemento && !valores.complemento) onChange('complemento', e.complemento)
      setEstado({ tipo: 'ok' })
      numero.current?.focus()
    } catch (erro) {
      if (ultima.current === digitos) setEstado({ tipo: 'aviso', mensagem: (erro as Error).message })
    }
  }

  const dica =
    estado?.tipo === 'buscando' ? (
      <span className="flex items-center gap-1 text-slate-500">
        <Loader2 size={12} className="animate-spin" /> Buscando endereço...
      </span>
    ) : estado?.tipo === 'ok' ? (
      <span className="flex items-center gap-1 text-emerald-600">
        <CheckCircle2 size={12} /> Endereço encontrado
      </span>
    ) : estado?.tipo === 'aviso' ? (
      <span className="text-amber-600">{estado.mensagem}</span>
    ) : (
      'Digite o CEP para preencher o endereço'
    )

  return (
    <>
      <div className="col-span-2">
        <div className="relative">
          <Input
            label="CEP"
            placeholder="00000-000"
            inputMode="numeric"
            value={valores.cep}
            error={erros.cep}
            onChange={(e) => {
              const v = fmt.mascaraCep(e.target.value)
              onChange('cep', v)
              setEstado(null)
              if (fmt.somenteDigitos(v).length === 8 && fmt.somenteDigitos(v) !== ultima.current) void buscar(v)
            }}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => void buscar(valores.cep)}
            className="absolute right-1.5 top-[30px] rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
            title="Buscar endereço pelo CEP"
            aria-label="Buscar endereço pelo CEP"
          >
            <Search size={16} />
          </button>
        </div>
        {!erros.cep && <p className="mt-1 text-xs text-slate-500">{dica}</p>}
      </div>
      <Input label="Endereço (rua, avenida...)" wrapperClassName="col-span-4" value={valores.logradouro} error={erros.logradouro} onChange={(e) => onChange('logradouro', e.target.value)} />
      <Input ref={numero} label="Número" wrapperClassName="col-span-2" value={valores.numero} error={erros.numero} onChange={(e) => onChange('numero', e.target.value)} />
      <Input label="Complemento" wrapperClassName="col-span-2" value={valores.complemento} error={erros.complemento} onChange={(e) => onChange('complemento', e.target.value)} />
      <Input label="Bairro" wrapperClassName="col-span-2" value={valores.bairro} error={erros.bairro} onChange={(e) => onChange('bairro', e.target.value)} />
      <Input label="Cidade" wrapperClassName="col-span-4" value={valores.cidade} error={erros.cidade} onChange={(e) => onChange('cidade', e.target.value)} />
      <Select
        label="UF"
        wrapperClassName="col-span-2"
        placeholder="—"
        opcoes={UFS.map((u) => ({ value: u, label: u }))}
        value={valores.uf}
        error={erros.uf}
        onChange={(e) => onChange('uf', e.target.value)}
      />
    </>
  )
}

import { useState } from 'react'
import type { z } from 'zod'

type Erros<V> = Partial<Record<keyof V, string>>

/** Estado de formulário + validação com zod. Os valores ficam como texto e o schema converte. */
export function useForm<V extends Record<string, unknown>, Saida>(
  inicial: V,
  schema: z.ZodType<Saida, z.ZodTypeDef, unknown>
) {
  const [values, setValues] = useState<V>(inicial)
  const [errors, setErrors] = useState<Erros<V>>({})

  function set<K extends keyof V>(campo: K, valor: V[K]): void {
    setValues((v) => ({ ...v, [campo]: valor }))
    setErrors((e) => ({ ...e, [campo]: undefined }))
  }

  function setError(campo: keyof V, mensagem: string): void {
    setErrors((e) => ({ ...e, [campo]: mensagem }))
  }

  function validate(): Saida | null {
    const r = schema.safeParse(values)
    if (r.success) {
      setErrors({})
      return r.data
    }
    const novos: Erros<V> = {}
    for (const issue of r.error.issues) {
      const campo = issue.path[0] as keyof V | undefined
      if (campo !== undefined && !novos[campo]) novos[campo] = issue.message
    }
    setErrors(novos)
    return null
  }

  function reset(v: V): void {
    setValues(v)
    setErrors({})
  }

  /** Atalho para inputs de texto: value + onChange + error. */
  function bind<K extends keyof V>(campo: K) {
    return {
      value: String(values[campo] ?? ''),
      onChange: (e: { target: { value: string } }) => set(campo, e.target.value as V[K]),
      error: errors[campo]
    }
  }

  return { values, errors, set, setError, validate, reset, bind }
}

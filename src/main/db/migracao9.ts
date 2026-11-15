// Migração 9 — endereço completo de clientes e fornecedores (CEP, rua, número, complemento, bairro),
// preenchido pela busca de CEP. Cidade e UF já existiam.

const colunas = ['cep', 'logradouro', 'numero', 'complemento', 'bairro']

export const migracao9 = ['clientes', 'fornecedores']
  .flatMap((t) => colunas.map((c) => `ALTER TABLE ${t} ADD COLUMN ${c} TEXT NOT NULL DEFAULT '';`))
  .join('\n')

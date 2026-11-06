import type {
  Categoria,
  Cliente,
  Compra,
  Configuracoes,
  Fornecedor,
  Movimentacao,
  Produto,
  Unidade,
  Usuario
} from '@shared/tipos'

// Dados de demonstração gravados no banco na primeira execução em desenvolvimento.
// Credenciais: admin / admin123 · gerente / gerente123 · operador / operador123
export const usuarios: (Usuario & { senha: string })[] = [
  { id: 1, nome: 'Administrador', email: 'admin@empresa.local', login: 'admin', senha: 'admin123', perfil: 'admin', ativo: true },
  { id: 2, nome: 'Marina Souza', email: 'marina@empresa.local', login: 'gerente', senha: 'gerente123', perfil: 'gerente', ativo: true },
  { id: 3, nome: 'Carlos Lima', email: 'carlos@empresa.local', login: 'operador', senha: 'operador123', perfil: 'operador', ativo: true },
  { id: 4, nome: 'Paula Reis', email: 'paula@empresa.local', login: 'paula', senha: 'paula123', perfil: 'operador', ativo: false }
]

export const categorias: Categoria[] = [
  { id: 1, nome: 'Periféricos', descricao: 'Mouses, teclados e acessórios' },
  { id: 2, nome: 'Monitores', descricao: 'Monitores e telas' },
  { id: 3, nome: 'Armazenamento', descricao: 'SSDs, HDs e pendrives' },
  { id: 4, nome: 'Redes', descricao: 'Roteadores, switches e cabos' },
  { id: 5, nome: 'Escritório', descricao: 'Material de escritório' }
]

export const unidades: Unidade[] = [
  { id: 1, sigla: 'UN', nome: 'Unidade' },
  { id: 2, sigla: 'CX', nome: 'Caixa' },
  { id: 3, sigla: 'PC', nome: 'Pacote' },
  { id: 4, sigla: 'M', nome: 'Metro' },
  { id: 5, sigla: 'KG', nome: 'Quilograma' }
]

export const produtos: Produto[] = [
  { id: 1, codigo: 'P0001', codigoBarras: '7891000100011', nome: 'Mouse USB', categoriaId: 1, unidadeId: 1, precoCusto: 28.5, precoVenda: 49.9, estoque: 18, estoqueMinimo: 10, ativo: true },
  { id: 2, codigo: 'P0002', codigoBarras: '7891000100028', nome: 'Teclado ABNT2', categoriaId: 1, unidadeId: 1, precoCusto: 52, precoVenda: 89.9, estoque: 12, estoqueMinimo: 8, ativo: true },
  { id: 3, codigo: 'P0003', codigoBarras: '7891000100035', nome: 'Monitor 24"', categoriaId: 2, unidadeId: 1, precoCusto: 580, precoVenda: 799, estoque: 5, estoqueMinimo: 6, ativo: true },
  { id: 4, codigo: 'P0004', codigoBarras: '7891000100042', nome: 'SSD 480GB', categoriaId: 3, unidadeId: 1, precoCusto: 165, precoVenda: 249.9, estoque: 22, estoqueMinimo: 10, ativo: true },
  { id: 5, codigo: 'P0005', codigoBarras: '7891000100059', nome: 'Pendrive 64GB', categoriaId: 3, unidadeId: 1, precoCusto: 24, precoVenda: 44.9, estoque: 3, estoqueMinimo: 15, ativo: true },
  { id: 6, codigo: 'P0006', codigoBarras: '7891000100066', nome: 'Cabo de rede Cat6', categoriaId: 4, unidadeId: 4, precoCusto: 1.8, precoVenda: 3.5, estoque: 305, estoqueMinimo: 100, ativo: true },
  { id: 7, codigo: 'P0007', codigoBarras: '7891000100073', nome: 'Roteador Wi-Fi 6', categoriaId: 4, unidadeId: 1, precoCusto: 310, precoVenda: 459, estoque: 7, estoqueMinimo: 4, ativo: true },
  { id: 8, codigo: 'P0008', codigoBarras: '7891000100080', nome: 'Papel A4 (500 fls)', categoriaId: 5, unidadeId: 3, precoCusto: 22, precoVenda: 34.9, estoque: 40, estoqueMinimo: 20, ativo: true },
  { id: 9, codigo: 'P0009', codigoBarras: '7891000100097', nome: 'Monitor 27" 4K', categoriaId: 2, unidadeId: 1, precoCusto: 1490, precoVenda: 2199, estoque: 2, estoqueMinimo: 2, ativo: true },
  { id: 10, codigo: 'P0010', codigoBarras: '7891000100103', nome: 'Webcam Full HD', categoriaId: 1, unidadeId: 1, precoCusto: 98, precoVenda: 169.9, estoque: 0, estoqueMinimo: 5, ativo: false }
]

export const fornecedores: Fornecedor[] = [
  { id: 1, razaoSocial: 'Tech Distribuidora Ltda', nomeFantasia: 'TechDist', cnpj: '12.345.678/0001-90', telefone: '(11) 3456-7890', email: 'vendas@techdist.com.br', cidade: 'São Paulo', uf: 'SP', ativo: true },
  { id: 2, razaoSocial: 'Info Atacado S.A.', nomeFantasia: 'Info Atacado', cnpj: '23.456.789/0001-01', telefone: '(21) 2345-6789', email: 'contato@infoatacado.com.br', cidade: 'Rio de Janeiro', uf: 'RJ', ativo: true },
  { id: 3, razaoSocial: 'Papelaria Central ME', nomeFantasia: 'Papel Central', cnpj: '34.567.890/0001-12', telefone: '(31) 3234-5678', email: 'pedidos@papelcentral.com.br', cidade: 'Belo Horizonte', uf: 'MG', ativo: true },
  { id: 4, razaoSocial: 'Rede Sul Comércio Eireli', nomeFantasia: 'Rede Sul', cnpj: '45.678.901/0001-23', telefone: '(51) 3123-4567', email: 'comercial@redesul.com.br', cidade: 'Porto Alegre', uf: 'RS', ativo: false }
]

export const clientes: Cliente[] = [
  { id: 1, nome: 'João Pereira', tipo: 'PF', documento: '123.456.789-00', telefone: '(11) 98765-4321', email: 'joao@email.com', cidade: 'Campinas', uf: 'SP', ativo: true },
  { id: 2, nome: 'Escola Saber Ltda', tipo: 'PJ', documento: '56.789.012/0001-34', telefone: '(11) 3333-2222', email: 'compras@escolasaber.com.br', cidade: 'São Paulo', uf: 'SP', ativo: true },
  { id: 3, nome: 'Ana Martins', tipo: 'PF', documento: '987.654.321-00', telefone: '(21) 99876-5432', email: 'ana.martins@email.com', cidade: 'Niterói', uf: 'RJ', ativo: true },
  { id: 4, nome: 'Clínica Vida S.A.', tipo: 'PJ', documento: '67.890.123/0001-45', telefone: '(31) 3555-4444', email: 'ti@clinicavida.com.br', cidade: 'Contagem', uf: 'MG', ativo: false }
]

export const compras: Compra[] = [
  { id: 1, numero: 'C-0001', fornecedorId: 1, data: '2026-06-12', status: 'recebida', observacao: '', itens: [{ produtoId: 1, quantidade: 20, valorUnitario: 28.5 }, { produtoId: 2, quantidade: 10, valorUnitario: 52 }] },
  { id: 2, numero: 'C-0002', fornecedorId: 2, data: '2026-07-03', status: 'recebida', observacao: '', itens: [{ produtoId: 4, quantidade: 15, valorUnitario: 165 }] },
  { id: 3, numero: 'C-0003', fornecedorId: 3, data: '2026-08-21', status: 'recebida', observacao: 'Entrega parcelada', itens: [{ produtoId: 8, quantidade: 30, valorUnitario: 22 }] },
  { id: 4, numero: 'C-0004', fornecedorId: 1, data: '2026-09-15', status: 'recebida', observacao: '', itens: [{ produtoId: 3, quantidade: 4, valorUnitario: 580 }, { produtoId: 9, quantidade: 2, valorUnitario: 1490 }] },
  { id: 5, numero: 'C-0005', fornecedorId: 2, data: '2026-10-08', status: 'recebida', observacao: '', itens: [{ produtoId: 6, quantidade: 300, valorUnitario: 1.8 }, { produtoId: 7, quantidade: 3, valorUnitario: 310 }] },
  { id: 6, numero: 'C-0006', fornecedorId: 1, data: '2026-10-29', status: 'pedido', observacao: 'Aguardando transportadora', itens: [{ produtoId: 5, quantidade: 50, valorUnitario: 24 }, { produtoId: 3, quantidade: 6, valorUnitario: 580 }] },
  { id: 7, numero: 'C-0007', fornecedorId: 3, data: '2026-11-02', status: 'rascunho', observacao: '', itens: [{ produtoId: 8, quantidade: 20, valorUnitario: 22 }] }
]

export const movimentacoes: Omit<Movimentacao, 'saldoApos'>[] = [
  { id: 1, data: '2026-06-12T10:15:00', produtoId: 1, tipo: 'entrada', quantidade: 20, motivo: 'Compra C-0001', usuarioId: 2, compraId: 1 },
  { id: 2, data: '2026-06-12T10:15:00', produtoId: 2, tipo: 'entrada', quantidade: 10, motivo: 'Compra C-0001', usuarioId: 2, compraId: 1 },
  { id: 3, data: '2026-06-25T15:40:00', produtoId: 1, tipo: 'saida', quantidade: 6, motivo: 'Venda balcão', usuarioId: 3 },
  { id: 4, data: '2026-07-03T09:00:00', produtoId: 4, tipo: 'entrada', quantidade: 15, motivo: 'Compra C-0002', usuarioId: 2, compraId: 2 },
  { id: 5, data: '2026-07-19T14:20:00', produtoId: 4, tipo: 'saida', quantidade: 4, motivo: 'Venda Escola Saber', usuarioId: 3 },
  { id: 6, data: '2026-08-21T11:05:00', produtoId: 8, tipo: 'entrada', quantidade: 30, motivo: 'Compra C-0003', usuarioId: 2, compraId: 3 },
  { id: 7, data: '2026-08-30T16:45:00', produtoId: 5, tipo: 'saida', quantidade: 12, motivo: 'Venda balcão', usuarioId: 3 },
  { id: 8, data: '2026-09-15T08:30:00', produtoId: 3, tipo: 'entrada', quantidade: 4, motivo: 'Compra C-0004', usuarioId: 2, compraId: 4 },
  { id: 9, data: '2026-09-15T08:30:00', produtoId: 9, tipo: 'entrada', quantidade: 2, motivo: 'Compra C-0004', usuarioId: 2, compraId: 4 },
  { id: 10, data: '2026-09-28T13:10:00', produtoId: 2, tipo: 'saida', quantidade: 3, motivo: 'Venda Clínica Vida', usuarioId: 3 },
  { id: 11, data: '2026-10-08T10:00:00', produtoId: 6, tipo: 'entrada', quantidade: 300, motivo: 'Compra C-0005', usuarioId: 2, compraId: 5 },
  { id: 12, data: '2026-10-08T10:00:00', produtoId: 7, tipo: 'entrada', quantidade: 3, motivo: 'Compra C-0005', usuarioId: 2, compraId: 5 },
  { id: 13, data: '2026-10-17T17:25:00', produtoId: 3, tipo: 'saida', quantidade: 2, motivo: 'Venda balcão', usuarioId: 3 },
  { id: 14, data: '2026-10-22T09:50:00', produtoId: 8, tipo: 'ajuste', quantidade: -2, motivo: 'Inventário: avaria', usuarioId: 1 },
  { id: 15, data: '2026-11-03T11:30:00', produtoId: 1, tipo: 'saida', quantidade: 5, motivo: 'Venda João Pereira', usuarioId: 3 }
]

export const configuracoes: Configuracoes = {
  nomeEmpresa: 'Minha Empresa Ltda',
  cnpj: '00.000.000/0001-00',
  telefone: '(11) 4000-0000',
  email: 'contato@minhaempresa.local',
  endereco: 'Rua Exemplo, 100 - Centro - São Paulo/SP',
  estoqueMinimoPadrao: 5,
  alertarEstoqueMinimo: true,
  prefixoCompra: 'C-',
  custoAoReceber: 'medio'
}

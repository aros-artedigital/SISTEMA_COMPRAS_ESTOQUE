// Cria um BANCO DE DEMONSTRAÇÃO separado (o banco real não é tocado), com 10 cadastros de cada tipo e
// cerca de 6 meses de movimento: vendas (à vista e a prazo), compras, ordens de serviço em todas as etapas,
// contas a pagar e a receber, caixas fechados, movimentações e um inventário.
//
// Tudo passa pelas mesmas regras do sistema (os canais IPC usados pelas telas). Para os gráficos terem
// histórico, o relógio do processo principal é "voltado" para a data de cada operação enquanto ela é feita.
//
// Uso:   node scripts/demo-dados.mjs            (usa o programa instalado ou dist/win-unpacked)
// Saída: %APPDATA%\gestor-estoque-compras\demonstracao\estoque-demo.sqlite  (+ perfil próprio do Electron)
// Um banco de demonstração anterior é guardado como .anterior.sqlite antes de recriar.

import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, renameSync, rmSync } from 'fs'
import { join, resolve } from 'path'

const raiz = resolve(import.meta.dirname, '..')
const pastaDemo = join(process.env.APPDATA, 'gestor-estoque-compras', 'demonstracao')
const banco = join(pastaDemo, 'estoque-demo.sqlite')
const perfil = join(pastaDemo, 'perfil')
const instalado = join(process.env.LOCALAPPDATA, 'Programs', 'Gestor de Estoque e Compras', 'Gestor de Estoque e Compras.exe')
const exe = process.env.DEMO_EXE || (existsSync(instalado) ? instalado : join(raiz, 'dist', 'win-unpacked', 'Gestor de Estoque e Compras.exe'))

mkdirSync(pastaDemo, { recursive: true })
if (existsSync(banco)) {
  renameSync(banco, join(pastaDemo, 'estoque-demo.anterior.sqlite'))
  for (const extra of ['-wal', '-shm']) rmSync(banco + extra, { force: true })
}

// ---------- Utilidades ----------

let semente = 20261119
const aleatorio = () => {
  semente = (semente + 0x6d2b79f5) | 0
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const sorteia = (lista) => lista[Math.floor(aleatorio() * lista.length)]
const entre = (a, b) => a + Math.floor(aleatorio() * (b - a + 1))
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const agoraReal = new Date()
const hoje = new Date(agoraReal.getFullYear(), agoraReal.getMonth(), agoraReal.getDate())
const dia = (n) => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + n) // n negativo = passado
const as = (d, h, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m)
const INICIO = -182

function digitoCpf(base) {
  const calc = (n) => {
    const soma = base.slice(0, n).split('').reduce((s, d, i) => s + Number(d) * (n + 1 - i), 0)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  base = base + calc(9)
  return base + calc(10)
}
const cpf = (base9) => digitoCpf(base9).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
function cnpj(base12) {
  const calc = (b, pesos) => {
    const r = b.split('').reduce((s, d, i) => s + Number(d) * pesos[i], 0) % 11
    return r < 2 ? 0 : 11 - r
  }
  let b = base12
  b += calc(b, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  b += calc(b, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return b.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}
function ean13(base12) {
  const s = base12.split('').reduce((t, d, i) => t + Number(d) * (i % 2 ? 3 : 1), 0)
  return base12 + ((10 - (s % 10)) % 10)
}

// ---------- Abre o sistema no banco de demonstração ----------

console.log(`Programa: ${exe}`)
console.log(`Banco de demonstração: ${banco}`)
const app = await electron.launch({ executablePath: exe, args: [`--user-data-dir=${perfil}`], env: { ...process.env, ESTOQUE_DB_PATH: banco, ESTOQUE_DEMO: '' } })
const page = await app.firstWindow()
await page.waitForSelector('input[placeholder="seu.login"]')
await page.fill('input[placeholder="seu.login"]', 'admin')
await page.fill('input[type="password"]', 'admin123')
await page.getByRole('button', { name: 'Entrar' }).click()
await page.getByText('Olá, Administrador').waitFor()

/** Volta (ou avança) o relógio do processo principal: tudo o que for gravado leva esta data. */
async function relogio(quando) {
  await app.evaluate((_, alvo) => {
    const Real = globalThis.__DataReal ?? Date
    globalThis.__DataReal = Real
    if (alvo === null) {
      globalThis.Date = Real
      return
    }
    const delta = alvo - Real.now()
    class Falsa extends Real {
      constructor(...a) {
        if (a.length === 0) super(Real.now() + delta)
        else super(...a)
      }
      static now() {
        return Real.now() + delta
      }
    }
    globalThis.Date = Falsa
  }, quando === null ? null : quando.getTime())
}

async function ipc(canal, ...args) {
  const r = await page.evaluate(([c, a]) => window.api.invoke(c, ...a), [canal, args])
  if (!r.ok) throw new Error(`${canal}: ${r.erro.mensagem}${r.erro.campo ? ` (${r.erro.campo})` : ''}`)
  return r.dados
}

// Rabisco de assinatura (PNG) desenhado num canvas da própria tela.
async function assinatura(semente) {
  return page.evaluate((s) => {
    const c = document.createElement('canvas')
    c.width = 600
    c.height = 200
    const g = c.getContext('2d')
    g.strokeStyle = '#0f172a'
    g.lineWidth = 3
    g.lineCap = 'round'
    g.beginPath()
    let x = 60
    g.moveTo(x, 120)
    for (let i = 0; i < 9; i++) {
      x += 45 + ((s * (i + 3)) % 20)
      g.quadraticCurveTo(x - 25, 40 + ((s * i * 7) % 60), x, 110 + ((s * i) % 30))
    }
    g.stroke()
    return c.toDataURL('image/png')
  }, semente)
}

// ---------- Linha do tempo ----------

const eventos = []
const quando = (data, fazer) => eventos.push({ data, ordem: eventos.length, fazer })
const st = { estoque: new Map(), vendas: [], compras: {}, os: {} }

// ---------- Cadastros (dia inicial) ----------

const CATEGORIAS = [
  ['Periféricos', 'Mouses, teclados e webcams'],
  ['Armazenamento', 'SSDs, HDs e pendrives'],
  ['Redes', 'Roteadores, switches e repetidores'],
  ['Cabos e adaptadores', 'HDMI, USB, rede e adaptadores'],
  ['Áudio', 'Fones e caixas de som'],
  ['Energia e carregadores', 'Carregadores, fontes e nobreaks'],
  ['Acessórios para celular', 'Películas, capas e suportes'],
  ['Monitores', 'Monitores e suportes'],
  ['Peças de reposição', 'Peças usadas na assistência técnica'],
  ['Impressão', 'Cartuchos, toners e papel']
]
const UNIDADES_NOVAS = [
  ['PAR', 'Par'],
  ['KIT', 'Kit'],
  ['RL', 'Rolo'],
  ['DZ', 'Dúzia'],
  ['LT', 'Litro']
]
const FORNECEDORES = [
  ['Distribuidora Alfa Tech Ltda', 'Alfa Tech', 'São Paulo', 'SP'],
  ['Mega Peças Eletrônicos Ltda', 'Mega Peças', 'Campinas', 'SP'],
  ['Conecta Redes Comércio Ltda', 'Conecta Redes', 'Curitiba', 'PR'],
  ['Brasil Cabos e Acessórios Ltda', 'Brasil Cabos', 'Belo Horizonte', 'MG'],
  ['Som & Cia Importadora Ltda', 'Som & Cia', 'Rio de Janeiro', 'RJ'],
  ['Energia Total Distribuidora Ltda', 'Energia Total', 'São Paulo', 'SP'],
  ['Mobile Acessórios Atacado Ltda', 'Mobile Atacado', 'Goiânia', 'GO'],
  ['Visão Monitores Comércio Ltda', 'Visão Monitores', 'Porto Alegre', 'RS'],
  ['Repara Peças para Assistência Ltda', 'Repara Peças', 'Recife', 'PE'],
  ['Imprima Suprimentos Ltda', 'Imprima', 'Florianópolis', 'SC']
]
const CLIENTES = [
  ['Ana Paula Ribeiro', 'PF', 'São Paulo', 'SP'],
  ['Bruno Henrique Costa', 'PF', 'Osasco', 'SP'],
  ['Camila Ferreira Souza', 'PF', 'São Paulo', 'SP'],
  ['Diego Martins Alves', 'PF', 'Guarulhos', 'SP'],
  ['Eduarda Lima Santos', 'PF', 'Santo André', 'SP'],
  ['Felipe Augusto Rocha', 'PF', 'São Paulo', 'SP'],
  ['Clínica Bem Viver Ltda', 'PJ', 'São Paulo', 'SP'],
  ['Escritório Contábil Exato Ltda', 'PJ', 'São Bernardo do Campo', 'SP'],
  ['Padaria Pão Dourado Ltda', 'PJ', 'São Paulo', 'SP'],
  ['Escola Aprender Mais Ltda', 'PJ', 'Barueri', 'SP']
]
const USUARIOS = [
  ['Carla Mendes', 'carla.mendes', 'gerente', null],
  ['Roberto Lima', 'roberto.lima', 'gerente', null],
  ['Juliana Prado', 'juliana.prado', 'operador', null],
  ['Marcos Vieira', 'marcos.vieira', 'operador', null],
  ['Patrícia Gomes', 'patricia.gomes', 'operador', null],
  ['Lucas Andrade', 'lucas.andrade', 'operador', null],
  ['Rafael Torres', 'rafael.torres', 'operador', ['dashboard', 'os', 'osEditar', 'osSenha', 'produtos', 'estoque', 'clientes']],
  ['Thiago Nunes', 'thiago.nunes', 'operador', ['dashboard', 'os', 'osEditar', 'osSenha', 'produtos', 'estoque', 'clientes']],
  ['Fernanda Dias', 'fernanda.dias', 'operador', ['dashboard', 'caixa', 'financeiro', 'financeiroEditar', 'financeiroExcluir', 'relatorios', 'clientes', 'fornecedores']],
  ['Gustavo Moreira', 'gustavo.moreira', 'operador', ['dashboard', 'produtos', 'produtosEditar', 'estoque', 'inventarioConcluir', 'compras', 'comprasEditar', 'fornecedores', 'fornecedoresEditar']]
]
// código, nome, categoria(idx), custo, venda, estoque inicial, mínimo, fornecedor(idx)
const PRODUTOS = [
  ['P01', 'Mouse sem fio', 0, 32, 69.9, 60, 8, 0],
  ['P02', 'Teclado USB ABNT2', 0, 45, 89.9, 40, 6, 0],
  ['P03', 'SSD 480GB SATA', 1, 165, 289.9, 20, 4, 1],
  ['P04', 'Pendrive 64GB', 1, 24, 49.9, 60, 8, 1],
  ['P05', 'Roteador Wi-Fi AC1200', 2, 145, 259.9, 12, 4, 2],
  ['P06', 'Cabo HDMI 2m', 3, 11, 29.9, 80, 10, 3],
  ['P07', 'Fone de ouvido Bluetooth', 4, 58, 129.9, 30, 5, 4],
  ['P08', 'Carregador USB-C 20W', 5, 28, 69.9, 50, 8, 5],
  ['P09', 'Película de vidro', 6, 3.5, 24.9, 120, 15, 6],
  ['P10', 'Conector de carga USB-C', 8, 7, 35, 40, 6, 8]
]
const ids = { categorias: [], fornecedores: [], clientes: [], usuarios: [], produtos: [] }

quando(as(dia(INICIO), 8, 30), async () => {
  const d = await ipc('dados:carregar')
  await ipc('configuracoes:salvar', {
    ...d.configuracoes,
    nomeEmpresa: 'TecnoPonto Informática (DEMONSTRAÇÃO)',
    cnpj: cnpj('451230980001'),
    telefone: '(11) 4002-8922',
    email: 'contato@tecnoponto.exemplo',
    cep: '01310-100',
    endereco: 'Av. Paulista, 1000 — Bela Vista — São Paulo/SP',
    estoqueMinimoPadrao: 5
  })
  for (const [nome, descricao] of CATEGORIAS) ids.categorias.push((await ipc('categorias:salvar', null, { nome, descricao })).id)
  for (const [sigla, nome] of UNIDADES_NOVAS) await ipc('unidades:salvar', null, { sigla, nome })
  const un = (await ipc('dados:carregar')).unidades.find((u) => u.sigla === 'UN').id
  for (const [i, [razao, fantasia, cidade, uf]] of FORNECEDORES.entries()) {
    ids.fornecedores.push(
      (
        await ipc('fornecedores:salvar', null, {
          razaoSocial: razao,
          nomeFantasia: fantasia,
          cnpj: cnpj(`${String(11 + i * 7).padStart(2, '0')}${String(203040 + i * 1111).padStart(6, '0')}0001`),
          telefone: `(11) 3${String(100 + i * 37).padStart(3, '0')}-${String(1000 + i * 271).slice(-4)}`,
          email: `vendas@${fantasia.toLowerCase().replace(/[^a-z]/g, '')}.exemplo`,
          cep: '',
          logradouro: `Rua do Comércio, ${100 + i * 15}`,
          numero: String(100 + i * 15),
          complemento: '',
          bairro: 'Centro',
          cidade,
          uf,
          ativo: true
        })
      ).id
    )
  }
  for (const [i, [nome, tipo, cidade, uf]] of CLIENTES.entries()) {
    ids.clientes.push(
      (
        await ipc('clientes:salvar', null, {
          nome,
          tipo,
          documento: tipo === 'PF' ? cpf(String(318460270 + i * 1137)) : cnpj(`${String(21 + i * 3)}${String(450120 + i * 997).padStart(6, '0')}0001`),
          telefone: `(11) 9${String(8100 + i * 123)}-${String(2000 + i * 347).slice(-4)}`,
          email: `${nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}${i}@cliente.exemplo`,
          cep: '',
          logradouro: `Rua das Flores, ${20 + i * 11}`,
          numero: String(20 + i * 11),
          complemento: i % 3 === 0 ? 'Sala 2' : '',
          bairro: sorteia(['Centro', 'Jardim América', 'Vila Nova', 'Bela Vista']),
          cidade,
          uf,
          ativo: true
        })
      ).id
    )
  }
  for (const [nome, login, perfilU, permissoes] of USUARIOS) {
    ids.usuarios.push((await ipc('usuarios:salvar', null, { nome, email: `${login}@tecnoponto.exemplo`, login, senha: 'demo123', perfil: perfilU, permissoes, ativo: true })).id)
  }
  for (const [codigo, nome, cat, custo, venda, inicial, minimo] of PRODUTOS) {
    const p = await ipc('produtos:salvar', null, {
      codigo,
      codigoBarras: ean13(`789${String(4512300 + Number(codigo.slice(1)) * 13).padStart(9, '0')}`),
      nome,
      categoriaId: ids.categorias[cat],
      unidadeId: un,
      precoCusto: custo,
      precoVenda: venda,
      estoque: inicial,
      estoqueMinimo: minimo,
      ativo: true
    })
    ids.produtos.push(p.id)
    st.estoque.set(p.id, inicial)
  }
})
const tecnicos = () => [ids.usuarios[6], ids.usuarios[7]]
const produto = (i) => ({ id: ids.produtos[i], preco: PRODUTOS[i][4], custo: PRODUTOS[i][3] })

// ---------- Compras (10) ----------
// [dia do pedido, fornecedor, itens [produto, qtd], dias até receber (null = não recebida), situação final]
const COMPRAS = [
  [-160, 0, [[0, 30], [1, 20]], 4, 'recebida'],
  [-140, 1, [[2, 12], [3, 40]], 6, 'recebida'],
  [-120, 6, [[8, 80], [7, 30]], 3, 'recebida'],
  [-100, 3, [[5, 60], [6, 20]], 5, 'recebida'],
  [-82, 2, [[4, 10], [2, 10]], 7, 'recebida'],
  [-64, 8, [[9, 30], [1, 20]], 4, 'recebida'],
  [-45, 5, [[7, 30], [0, 30], [3, 30]], 5, 'recebida'],
  [-28, 4, [[6, 20], [8, 60]], 6, 'parcial'],
  [-14, 0, [[1, 12], [0, 10]], null, 'pedido'],
  [-2, 1, [[2, 6]], null, 'rascunho']
]
COMPRAS.forEach(([d, forn, itens, receber, situacao], n) => {
  quando(as(dia(d), 10, 15), async () => {
    const c = await ipc('compras:salvar', null, {
      fornecedorId: ids.fornecedores[forn],
      data: iso(dia(d)),
      observacao: situacao === 'rascunho' ? 'Cotação em andamento' : '',
      status: situacao === 'rascunho' ? 'rascunho' : 'pedido',
      itens: itens.map(([p, q]) => ({ produtoId: produto(p).id, quantidade: q, valorUnitario: Math.round(produto(p).custo * (0.95 + aleatorio() * 0.1) * 100) / 100 }))
    })
    st.compras[n] = c
  })
  if (receber !== null) {
    quando(as(dia(d + receber), 11, 0), async () => {
      const c = st.compras[n]
      if (situacao === 'parcial') {
        await ipc('compras:receber', c.id, c.itens.map((i) => ({ produtoId: i.produtoId, quantidade: Math.floor(i.quantidade / 2) })))
        for (const i of c.itens) st.estoque.set(i.produtoId, st.estoque.get(i.produtoId) + Math.floor(i.quantidade / 2))
      } else {
        await ipc('compras:receber', c.id)
        for (const i of c.itens) st.estoque.set(i.produtoId, st.estoque.get(i.produtoId) + i.quantidade)
      }
      // Conta a pagar ao fornecedor para metade das compras recebidas (30 dias), paga no vencimento.
      if (n % 2 === 0 && situacao === 'recebida') {
        const total = c.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0)
        const [conta] = await ipc('contas:salvar', null, {
          tipo: 'pagar',
          descricao: `Compra ${c.numero}`,
          categoria: 'Fornecedores',
          clienteId: null,
          fornecedorId: c.fornecedorId,
          compraId: c.id,
          valor: Math.round(total * 100) / 100,
          vencimento: iso(dia(d + receber + 30)),
          parcelas: 1,
          observacao: ''
        })
        if (d + receber + 30 < 0) quando(as(dia(d + receber + 30), 14, 0), () => ipc('contas:baixar', conta.id, { valor: conta.valor, juros: 0, desconto: 0, forma: 'boleto' }))
      }
    })
  }
})

// ---------- Contas a pagar (despesas) ----------
// [descrição, categoria, valor da parcela, parcelas, 1º vencimento (dia), forma, fornecedor?]
const DESPESAS = [
  ['Aluguel da loja', 'Aluguel', 1600, 7, -170, 'boleto'],
  ['Energia elétrica', 'Energia', 380, 6, -160, 'boleto'],
  ['Internet fibra 500 MB', 'Internet e telefone', 129.9, 6, -165, 'debito'],
  ['Honorários do contador', 'Outros', 350, 6, -162, 'pix'],
  ['Anúncios nas redes sociais', 'Marketing', 300, 2, -20, 'credito'],
  ['Simples Nacional', 'Impostos', 1180.45, 1, -5, 'boleto'],
  ['Manutenção do ar-condicionado', 'Manutenção', 350, 1, 12, 'pix']
]
DESPESAS.forEach(([descricao, categoria, valor, parcelas, venc, forma]) => {
  quando(as(dia(Math.min(0, Math.max(INICIO + 1, venc - 10))), 9, 0), async () => {
    const lista = await ipc('contas:salvar', null, {
      tipo: 'pagar',
      descricao,
      categoria,
      clienteId: null,
      fornecedorId: null,
      compraId: null,
      valor: Math.round(valor * parcelas * 100) / 100,
      vencimento: iso(dia(venc)),
      parcelas,
      observacao: ''
    })
    for (const c of lista) {
      const v = Math.round((new Date(`${c.vencimento}T12:00:00`) - hoje) / 86400000)
      // Paga as vencidas (o imposto do mês fica em aberto, vencido; a energia de um mês é paga com atraso e juros).
      if (v >= 0 || descricao === 'Simples Nacional') continue
      const atraso = descricao === 'Energia elétrica' && c.parcela === 3 ? 4 : 0
      quando(as(dia(v + atraso), 15, 30), () => ipc('contas:baixar', c.id, { valor: c.valor, juros: atraso ? 7.6 : 0, desconto: 0, forma }))
    }
  })
})

// ---------- Contas a receber avulsas ----------
quando(as(dia(-40), 9, 30), async () => {
  const [p1, p2] = await ipc('contas:salvar', null, {
    tipo: 'receber',
    descricao: 'Instalação de rede e cabeamento',
    categoria: 'Serviços',
    clienteId: ids.clientes[7],
    fornecedorId: null,
    compraId: null,
    valor: 1800,
    vencimento: iso(dia(-25)),
    parcelas: 2,
    observacao: '10 pontos de rede e configuração do roteador'
  })
  quando(as(dia(-25), 10, 0), () => ipc('contas:baixar', p1.id, { valor: p1.valor, juros: 0, desconto: 0, forma: 'pix' }))
  void p2
  await ipc('contas:salvar', null, {
    tipo: 'receber',
    descricao: 'Manutenção mensal dos computadores',
    categoria: 'Serviços',
    clienteId: ids.clientes[6],
    fornecedorId: null,
    compraId: null,
    valor: 450,
    vencimento: iso(dia(-8)),
    parcelas: 1,
    observacao: 'Contrato mensal'
  })
})

// ---------- Vendas (≈ 6 meses, crescendo) ----------

const FORMAS = [
  ['pix', 35],
  ['credito', 25],
  ['debito', 20],
  ['dinheiro', 20]
]
const formaSorteada = () => {
  let r = aleatorio() * 100
  for (const [f, p] of FORMAS) if ((r -= p) < 0) return f
  return 'pix'
}
const diasCaixa = []
for (let d = -1; diasCaixa.length < 10; d--) if (dia(d).getDay() !== 0) diasCaixa.push(d)
const ehDiaCaixa = (d) => d === 0 || diasCaixa.includes(d)
const diasPrazo = new Set([-150, -118, -86, -61, -33, -12])

function venda(d, hora, minuto, forcarForma) {
  quando(as(dia(d), hora, minuto), async () => {
    const qtdItens = entre(1, 3)
    const usados = new Set()
    const itens = []
    for (let k = 0; k < qtdItens; k++) {
      const i = entre(0, 8) // a peça de reposição (P10) é usada nas OS, não vendida no balcão
      if (usados.has(i)) continue
      const p = produto(i)
      const q = Math.min(i === 8 ? entre(1, 3) : entre(1, 2), st.estoque.get(p.id))
      if (q <= 0) continue
      usados.add(i)
      itens.push({ produtoId: p.id, quantidade: q, valorUnitario: p.preco })
    }
    if (!itens.length) return
    const forma = forcarForma ?? formaSorteada()
    const prazo = forma === 'prazo'
    const subtotal = itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0)
    const v = await ipc('vendas:registrar', {
      clienteId: prazo || aleatorio() < 0.45 ? sorteia(ids.clientes) : null,
      formaPagamento: forma,
      parcelas: prazo ? entre(2, 4) : 1,
      primeiroVencimento: prazo ? iso(dia(d + 30)) : null,
      desconto: subtotal > 200 && aleatorio() < 0.3 ? 10 : 0,
      observacao: '',
      itens
    })
    for (const i of itens) st.estoque.set(i.produtoId, st.estoque.get(i.produtoId) - i.quantidade)
    st.vendas.push(v)
    if (prazo) {
      // Parcelas recebidas no vencimento — a 1ª parcela da venda de 33 dias atrás fica em atraso.
      const parcelas = (await ipc('dados:carregar')).contas.filter((c) => c.vendaId === v.id)
      for (const c of parcelas) {
        const venc = Math.round((new Date(`${c.vencimento}T12:00:00`) - hoje) / 86400000)
        if (venc >= 0 || (d === -33 && c.parcela === 1)) continue
        quando(as(dia(venc), 11, 30), () => ipc('contas:baixar', c.id, { valor: c.valor, juros: 0, desconto: 0, forma: sorteia(['pix', 'dinheiro', 'debito']) }))
      }
    }
  })
}
for (let d = INICIO + 2; d <= 0; d++) {
  if (dia(d).getDay() === 0) continue
  const mes = (d - INICIO) / 30 // 0 a 6: o movimento cresce ao longo dos meses
  if (ehDiaCaixa(d)) {
    // Dias de caixa: 3 a 5 vendas, ao menos uma em dinheiro.
    const n = entre(3, 5)
    for (let k = 0; k < n; k++) {
      const h = 10 + Math.floor((k * 7) / n)
      if (d === 0 && as(dia(0), h, 40) > new Date(agoraReal.getTime() - 20 * 60000)) continue
      venda(d, h, 10 + k * 7, k === 0 ? 'dinheiro' : undefined)
    }
  } else if (diasPrazo.has(d)) {
    venda(d, 14, 20, 'prazo')
  } else if (aleatorio() < 0.62 + mes * 0.05) {
    venda(d, entre(9, 12), entre(0, 59))
    if (aleatorio() < 0.25 + mes * 0.06) venda(d, entre(14, 17), entre(0, 59))
  }
}
// Duas vendas canceladas (cliente desistiu / produto com defeito).
for (const [d, motivo] of [
  [-95, 'Cliente desistiu da compra'],
  [-41, 'Produto com defeito, devolvido']
]) {
  venda(d, 9, 5, 'pix')
  quando(as(dia(d), 16, 45), async () => {
    const v = [...st.vendas].reverse().find((x) => x.data.startsWith(iso(dia(d))) && x.formaPagamento === 'pix' && x.status === 'concluida')
    if (v) await ipc('vendas:cancelar', v.id, motivo)
  })
}
// ---------- Ordens de serviço (10, em todas as etapas) ----------
const EQUIP = [
  ['Celular', 'Samsung', 'Galaxy A54', 'Não carrega'],
  ['Notebook', 'Dell', 'Inspiron 15', 'Muito lento, esquenta'],
  ['Celular', 'Motorola', 'Moto G84', 'Tela trincada'],
  ['Celular', 'Apple', 'iPhone 12', 'Bateria dura pouco'],
  ['Impressora', 'HP', 'DeskJet 2774', 'Não puxa o papel'],
  ['Celular', 'Xiaomi', 'Redmi Note 12', 'Conector de carga com mau contato'],
  ['Notebook', 'Lenovo', 'IdeaPad 3', 'Não liga'],
  ['Videogame', 'Sony', 'PlayStation 4', 'Superaquecendo e desligando'],
  ['Computador', 'Montado', 'Core i5', 'Formatação e backup'],
  ['Celular', 'Samsung', 'Galaxy S21', 'Câmera traseira embaçada']
]
// [dia de entrada, roteiro de status até hoje, peça?, valor da mão de obra, senha]
const OS = [
  [-45, [['em_analise', 1], ['em_execucao', 2], ['pronta', 3], ['entregue', 5]], true, 80, 'desenho'],
  [-36, [['em_analise', 1], ['aguardando_aprovacao', 2], ['em_execucao', 4], ['pronta', 6], ['entregue', 7]], false, 180, 'pin'],
  [-22, [['em_analise', 1], ['em_execucao', 2], ['pronta', 3], ['entregue', 4]], false, 250, 'desenho'],
  [-14, [['em_analise', 1], ['em_execucao', 3], ['pronta', 5], ['entregue', 6]], false, 320, 'nenhuma'],
  [-20, [['em_analise', 1], ['aguardando_aprovacao', 2], ['cancelada', 6]], false, 150, 'nenhuma'],
  [-16, [['em_analise', 1], ['em_execucao', 2], ['pronta', 6]], true, 90, 'desenho'],
  [-9, [['em_analise', 1], ['em_execucao', 3]], true, 120, 'texto'],
  [-6, [['em_analise', 1], ['aguardando_aprovacao', 2]], false, 220, 'nenhuma'],
  [-5, [['em_analise', 1]], false, 160, 'nenhuma'],
  [0, [], false, 0, 'desenho']
]
const SENHAS = { desenho: '1-4-7-8-9', pin: '2580', texto: 'gato1234' }
OS.forEach(([d, roteiro, peca, maoDeObra, senha], n) => {
  const [tipo, marca, modelo, defeito] = EQUIP[n]
  const h0 = d === 0 ? Math.max(8, Math.min(agoraReal.getHours() - 1, 11)) : 9
  quando(as(dia(d), h0, 40), async () => {
    const itens = []
    if (maoDeObra) itens.push({ tipo: 'servico', produtoId: null, descricao: n === 8 ? 'Formatação com backup' : 'Mão de obra técnica', quantidade: 1, valorUnitario: maoDeObra })
    if (peca) itens.push({ tipo: 'peca', produtoId: produto(9).id, descricao: '', quantidade: 1, valorUnitario: 35 })
    const o = await ipc('os:salvar', null, {
      clienteId: ids.clientes[n],
      tecnicoId: tecnicos()[n % 2],
      previsao: iso(dia(d + (n === 8 ? 2 : 5))),
      equipTipo: tipo,
      equipMarca: marca,
      equipModelo: modelo,
      equipSerie: `${tipo === 'Celular' ? '35' : 'SN'}${String(4100000 + n * 7919).padStart(9, '0')}`,
      acessorios: tipo === 'Celular' ? 'Capa' : tipo === 'Notebook' ? 'Carregador' : '',
      estadoFisico: n % 3 === 0 ? 'Riscos leves na tampa' : '',
      defeito,
      diagnostico: roteiro.length > 1 ? 'Diagnóstico concluído na bancada' : '',
      laudo: roteiro.some(([s]) => s === 'pronta') ? 'Serviço realizado e testado' : '',
      observacao: '',
      desconto: 0,
      garantiaDias: 90,
      itens,
      senha: senha === 'nenhuma' ? undefined : { tipo: senha, valor: SENHAS[senha] }
    })
    st.os[n] = o
    await ipc('os:assinar', o.id, { tipo: 'entrada', nome: EQUIP[n] && CLIENTES[n][0], imagem: await assinatura(n + 3) })
    // Sinal pago em algumas
    if (n === 1 || n === 6) await ipc('os:receber', o.id, [{ forma: 'pix', valor: 50 }])
  })
  for (const [status, depois] of roteiro) {
    quando(as(dia(d + depois), 16, 10), async () => {
      const o = st.os[n]
      const total = o.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0)
      if (status === 'entregue') {
        const pago = n === 1 ? 50 : 0
        const falta = Math.round((total - pago) * 100) / 100
        const comSaldo = n === 3 // entregue com valor a receber
        await ipc('os:status', o.id, 'entregue', '', {
          pagamentos: comSaldo ? [{ forma: 'dinheiro', valor: 100 }] : n === 0 ? [{ forma: 'dinheiro', valor: 40 }, { forma: 'pix', valor: Math.round((falta - 40) * 100) / 100 }] : [{ forma: sorteia(['pix', 'credito', 'debito']), valor: falta }],
          entregarComSaldo: comSaldo
        })
        await ipc('os:assinar', o.id, { tipo: 'retirada', nome: CLIENTES[n][0], imagem: await assinatura(n + 11) })
      } else {
        await ipc('os:status', o.id, status, status === 'cancelada' ? 'Cliente não aprovou o orçamento' : '')
        if (status === 'pronta' && o.itens.some((i) => i.tipo === 'peca')) st.estoque.set(produto(9).id, st.estoque.get(produto(9).id) - 1)
      }
    })
  }
})

// ---------- Movimentações manuais e inventário ----------
quando(as(dia(-112), 17, 0), () => ipc('estoque:movimentar', { produtoId: produto(6).id, tipo: 'saida', quantidade: 1, motivo: 'Avaria no transporte' }).then(() => st.estoque.set(produto(6).id, st.estoque.get(produto(6).id) - 1)))
quando(as(dia(-100), 10, 30), () => ipc('estoque:movimentar', { produtoId: produto(8).id, tipo: 'entrada', quantidade: 10, motivo: 'Bonificação do fornecedor' }).then(() => st.estoque.set(produto(8).id, st.estoque.get(produto(8).id) + 10)))
quando(as(dia(-75), 15, 0), () => ipc('estoque:movimentar', { produtoId: produto(5).id, tipo: 'saida', quantidade: 2, motivo: 'Uso interno (instalação na loja)' }).then(() => st.estoque.set(produto(5).id, st.estoque.get(produto(5).id) - 2)))
quando(as(dia(-60), 18, 0), async () => {
  const inv = await ipc('inventario:abrir', { descricao: 'Inventário trimestral', categoriaId: null })
  for (const item of inv.lista) {
    const ajuste = item.produtoId === produto(8).id ? -2 : item.produtoId === produto(5).id ? 1 : 0
    await ipc('inventario:contar', item.id, Math.max(0, item.saldoSistema + ajuste))
    st.estoque.set(item.produtoId, Math.max(0, item.saldoSistema + ajuste))
  }
  await ipc('inventario:concluir', inv.id, { naoContadosZero: false })
})

// ---------- Caixa: 10 dias fechados + o de hoje aberto ----------
for (const d of [...diasCaixa, 0]) {
  quando(as(dia(d), 8, 30), () => ipc('caixa:abrir', 150))
  if (d === 0) continue
  if (d === diasCaixa[2] || d === diasCaixa[6]) {
    quando(as(dia(d), 17, 30), async () => {
      const cx = await ipc('caixa:estado')
      if (cx && cx.esperado.dinheiro > 250) await ipc('caixa:movimentar', 'sangria', 200, 'Depósito no banco')
    })
  }
  if (d === diasCaixa[4]) quando(as(dia(d), 12, 0), () => ipc('caixa:movimentar', 'suprimento', 50, 'Reforço de troco'))
  quando(as(dia(d), 18, 30), async () => {
    const cx = await ipc('caixa:estado')
    const contado = { ...cx.esperado }
    let obs = ''
    if (d === diasCaixa[3]) {
      contado.dinheiro = Math.round((contado.dinheiro - 2.5) * 100) / 100
      obs = 'Diferença de troco no fim do dia'
    }
    delete contado.prazo
    await ipc('caixa:fechar', contado, obs)
  })
}

// ---------- Executa em ordem cronológica ----------
eventos.sort((a, b) => a.data - b.data || a.ordem - b.ordem)
let feitos = 0
for (let i = 0; i < eventos.length; i++) {
  const e = eventos[i]
  await relogio(e.data)
  try {
    await e.fazer()
  } catch (erro) {
    console.error(`Falha em ${e.data.toLocaleString('pt-BR')}: ${erro.message}`)
    throw erro
  }
  feitos++
  // Eventos criados durante a execução (ex.: baixas no vencimento) entram na fila na posição certa.
  const resto = eventos.slice(i + 1).sort((a, b) => a.data - b.data || a.ordem - b.ordem)
  eventos.splice(i + 1, resto.length, ...resto)
  if (feitos % 50 === 0) console.log(`  ${feitos} operações...`)
}
await relogio(null)

const d = await ipc('dados:carregar')
const conta = (l) => l.length
console.log('\nDemonstração criada:')
console.log(`  categorias ${conta(d.categorias)}, unidades ${conta(d.unidades)}, fornecedores ${conta(d.fornecedores)}, clientes ${conta(d.clientes)}, usuários ${conta(d.usuarios)}, produtos ${conta(d.produtos)}`)
console.log(`  vendas ${conta(d.vendas)} (a prazo ${d.vendas.filter((v) => v.formaPagamento === 'prazo').length}, canceladas ${d.vendas.filter((v) => v.status === 'cancelada').length}), compras ${conta(d.compras)}, OS ${conta(d.ordensServico)}, contas ${conta(d.contas)}, movimentações ${conta(d.movimentacoes)}`)
console.log(`  saldos batem com as movimentações: ${d.produtos.every((p) => d.movimentacoes.filter((m) => m.produtoId === p.id).reduce((s, m) => s + (m.tipo === 'saida' ? -m.quantidade : m.quantidade), 0) === p.estoque) ? 'sim' : 'NÃO'}`)
await app.close()

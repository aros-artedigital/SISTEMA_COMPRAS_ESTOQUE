# Gestor de Estoque e Compras

Sistema desktop de estoque e compras — Electron + React + TypeScript + Tailwind + SQLite,
com sincronização entre terminais por uma API PHP + MySQL (pasta [`servidor/`](servidor/README.md)).

## Como rodar

```bash
npm install          # instala e compila o SQLite (better-sqlite3) para o Electron
npm run dev          # abre o app em modo desenvolvimento
npm run build        # typecheck + build de produção (pasta out/)
npm run test:smoke   # abre o app de verdade com um banco temporário e testa os fluxos principais
npm run test:api     # testa a API PHP direto (usa o PHP portátil em tools/php)
npm run test:sync    # dois terminais reais + API PHP: envio, recebimento, conflitos, sem internet
npm run dist         # gera o instalador Windows em dist/ (Gestor-Estoque-Compras-Setup-<versão>.exe)
npm run icone        # regenera build/icon.png a partir de build/icon.svg
```

### Instalador Windows

`npm run dist` gera um instalador NSIS em `dist/`: escolhe a pasta de instalação, cria atalhos na área de
trabalho e no menu Iniciar e instala só para o usuário atual (não pede administrador). Desinstalar **não**
apaga o banco nem os backups em `%APPDATA%\gestor-estoque-compras`.

O instalador não tem assinatura digital, então o Windows SmartScreen mostra "O Windows protegeu o computador"
na primeira execução (clique em **Mais informações → Executar assim mesmo**). Para remover o aviso é preciso
um certificado de assinatura de código (configurável em `build.win` no `package.json`).

### Sincronização entre terminais

1. Instale a pasta [`servidor/`](servidor/README.md) numa hospedagem com PHP 8.1+ e MySQL e crie o `config.php`.
2. No **primeiro** terminal: Configurações → Sincronização → informe endereço, chave de cadastro, nome e código
   do terminal, e escolha **Enviar os dados deste terminal**.
3. Nos **demais**: o mesmo, escolhendo **Substituir pelos dados do servidor** (os dados locais são apagados,
   com backup antes, e os do servidor são baixados).

Cada terminal funciona sem internet e sincroniza sozinho (ao abrir e a cada 5 minutos, configurável). A barra
superior mostra a situação: sincronizado, pendentes, sem conexão ou conflitos. Detalhes do funcionamento,
das regras de conflito e da API estão em [`servidor/README.md`](servidor/README.md).

Para testar localmente sem hospedagem: `tools/php/php.exe -S 127.0.0.1:8099 -t servidor servidor/index.php`
(SQLite em `servidor/dados/`, chave de cadastro `teste-local`) e use `http://127.0.0.1:8099` como endereço.
A pasta `tools/` não vai para o git: baixe o PHP 8.3 x64 NTS de windows.php.net e descompacte em `tools/php`
(com um `php.ini` habilitando `pdo_sqlite`, `pdo_mysql` e `mbstring`).

### Atualização automática

O app instalado procura novas versões em `<endereço do servidor>/atualizacoes` ao abrir e a cada 6 horas,
baixa em segundo plano e oferece "Reiniciar e atualizar". Para publicar: suba a versão em `package.json`, rode
`npm run dist` e envie `latest.yml`, o `.exe` e o `.blockmap` de `dist/` para `servidor/atualizacoes/` na hospedagem.

### Banco de dados

- Arquivo SQLite em `%APPDATA%\gestor-estoque-compras\estoque.sqlite` (o caminho aparece em **Configurações**).
- Para usar outro arquivo: defina a variável de ambiente `ESTOQUE_DB_PATH`.
- O schema é criado e atualizado automaticamente pelas migrações em `src/main/db/migracoes.ts`.
- **Em desenvolvimento** o banco novo vem com dados de demonstração. **No app instalado** vem só com o
  usuário `admin` / `admin123` e as unidades de medida — troque essa senha no primeiro acesso.
- Para recomeçar do zero em desenvolvimento, feche o app e apague o arquivo `estoque.sqlite`.
- **Backup automático** uma vez por dia ao abrir o app, na subpasta `backups` ao lado do banco (mantém os 7
  mais recentes). Em **Configurações** dá para fazer backup manual, restaurar e abrir a pasta. Restaurar guarda
  antes uma cópia do estado atual (`antes-da-restauracao_*.sqlite`) e encerra a sessão.

### Usuários, senhas e recuperação de acesso

- O administrador cria logins em **Cadastros → Usuários** (perfil Administrador, Gerente ou Operador) e pode
  definir uma nova senha para quem esqueceu. Cada um troca a própria senha em **Meu perfil**.
- Uma faixa de aviso aparece enquanto alguém usa a senha padrão `admin123` ou enquanto não existe código de
  recuperação.
- **Código de recuperação** (Configurações → Recuperação de acesso): mostrado uma única vez, para imprimir ou salvar
  em PDF e guardar fora do computador. Na tela de login, **Esqueci minha senha** + login de administrador + código
  redefine a senha. O código vale uma vez, em todos os terminais sincronizados, e é guardado só como hash; depois de
  5 tentativas erradas, a tela bloqueia por um tempo crescente.

Usuários de demonstração (só em desenvolvimento):

| Login | Senha | Perfil |
|---|---|---|
| admin | admin123 | Administrador (acesso total) |
| gerente | gerente123 | Gerente (sem Usuários e Configurações) |
| operador | operador123 | Operador (Início, Produtos, Movimentações, Clientes) |

## Recursos

- **Relatórios** (administrador e gerente): posição de estoque, sugestão de compra, compras por período e
  movimentações — cada um com filtros, Excel, PDF (A4, com numeração de páginas) e impressão.
- **Etiquetas** com código de barras (EAN-13/EAN-8 quando o código é válido, senão CODE128), em folha A4
  (3×7 ou 4×10) ou rolo térmico 50×30 mm. Em Produtos ou a partir de uma compra recebida.
- **Leitor de código de barras** (leitores USB funcionam como teclado): na busca de Produtos, em Nova
  movimentação, nos itens da compra e nas etiquetas.
- **Excel**: exportação das listas e importação de produtos, fornecedores e clientes com modelo pronto e
  prévia linha a linha antes de gravar. A planilha exportada de Produtos pode ser editada e importada de volta.
- **Painel**: indicadores, entradas × saídas, compras por mês, produtos com mais saídas e valor por categoria.
- **Sincronização** entre vários terminais, com funcionamento offline, fila de envio, tratamento de conflitos
  e atualização automática do aplicativo.

## Arquitetura

```
src/
  main/                 processo principal do Electron
    db/                 conexão, migrações, seed e dados de demonstração
    servicos/           regras de negócio (produtos, compras, estoque, cadastros, usuários, sessão)
    ipc.ts              canais IPC: validação (zod) + permissão antes de tocar no banco
    servicos/backup.ts  backup online do SQLite, automático diário e restauração validada
    servicos/excel.ts   exportação e importação (prévia numa transação desfeita no fim)
    servicos/impressao.ts  PDF e impressão via janela oculta do Chromium
    servicos/sync/      sincronização: config do terminal, mapeamento local ↔ servidor, motor (envio/recebimento)
    atualizacao.ts      atualização automática (electron-updater, provedor genérico)
    seguranca.ts        hash de senha (scrypt)
  preload/              ponte segura: expõe só window.api.invoke
  shared/               código usado pelos dois lados: tipos, schemas, permissões, contrato IPC (api.ts)
  renderer/src/
    data/               api.ts (chamada IPC tipada) e store.ts (cópia local recarregada após cada alteração)
    components/ pages/  interface
scripts/smoke.mjs       teste automatizado com Playwright
build/                  ícone do app e recursos do instalador
servidor/               API PHP + MySQL de sincronização (index.php, src/, README.md)
```

Fluxo de uma alteração: a tela valida o formulário → `alterar('produtos:salvar', ...)` → IPC →
o main confere a sessão e a permissão do perfil, valida de novo com zod, aplica as regras de negócio
numa transação SQLite → a tela recarrega os dados.

Regras garantidas pelo banco/main (não só pela tela):

- Estoque só muda por movimentação e é sempre a soma delas; saída feita no terminal não deixa saldo negativo
  (depois de sincronizar vendas simultâneas de dois terminais, o saldo pode ficar negativo — e aparece como sem estoque).
- Receber compra dá entrada de todos os itens de uma vez (transação). Só compras com status "Pedido enviado".
- Compras recebidas não podem ser alteradas nem excluídas.
- Itens com histórico (produto, fornecedor, usuário) não podem ser excluídos; inative-os.
- Códigos, CNPJ/CPF, logins e siglas são únicos.
- Sempre existe pelo menos um administrador ativo.

## Roadmap

- [x] **Fase 1 — Interface e cadastros**: todas as telas, com dados fictícios.
- [x] **Fase 2 — Banco de dados**: SQLite no processo principal, IPC tipado, senhas com hash,
      regras de negócio e permissões no main, teste automatizado.
- [x] **Fase 3 — Recursos avançados**: relatórios, PDF, impressão, etiquetas, código de
      barras, Excel, backup/restauração, painel avançado e instalador Windows.
- [x] **Fase 4 — Sincronização** com API PHP + MySQL, funcionamento offline, conflitos e
      atualização automática do app.

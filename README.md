# Gestor de Estoque e Compras

Sistema desktop de estoque e compras — Electron + React + TypeScript + Tailwind + SQLite.

## Como rodar

```bash
npm install          # instala e compila o SQLite (better-sqlite3) para o Electron
npm run dev          # abre o app em modo desenvolvimento
npm run build        # typecheck + build de produção (pasta out/)
npm run test:smoke   # abre o app de verdade com um banco temporário e testa os fluxos principais
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
    seguranca.ts        hash de senha (scrypt)
  preload/              ponte segura: expõe só window.api.invoke
  shared/               código usado pelos dois lados: tipos, schemas, permissões, contrato IPC (api.ts)
  renderer/src/
    data/               api.ts (chamada IPC tipada) e store.ts (cópia local recarregada após cada alteração)
    components/ pages/  interface
scripts/smoke.mjs       teste automatizado com Playwright
build/                  ícone do app e recursos do instalador
```

Fluxo de uma alteração: a tela valida o formulário → `alterar('produtos:salvar', ...)` → IPC →
o main confere a sessão e a permissão do perfil, valida de novo com zod, aplica as regras de negócio
numa transação SQLite → a tela recarrega os dados.

Regras garantidas pelo banco/main (não só pela tela):

- Estoque só muda por movimentação; saída não deixa saldo negativo; cada movimentação guarda o saldo após.
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
- [ ] **Fase 4 — Sincronização** com API PHP + MySQL e atualização automática do app
      (a atualização depende de um servidor para publicar as novas versões).

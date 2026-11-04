# Gestor de Estoque e Compras

Sistema desktop de estoque e compras — Electron + React + TypeScript + Tailwind + SQLite.

## Como rodar

```bash
npm install          # instala e compila o SQLite (better-sqlite3) para o Electron
npm run dev          # abre o app em modo desenvolvimento
npm run build        # typecheck + build de produção (pasta out/)
npm run test:smoke   # abre o app de verdade com um banco temporário e testa os fluxos principais
```

### Banco de dados

- Arquivo SQLite em `%APPDATA%\gestor-estoque-compras\estoque.sqlite` (o caminho aparece em **Configurações**).
- Para usar outro arquivo: defina a variável de ambiente `ESTOQUE_DB_PATH`.
- O schema é criado e atualizado automaticamente pelas migrações em `src/main/db/migracoes.ts`.
- **Em desenvolvimento** o banco novo vem com dados de demonstração. **No app instalado** vem só com o
  usuário `admin` / `admin123` e as unidades de medida — troque essa senha no primeiro acesso.
- Para recomeçar do zero em desenvolvimento, feche o app e apague o arquivo `estoque.sqlite`.

Usuários de demonstração (só em desenvolvimento):

| Login | Senha | Perfil |
|---|---|---|
| admin | admin123 | Administrador (acesso total) |
| gerente | gerente123 | Gerente (sem Usuários e Configurações) |
| operador | operador123 | Operador (Início, Produtos, Movimentações, Clientes) |

## Arquitetura

```
src/
  main/                 processo principal do Electron
    db/                 conexão, migrações, seed e dados de demonstração
    servicos/           regras de negócio (produtos, compras, estoque, cadastros, usuários, sessão)
    ipc.ts              canais IPC: validação (zod) + permissão antes de tocar no banco
    seguranca.ts        hash de senha (scrypt)
  preload/              ponte segura: expõe só window.api.invoke
  shared/               código usado pelos dois lados: tipos, schemas, permissões, contrato IPC (api.ts)
  renderer/src/
    data/               api.ts (chamada IPC tipada) e store.ts (cópia local recarregada após cada alteração)
    components/ pages/  interface
scripts/smoke.mjs       teste automatizado com Playwright
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
- [ ] **Fase 3 — Recursos avançados**: relatórios, PDF, impressão, etiquetas, código de
      barras, Excel, backup/restauração e instalador Windows (`electron-builder`).
- [ ] **Fase 4 — Sincronização** com API PHP + MySQL.

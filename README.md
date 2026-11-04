# Gestor de Estoque e Compras

Sistema desktop de estoque e compras — Electron + React + TypeScript + Tailwind.

## Como rodar

```bash
npm install
npm run dev        # abre o app em modo desenvolvimento
npm run build      # typecheck + build de produção (pasta out/)
```

Usuários de demonstração (definidos em `src/renderer/src/data/mock.ts`):

| Login | Senha | Perfil |
|---|---|---|
| admin | admin123 | Administrador (acesso total) |
| gerente | gerente123 | Gerente (sem Usuários e Configurações) |
| operador | operador123 | Operador (Início, Produtos, Movimentações, Clientes) |

## Estrutura

```
src/
  main/        processo principal do Electron (janela)
  preload/     ponte segura main <-> interface (IPC entra aqui na fase 2)
  renderer/src/
    components/  componentes reutilizáveis (tabela, modal, formulários, layout)
    contexts/    autenticação e notificações
    data/        dados fictícios (mock.ts) e store em memória (store.ts)
    lib/         formatação, máscaras, validação (zod), permissões, regras
    pages/       telas do sistema
```

## Roadmap

- [x] **Fase 1 — Interface e cadastros** com dados fictícios: login, painel, produtos,
      categorias/unidades, movimentações, compras (com recebimento), fornecedores,
      clientes, usuários e permissões, configurações, perfil.
- [ ] **Fase 2 — Banco de dados**: SQLite (`better-sqlite3`) no processo principal,
      ações do `store.ts` viram chamadas IPC, senhas com hash, regras de negócio no main.
- [ ] **Fase 3 — Recursos avançados**: relatórios, PDF, impressão, etiquetas, código de
      barras, Excel, backup e instalador Windows (`electron-builder`).
- [ ] **Fase 4 — Sincronização** com API PHP + MySQL.

> Na fase 1 os dados ficam só na memória e voltam ao estado inicial ao reiniciar o app.

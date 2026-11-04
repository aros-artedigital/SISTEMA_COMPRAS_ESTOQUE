import type Database from 'better-sqlite3'
import { migracao2 } from './migracao2'

// Cada item é uma versão do schema. Nunca altere uma migração já publicada:
// adicione uma nova no fim da lista. A versão atual fica em PRAGMA user_version.
// Uma migração é SQL puro ou uma função (quando precisa de lógica, como gerar uuids).
const migracoes: (string | ((db: Database.Database) => void))[] = [
  /* 1 — schema inicial */ `
  CREATE TABLE usuarios (
    id            INTEGER PRIMARY KEY,
    nome          TEXT    NOT NULL,
    email         TEXT    NOT NULL,
    login         TEXT    NOT NULL UNIQUE,
    senha_hash    TEXT    NOT NULL,
    perfil        TEXT    NOT NULL CHECK (perfil IN ('admin', 'gerente', 'operador')),
    ativo         INTEGER NOT NULL DEFAULT 1,
    criado_em     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    atualizado_em TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE categorias (
    id        INTEGER PRIMARY KEY,
    nome      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    descricao TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE unidades (
    id    INTEGER PRIMARY KEY,
    sigla TEXT NOT NULL UNIQUE,
    nome  TEXT NOT NULL
  );

  CREATE TABLE produtos (
    id             INTEGER PRIMARY KEY,
    codigo         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    codigo_barras  TEXT    NOT NULL DEFAULT '',
    nome           TEXT    NOT NULL,
    categoria_id   INTEGER NOT NULL REFERENCES categorias (id),
    unidade_id     INTEGER NOT NULL REFERENCES unidades (id),
    preco_custo    REAL    NOT NULL DEFAULT 0 CHECK (preco_custo >= 0),
    preco_venda    REAL    NOT NULL DEFAULT 0 CHECK (preco_venda >= 0),
    estoque        INTEGER NOT NULL DEFAULT 0 CHECK (estoque >= 0),
    estoque_minimo INTEGER NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
    ativo          INTEGER NOT NULL DEFAULT 1,
    criado_em      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    atualizado_em  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX idx_produtos_codigo_barras ON produtos (codigo_barras) WHERE codigo_barras <> '';
  CREATE INDEX idx_produtos_categoria ON produtos (categoria_id);

  CREATE TABLE fornecedores (
    id            INTEGER PRIMARY KEY,
    razao_social  TEXT    NOT NULL,
    nome_fantasia TEXT    NOT NULL DEFAULT '',
    cnpj          TEXT    NOT NULL UNIQUE,
    telefone      TEXT    NOT NULL DEFAULT '',
    email         TEXT    NOT NULL DEFAULT '',
    cidade        TEXT    NOT NULL DEFAULT '',
    uf            TEXT    NOT NULL DEFAULT '',
    ativo         INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE clientes (
    id        INTEGER PRIMARY KEY,
    nome      TEXT    NOT NULL,
    tipo      TEXT    NOT NULL CHECK (tipo IN ('PF', 'PJ')),
    documento TEXT    NOT NULL UNIQUE,
    telefone  TEXT    NOT NULL DEFAULT '',
    email     TEXT    NOT NULL DEFAULT '',
    cidade    TEXT    NOT NULL DEFAULT '',
    uf        TEXT    NOT NULL DEFAULT '',
    ativo     INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE compras (
    id            INTEGER PRIMARY KEY,
    numero        TEXT    NOT NULL UNIQUE,
    fornecedor_id INTEGER NOT NULL REFERENCES fornecedores (id),
    data          TEXT    NOT NULL,
    status        TEXT    NOT NULL CHECK (status IN ('rascunho', 'pedido', 'recebida', 'cancelada')),
    observacao    TEXT    NOT NULL DEFAULT '',
    recebida_em   TEXT,
    criado_em     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    atualizado_em TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX idx_compras_fornecedor ON compras (fornecedor_id);

  CREATE TABLE compra_itens (
    id             INTEGER PRIMARY KEY,
    compra_id      INTEGER NOT NULL REFERENCES compras (id) ON DELETE CASCADE,
    produto_id     INTEGER NOT NULL REFERENCES produtos (id),
    quantidade     INTEGER NOT NULL CHECK (quantidade > 0),
    valor_unitario REAL    NOT NULL CHECK (valor_unitario >= 0),
    UNIQUE (compra_id, produto_id)
  );
  CREATE INDEX idx_compra_itens_produto ON compra_itens (produto_id);

  CREATE TABLE movimentacoes (
    id         INTEGER PRIMARY KEY,
    data       TEXT    NOT NULL,
    produto_id INTEGER NOT NULL REFERENCES produtos (id),
    tipo       TEXT    NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste')),
    quantidade INTEGER NOT NULL,
    saldo_apos INTEGER NOT NULL,
    motivo     TEXT    NOT NULL,
    usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
    compra_id  INTEGER REFERENCES compras (id)
  );
  CREATE INDEX idx_mov_produto ON movimentacoes (produto_id);
  CREATE INDEX idx_mov_data ON movimentacoes (data);

  CREATE TABLE configuracoes (
    id    INTEGER PRIMARY KEY CHECK (id = 1),
    dados TEXT    NOT NULL
  );
  `,
  /* 2 — sincronização entre terminais (uuid, fila, estoque derivado) */ migracao2,
  /* 3 — código de recuperação do administrador (só o hash; sincronizado entre terminais) */ `
  CREATE TABLE recuperacao (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    codigo_hash TEXT NOT NULL,
    criado_em   TEXT NOT NULL
  );
  CREATE TRIGGER sync_recuperacao_ai AFTER INSERT ON recuperacao WHEN (SELECT aplicando FROM sync_controle WHERE id = 1) = 0 BEGIN
    INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) VALUES ('recuperacao', 'recuperacao', 'salvar', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  END;
  CREATE TRIGGER sync_recuperacao_au AFTER UPDATE ON recuperacao WHEN (SELECT aplicando FROM sync_controle WHERE id = 1) = 0 BEGIN
    INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) VALUES ('recuperacao', 'recuperacao', 'salvar', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  END;
  CREATE TRIGGER sync_recuperacao_ad AFTER DELETE ON recuperacao WHEN (SELECT aplicando FROM sync_controle WHERE id = 1) = 0 BEGIN
    INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) VALUES ('recuperacao', 'recuperacao', 'excluir', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  END;
  `
]

/** Versão de schema que este build do app conhece. */
export const VERSAO_SCHEMA = migracoes.length

export function migrar(db: Database.Database): number {
  const atual = db.pragma('user_version', { simple: true }) as number
  if (atual >= migracoes.length) return atual
  // Reconstruir tabelas exige as chaves estrangeiras desligadas (fora da transação);
  // a integridade é conferida com foreign_key_check antes de cada commit.
  db.pragma('foreign_keys = OFF')
  try {
    for (let versao = atual; versao < migracoes.length; versao++) {
      db.transaction(() => {
        const m = migracoes[versao]
        if (typeof m === 'string') db.exec(m)
        else m(db)
        const violacoes = db.pragma('foreign_key_check') as unknown[]
        if (violacoes.length) throw new Error(`Migração ${versao + 1} deixou ${violacoes.length} referência(s) inválida(s)`)
        db.pragma(`user_version = ${versao + 1}`)
      })()
    }
  } finally {
    db.pragma('foreign_keys = ON')
  }
  return migracoes.length
}

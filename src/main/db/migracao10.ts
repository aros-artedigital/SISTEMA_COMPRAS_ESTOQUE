// Migração 10 — permissões personalizadas e notificações lidas.
//  • usuarios.permissoes: lista (JSON) de permissões do perfil "Personalizado"; NULL = usa o perfil;
//  • notificacoes_lidas: o que cada usuário já viu na central de notificações (só neste terminal).

export const migracao10 = `
  ALTER TABLE usuarios ADD COLUMN permissoes TEXT;
  CREATE TABLE notificacoes_lidas (
    usuario_id INTEGER NOT NULL,
    chave      TEXT    NOT NULL,
    em         TEXT    NOT NULL,
    PRIMARY KEY (usuario_id, chave)
  );
`

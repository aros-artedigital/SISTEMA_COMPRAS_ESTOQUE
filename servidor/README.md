# Servidor de sincronização (PHP + MySQL)

API que mantém vários terminais do Gestor de Estoque e Compras com os mesmos dados.
Cada terminal continua **funcionando sem internet** com o próprio banco SQLite; quando há conexão,
ele envia o que mudou localmente e recebe o que mudou nos outros terminais.

## Requisitos

- PHP 8.1 ou mais novo, com `pdo_mysql` (produção) ou `pdo_sqlite` (testes locais).
- MySQL 5.7+ ou MariaDB 10.3+.
- Apache com `mod_rewrite` (o `.htaccess` já vem pronto) ou Nginx apontando tudo para `index.php`.

## Instalação na hospedagem

1. Envie a pasta `servidor/` (por FTP ou pelo gerenciador de arquivos) para, por exemplo, `public_html/estoque-api/`.
2. Copie `config.exemplo.php` para `config.php` e preencha os dados do MySQL e uma **chave de cadastro**
   longa (é a senha usada para conectar novos terminais).
3. Acesse `https://seu-dominio/estoque-api/status` no navegador: deve aparecer `{"ok":true,...}`.
   As tabelas são criadas automaticamente na primeira requisição.
4. Em cada terminal: **Configurações → Sincronização**, informe o endereço `https://seu-dominio/estoque-api`,
   a chave de cadastro, um nome e um código curto para o terminal (ex.: `A`, `LOJA2`).

> Use HTTPS na hospedagem: a chave de cadastro e os dados trafegam pela internet.

## Teste local (sem MySQL)

```bash
# na raiz do projeto, com o PHP portátil em tools/php
tools/php/php.exe -S 127.0.0.1:8099 -t servidor servidor/index.php
```

Sem `config.php`, o servidor usa as variáveis de ambiente `ESTOQUE_DB_DSN` (padrão: SQLite em
`servidor/dados/servidor.sqlite`), `ESTOQUE_DB_USUARIO`, `ESTOQUE_DB_SENHA` e `ESTOQUE_CHAVE_CADASTRO`
(padrão: `teste-local`).

## Atualização automática do aplicativo

Depois de `npm run dist`, envie para `servidor/atualizacoes/` os arquivos gerados em `dist/`:
`latest.yml`, `Gestor-Estoque-Compras-Setup-<versão>.exe` e o `.blockmap`. Os terminais conectados
verificam essa pasta ao abrir e oferecem a nova versão.

## Como a sincronização funciona

**Identidade global.** Cada registro tem um `uuid`. Os `id` numéricos são só locais; entre terminais as
referências (categoria do produto, fornecedor da compra...) viajam como `uuid`.

**Fila de envio.** Gatilhos no SQLite do terminal anotam em `sync_fila` toda inclusão, alteração ou exclusão.
Ao sincronizar, o terminal envia o estado atual de cada registro da fila (`POST /sync/enviar`) e depois recebe
as alterações dos outros (`GET /sync/receber?desde=<cursor>`).

**Conflitos de edição.** Vale a alteração mais recente (pelo horário em que foi feita no terminal). Se o servidor
já tem uma versão mais nova, a enviada é ignorada e o terminal recebe a do servidor.

**Estoque.** O saldo **não** é sincronizado como número: os terminais trocam **movimentações** (que nunca são
editadas nem excluídas) e cada um soma as entradas e saídas recebidas. Assim, duas vendas feitas em terminais
diferentes sem internet são somadas corretamente. O saldo pode ficar negativo depois da sincronização (ex.: os
dois terminais venderam a última unidade) — o produto aparece como "sem estoque" para conferência.

**Regras do servidor.**
- Códigos de produto, códigos de barras, CNPJ/CPF, logins, siglas e números de compra são únicos entre todos os
  terminais. Um registro que viole isso é **recusado** e aparece em "Conflitos" no terminal, para correção.
- Uma compra recebida não volta a outro status, e cada item de uma compra só pode ser recebido uma vez: se dois
  terminais receberem a mesma compra sem internet, a segunda entrada é recusada e desfeita no terminal.
- O número das compras inclui o código do terminal (`C-A0008`), para não colidir.

## API

Todas as respostas são JSON. Rotas autenticadas exigem `Authorization: Bearer <token do terminal>`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/status` | Saúde do servidor. Com token, informa também o terminal e o total de registros. |
| POST | `/dispositivos` | Cadastra um terminal: `{chave, nome, codigo}` → `{uuid, token, nome, codigo}`. |
| POST | `/sync/enviar` | `{alteracoes: [{tabela, uuid, operacao: "salvar"\|"excluir", dados, alteradoEm}]}` → `{resultados: [{tabela, uuid, status: "aceito"\|"ignorado"\|"rejeitado", motivo?}]}` |
| GET | `/sync/receber?desde=N&limite=500` | Alterações de outros terminais com `seq > N`: `{alteracoes: [...], ultimoSeq, temMais}` |

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

### Demonstração (dados fictícios)

`npm run demo` cria um **banco de demonstração separado** (`%APPDATA%\gestor-estoque-compras\demonstracao`) — o
banco real não é tocado — com 10 cadastros de cada tipo (categorias, unidades, fornecedores, clientes, usuários,
produtos) e cerca de 6 meses de movimento: ~190 vendas (à vista e a prazo, 2 canceladas), 10 compras (recebidas,
parcial, em pedido, rascunho), 10 ordens de serviço em todas as etapas (com senha, sinal, assinaturas, uma com valor
a receber), contas a pagar e a receber (pagas, vencidas e a vencer), 10 caixas fechados e o de hoje aberto,
movimentações e um inventário. Tudo passa pelas regras do sistema; o relógio do processo principal é ajustado para
a data de cada operação, para os gráficos terem histórico. Também cria o atalho **"Gestor - Demonstração"** na área
de trabalho (programa instalado + banco e perfil da demonstração). Entrar com `admin` / `admin123` (os outros
usuários fictícios usam a senha `demo123`). Rodar de novo recria a demonstração (a anterior vira
`estoque-demo.anterior.sqlite`).

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
- **Zerar dados** (Configurações → Zerar dados, só administrador): apaga produtos, estoque, compras, categorias,
  fornecedores e clientes para começar com os seus próprios dados. Mantém as unidades de medida, faz backup antes
  (`antes-de-zerar_*.sqlite`) e exige digitar ZERAR. Não funciona com o terminal conectado ao servidor.
- **Backup automático** uma vez por dia ao abrir o app, na subpasta `backups` ao lado do banco (mantém os 7
  mais recentes). Em **Configurações** dá para fazer backup manual, restaurar e abrir a pasta. Restaurar guarda
  antes uma cópia do estado atual (`antes-da-restauracao_*.sqlite`) e encerra a sessão.
- **Backup fora deste computador** (Configurações): escolha uma pasta em pendrive, outro disco ou Google Drive/OneDrive.
  Uma cópia vai para `<pasta>\Gestor de Estoque - backups` ao abrir o sistema (uma por dia) ou em "Fazer cópia agora";
  as 10 mais recentes são mantidas. Se ficar 7 dias sem conseguir copiar (ex.: pendrive desconectado), o
  administrador é avisado. A configuração fica em `config-local.json`, ao lado do banco: vale só para este computador
  e não se perde ao restaurar um backup.

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

- **Vendas** (todos os perfis vendem; só administrador e gerente cancelam): tela de caixa com leitor de código de
  barras, cliente opcional (ou consumidor final), desconto e forma de pagamento; dá baixa no estoque na hora e não
  deixa vender sem saldo. Recibo em cupom de 80 mm (impressão ou PDF, sem valor fiscal). Uma venda não é editada:
  o cancelamento devolve os itens ao estoque e fica registrado com o motivo. Atalho **F2** abre uma nova venda.
  Relatório de vendas por venda, por cliente ou por produto; total comprado por cliente na tela de Clientes.
- **Sugestão de compra automática** (Compras → "Sugerir compra"): calcula quanto comprar pelo consumo real —
  estoque mínimo + média de saídas por dia (dos últimos 30/60/90/180 dias, descontando devoluções) × dias de cobertura
  (15 a 90) − estoque atual − o que já foi pedido e não chegou. Fornecedor e custo vêm da última compra de cada produto
  (produto nunca comprado pede a escolha do fornecedor). Dá para desmarcar itens, mudar quantidades e fornecedores, e
  exportar para o Excel. "Gerar pedidos" cria um pedido em rascunho por fornecedor, de uma vez (se um falhar, nenhum é
  criado). O relatório "Sugestão de compra" usa o mesmo cálculo.
- **Ordens de Serviço** (assistência técnica; menu ou `Ctrl+0`): entrada do equipamento (tipo, marca, modelo, nº de
  série/IMEI, acessórios e estado físico), defeito relatado, diagnóstico e laudo, técnico responsável, previsão de
  entrega e garantia. Orçamento com peças do estoque (inclusive pelo leitor de código de barras) e serviços de mão de
  obra, com desconto. Andamento: Aberta → Em análise → Aguardando aprovação → Em execução → Pronta → Entregue (ou
  Cancelada, com motivo), com histórico de quem mudou e quando. As peças saem do estoque quando a OS fica pronta;
  reabrir ou cancelar uma OS pronta devolve as peças. Ficha com as etapas, impressão/PDF em A4 com espaço para as
  assinaturas, quadros de "em andamento", "prontas" e "atrasadas", avisos no sino (OS atrasada, pronta há 7 dias sem
  retirada), Excel, exclusão em lote, auditoria e sincronização entre terminais (número OS-A0001 por terminal).
  Permissões próprias: ver, cadastrar e editar (inclui mudar o status), excluir e ver a senha do equipamento.
- **Pagamento da OS**: sinal com a OS em andamento e o restante na entrega, em uma ou mais formas (ex.: parte no Pix,
  parte no cartão). Não deixa receber mais do que falta nem reduzir o total abaixo do já recebido. Entregar com valor em
  aberto exige confirmação ("Entregar com valor a receber") e gera aviso no sino até ser quitado; filtro "Com valor a
  receber" na lista. Pagamentos não são apagados: são estornados com motivo. Recebido e saldo aparecem na impressão e no
  arquivo do cliente; tudo vai para a auditoria e é sincronizado.
- **Assinatura do cliente na tela** (ficha da OS): na entrada do equipamento e na retirada (esta quando a OS está
  pronta ou entregue, com o nome de quem retira). Assina-se com o mouse, o dedo (tela de toque) ou caneta de mesa
  digitalizadora (a pressão engrossa o traço). Fica gravada como imagem pequena, sai na impressão/PDF da OS sobre a
  linha de assinatura, é sincronizada e cada assinatura (ou remoção) vai para a auditoria.
- **Fotos do equipamento** (ficha da OS): do arquivo (JPG, PNG, WEBP — várias de uma vez) ou da câmera do computador
  (webcam/câmera USB, com escolha da câmera). São reduzidas (até 1600 px, JPEG) com miniatura, até 20 por OS; clique para
  ampliar. Ficam no banco deste computador (entram no backup), mas **não sincronizam** com os outros terminais.
- **Histórico do aparelho e garantia**: ao digitar o nº de série/IMEI na OS, o sistema mostra as OS anteriores do mesmo
  aparelho e avisa se ele ainda está na garantia (com a data em que termina) — também na ficha.
- **Etiqueta da OS**: número grande, cliente, equipamento e código de barras do número (rolo 50 × 30 mm ou folhas A4).
  Lendo a etiqueta (ou digitando o número + Enter) na busca da tela de OS, a ficha abre direto.
- **OS no painel e nos relatórios**: card "Serviços no mês" (o que entrou pelas OS) e a aba Relatórios → Ordens de
  serviço: OS entregues (peças, mão de obra, recebido, dias de conserto), por técnico (faturamento e tempo médio), peças
  mais usadas, recebimentos por forma de pagamento e canceladas/orçamentos recusados com o motivo.
- **Enviar a OS ao cliente** (botão na ficha da OS, sem precisar de servidor na internet): salva uma página `.html`
  única — abre no celular mesmo sem internet, nas cores da empresa, com modo escuro — mostrando a situação explicada em
  linguagem simples, as etapas com datas, o equipamento, o defeito/diagnóstico/serviço, o orçamento, a garantia (com a
  data em que termina) e os contatos (botão "Falar no WhatsApp" com o telefone da empresa). Não leva a senha do
  equipamento, o técnico nem as observações internas do andamento, e não tem scripts. Em seguida o botão "Abrir
  WhatsApp" abre a conversa com o celular do cliente e a mensagem pronta (editável); o arquivo é anexado na conversa.
  Cada arquivo gerado fica na auditoria.
- **Senha do equipamento na OS**: desenho (grade 3×3 como no celular — arrastando o mouse ou clicando nos pontos;
  passar por cima de um ponto o inclui, como no Android), PIN ou senha em texto. A senha não vem junto com os dados
  das telas: só quem tem a permissão "Ver senha do equipamento" (administrador e gerente; no Personalizado, quem for
  marcado) clica em "Mostrar senha" na ficha, e cada visualização vai para a auditoria. Ela nunca aparece na
  impressão/PDF, no Excel nem no texto da auditoria. Ao editar a OS, a senha atual é mantida (há "Trocar" e
  "Remover"). Por padrão é apagada quando a OS é entregue ou cancelada (Configurações → Segurança). Com sincronização,
  a senha vai para o servidor junto com a OS, para o técnico de outro terminal poder vê-la.
- **Fluxo de caixa** (Financeiro → Fluxo de caixa): entradas e saídas **realizadas** (vendas à vista, recebimentos de OS,
  recebimentos e pagamentos de contas com juros/desconto e, opcionalmente, compras recebidas sem conta a pagar) e
  **previstas** (contas a receber e a pagar em aberto pelo vencimento e OS entregues com saldo; o que venceu e não foi
  pago entra "em atraso" na data de hoje). Períodos prontos (este mês, próximos 30/90 dias, últimos 30 dias, este ano)
  ou personalizado, agrupado por dia, semana ou mês, com saldo inicial e saldo acumulado; quadros de resumo, gráfico
  de entradas × saídas, tabela por período e lista de movimentos com filtros; PDF, impressão e Excel. Vendas a prazo
  entram quando as parcelas são recebidas; sangrias e suprimentos não entram (é dinheiro mudando de lugar).
- **Contas a receber e a pagar** (menu Financeiro): cada parcela é uma conta, com vencimento, situação (a vencer,
  vence hoje, vencida, paga, cancelada), quadros de em aberto / vencidas / vencem em 7 dias / recebido ou pago no mês,
  filtros, Excel e detalhes. **A receber:** vendas **a prazo** (nova forma de pagamento na venda: cliente obrigatório,
  1 a 12 parcelas mensais com prévia de datas e valores, impressas no recibo), contas avulsas e as OS entregues com
  valor em aberto. **A pagar:** despesas (aluguel, energia...) e contas de compras (ao escolher a compra, preenche
  fornecedor e valor), em uma ou várias parcelas. Recebimento/pagamento parcial ou total, com juros/multa e desconto;
  estorno com motivo; cancelamento com motivo (nada é apagado). Recebimentos entram no caixa aberto; pagamentos só
  quando saem em dinheiro da gaveta (e não podem passar do que há nela). Cancelar uma venda a prazo cancela as
  parcelas (as já recebidas precisam ser estornadas antes). Avisos no sino de contas vencidas. Sincroniza entre
  terminais; permissões próprias (ver, lançar/baixar, cancelar) — o operador não tem por padrão.
- **Caixa do dia** (menu Caixa; cada computador tem o seu, não sincroniza): abertura com o troco, lançamento
  automático de vendas, cancelamentos, recebimentos e estornos de OS, sangria (não deixa tirar mais do que há em
  dinheiro) e suprimento. O quadro mostra o dinheiro que deve haver na gaveta e o total de cada forma de pagamento.
  No fechamento, conta-se o dinheiro e confere-se Pix/cartões; diferença exige explicação e fica registrada (sobra ou
  falta). Histórico de caixas com detalhe e comprovante em cupom de 80 mm. Aviso no sino se o caixa do dia anterior
  ficou aberto. Opcional (Configurações → Estoque e compras): exigir caixa aberto para vender e receber.
- **Aparência** (botão de sol/lua na barra superior, cada computador guarda a sua escolha): modo Claro, Escuro ou
  Automático (segue o Windows) — `Ctrl+Shift+D` alterna na hora — e tamanho da letra Pequena, Normal ou Grande.
- **Tema de cores da empresa** (Configurações → Aparência, só administrador): 5 temas prontos (Azul clássico, Verde
  floresta, Roxo real, Grafite e ciano, Vinho) ou Personalizado, escolhendo a cor principal (botões, links, abas) e a
  secundária (menu lateral). Vale para todos os usuários e terminais sincronizados; cores muito claras são escurecidas
  na tela para o texto continuar legível.
- **Formulários**:
  - valores em reais com máscara: digite "35", "59,90" ou "1.234,56" e o campo mostra R$ 1.234,56;
  - CPF, CNPJ, telefone e CEP formatados enquanto se digita;
  - **busca de CEP** (ViaCEP, precisa de internet): em clientes, fornecedores e dados da empresa, o CEP preenche rua,
    bairro, cidade e UF, e o cursor vai para o número. Sem internet, o endereço é digitado normalmente;
  - todos os campos de seleção aceitam digitação para filtrar a lista (↑ ↓ e Enter escolhem, Esc fecha);
  - mensagens de sucesso, atenção e erro no canto superior direito, com visual de vidro fosco (transparência e
    desfoque), entrada com efeito de mola, leve tremida (mais forte nos erros), halo e reflexo de luz ao surgir e saída
    suave; com "reduzir movimento" do Windows, só esmaecem. Formulário com campo inválido também avisa.
- **Listas**: rodapé com "Mostrando 1–10 de 57" e itens por página (10, 25, 50 ou 100 — cada tela lembra a escolha);
  cabeçalho fixo ao rolar listas longas; botões de ação com ícones.
- **Ações em lote em Produtos**: marque vários produtos (ou todos da página pela caixa do cabeçalho) e ative, inative,
  mude a categoria, imprima etiquetas, exporte para o Excel ou exclua de uma vez. Produtos com histórico não são
  excluídos — o sistema avisa quais e por quê. Cada alteração fica na auditoria.
- **Ações em lote nas outras listas**: Clientes e Fornecedores (ativar, inativar, Excel, excluir), Compras (Excel,
  excluir as não recebidas), Categorias e Unidades (excluir as que não estão em uso), Vendas e Movimentações
  (exportar a seleção para o Excel). O que não pode ser feito é mantido e marcado, com o motivo na mensagem.
- **Notificações** (sino na barra superior): estoque zerado ou abaixo do mínimo, compras pedidas há mais de 7 dias e
  não recebidas, inventário em aberto, senha padrão, código de recuperação, backup externo atrasado, conflitos de
  sincronização e atualização disponível — cada usuário vê só o que diz respeito às telas que pode acessar. Avisos
  novos também aparecem como mensagem; clicar leva à tela certa e marca como lido. Quando o problema é resolvido, o
  aviso some; se voltar, aparece de novo como não lido.
- **Permissões personalizadas** (Usuários → perfil "Personalizado"): marque, tela a tela, se o usuário pode ver,
  cadastrar/editar e excluir, e as ações especiais (cancelar vendas, concluir inventário, estornar). Usuários,
  Configurações e Auditoria continuam só para administradores. As regras valem também no processo principal: o que
  não é permitido nem aparece na tela e, se chamado direto, é recusado.
- **Configurações em abas**: Dados da empresa, Aparência, Estoque e compras, Segurança, Sincronização, Backup e dados.
- **Atalhos de teclado** (`F1` ou o ícone de teclado mostra todos): `F2` nova venda de qualquer tela, `Ctrl+N` novo
  cadastro na tela atual, `Ctrl+F` vai para a busca, `Ctrl+1` a `Ctrl+9` abrem Início, Vendas, Produtos,
  Movimentações, Inventário, Compras, Fornecedores, Clientes e Relatórios, `Esc` fecha a janela aberta.
- **Auditoria** (Sistema → Auditoria, só administrador): registra quem fez o quê e quando — inclusões, alterações e
  exclusões de cadastros com os valores de antes e depois (ex.: "Preço de venda: R$ 49,90 → R$ 54,90"), logins e
  tentativas recusadas, recebimento e encerramento de compras, cancelamento de vendas, estornos, inventários,
  importações do Excel, configurações, restauração de backup e "Zerar dados". Filtros por período, usuário, ação, tipo
  e texto; sai em PDF, Excel ou impressão. Fica em cada computador e não é apagada ao zerar os dados.
- **Ficha do produto** (Produtos → clique no nome ou em "Ficha"): saldo, custo, preço e margem, valor em estoque,
  vendido e faturado em 90 dias, cobertura em dias no ritmo atual de vendas, gráfico do saldo ao longo do tempo e o
  histórico completo — movimentações, compras (pedido × recebido) e vendas. O kardex sai em PDF, Excel ou impressão.
- **Inventário** (Estoque → Inventário): congela a lista de produtos ativos (todos ou de uma categoria) e recebe a
  contagem física — digitada ou pelo leitor de código de barras (cada leitura soma 1). As contagens são gravadas na
  hora. Ao concluir (administrador ou gerente), lança um ajuste para cada produto com diferença, comparando com o
  saldo do sistema naquele momento; os não contados ficam como estão ou podem ser considerados zero. Relatório de
  diferenças em PDF/Excel. O inventário é local de cada terminal; os ajustes gerados são sincronizados.
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
- Receber compra dá entrada no estoque numa transação. Só compras com status "Pedido enviado". O recebimento pode
  ser **parcial**: informa-se quanto chegou de cada item, a compra aparece como "Parcial" e continua pendente até
  tudo chegar (vira "Recebida") ou ser **encerrada** sem o restante (o que faltou fica anotado na observação).
  Entre terminais, a soma recebida de cada item não pode passar do pedido.
- Compras recebidas não podem ser alteradas nem excluídas.
- Ao receber uma compra, o preço de custo vira o **custo médio ponderado** (saldo × custo atual + quantidade ×
  preço pago, dividido pelo novo saldo; com saldo zerado, vale o preço pago). Em Configurações dá para trocar por
  "último preço pago" ou "não alterar".
- Vendas não são editadas nem excluídas; cancelar devolve os itens ao estoque (uma vez só, mesmo cancelando em
  dois terminais sem internet). Número com o código do terminal (`V-A0001`).
- Itens com histórico (produto, fornecedor, usuário) não podem ser excluídos; inative-os.
- **Estorno** (Movimentações, administrador e gerente): desfaz um lançamento manual criando a movimentação inversa,
  ligada à original, com motivo. A original fica no histórico marcada como "Estornada". Não se estorna um estorno,
  nem movimentos de venda (cancele a venda), de ordem de serviço (reabra ou cancele a OS) ou de recebimento de compra; cada movimentação só é estornada uma vez,
  mesmo entre terminais.
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

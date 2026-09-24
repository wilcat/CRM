# Fluxo ERP

Sistema de gestão empresarial (protótipo/MVP) com módulos de **Vendas, Produtos,
Clientes, Estoque, Orçamentos, Ordens de Serviço, Financeiro e Relatórios**,
com controle de permissões por papel de usuário.

## Stack

- **Backend:** Node.js + Express, autenticação via JWT, controle de acesso por papel (RBAC)
- **Banco de dados:** **PostgreSQL** (recomendado para uso real / rede interna) —
  veja **`DEPLOY.md`** para o passo a passo completo no Ubuntu Server. Também
  funciona com um arquivo JSON local (`data/database.json`, zero configuração)
  quando você só quer testar rápido sem instalar banco nenhum — a troca é
  automática: se a variável `DATABASE_URL` existir, usa Postgres; se não
  existir, usa o arquivo.
- **Frontend:** SPA em HTML/CSS/JS puro (sem build step), gráficos em SVG nativo
  (sem dependência de internet/CDN para funcionar)

## Como rodar localmente (modo rápido, sem instalar banco)

```bash
npm install
npm start
```

Acesse **http://localhost:3000**

### Logins de demonstração (criados automaticamente na primeira execução)

| Papel | E-mail | Senha | Acesso |
|---|---|---|---|
| Administrador | admin@fluxoerp.com | admin123 | Total — inclusive gestão de usuários |
| Vendedor | vendedor@fluxoerp.com | vendedor123 | Vendas, Produtos, Clientes, Estoque, Orçamentos, OS |
| Financeiro | financeiro@fluxoerp.com | financeiro123 | Financeiro e Relatório de fluxo de caixa |

Para recomeçar do zero nesse modo, apague `data/database.json` e reinicie o servidor.

## Como rodar com PostgreSQL (recomendado para uso real)

```bash
# 1. Crie o banco e rode o schema uma vez:
psql "postgres://usuario:senha@localhost:5432/fluxo_erp" -f db/schema.sql

# 2. Configure o .env:
cp .env.example .env
# edite o .env e preencha DATABASE_URL, JWT_SECRET, etc.

# 3. Instale as dependências e rode:
npm install
npm start
```

Pra instalar isso do zero numa rede interna, siga o guia completo,
passo a passo: **`DEPLOY.md`** (Ubuntu Server) ou **`DEPLOY-WINDOWS.md`**
(Windows Server) — cobrem Node, PostgreSQL, o sistema iniciando sozinho
depois de reiniciar o servidor, firewall e backup automático.

> **Já tinha o sistema instalado com PostgreSQL antes desta versão?** Rode as
> migrações abaixo uma vez, na ordem (quem está instalando do zero não
> precisa, o `db/schema.sql` já vem atualizado):
> ```bash
> psql "postgres://usuario:senha@localhost:5432/fluxo_erp" -f db/migrations/001_codigo_barras.sql
> psql "postgres://usuario:senha@localhost:5432/fluxo_erp" -f db/migrations/002_configuracoes.sql
> ```

Se quiser repopular o banco Postgres com os dados de demonstração (ou
resetar tudo), rode `npm run seed` (isso apaga os dados existentes).

## Permissões — como foi modelado

Você pediu "só o admin edita/exclui" e "financeiro só acessa por usuário
financeiro". Para isso não travar o dia a dia (ex: vendedor precisa poder
avançar o status de uma venda, financeiro precisa poder dar baixa numa conta),
separei em duas categorias:

1. **Edição de cadastro / exclusão** (alterar nome de um produto, apagar um
   cliente, apagar uma venda etc.) → **somente admin**, em todos os módulos.
2. **Mudança de status/situação** (venda → "concretizada", OS → "concluída",
   conta → "paga") → tratada como uma ação de fluxo de trabalho, liberada para
   quem opera aquele módulo no dia a dia (vendedor para Vendas/OS, financeiro
   para Financeiro). Admin sempre pode tudo.

Se preferir que status também seja admin-only, é uma troca simples nas rotas
`PUT /api/*/:id/situacao` do `server.js` (troque a lista de papéis por
`requireRole('admin')`).

### Matriz de acesso por módulo

| Módulo | Ver / Criar | Editar / Excluir | Mudar status |
|---|---|---|---|
| Vendas | admin, vendedor (financeiro só vê) | admin | admin |
| Orçamentos | admin, vendedor | admin | admin, vendedor (aprovar gera venda) |
| Produtos | admin, vendedor | admin | — |
| Clientes | admin, vendedor (financeiro só vê) | admin | — |
| Estoque | admin, vendedor | admin | — |
| Orçamentos | admin, vendedor | admin | — |
| Ordens de Serviço | admin, vendedor (financeiro só vê) | admin | admin, vendedor |
| Financeiro | admin, financeiro | admin | admin, financeiro (marcar como pago) |
| Relatório de vendas | admin, vendedor, financeiro | — | — |
| Relatório de fluxo de caixa | admin, financeiro | — | — |
| Usuários | somente admin | somente admin | — |

## Funcionalidades desta versão

- **Usuários e permissões**: só admin cadastra/edita/exclui usuários; menu
  Financeiro só aparece para papel `financeiro` (e admin); edição/exclusão de
  registros restrita a admin em todos os módulos.
- **Status de Ordem de Serviço** editável direto na listagem (Aberta → Em
  andamento → Concluída/Cancelada).
- **Produção Gráfica** (Rápida / Digital / Offset num módulo só, com abas de
  filtro) — ao concluir um trabalho, gera automaticamente um lançamento "a
  receber" no Financeiro (que continua único para os 3 setores).
- **Vendas integradas ao Financeiro** — o lançamento "a receber" nasce assim
  que a venda é adicionada (não espera ela ser concretizada); se a venda já
  nascer "Entregue | Pago", o lançamento já nasce quitado. Orçamento
  aprovado também gera o lançamento automaticamente, junto com a venda e a
  produção. Cancelar a venda remove o lançamento se nada ainda tinha sido
  pago. Nada disso duplica lançamento, mesmo trocando o status várias vezes.
- **Entrada / pagamento parcial no Financeiro** — cada lançamento tem um
  botão "Registrar entrada" (a receber) ou "Registrar pagamento" (a pagar)
  que aceita qualquer valor até o saldo em aberto. Paga uma parte → fica
  "Parcial" (mostra quanto já entrou e quanto falta); paga o resto → vira
  "Pago". O relatório de fluxo de caixa lista cada pagamento individualmente
  (inclusive entradas parciais), não só lançamentos 100% quitados.
- **Segmento na Venda** (Rápida / Digital / Offset) — toda venda agora
  informa o segmento gráfico. **A produção é criada assim que a venda é
  adicionada** (não é preciso esperar ela ser concretizada, nem cadastrar
  nada manualmente em Produção Gráfica) — mesma trava anti-duplicação usada
  no Financeiro. Se a venda for cancelada antes da produção terminar, a
  produção é marcada como cancelada também. Se o segmento da venda for
  editado depois, a produção vinculada acompanha a mudança.
- **Produção concluída avisa o vendedor** — ao marcar uma produção como
  "Concluída", a venda vinculada avança sozinha para **"Pronto para
  entrega"**, sem precisar de nenhuma ação manual na tela de Vendas. Isso não
  acontece se a venda já estiver "Entregue | Pago" ou "Cancelada".
- **Fluxo Orçamento → Venda → Produção → Pronto para entrega**: orçamento
  aprovado vira venda automaticamente (mesmos itens, cliente e segmento, com
  baixa de estoque), que já entra em produção no setor certo; ao concluir a
  produção, a venda avança para "Pronto para entrega" sozinha. Orçamento
  também ganhou edição completa (cabeçalho + itens) e exclusão, restritas ao
  admin.
- **Somente admin altera vendas** — mudar a situação de uma venda (ou
  editá-la/excluí-la) agora é exclusivo do administrador. Vendedor continua
  podendo criar vendas normalmente, só não pode mais avançar o status delas.
- **Dashboard com gráficos** (SVG nativo, sem dependência externa): vendas dos
  últimos 7 dias, distribuição de vendas por situação, comparativo a
  receber x a pagar.
- **Impressão** via área oculta na própria página (`#print-area` + `@media
  print`, sem pop-ups): recibo de venda, Ordem de Serviço, Produção Gráfica,
  relatório de vendas e relatório de fluxo de caixa.
- **Visualização detalhada** (👁) de Vendas e Ordens de Serviço, sem precisar
  editar o registro.
- **Relatório de fluxo de caixa**: entradas e saídas efetivamente pagas, com
  saldo acumulado, filtrável por período.
- **Busca em todas as listagens** — Vendas, Clientes, Produtos, Estoque,
  Orçamentos, Ordens de Serviço, Produção Gráfica e Financeiro têm um campo
  de busca no topo que filtra em tempo real (por número, nome do cliente,
  descrição, situação, etc. — depende do módulo). A busca ignora acentos e
  maiúsculas/minúsculas. Em Produção Gráfica, funciona junto com as abas de
  setor (filtra dentro do setor selecionado).
- **Leitor de código de barras** — Produtos ganharam um campo "Código de
  barras" (separado do código/SKU interno). Funciona em três lugares:
  - Ao criar uma **Venda**: passe o produto no leitor (ou digite o código +
    Enter) que ele é adicionado automaticamente — se já estiver na lista, só
    soma a quantidade.
  - No **Estoque**: escaneie pra já selecionar o produto certo na
    movimentação, sem precisar procurar no select.
  - Na busca de **Produtos**: o código de barras também é considerado.

  Funciona com qualquer leitor USB/Bluetooth configurado como teclado (o
  padrão da grande maioria — ele só "digita" o código e aperta Enter).
- **Cupom com código de barras + QR Code** — em qualquer venda, o botão 🎫
  gera um cupom em formato estreito (compatível com impressora térmica/
  fiscal de 80mm) com **dois códigos**: um código de barras (Code128, gerado
  no navegador e testado com leitor de verdade — decodifica certinho) pro
  operador escanear no balcão, e um QR Code pro cliente escanear com o
  celular (inclusive pelo WhatsApp).
- **Consultar Pedido (tela interna, balcão)** — novo item de menu. O
  operador escaneia o código de barras ou QR Code do cupom do cliente (ou
  digita o número) e vê na hora: situação da venda, situação da produção,
  se já foi pago, itens e valor — sem precisar procurar na listagem de
  Vendas. Aceita tanto o número puro (do código de barras) quanto o link
  completo (do QR Code) — o sistema entende os dois formatos sozinho.
- **Consulta pública (para o cliente)** — separada da tela acima: o cliente
  aponta a câmera do celular pro QR Code do próprio cupom (ou acessa
  `/rastreio.html` e digita o número) e vê o status do pedido sozinho, sem
  precisar de login nem ligar pra loja.
  ⚠️ Configure a variável `PUBLIC_URL` no `.env` com o endereço que os
  clientes vão acessar (IP da rede, não "localhost"), senão o QR Code só
  funciona escaneado na própria máquina do servidor.
- **Forma de pagamento no Financeiro** — ao registrar uma entrada/pagamento,
  agora dá pra informar Pix, Dinheiro, Cartão ou Outro. Aparece como coluna
  no relatório de fluxo de caixa (tela e impressão).
- **Quem fechou a venda** — o modal de "Visualizar" venda e a tela
  "Consultar Pedido" agora mostram o nome do vendedor que criou a venda.
- **Configurações (admin)** — novo item de menu, só pra admin, com:
  - **Dados da empresa** (nome, CNPJ, telefone, endereço, e-mail) — usados
    automaticamente no cabeçalho de recibos, cupons, ordens de serviço e
    relatórios impressos.
  - **Numeração** — permite definir a partir de qual número cada módulo
    (Venda, Orçamento, Produção, OS) deve continuar contando. É um "piso":
    o sistema nunca gera um número que já existe, então só tem efeito
    prático se for maior que o maior número atual, ou depois de limpar os
    registros antigos.

## Como criar um novo módulo (receita geral)

O módulo "Produção Gráfica" foi feito seguindo esses 5 passos — use como
referência para criar outros (ex: "Locação de equipamentos", "Manutenção",
etc.):

1. **`db.js`** — adicione o nome da coleção no array `COLLECTIONS`.
2. **`seed.js`** *(opcional)* — insira alguns registros de exemplo com `d.insert('sua_colecao', {...})`.
3. **`server.js`** — registre as rotas com `makeCrud('sua_colecao', { readRoles: [...], createRoles: [...] })`.
   Isso já te dá GET/POST/PUT/DELETE prontos, com edição/exclusão restrita a
   admin por padrão. Se precisar de uma ação de status separada (que outros
   papéis também possam usar), crie uma rota própria tipo
   `PUT /api/sua_colecao/:id/situacao`, no mesmo padrão das que já existem
   para vendas, OS e produção.
4. **`public/js/app.js`** — adicione uma entrada em `NAV` e `TITLES`, e crie
   `VIEWS.sua_rota = async function () {...}` renderizando a tabela + modal de
   criação (copie a estrutura de `VIEWS.producao` como ponto de partida).
5. **Integração com Financeiro** *(se o módulo gerar cobrança)* — dentro da
   rota de status, quando o registro for concluído, chame
   `db.insert('financeiro', { tipo: 'RECEBER', ... })` uma única vez (use um
   campo tipo `financeiro_gerado` para não duplicar, como feito na produção
   gráfica).

Se um dia os setores precisarem de campos bem diferentes entre si, dá pra
guardar isso num campo livre tipo `detalhes` (JSON), sem precisar quebrar o
módulo em três.

## Estrutura do projeto

```
erp-app/
  server.js         API REST + autenticação + permissões (Express)
  db.js             Seletor de banco (Postgres se DATABASE_URL existir, senão arquivo)
  db-postgres.js    Driver PostgreSQL
  db-json.js        Driver arquivo JSON (modo rápido, sem instalar banco)
  db/schema.sql     Script de criação das tabelas no PostgreSQL
  seed.js           Dados de demonstração (usuários, clientes, produtos, vendas...)
  .env.example      Modelo de configuração (copie para .env)
  DEPLOY.md         Guia completo de instalação no Ubuntu Server
  DEPLOY-WINDOWS.md Guia completo de instalação no Windows Server
  public/
    index.html      Shell da aplicação (login + layout)
    rastreio.html    Consulta pública de pedido (sem login) — pro cliente
    css/style.css   Design system (cores, tipografia, componentes)
    js/app.js       Lógica do frontend (rotas, telas, formulários, gráficos, impressão)
    js/vendor/      Bibliotecas de terceiros incluídas localmente (sem CDN)
  data/
    database.json   Só existe no modo arquivo JSON (não versionar em produção)
```

## Segurança antes de usar com clientes reais

1. **`JWT_SECRET`** — defina uma variável de ambiente forte (`.env` ou `export JWT_SECRET=...`).
2. **HTTPS** — sirva sempre atrás de um domínio com certificado SSL, se for expor além da rede interna.
3. **Senhas** — force senhas fortes e habilite expiração/reset antes de liberar a múltiplos usuários.
4. **Backup do banco** — com Postgres, configure `pg_dump` automático (exemplo pronto no `DEPLOY.md`).

## Evoluindo para produção

Já feito nesta versão: banco PostgreSQL com schema relacional
(`db/schema.sql`), driver assíncrono (`db-postgres.js`) e guia de instalação
completo (`DEPLOY.md`). Próximos passos, se/quando fizer sentido:

1. **Multi-tenant**, se for vender para vários clientes na mesma instalação —
   hoje o projeto é single-tenant (uma instalação = uma empresa).
2. **Mais granularidade de papéis**, se precisar (ex: vendedor sênior,
   supervisor de estoque) — o campo `papel` já está pronto para isso.
3. **Connection pooling / réplicas**, se o volume de acesso crescer muito —
   o driver já usa `pg.Pool`, então dá pra ajustar `max` de conexões e, mais
   pra frente, apontar leituras para uma réplica se precisar.

## Publicando (deploy)

- **Ubuntu Server numa rede interna** → siga o **`DEPLOY.md`** — cobre Node,
  PostgreSQL, systemd, firewall e backup, passo a passo.
- **Windows Server numa rede interna** → siga o **`DEPLOY-WINDOWS.md`** —
  cobre Node, PostgreSQL, serviço com início automático (via NSSM), firewall
  e backup agendado, passo a passo.

Para outros ambientes (Railway, Render, VPS genérico), o essencial é:

```bash
npm install --production
DATABASE_URL="postgres://..." JWT_SECRET="sua-chave-secreta-forte" PORT=3000 node server.js
```

Qualquer serviço com Node.js + PostgreSQL disponíveis funciona.

---

Feito para servir como base de um produto próprio — sinta-se livre para
renomear a marca, trocar cores/fontes em `public/css/style.css` e expandir os
módulos conforme a necessidade de cada cliente.

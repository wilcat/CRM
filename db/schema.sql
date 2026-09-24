-- ============================================================
-- Fluxo ERP — schema PostgreSQL
-- Rode este arquivo uma vez no banco vazio para criar as tabelas:
--   psql -U fluxo -d fluxo_erp -f db/schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  nome           TEXT NOT NULL,
  email          TEXT UNIQUE NOT NULL,
  senha_hash     TEXT NOT NULL,
  papel          TEXT NOT NULL DEFAULT 'vendedor',
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS clientes (
  id             SERIAL PRIMARY KEY,
  nome           TEXT NOT NULL,
  documento      TEXT,
  telefone       TEXT,
  email          TEXT,
  tipo           TEXT DEFAULT 'PF',
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS produtos (
  id             SERIAL PRIMARY KEY,
  nome           TEXT NOT NULL,
  codigo         TEXT,
  codigo_barras  TEXT,
  preco          NUMERIC(12,2) NOT NULL DEFAULT 0,
  custo          NUMERIC(12,2) NOT NULL DEFAULT 0,
  estoque        NUMERIC(12,2) NOT NULL DEFAULT 0,
  estoque_minimo NUMERIC(12,2) NOT NULL DEFAULT 0,
  categoria      TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_produtos_codigo_barras ON produtos(codigo_barras);
CREATE TABLE IF NOT EXISTS vendas (
  id             SERIAL PRIMARY KEY,
  numero         INTEGER UNIQUE NOT NULL,
  cliente_id     INTEGER REFERENCES clientes(id),
  data           DATE,
  situacao       TEXT NOT NULL DEFAULT 'EM_PRODUCAO',
  segmento       TEXT,
  valor          NUMERIC(12,2) NOT NULL DEFAULT 0,
  vendedor_id    INTEGER REFERENCES users(id),
  financeiro_id  INTEGER,
  producao_id    INTEGER,
  orcamento_id   INTEGER,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS itens_venda (
  id           SERIAL PRIMARY KEY,
  venda_id     INTEGER REFERENCES vendas(id) ON DELETE CASCADE,
  produto_id   INTEGER REFERENCES produtos(id),
  quantidade   NUMERIC(12,2) NOT NULL DEFAULT 0,
  preco_unit   NUMERIC(12,2) NOT NULL DEFAULT 0,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS estoque_movimentos (
  id           SERIAL PRIMARY KEY,
  produto_id   INTEGER REFERENCES produtos(id),
  tipo         TEXT NOT NULL,
  quantidade   NUMERIC(12,2) NOT NULL DEFAULT 0,
  motivo       TEXT,
  data         DATE,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orcamentos (
  id             SERIAL PRIMARY KEY,
  numero         INTEGER UNIQUE NOT NULL,
  cliente_id     INTEGER REFERENCES clientes(id),
  data           DATE,
  validade       DATE,
  situacao       TEXT NOT NULL DEFAULT 'ENVIADO',
  segmento       TEXT,
  valor          NUMERIC(12,2) NOT NULL DEFAULT 0,
  venda_id       INTEGER REFERENCES vendas(id),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS itens_orcamento (
  id            SERIAL PRIMARY KEY,
  orcamento_id  INTEGER REFERENCES orcamentos(id) ON DELETE CASCADE,
  produto_id    INTEGER REFERENCES produtos(id),
  quantidade    NUMERIC(12,2) NOT NULL DEFAULT 0,
  preco_unit    NUMERIC(12,2) NOT NULL DEFAULT 0,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ordens_servico (
  id             SERIAL PRIMARY KEY,
  numero         INTEGER UNIQUE NOT NULL,
  cliente_id     INTEGER REFERENCES clientes(id),
  descricao      TEXT,
  data_abertura  DATE,
  situacao       TEXT NOT NULL DEFAULT 'ABERTA',
  valor          NUMERIC(12,2) NOT NULL DEFAULT 0,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS financeiro (
  id             SERIAL PRIMARY KEY,
  tipo           TEXT NOT NULL,
  descricao      TEXT,
  valor          NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_pago     NUMERIC(12,2) NOT NULL DEFAULT 0,
  pagamentos     JSONB NOT NULL DEFAULT '[]',
  vencimento     DATE,
  situacao       TEXT NOT NULL DEFAULT 'PENDENTE',
  pago_em        DATE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS producoes (
  id                SERIAL PRIMARY KEY,
  numero            INTEGER UNIQUE NOT NULL,
  setor             TEXT,
  cliente_id        INTEGER REFERENCES clientes(id),
  descricao         TEXT,
  data_abertura     DATE,
  situacao          TEXT NOT NULL DEFAULT 'ABERTA',
  valor             NUMERIC(12,2) NOT NULL DEFAULT 0,
  venda_id          INTEGER REFERENCES vendas(id),
  financeiro_gerado BOOLEAN NOT NULL DEFAULT false,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ
);

-- Linha unica (id=1) com dados da empresa e os contadores de numeracao.
-- "proximo_numero_*" e um "piso": o sistema so usa esse valor se ele for
-- maior que o maior numero ja existente (nunca gera numero duplicado).
CREATE TABLE IF NOT EXISTS configuracoes (
  id                     SERIAL PRIMARY KEY,
  empresa_nome           TEXT DEFAULT 'Fluxo ERP',
  empresa_documento      TEXT,
  empresa_telefone       TEXT,
  empresa_endereco       TEXT,
  empresa_email          TEXT,
  proximo_numero_venda     INTEGER,
  proximo_numero_orcamento INTEGER,
  proximo_numero_producao  INTEGER,
  proximo_numero_os        INTEGER,
  atualizado_em          TIMESTAMPTZ
);

-- Cadastro de funcionarios. "vales" guarda o historico de adiantamentos
-- salariais (mesmo padrao usado em financeiro.pagamentos): um array de
-- { valor, data, descricao }, usado tanto para responder "pegou vale?"
-- quanto para descontar o valor certo no contracheque de cada mes.
CREATE TABLE IF NOT EXISTS funcionarios (
  id             SERIAL PRIMARY KEY,
  nome           TEXT NOT NULL,
  cpf            TEXT,
  cargo          TEXT,
  data_admissao  DATE,
  data_demissao  DATE,
  telefone       TEXT,
  email          TEXT,
  endereco       TEXT,
  salario        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ativo          BOOLEAN NOT NULL DEFAULT true,
  vales          JSONB NOT NULL DEFAULT '[]',
  observacoes    TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ
);

-- Auditoria: registro de quem acessou o sistema e o que fez (somente leitura pra admin)
CREATE TABLE IF NOT EXISTS logs (
  id             SERIAL PRIMARY KEY,
  usuario_id     INTEGER,
  usuario_nome   TEXT,
  papel          TEXT,
  acao           TEXT NOT NULL,
  entidade       TEXT,
  entidade_id    INTEGER,
  detalhes       JSONB,
  ip             TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logs_criado_em ON logs(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_logs_usuario ON logs(usuario_id);

-- Indices para as buscas e filtros mais comuns
CREATE INDEX IF NOT EXISTS idx_vendas_cliente ON vendas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_vendas_situacao ON vendas(situacao);
CREATE INDEX IF NOT EXISTS idx_itens_venda_venda ON itens_venda(venda_id);
CREATE INDEX IF NOT EXISTS idx_itens_orcamento_orc ON itens_orcamento(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_produto ON estoque_movimentos(produto_id);
CREATE INDEX IF NOT EXISTS idx_producoes_setor ON producoes(setor);
CREATE INDEX IF NOT EXISTS idx_producoes_venda ON producoes(venda_id);
CREATE INDEX IF NOT EXISTS idx_financeiro_situacao ON financeiro(situacao);

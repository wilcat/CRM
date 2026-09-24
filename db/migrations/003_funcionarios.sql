-- Migração: adiciona o módulo de Funcionários. Rode isto se você já tinha o
-- Fluxo ERP instalado com PostgreSQL ANTES desta atualização (quem está
-- instalando do zero não precisa — o db/schema.sql já vem atualizado):
--
--   psql "postgres://usuario:senha@localhost:5432/fluxo_erp" -f db/migrations/003_funcionarios.sql

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

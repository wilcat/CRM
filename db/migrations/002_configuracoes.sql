-- Migração: adiciona tabela de configurações (dados da empresa + contadores
-- de numeração). Rode isto se você já tinha o Fluxo ERP instalado com
-- PostgreSQL ANTES desta atualização (quem está instalando do zero não
-- precisa — o db/schema.sql já vem atualizado):
--
--   psql "postgres://usuario:senha@localhost:5432/fluxo_erp" -f db/migrations/002_configuracoes.sql

CREATE TABLE IF NOT EXISTS configuracoes (
  id                        SERIAL PRIMARY KEY,
  empresa_nome              TEXT DEFAULT 'Fluxo ERP',
  empresa_documento         TEXT,
  empresa_telefone          TEXT,
  empresa_endereco          TEXT,
  empresa_email             TEXT,
  proximo_numero_venda      INTEGER,
  proximo_numero_orcamento  INTEGER,
  proximo_numero_producao   INTEGER,
  proximo_numero_os         INTEGER,
  atualizado_em             TIMESTAMPTZ
);

INSERT INTO configuracoes (id, empresa_nome)
SELECT 1, 'Fluxo ERP'
WHERE NOT EXISTS (SELECT 1 FROM configuracoes WHERE id = 1);

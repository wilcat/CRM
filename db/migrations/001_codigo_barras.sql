-- Migração: adiciona código de barras aos produtos
-- Rode isto se você já tinha o Fluxo ERP instalado com PostgreSQL ANTES
-- desta atualização (quem está instalando do zero não precisa — o
-- db/schema.sql já vem atualizado):
--
--   psql "postgres://usuario:senha@localhost:5432/fluxo_erp" -f db/migrations/001_codigo_barras.sql

ALTER TABLE produtos ADD COLUMN IF NOT EXISTS codigo_barras TEXT;
CREATE INDEX IF NOT EXISTS idx_produtos_codigo_barras ON produtos(codigo_barras);

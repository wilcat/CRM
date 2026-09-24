-- Auditoria: registro de quem acessou o sistema e o que fez (somente leitura pra admin)
-- Rode uma vez em bancos Postgres já existentes.
--   psql -U fluxo -d fluxo_erp -f db/migrations/004_logs.sql

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

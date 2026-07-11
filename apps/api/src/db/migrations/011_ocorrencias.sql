-- Runs with search_path already set to the tenant schema.
-- Livro digital de ocorrências: portaria/morador registram, síndico trata.

CREATE TABLE IF NOT EXISTS ocorrencias (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo       TEXT NOT NULL,
  descricao    TEXT NOT NULL,
  categoria    TEXT NOT NULL DEFAULT 'outros' CHECK (categoria IN ('barulho','manutencao','seguranca','outros')),
  status       TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_andamento','resolvida')),
  unidade_id   UUID REFERENCES unidades(id) ON DELETE SET NULL,
  aberto_por   UUID,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvido_em TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ocorrencia_comentarios (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ocorrencia_id UUID NOT NULL REFERENCES ocorrencias(id) ON DELETE CASCADE,
  autor         UUID,
  texto         TEXT NOT NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ocorrencias_status ON ocorrencias(status, criado_em DESC);

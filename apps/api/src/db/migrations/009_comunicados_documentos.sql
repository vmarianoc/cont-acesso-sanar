-- Runs with search_path already set to the tenant schema.
-- Comunicados (mural digital com confirmação de leitura), grupos de pessoas
-- (ex.: conselho fiscal) e documentos do condomínio com escopo por grupo.

CREATE TABLE IF NOT EXISTS grupos (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome      TEXT NOT NULL UNIQUE,
  descricao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grupo_membros (
  grupo_id  UUID NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  pessoa_id UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (grupo_id, pessoa_id)
);

CREATE TABLE IF NOT EXISTS comunicados (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo        TEXT NOT NULL,
  corpo         TEXT NOT NULL,
  prioridade    TEXT NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('normal','urgente')),
  publicado_por UUID,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comunicado_leituras (
  comunicado_id UUID NOT NULL REFERENCES comunicados(id) ON DELETE CASCADE,
  pessoa_id     UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  lido_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comunicado_id, pessoa_id)
);

CREATE TABLE IF NOT EXISTS documentos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo        TEXT NOT NULL,
  descricao     TEXT,
  arquivo_nome  TEXT NOT NULL,
  mime          TEXT NOT NULL,
  tamanho       INTEGER NOT NULL,
  conteudo      BYTEA NOT NULL,
  escopo        TEXT NOT NULL DEFAULT 'todos' CHECK (escopo IN ('todos','grupo')),
  grupo_id      UUID REFERENCES grupos(id) ON DELETE CASCADE,
  publicado_por UUID,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (escopo <> 'grupo' OR grupo_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_comunicados_criado ON comunicados(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_escopo ON documentos(escopo, grupo_id);

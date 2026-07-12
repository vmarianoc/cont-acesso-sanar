-- Convite facial de visitante (segunda forma de liberação, além do QR): o
-- morador anexa uma foto que é enviada ao leitor facial via Edge, com
-- remoção automática ao fim da validade (o Edge decide, mesmo offline).
ALTER TABLE visitantes ADD COLUMN IF NOT EXISTS foto_base64 TEXT;

-- Fila temporária de fotos de acesso liberado (facial/placa), para o morador
-- ver quem entrou. É efêmera por natureza (LGPD): mantemos só as fotos mais
-- recentes por unidade (poda feita pela aplicação); o registro em `eventos`
-- (auditoria) continua permanente e sem foto.
CREATE TABLE IF NOT EXISTS eventos_fotos (
  evento_id   UUID PRIMARY KEY REFERENCES eventos(id) ON DELETE CASCADE,
  unidade_id  UUID REFERENCES unidades(id) ON DELETE CASCADE,
  foto        BYTEA NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eventos_fotos_unidade ON eventos_fotos(unidade_id, criado_em DESC);

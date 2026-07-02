-- Runs with search_path already set to the tenant schema.
-- Aligns vinculos_unidade with the identity model (identidade-condominial.md):
-- each unidade has exactly one active "principal" (responsável) vínculo, and we
-- track who created the vínculo.

ALTER TABLE vinculos_unidade ADD COLUMN IF NOT EXISTS principal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE vinculos_unidade ADD COLUMN IF NOT EXISTS criado_por UUID;

-- At most one active principal per unidade.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vinculos_unidade_principal
  ON vinculos_unidade (unidade_id)
  WHERE principal = true AND ativo = true;

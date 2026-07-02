-- Runs with search_path already set to the tenant schema.
-- Supports pessoa jurídica (CNPJ) as owner of a unit, alongside pessoa física (CPF).

ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS tipo_pessoa TEXT NOT NULL DEFAULT 'fisica';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pessoas_tipo_pessoa_check'
  ) THEN
    ALTER TABLE pessoas
      ADD CONSTRAINT pessoas_tipo_pessoa_check CHECK (tipo_pessoa IN ('fisica', 'juridica'));
  END IF;
END $$;

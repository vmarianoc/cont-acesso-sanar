-- Runs with search_path already set to the tenant schema.
-- Adds contact fields to pessoas (aligns with identidade-condominial.md and
-- supports the unit/resident import).

ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS telefone TEXT;

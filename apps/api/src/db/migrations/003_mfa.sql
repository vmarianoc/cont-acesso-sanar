-- Runs with search_path already set to the tenant schema.
-- Adds TOTP-based MFA fields to tenant users (required for admin/sindico profiles).

ALTER TABLE usuarios_tenant ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE usuarios_tenant ADD COLUMN IF NOT EXISTS mfa_ativo BOOLEAN NOT NULL DEFAULT false;

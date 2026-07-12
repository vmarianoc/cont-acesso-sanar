-- Runs with search_path already set to the tenant schema.
-- Perfil administradora: empresa que gerencia vários condomínios (multi-tenant
-- via /auth/contas + /auth/trocar-condominio), distinto do superadmin (dono
-- da plataforma Condar).

DO $$ BEGIN
  ALTER TABLE usuarios_tenant DROP CONSTRAINT IF EXISTS usuarios_tenant_perfil_check;
  ALTER TABLE usuarios_tenant ADD CONSTRAINT usuarios_tenant_perfil_check
    CHECK (perfil IN ('superadmin','admin','porteiro','morador','sindico','administradora'));
END $$;

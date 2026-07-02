# Multi-tenant

## Estratégia de isolamento

A plataforma usa **schema-per-tenant** no PostgreSQL: cada condomínio (ou grupo de condomínios de uma administradora) tem seu próprio schema dentro do mesmo banco de dados. Isso garante:

- **Isolamento lógico completo**: uma query no schema do Condomínio A nunca acessa dados do Condomínio B, mesmo que seja um erro de programação
- **Backups independentes**: restaurar um tenant específico é possível sem afetar outros
- **Migrações controladas**: é possível migrar tenants individualmente (ex.: levar um cliente para a nova versão do schema antes dos demais)
- **Performance previsível**: estatísticas e índices por schema permitem tuning por tenant

## Nomenclatura dos schemas

```
public              → tabelas compartilhadas (tenants, licenças, planos)
tenant_{uuid}       → schema isolado por tenant
  ex: tenant_a3f2c1b0_4e5d_11ee_be56_0242ac120002
```

O UUID é gerado no momento da criação do tenant e nunca muda, mesmo que o nome do condomínio seja alterado.

## Estrutura do schema público

```sql
-- Registro de tenants (condomínios ou grupos de administradora)
CREATE TABLE public.tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  tipo          TEXT NOT NULL,  -- 'condominio' | 'administradora'
  plano         TEXT NOT NULL,  -- 'start' | 'pro' | 'enterprise'
  cnpj_cpf      TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  suspenso_em   TIMESTAMPTZ,
  schema_name   TEXT NOT NULL UNIQUE  -- tenant_{uuid}
);

-- Hierarquia: administradora → condomínios filhos
CREATE TABLE public.tenant_hierarquia (
  pai_id   UUID NOT NULL REFERENCES public.tenants(id),
  filho_id UUID NOT NULL REFERENCES public.tenants(id),
  PRIMARY KEY (pai_id, filho_id)
);

-- Licenças por tenant
CREATE TABLE public.licencas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id),
  plano        TEXT NOT NULL,
  validade_ate TIMESTAMPTZ NOT NULL,
  max_unidades INT,
  max_ramais   INT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Estrutura do schema por tenant

Cada `tenant_{uuid}` contém as mesmas tabelas:

```
condominios         blocos              unidades
pessoas             documentos          biometrias
veiculos            acessos             visitantes
eventos             ocorrencias
aprovacoes          historico_aprovacoes
auditoria           sync_queue
notificacoes        webhooks
usuarios_tenant     perfis_acesso
```

## Como o roteamento de tenant funciona

A API recebe o JWT do usuário autenticado, que contém o `tenant_id`. Antes de qualquer query, o pool de conexões executa:

```sql
SET search_path TO tenant_a3f2c1b0_4e5d_11ee_be56_0242ac120002, public;
```

Toda query subsequente na mesma conexão opera no schema correto sem precisar prefixar tabelas. O middleware da API garante que esse `SET` sempre aconteça antes da primeira query da requisição.

## Row Level Security (RLS) como segunda camada

Além do isolamento por schema, tabelas críticas têm RLS ativado como defesa em profundidade:

```sql
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY auditoria_tenant_only ON auditoria
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

Isso garante que mesmo um bug que misture conexões de tenants diferentes não vaze dados.

## Criação de novo tenant

O processo de onboarding de um novo condomínio:

```sql
BEGIN;

-- 1. Registrar o tenant
INSERT INTO public.tenants (nome, tipo, plano, cnpj_cpf, schema_name)
VALUES ('Residencial Horizonte', 'condominio', 'pro', '12.345.678/0001-90',
        'tenant_' || replace(gen_random_uuid()::text, '-', '_'));

-- 2. Criar o schema isolado
EXECUTE 'CREATE SCHEMA ' || schema_name;

-- 3. Aplicar migrations no novo schema
-- (executado pelo migration runner da API com search_path = novo schema)

-- 4. Criar licença inicial
INSERT INTO public.licencas (tenant_id, plano, validade_ate, max_unidades, max_ramais)
VALUES (novo_tenant_id, 'pro', NOW() + INTERVAL '1 year', 500, 10);

COMMIT;
```

Na prática, esse processo é encapsulado no endpoint `POST /api/admin/tenants` da Cloud API, que executa as etapas acima e provisiona o tenant em segundos.

## Backups e disaster recovery

- **Backup físico**: WAL archiving contínuo para S3 (Point-in-Time Recovery com granularidade de 5 minutos)
- **Backup lógico por tenant**: `pg_dump --schema=tenant_{uuid}` executado diariamente, retido por 30 dias
- **RTO**: < 4 horas para restauração completa de um tenant
- **RPO**: < 5 minutos (perda máxima de dados em caso de falha)

## Escalabilidade

Quando um único servidor PostgreSQL atingir o limite de tenants:

1. **Read replicas**: queries de leitura (relatórios, histórico) roteadas para réplicas
2. **Sharding por tenant**: tenants de alto volume podem ser movidos para um servidor dedicado — o `schema_name` e o roteamento na API suportam isso sem alterar a lógica de negócio
3. **Connection pooling**: PgBouncer em modo transaction para suportar centenas de tenants simultâneos com um pool controlado de conexões

## Documentação relacionada

- [Identidade Condominial](identidade-condominial.md)
- [Cloud API](../cloud/cloud-api.md)
- [Licenciamento SaaS](../docs/03-licenciamento-saas.md)
- [LGPD e Segurança](../docs/02-lgpd-e-seguranca.md)

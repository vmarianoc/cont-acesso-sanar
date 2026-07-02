# condar — Controle de Acesso Condominial

condar é uma plataforma SaaS de controle de acesso e gestão condominial (multi-tenant, offline-first).
Este repositório contém o MVP (Fase 1): **Cloud API** + **painel web da Portaria**.

## Documentação

Documentação completa de produto, arquitetura e **roadmap** em [`docs/`](docs/README.md)
— incluindo o [roadmap da Fase 1](docs/roadmap/fase-1.md) e o
[progresso da implementação](docs/roadmap/progresso.md).

## Arquitetura

Monorepo com pnpm workspaces:

```
apps/api            Cloud API — Node.js 20 + Fastify 4 + PostgreSQL 15 + Redis
apps/web-portaria   Painel da portaria — React 18 + Vite (PWA)
apps/web-morador    App do morador (condar) — React 18 + Vite (PWA mobile)
apps/web-sindico    App do síndico (condar) — gestão / aprovações / licença
packages/shared     Schemas Zod + tipos TypeScript compartilhados
packages/ui         Design system condar (@condar/ui) — componentes + preset
infra               docker-compose (Postgres + Redis) para dev local
```

Isolamento multi-tenant por **schema-per-tenant**: cada requisição autenticada
reserva uma conexão dedicada do pool e fixa `search_path` para o schema do tenant
(`apps/api/src/plugins/multiTenant.ts` + `fastify.withTenant`), garantindo que uma
query de um condomínio nunca acesse dados de outro.

## Requisitos

- Node.js 20+, pnpm 10+
- PostgreSQL 15 e Redis 7 (via Docker ou instalados localmente)

## Setup

```bash
# 1. Subir Postgres + Redis
cd infra && docker compose up -d && cd ..

# 2. Instalar dependências
pnpm install

# 3. Configurar variáveis da API
cp apps/api/.env.example apps/api/.env   # ajuste se necessário

# 4. Criar schemas (public + tenant)
pnpm --filter api migrate

# 5. Popular dados de demonstração (imprime tenant_id + credenciais)
pnpm --filter api seed
```

O comando `seed` cria o tenant demo **Residencial Horizonte** e imprime o
`tenant_id` e as credenciais. Usuários demo (senha entre parênteses):

| Perfil     | E-mail                | Senha        |
|------------|-----------------------|--------------|
| superadmin | superadmin@demo.com   | `super1234`  |
| síndico    | sindico@demo.com      | `sindico123` |
| porteiro   | porteiro@demo.com     | `porteiro123`|
| morador    | morador@demo.com      | `morador123` |

## Rodando

```bash
# API em :3000 e portaria em :5173
pnpm dev

# ou separadamente
pnpm --filter api dev
pnpm --filter web-portaria dev

# worker de notificações (BullMQ) — opcional
pnpm --filter api worker
```

No login da portaria, informe o `tenant_id` do seed (ou defina
`VITE_TENANT_ID` em `apps/web-portaria/.env.local` para pré-preencher — veja
`apps/web-portaria/.env.example`).

## Testes

```bash
pnpm --filter api test     # Vitest: auth, isolamento multi-tenant, /eventos, fluxo de aprovações
pnpm -r build              # typecheck + build de todos os workspaces
```

O CI (`.github/workflows/ci.yml`) sobe Postgres + Redis, roda typecheck,
migrations, testes e build a cada push/PR.

## Funcionalidades do MVP

- **Auth**: JWT (15 min) + refresh token rotativo; **MFA (TOTP)** obrigatório
  para perfis admin/síndico quando ativado (`/auth/mfa/setup`, `/auth/mfa/enable`).
- **Portaria (web/PWA)**: feed de eventos em tempo real, registro manual de
  acesso, cadastro/pré-autorização de visitantes, indicador online/offline.
- **App do Morador (condar, PWA mobile)**: home com resumo da unidade,
  autorização de visitante na portaria, reserva de áreas comuns e encomendas
  aguardando retirada (`/morador/resumo`, `/morador/encomendas`, `/espacos`,
  `/morador/reservas`, `/morador/solicitacoes`).
- **App do Síndico (condar, PWA mobile)**: painel de gestão, central de
  aprovações (aprovar/reprovar) e visão de plano/licença com uso de unidades e
  dispositivos.
- **Design system (`@condar/ui`)**: componentes e preset Tailwind
  compartilhados por todos os apps (regra de reúso de layout em `CLAUDE.md`).
- **Unidades**: CRUD de condomínios, blocos e unidades + gestão de ocupantes
  (`/condominios`, `/blocos`, `/unidades`, `/unidades/:id/ocupantes`) com a
  regra de vínculo principal único por unidade.
- **Importação de unidades (PDF)**: `POST /unidades/importar` (síndico/admin)
  faz upload do relatório "Contatos das unidades" do condomínio; com
  `?dry_run=true` (padrão) apenas pré-visualiza, e `?dry_run=false` grava
  (idempotente) condomínio/blocos/unidades/moradores/vínculos.
- **Licenciamento**: limites por plano (START 50 / PRO 500 / ENTERPRISE ∞)
  aplicados na criação de unidades e na importação; `GET /licenca` mostra
  plano, limites e uso atual.
- **Cadastro Vivo**: ao aprovar uma solicitação (`PATCH /aprovacoes/:id`), o
  sistema enfileira um comando para o Edge (`sync_queue`) e notifica o morador,
  de forma transacional.
- **LGPD**: log de auditoria append-only (`auditoria`) em mutações sensíveis
  (pessoas, veículos, aprovações).
- **Edge Sync**: ingestão de eventos, heartbeat e fila de comandos
  (`/edge/sync/*`); validação de licença pelo Edge
  (`POST /edge/validate-license`) com vínculo ao hardware por fingerprint e
  modo degradado (o acesso físico nunca é bloqueado).

> Integrações externas (FCM/APNs, OCR, SDK de hardware Hikvision/Intelbras)
> são stubs claramente marcados, coerentes com o escopo da Fase 1.

## Claude Code na web

O repositório inclui um hook de `SessionStart`
(`.claude/hooks/session-start.sh`) que, em sessões remotas, sobe Postgres +
Redis, instala dependências e roda as migrations automaticamente — permitindo
rodar testes e a aplicação sem setup manual.

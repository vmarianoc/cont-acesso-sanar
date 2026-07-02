# condar — convenções do projeto

## Regra de design: reaproveitar o layout (obrigatório)

Todo o front-end (`apps/web-*`) compartilha um **único design system**. Ao criar
ou alterar telas:

- **Reutilize os componentes de `@condar/ui`** (`packages/ui`) — `AppScreen`,
  `Header`, `Card`, `Stat`, `IconTile`, `BottomNav`, `Button`, `TextField`,
  `Badge`, `Logo` — em vez de recriar layout/estilos.
- **Não duplique** cliente HTTP, hook de auth nem tokens de tema: use
  `@condar/ui` (`client`, `useAuth`, `apiLogin`) e o preset Tailwind
  (`@condar/ui/tailwind-preset`).
- Se um padrão visual novo aparecer em mais de uma tela, **promova-o a um
  componente em `@condar/ui`** antes de repetir.
- Paleta: `brand` (carmim), `areia` (fundo), `tinta` (cabeçalho escuro).
  Cabeçalhos usam `Header` com `variant="brand"` (vermelho) ou `"tinta"`.

Objetivo: qualquer tela nova deve parecer parte do mesmo app sem reescrever CSS.

## Convenções de código

- Respostas da API: `{ data }` no sucesso, `{ erro: { codigo, mensagem } }` no erro.
- Multi-tenant: rotas autenticadas usam `request.tenantDb` (conexão reservada);
  serviços públicos usam `fastify.withTenant(schema, fn)`.
- Migrations de tenant são numeradas (`002_…`, `003_…`) e idempotentes; o schema
  `public` fica no `001` (reaplicado a cada migrate, use `IF NOT EXISTS`).
- Toda mutação sensível registra auditoria (`registrarAuditoria`).
- Não versionar PDFs nem dados pessoais (LGPD) — `*.pdf` está no `.gitignore`.

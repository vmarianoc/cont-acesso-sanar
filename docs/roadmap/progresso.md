# Progresso do Roadmap — Fase 1 (MVP)

Estado da implementação neste repositório (Cloud API + painel web da Portaria).
Referência de escopo: [fase-1.md](fase-1.md).

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado

## Escopo do MVP

| Funcionalidade | Prioridade | Status | Observações |
|---|---|---|---|
| Edge Service — Windows Service | P0 | ⬜ | Fora deste repo (Edge é .NET 8 / Go); a Cloud já expõe `/edge/sync/*` para integrá-lo |
| Controle de acesso (Hikvision) | P0 | ⬜ | Depende do SDK de hardware no Edge |
| Cadastro de moradores e unidades | P0 | ✅ | CRUD de condomínios/blocos/unidades (`/condominios`, `/blocos`, `/unidades`) + gestão de ocupantes (`/unidades/:id/ocupantes`) com regra de vínculo principal único; `/pessoas` e seed prontos; UI de busca/gestão de ocupantes em `apps/web-sindico` (`/unidades`) |
| Painel da portaria (web local) | P0 | ✅ | `apps/web-portaria` (PWA): feed de eventos, registro manual, visitantes, online/offline |
| Liberação de visitantes com notificação | P0 | 🟡 | Pré-autorização com foto (`visitantes.foto_url`) + notificação push com a foto ao morador. Falta o fluxo em tempo real portaria↔app |
| App Morador (iOS + Android) | P0 | 🟡 | App do morador **condar** (PWA mobile, `apps/web-morador`) com home, autorizar visitante, reservas e encomendas — funcional sobre a Cloud API. Falta empacotar como app nativo (React Native) |
| Atualização cadastral com aprovação | P0 | ✅ | Fluxo de aprovações (`/aprovacoes`) com histórico, comando ao Edge e auditoria |
| App Síndico — central de aprovações | P0 | 🟡 | App do síndico **condar** (PWA, `apps/web-sindico`) com painel de gestão, central de aprovações (aprovar/reprovar) e visão de licença/uso. Falta empacotar nativo |
| Cloud API — auth, sync, push | P0 | ✅ | JWT+refresh, `/edge/sync/*`; push real via FCM (BullMQ + `pushService.ts`), com modo degradado (loga em vez de falhar) quando `FCM_SERVICE_ACCOUNT_JSON` não está configurado |
| Multi-tenant (schema per tenant) | P0 | ✅ | Conexão reservada por requisição + `search_path` isolado; teste de isolamento sob concorrência |
| Licenciamento básico (START e PRO) | P0 | ✅ | Licença criada junto do tenant (com `license_key`); limites por plano (START 50 / PRO 500 / ENTERPRISE ∞) aplicados em `POST /unidades` e na importação; `GET /licenca` (plano/limites/uso) e `POST /edge/validate-license` (validação pelo Edge com vínculo de hardware por fingerprint e modo degradado) |
| Importação via CSV/Excel | P1 | ✅ | `POST /unidades/importar` (com dry-run) aceita PDF, CSV e Excel (.xlsx/.xls); PDF validado contra relatório real (660 unidades), CSV/Excel via `sheetImportService.ts` reaproveitando `mapRelatorioParaPlano`/`aplicarImportacao` |
| Migração Hikvision | P1 | ⬜ | — |
| Chat portaria ↔ morador | P1 | ⬜ | — |
| OCR de documentos (RG, CNH) | P1 | ⬜ | — |
| Central SIP (ramal no app) | P2 | 🟡 | Cloud: tabela `ramais_sip`, geração automática de ramal ao criar usuário morador (`ramalSipService.ts`), `GET /morador/ramal` (com geração sob demanda) e `GET /unidades/:id/ramais` (para a portaria). Falta o Flexisip de verdade — Edge tem só o stub de ciclo de vida (branch `edge-service`, `internal/sip`) — e o fluxo de chamada em si |
| Integração Superlógica | P2 | ⬜ | — |

## Entregas transversais (além da tabela de escopo)

| Item | Status | Observações |
|---|---|---|
| LGPD — log de auditoria append-only | ✅ | `auditoria` gravada em mutações sensíveis (pessoas, veículos, aprovações) |
| MFA (TOTP) para admin/síndico | ✅ | `/auth/mfa/setup` e `/auth/mfa/enable`; exigido no login quando ativo |
| Cadastro Vivo — aprovação → comando Edge | ✅ | `PATCH /aprovacoes/:id` enfileira `sync_queue` + notifica, transacional |
| Testes automatizados (Vitest) | ✅ | auth, isolamento multi-tenant, `/eventos`, cascata de aprovação, `/push/tokens`, notificação com foto em acessos e visitas |
| CI (GitHub Actions) | ✅ | Postgres+Redis, typecheck, migrate, testes, build |
| Seed de demonstração | ✅ | `pnpm --filter api seed` |

## Próximos passos sugeridos

1. ~~Importação de unidades/moradores via PDF/CSV/Excel~~ ✅ (`POST /unidades/importar` aceita os três formatos; front da portaria atualizado).
2. ~~Gestão de usuários do tenant~~ ✅ (`/usuarios` + tela no app do síndico: convidar, vincular pessoa, ativar/desativar).
3. ~~UI web de administração de unidades/ocupantes~~ ✅ (`/unidades` no app do síndico: busca por número, listagem condomínio/bloco/unidade, vincular/desvincular ocupante). Falta UI para criar condomínio/bloco (hoje só via API).
4. ~~Enforcement de licença~~ ✅ (limites de unidades por plano + `/edge/validate-license`).
5. App Morador / App Síndico (React Native) consumindo os endpoints existentes.
6. ~~Provider real de push (FCM/APNs)~~ ✅ (`pushService.ts` via `firebase-admin`; `POST/DELETE /push/tokens` para registrar/remover dispositivo; notificações de acesso e de visita já enviam a foto — `eventos.foto_url`/`visitantes.foto_url` — como imagem do push).
7. Central SIP: geração/consulta de ramal implementada do lado Cloud (item 🟡 acima). Falta integrar de verdade com o Flexisip no Edge (provisionar o ramal recebido via `sync_queue`, ex.: novo tipo de comando `ramal.provisionar`) e o fluxo de chamada (portaria → morador com foto do visitante, toque simultâneo, etc. — ver `docs/modules/central-sip.md`).

> Este arquivo é um espelho vivo do progresso — atualize a cada iteração.

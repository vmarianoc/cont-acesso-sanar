# Progresso do Roadmap — Fase 1 (MVP)

Estado da implementação neste repositório (Cloud API + painel web da Portaria).
Referência de escopo: [fase-1.md](fase-1.md).

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado

## Escopo do MVP

| Funcionalidade | Prioridade | Status | Observações |
|---|---|---|---|
| Edge Service — Windows Service | P0 | ✅ | `apps/edge` (Node/TS, serviço Windows via NSSM): listener ANPR das câmeras LPR, stream de eventos do facial, sync de comandos com ack, cache de placas + fila offline (modo degradado), licença por fingerprint e heartbeat — validado E2E contra a Cloud |
| Controle de acesso (Intelbras) | P0 | 🟡 | Lado Cloud pronto: `/edge/validate-access` (facial) e **`/edge/lpr`** (acesso veicular por placa, câmeras LPR Intelbras) com regras por área e evento auditável (`metodo='placa'`); Edge implementado em `apps/edge` (HTTP API Intelbras, digest auth) — ver `apps/edge/README.md`; resta homologar com hardware real |
| Cadastro de moradores e unidades | P0 | ✅ | CRUD de condomínios/blocos/unidades (`/condominios`, `/blocos`, `/unidades`) + gestão de ocupantes (`/unidades/:id/ocupantes`) com regra de vínculo principal único; `/pessoas` e seed prontos; UI de busca/gestão de ocupantes em `apps/web-sindico` (`/unidades`) |
| Painel da portaria (web local) | P0 | ✅ | `apps/web-portaria` (PWA): feed de eventos, registro manual, visitantes, online/offline |
| Liberação de visitantes com notificação | P0 | ✅ | Pré-autorização com **QR de convite** (lido pelo facial Intelbras via `/edge/qr` ou validado pelo porteiro, mostrando quem liberou) + notificação (`notificacoes` + worker) e **tempo real via SSE + Redis pub/sub** (`GET /rt/stream`): portaria "Chama Morador" → app recebe na hora → decisão volta ao painel ao vivo (~150ms fim a fim) |
| App Morador (iOS + Android) | P0 | 🟡 | App do morador **condar** (PWA mobile, `apps/web-morador`) com home, autorizar visitante, reservas e encomendas — funcional sobre a Cloud API. Falta empacotar como app nativo (React Native) |
| Atualização cadastral com aprovação | P0 | ✅ | Fluxo de aprovações (`/aprovacoes`) com histórico, comando ao Edge e auditoria |
| App Síndico — central de aprovações | P0 | 🟡 | App do síndico **condar** (PWA, `apps/web-sindico`) com painel de gestão, central de aprovações (aprovar/reprovar) e visão de licença/uso. Falta empacotar nativo |
| Cloud API — auth, sync, push | P0 | ✅ | JWT+refresh, `/edge/sync/*`; **push real via FCM HTTP v1** (Web Push nos 4 PWAs: tokens por pessoa em `push_tokens`, worker envia e remove expirados; stub sem `FCM_SERVICE_ACCOUNT_PATH`) |
| Multi-tenant (schema per tenant) | P0 | ✅ | Conexão reservada por requisição + `search_path` isolado; teste de isolamento sob concorrência |
| Licenciamento básico (START e PRO) | P0 | ✅ | Licença criada junto do tenant (com `license_key`); limites por plano (START 50 / PRO 500 / ENTERPRISE ∞) aplicados em `POST /unidades` e na importação; `GET /licenca` (plano/limites/uso) e `POST /edge/validate-license` (validação pelo Edge com vínculo de hardware por fingerprint e modo degradado) |
| Liberação facial por área (temporária, via agendamentos) | P0 | ✅ | `liberacoes_acesso` + `POST /edge/validate-access`: reserva de espaço libera a área do espaço no dia; pré-autorização de visitante libera a portaria na janela; liberação manual com revogação (`/liberacoes`); todo acesso gera evento auditável |
| App Administração (4ª rota) | P0 | ✅ | `apps/web-admin` (PWA + Capacitor `br.com.condar.admin`, porta 5176): painel, cadastros de pessoas, gestão de encomendas (registrar chegada, código de retirada, baixa) e liberações de acesso por área |
| Comunicados + Documentos por grupo | P0 | ✅ | Mural com confirmação de leitura (SSE em tempo real) e documentos (convenção p/ todos; restritos a grupos ex. conselho fiscal), tudo auditado |
| Autosserviço de conta | P0 | ✅ | Esqueci-senha, convite, e **auto-cadastro de implantação**: síndico dispara códigos por e-mail para a lista importada; morador confirma com e-mail/CPF+código; fora da lista solicita e o síndico aprova (convite automático) |
| Ocorrências (livro digital) | P0 | ✅ | Portaria/morador registram; síndico trata com comentários; SSE para síndico/autor |
| Reservas v2 + presença | P0 | ✅ | Períodos por espaço, aprovação opcional, antecedência/limite mensal, cancelamento revoga liberação; liberação facial restrita à faixa horária; entrada/saída de visitantes + "quem está dentro" |
| Busca unificada + cadastros vivos | P0 | ✅ | /busca (nome/placa/unidade/documento/pet) na portaria; pets; vaga do veículo; liberação recorrente (prestador); PATCH/timeline de pessoas |
| LGPD operacional | P0 | ✅ | Export "meus dados" (art. 18), anonimização, retenção automática de eventos (worker diário), consentimento, SSE via ticket de uso único |
| Multi-unidade e multi-condomínio | P0 | ✅ | /morador/contextos + header x-unidade-id; /auth/contas e /auth/trocar-condominio (mesmo e-mail em vários tenants); seletor no app do morador |
| Painel da administradora (rede) | P0 | ✅ | `/admin/*` (superadmin): resumo consolidado, lista com uso por condomínio, onboarding self-service (tenant+licença+convite do síndico), plano/ativação; tela Minha Rede no web-admin |
| Importação via CSV/Excel | P1 | ✅ | `POST /unidades/importar` aceita **PDF, CSV e XLSX** (cabeçalhos flexíveis: unidade, nome, vínculo, documento, email, telefone), com dry-run, idempotência e classificação física/jurídica; validado contra relatório real de 660 unidades (PDF) e fixtures CSV/XLSX |
| Migração de legado (Hikvision → Intelbras) | P1 | ⬜ | Primeiro condomínio já nasce Intelbras; migração de bases legadas fica para quando houver caso real |
| Chat portaria ↔ morador | P1 | ✅ | Conversa por unidade (morador só vê as suas), entrega em tempo real via SSE (~100ms), telas na portaria (lista + thread) e no app do morador |
| OCR de documentos (RG, CNH) | P1 | ⬜ | — |
| Central SIP (ramal no app) | P2 | ⬜ | — |
| Integração Superlógica | P2 | ⬜ | — |
| Billing (Banco Cora) ligado à licença | P0 | ✅ | Faturas por tenant (`/admin/faturas`): emissão de boleto/Pix na Cora (mTLS; stub sem credenciais), webhook de pagamento e **baixa manual** — pagamento estende a licença em 1 mês; tela Faturas no web-admin |

## Entregas transversais (além da tabela de escopo)

| Item | Status | Observações |
|---|---|---|
| LGPD — log de auditoria append-only | ✅ | `auditoria` gravada em mutações sensíveis (pessoas, veículos, aprovações) |
| MFA (TOTP) para admin/síndico | ✅ | `/auth/mfa/setup` e `/auth/mfa/enable`; exigido no login quando ativo |
| Cadastro Vivo — aprovação → comando Edge | ✅ | `PATCH /aprovacoes/:id` enfileira `sync_queue` + notifica, transacional |
| Testes automatizados (Vitest) | ✅ | auth, isolamento multi-tenant, `/eventos`, cascata de aprovação |
| CI (GitHub Actions) | ✅ | Postgres+Redis, typecheck, migrate, testes, build |
| Seed de demonstração | ✅ | `pnpm --filter api seed` |

## Próximos passos sugeridos

1. Importação de unidades/moradores via PDF/CSV/Excel (P1) — parser reaproveitando o cadastro de `/unidades` e `/pessoas`.
2. ~~Gestão de usuários do tenant~~ ✅ (`/usuarios` + tela no app do síndico: convidar, vincular pessoa, ativar/desativar).
3. ~~UI web de administração de unidades/ocupantes~~ ✅ (`/unidades` no app do síndico: busca por número, listagem condomínio/bloco/unidade, vincular/desvincular ocupante). Falta UI para criar condomínio/bloco (hoje só via API).
4. ~~Enforcement de licença~~ ✅ (limites de unidades por plano + `/edge/validate-license`).
5. ~~Apps nativos (portaria/morador/síndico)~~ ✅ via Capacitor reaproveitando os apps web + `@condar/ui` (ver `docs/apps-nativos.md`); resta assinar/publicar nas lojas e `cap add ios` (requer macOS).
6. ~~Provider real de push (FCM)~~ ✅ Web Push via FCM HTTP v1 nos 4 apps (`/push/token` + worker); push nativo Android/iOS fica para o empacotamento das lojas (registrar os pacotes `br.com.condar.*` no Firebase).
7. ~~Liberação facial por área via agendamentos~~ ✅ (`/edge/validate-access` + liberações automáticas de reservas/visitantes; UI em `web-admin`).
8. ~~App de administração do condomínio~~ ✅ (`apps/web-admin`: cadastros, encomendas com código de retirada, liberações).
9. ~~Telas de áreas/dispositivos~~ ✅ (`/dispositivos` + tela no web-admin: criar leitor por área, ativar/desativar). Falta a integração do Edge real com `/edge/validate-access` (matching facial no hardware → pessoa_id).

> Este arquivo é um espelho vivo do progresso — atualize a cada iteração.

# condar — Controle de Acesso e Gestão Condominial

**condar** é uma plataforma SaaS multi-tenant de controle de acesso e gestão
condominial: portaria digital, liberação facial por área, comunicados,
reservas, encomendas, ocorrências e painel da administradora — com auditoria
LGPD de ponta a ponta e tempo real (SSE).

Documentação de produto/arquitetura/roadmap em [`docs/`](docs/README.md) —
inclui o [progresso da implementação](docs/roadmap/progresso.md) e o guia de
[apps nativos](docs/apps-nativos.md).

---

## 1. Visão geral da solução

```
                        ┌─────────────────────────────────────────────┐
                        │                 Cloud API                   │
  Apps (PWA/nativo) ───►│  Fastify 4 · Node 20 · TS ESM               │
  web-portaria :5173    │  ├─ PostgreSQL 15  (schema-per-tenant)      │
  web-morador  :5174    │  ├─ Redis 7        (fila, SSE pub/sub,      │
  web-sindico  :5175    │  │                  rate-limit, tickets)    │
  web-admin    :5176    │  └─ Workers        (notificações, retenção) │
                        └───────────────▲─────────────────────────────┘
                                        │ /edge/* (sync, validate-license,
                                        │          validate-access)
                        ┌───────────────┴────────────┐
                        │  Edge Service (guarita)     │  ← apps/edge (Windows)
                        │  hardware Intelbras (facial │
                        │  + câmeras LPR)             │
                        └─────────────────────────────┘
```

| Workspace | Descrição | Porta dev |
|---|---|---|
| `apps/api` | Cloud API (Fastify + Postgres + Redis + BullMQ) | 3000 |
| `apps/edge` | Edge Service da guarita (Intelbras facial + LPR, Windows) | 8090 (ANPR) |
| `apps/web-portaria` | Console da portaria (desktop-first, PWA) | 5173 |
| `apps/web-morador` | App do morador (mobile-first, PWA + Capacitor) | 5174 |
| `apps/web-sindico` | App do síndico — gestão/aprovações/comunicados | 5175 |
| `apps/web-admin` | Administração — cadastros/encomendas/liberações/**rede** | 5176 |
| `packages/ui` | Design system `@condar/ui` (componentes, client HTTP, auth, SSE) | — |
| `packages/shared` | Schemas Zod/typing compartilhados | — |
| `infra` | docker-compose (Postgres + Redis) para dev | — |

**Isolamento multi-tenant:** schema-per-tenant. Cada requisição autenticada
reserva uma conexão do pool e fixa `search_path` no schema do tenant
(`apps/api/src/plugins/multiTenant.ts`); serviços públicos usam
`fastify.withTenant`. Isso impede, por construção, que uma query de um
condomínio leia dados de outro (há teste de isolamento sob concorrência).

---

## 2. Requisitos

| Componente | Versão mínima | Observação |
|---|---|---|
| Node.js | 20.x | ESM (`"type": "module"`) |
| pnpm | 10.x | workspaces |
| PostgreSQL | 15 | extensão `uuid-ossp` (criada pela migration) |
| Redis | 7 | fila BullMQ + pub/sub SSE + tickets |
| (produção) SMTP | — | esqueci-senha/convites; sem SMTP roda em modo stub (loga o código) |
| (apps nativos) JDK 17 + Android SDK | — | só para gerar APK/AAB |

---

## 3. Implantação local (desenvolvimento)

```bash
# 1) infraestrutura
cd infra && docker compose up -d          # Postgres :5432 + Redis :6379
cd ..

# 2) dependências
pnpm install

# 3) configuração da API
cp apps/api/.env.example apps/api/.env    # ajuste JWT_SECRET etc.

# 4) banco: schema public + migrations de todos os tenants
pnpm --filter api migrate

# 5) dados de demonstração (tenant "Residencial Horizonte")
pnpm --filter api seed                    # imprime tenant_id + credenciais

# 6) subir tudo
pnpm --filter api dev                     # API :3000
pnpm --filter api worker                  # workers (notificações + retenção LGPD)
pnpm --filter web-portaria dev            # :5173
pnpm --filter web-morador  dev            # :5174
pnpm --filter web-sindico  dev            # :5175
pnpm --filter web-admin    dev            # :5176
```

Crie `apps/web-*/.env.local` com `VITE_TENANT_ID=<tenant_id do seed>` para
pré-preencher o login. Em dev, os apps proxiam `/api` → `:3000`.

### Credenciais demo (após o seed)

| Perfil | E-mail | Senha | Onde usar |
|---|---|---|---|
| Superadmin (administradora) | superadmin@demo.com | super1234 | web-admin (painel "Minha rede") |
| Síndico | sindico@demo.com | sindico123 | web-sindico / web-admin / importação |
| Porteiro | porteiro@demo.com | porteiro123 | web-portaria |
| Morador | morador@demo.com | morador123 | web-morador |

---

## 4. Variáveis de ambiente (API)

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | `postgres://user:pass@host:5432/db` |
| `REDIS_URL` | ✅ | — | `redis://host:6379` |
| `JWT_SECRET` | ✅ | — | segredo dos tokens de acesso (longo e aleatório) |
| `JWT_REFRESH_SECRET` | ✅ | — | segredo do refresh token |
| `JWT_EXPIRES_IN` | — | `15m` | validade do access token |
| `JWT_REFRESH_EXPIRES_IN` | — | `7d` | validade do refresh (cookie httpOnly) |
| `BCRYPT_ROUNDS` | — | `12` | custo do hash de senha |
| `PORT` / `HOST` | — | `3000` / `0.0.0.0` | bind da API |
| `NODE_ENV` | — | `development` | `production` oculta mensagens de erro internas |
| `SMTP_URL` | — | *(stub)* | ex. `smtps://user:pass@smtp.provedor.com:465`; ausente → códigos saem no log |
| `FCM_SERVICE_ACCOUNT_PATH` | — | *(stub)* | caminho do JSON da conta de serviço do Firebase (push real via FCM HTTP v1); sem ele o worker loga em stub |
| `VITE_FIREBASE_VAPID_KEY` | — | embutida | chave pública VAPID (Certificados push da Web) usada pelos fronts no `getToken` |
| `SMTP_FROM` | — | `condar <nao-responda@condar.app>` | remetente |
| `RETENCAO_EVENTOS_DIAS` | — | `365` | retenção LGPD de eventos de acesso/fotos (worker diário) |
| `LOG_LEVEL` | — | `info` | pino |
| `CORA_BASE_URL` | — | *(stub)* | API do Banco Cora (billing); sem as 4 variáveis CORA_* a emissão roda em modo stub |
| `CORA_CLIENT_ID` | — | — | client_id da integração direta Cora |
| `CORA_CERT_PATH` / `CORA_KEY_PATH` | — | — | certificado/chave mTLS emitidos pela Cora |
| `CORA_WEBHOOK_SECRET` | — | — | segredo validado no header `x-webhook-secret` de `POST /webhooks/cora` |
| `PRECO_START` / `PRECO_PRO` / `PRECO_ENTERPRISE` | — | `19900/49900/99900` | preço mensal por plano, em centavos |

Front-ends (build): `VITE_API_URL` (URL pública da API — **obrigatória em
produção e nos apps nativos**) e `VITE_TENANT_ID` (opcional, pré-preenche o login).

---

## 5. Implantação em produção

### 5.1 Topologia recomendada

- **1+ instâncias da API** atrás de um proxy HTTPS (nginx/Caddy/ALB). O tempo
  real usa Redis pub/sub, então múltiplas instâncias funcionam sem sticky
  session (SSE exige `proxy_buffering off`).
- **1 processo de workers** (`pnpm --filter api worker`) — notificações + retenção LGPD.
- **PostgreSQL e Redis gerenciados** (RDS/Cloud SQL/ElastiCache ou
  equivalentes), com backup automático do Postgres.
- **Front-ends são estáticos**: `pnpm -r build` gera `apps/web-*/dist` —
  sirva por CDN/nginx (SPA fallback para `index.html`).

### 5.2 Passo a passo (VM única com nginx)

```bash
# dependências: node 20, pnpm, postgres 15, redis 7, nginx

git clone <repo> /opt/condar && cd /opt/condar
pnpm install --frozen-lockfile

# API
cp apps/api/.env.example apps/api/.env    # DATABASE_URL, REDIS_URL, JWT_*, SMTP_URL,
                                          # NODE_ENV=production
pnpm --filter api migrate

# builds dos apps (aponte para a URL pública da API)
VITE_API_URL=https://api.condar.app pnpm -r build
```

`systemd` (uma unit para a API, outra para os workers):

```ini
# /etc/systemd/system/condar-api.service
[Unit]
Description=condar API
After=network.target postgresql.service redis.service

[Service]
WorkingDirectory=/opt/condar/apps/api
EnvironmentFile=/opt/condar/apps/api/.env
ExecStart=/usr/bin/node --import tsx src/index.ts
Restart=always
User=condar

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/condar-workers.service  (mesma base, ExecStart abaixo)
ExecStart=/usr/bin/node --import tsx src/workers/index.ts
```

nginx (API + um app; repita o bloco de site para cada front):

```nginx
server {
  listen 443 ssl http2;
  server_name api.condar.app;
  # ssl_certificate ... (certbot/letsencrypt)

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
  }
  # SSE: sem buffering e timeout longo
  location /rt/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_buffering off;
    proxy_read_timeout 1h;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
  }
}

server {
  listen 443 ssl http2;
  server_name morador.condar.app;
  root /opt/condar/apps/web-morador/dist;
  location / { try_files $uri /index.html; }   # SPA fallback
}
```

### 5.3 Checklist de produção

- [ ] `JWT_SECRET`/`JWT_REFRESH_SECRET` longos e únicos; `NODE_ENV=production`
- [ ] HTTPS em tudo (cookies de refresh são `secure` em produção)
- [ ] `SMTP_URL` configurado (esqueci-senha/convites por e-mail)
- [ ] Workers rodando (sem eles não há push interno nem retenção LGPD)
- [ ] Backup diário do Postgres (`pg_dump -Fc`) + teste de restore
- [ ] `RETENCAO_EVENTOS_DIAS` de acordo com a política de privacidade do condomínio
- [ ] Monitorar `/health` (retorna 200) e logs estruturados (pino/JSON em produção)
- [ ] **Nunca versionar PDFs/dados pessoais** (LGPD — `*.pdf` está no `.gitignore`)

### 5.4 Provisionamento de um novo condomínio (administradora)

Pelo painel **web-admin → Minha rede** (perfil `superadmin`):
1. "+ Condomínio": nome, plano (START 50 / PRO 500 / ENTERPRISE ∞), nome e
   e-mail do síndico.
2. O sistema cria o tenant (schema isolado + licença com `license_key`),
   estrutura mínima e envia o **convite do síndico** (7 dias) — ele define a
   própria senha em "Ativar minha conta".
3. O síndico importa as unidades/moradores por **PDF, CSV ou XLSX**
   (`web-portaria → Importar`, com dry-run) e convida os moradores
   (tela Usuários → Convite).
4. Plano/ativação podem ser alterados a qualquer momento no mesmo painel.

Via API: `POST /admin/condominios`, `PATCH /admin/condominios/:id`,
`GET /admin/resumo|/admin/condominios` (token superadmin).

---

## 6. Apps nativos (Android/iOS)

Os quatro apps são PWAs instaláveis e também têm projetos **Capacitor**
versionados (`apps/*/android`, appIds `br.com.condar.*`). Para gerar o APK:

```bash
cd apps/web-morador
VITE_API_URL=https://api.condar.app pnpm app:android
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Detalhes (release/assinatura/Play Store/iOS): [`docs/apps-nativos.md`](docs/apps-nativos.md).

---

## 7. Integração com o Edge (guarita)

O Edge Service (**`apps/edge`**, Node/TS rodando como serviço do Windows via NSSM) integra o hardware
**Intelbras** (controladores de acesso facial + câmeras LPR) à Cloud — guia
completo em [`docs/integracao-intelbras.md`](docs/integracao-intelbras.md).
Endpoints consumidos:

| Endpoint | Uso |
|---|---|
| `POST /edge/validate-license` | ativação com vínculo de hardware (fingerprint) e modo degradado |
| `POST /edge/validate-access` | leitor facial → `pessoa_id` → liberado/negado por área (agendamentos, recorrência) |
| `POST /edge/lpr` | câmera LPR Intelbras → placa → veículo/pessoa → liberado/negado por área (comanda a cancela) |
| `GET /edge/sync/comandos` | fila de comandos (Cadastro Vivo → hardware) |
| `POST /edge/sync/eventos` | upload de eventos offline-first |
| `POST /edge/sync/heartbeat` | saúde do dispositivo |

Regra de ouro: o acesso físico **nunca** é bloqueado por indisponibilidade da
Cloud — o Edge decide localmente em modo degradado e sincroniza depois.

---

## 8. Operação e verificação

```bash
# testes (exige Postgres+Redis de dev)
pnpm --filter api test          # suíte completa (94 testes)

# typecheck de tudo
pnpm -r typecheck

# builds
pnpm -r build
```

CI (GitHub Actions): sobe Postgres+Redis, typecheck dos 6 pacotes, migrate,
testes e build a cada push.

**Migrations:** numeradas e idempotentes em `apps/api/src/db/migrations/`
(`001` = schema public, reaplicado sempre; `002+` = tenants, aplicadas em ordem
a todos os schemas). Para atualizar produção: `git pull && pnpm install && pnpm
--filter api migrate && systemctl restart condar-api condar-workers`.

### Solução de problemas

| Sintoma | Causa provável |
|---|---|
| Login 500 "column ... does not exist" | faltou `pnpm --filter api migrate` após atualizar |
| SSE não conecta atrás do proxy | falta `proxy_buffering off` no location `/rt/` |
| E-mails não chegam | `SMTP_URL` ausente (modo stub: o código sai no log da API) |
| 429 em rajadas | rate-limit por Redis — ajuste na `plugins/rateLimit.ts` se necessário |
| Import PDF falha | relatório fora do layout esperado — use CSV/XLSX (cabeçalhos: unidade, nome, vínculo, documento, email, telefone) |

---

## 9. Segurança e LGPD (resumo)

- Auditoria append-only de toda mutação sensível (`registrarAuditoria`).
- MFA TOTP para síndico/admin; tokens de reset/convite com hash SHA-256 e uso único.
- SSE autenticado por ticket de uso único (JWT fora de query string/logs).
- Direitos do titular: export "meus dados" (art. 18), anonimização no
  desligamento, retenção automática de eventos, consentimento no primeiro acesso.
- Isolamento multi-tenant testado sob concorrência.

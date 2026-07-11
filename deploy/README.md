# Deploy do condar em condar.app

Pré-requisitos já feitos: DNS (A) de condar.app, api., portaria., morador.,
sindico. e admin. apontando para o servidor.

## Primeira instalação (no servidor, como root)

```bash
git clone https://github.com/vmarianoc/cont-acesso-sanar.git /opt/condar
bash /opt/condar/deploy/bootstrap.sh main
```

O script instala nginx/Postgres/Redis/Node 20, cria o banco e o `.env`
(edite a senha do banco e os segredos), roda migrations, builda os 5 apps,
sobe API + workers via systemd, instala os sites nginx e emite o certificado
(um só para os 6 hosts). Os fronts falam com `https://api.condar.app`
automaticamente (`apiBase()` no @condar/ui) — nenhum env de build necessário.

> Se estiver atrás do proxy da Cloudflare (nuvem laranja), use SSL/TLS
> "Full (strict)" e desative o proxy no host `api.` OU garanta que o
> tempo-real (/rt/) não seja bufferizado.

## Atualizações

```bash
bash /opt/condar/deploy/atualizar.sh
```

## Depois de instalar

1. `https://api.condar.app/health` deve responder `{"status":"ok"}`.
2. Onboarding do primeiro condomínio: app admin (admin.condar.app) →
   Minha Rede → Novo condomínio (gera licença + convite do síndico), ou
   `pnpm --filter api seed` para dados de demonstração.
3. Anote o **código do condomínio** (tela Licença do síndico) — é o que a
   portaria usa no login.
4. Edge da guarita: `apps/edge/README.md` (config aponta para
   https://api.condar.app).
5. Push real: coloque o JSON da conta de serviço em
   `/etc/condar/fcm-service-account.json` e descomente
   `FCM_SERVICE_ACCOUNT_PATH` no `.env`.

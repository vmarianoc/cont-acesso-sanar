# Deploy em produção (VPS única, Ubuntu 22.04)

Pressupõe: VPS provisionada (4 vCPU / 8 GB RAM), Ubuntu 22.04, DNS de
`condar.app`, `api.condar.app`, `portaria.condar.app`, `morador.condar.app`,
`sindico.condar.app` e `www.condar.app` já apontados (A record) para o IP da VPS.

## 1. Acesso inicial e hardening básico

```bash
ssh root@SEU_IP

adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

exit
ssh deploy@SEU_IP
```

## 2. Instalar Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version && docker compose version
```

## 3. Instalar Node 20 + pnpm (para buildar os web apps estáticos)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo corepack enable
```

## 4. Clonar o repositório

```bash
sudo mkdir -p /srv/condar
sudo chown $USER:$USER /srv/condar
git clone https://github.com/vmarianoc/cont-acesso-sanar.git /srv/condar/app
cd /srv/condar/app
```

## 5. Configurar segredos

```bash
cp apps/api/.env.example apps/api/.env
# edite apps/api/.env:
#   JWT_SECRET e JWT_REFRESH_SECRET -> gere com: openssl rand -base64 48
#   NODE_ENV=production
#   DATABASE_URL e REDIS_URL não precisam mudar (apontam para os serviços do compose)
nano apps/api/.env

cp infra/.env.production.example infra/.env
# defina POSTGRES_PASSWORD com uma senha forte
nano infra/.env
```

## 6. Subir Postgres, Redis, API e worker

```bash
cd infra
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

## 7. Rodar as migrations

```bash
docker compose -f docker-compose.prod.yml exec api node dist/db/migrate.js
```

Isso cria o schema `public` (tenants, licenças) — os schemas de tenant são
criados sob demanda quando um condomínio é cadastrado (`POST /admin/tenants`,
autenticado como `superadmin`). **Não** rode `pnpm seed` em produção — o
script de seed cria dados fictícios (`Residencial Horizonte`, usuários demo).
Cadastrar o condomínio real e o primeiro usuário síndico é um passo separado
— me avise quando chegar nessa etapa que ajudo a criar esse fluxo de bootstrap.

## 8. Buildar os apps web (estáticos)

```bash
cd /srv/condar/app
pnpm install --frozen-lockfile

VITE_API_URL=/api pnpm --filter web-portaria build
VITE_API_URL=/api pnpm --filter web-morador build
VITE_API_URL=/api pnpm --filter web-sindico build

sudo mkdir -p /srv/condar/web-portaria /srv/condar/web-morador /srv/condar/web-sindico
sudo cp -r apps/web-portaria/dist/. /srv/condar/web-portaria/
sudo cp -r apps/web-morador/dist/. /srv/condar/web-morador/
sudo cp -r apps/web-sindico/dist/. /srv/condar/web-sindico/
```

## 9. Instalar o Caddy (TLS automático via Let's Encrypt)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

sudo cp /srv/condar/app/infra/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy
```

Caddy obtém e renova os certificados TLS automaticamente na primeira
requisição a cada domínio — não precisa de certbot manual.

## 10. Verificar

```bash
curl -I https://api.condar.app/health   # ou a rota de health que a API expuser
```

Abra `https://portaria.condar.app`, `https://morador.condar.app` e
`https://sindico.condar.app` no navegador.

## Deploys seguintes (atualizar código)

```bash
cd /srv/condar/app
git pull
cd infra && docker compose -f docker-compose.prod.yml up -d --build
cd .. && pnpm install --frozen-lockfile
VITE_API_URL=/api pnpm --filter web-portaria build && sudo cp -r apps/web-portaria/dist/. /srv/condar/web-portaria/
VITE_API_URL=/api pnpm --filter web-morador build && sudo cp -r apps/web-morador/dist/. /srv/condar/web-morador/
VITE_API_URL=/api pnpm --filter web-sindico build && sudo cp -r apps/web-sindico/dist/. /srv/condar/web-sindico/
docker compose -f infra/docker-compose.prod.yml exec api node dist/db/migrate.js
```

## Backups

```bash
# cron diário — ajuste o destino (S3/Backblaze) conforme a conta escolhida
docker compose -f /srv/condar/app/infra/docker-compose.prod.yml exec -T postgres \
  pg_dump -U postgres accessplatform | gzip > /srv/condar/backups/accessplatform-$(date +%F).sql.gz
```

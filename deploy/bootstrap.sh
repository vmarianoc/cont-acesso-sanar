#!/usr/bin/env bash
# Bootstrap do servidor condar.app (Ubuntu/Debian). Idempotente — rode como root.
# Uso: bash deploy/bootstrap.sh [ramo]   (padrão: main)
set -euo pipefail
RAMO="${1:-main}"
REPO="https://github.com/vmarianoc/cont-acesso-sanar.git"
DIR=/opt/condar

echo "== pacotes base"
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx postgresql redis-server git curl

echo "== node 20 + pnpm"
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
corepack enable && corepack prepare pnpm@10 --activate

echo "== usuário e código"
id condar &>/dev/null || useradd -r -m -s /bin/bash condar
if [ ! -d "$DIR/.git" ]; then
  git clone --branch "$RAMO" "$REPO" "$DIR"
else
  git -C "$DIR" fetch origin "$RAMO" && git -C "$DIR" checkout "$RAMO" && git -C "$DIR" pull
fi
chown -R condar:condar "$DIR"

echo "== banco"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='condar'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE condar LOGIN PASSWORD 'TROQUE-ESTA-SENHA'"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='condar'" | grep -q 1 || \
  sudo -u postgres createdb -O condar condar

echo "== .env"
if [ ! -f "$DIR/apps/api/.env" ]; then
  cat > "$DIR/apps/api/.env" <<ENV
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://condar:TROQUE-ESTA-SENHA@127.0.0.1:5432/condar
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
# SMTP_URL=smtps://usuario:senha@smtp.provedor.com:465
# FCM_SERVICE_ACCOUNT_PATH=/etc/condar/fcm-service-account.json
# CORA_BASE_URL= / CORA_CLIENT_ID= / CORA_CERT_PATH= / CORA_KEY_PATH= / CORA_WEBHOOK_SECRET=
ENV
  chown condar:condar "$DIR/apps/api/.env"; chmod 600 "$DIR/apps/api/.env"
  echo ">> Edite $DIR/apps/api/.env (senha do banco, SMTP, FCM, Cora)"
fi

echo "== dependências, migrations e build"
sudo -u condar bash -c "cd $DIR && pnpm install --frozen-lockfile && pnpm --filter api migrate && pnpm -r build"

echo "== systemd"
cp "$DIR"/deploy/systemd/*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now condar-api condar-workers

echo "== nginx + certificado"
mkdir -p /var/www/certbot
cp "$DIR"/deploy/nginx/*.conf /etc/nginx/sites-available/
for f in "$DIR"/deploy/nginx/*.conf; do ln -sf /etc/nginx/sites-available/$(basename "$f") /etc/nginx/sites-enabled/; done
if [ ! -d /etc/letsencrypt/live/condar.app ]; then
  certbot certonly --nginx --agree-tos --no-eff-email -m fiscal@transportesdj.com.br \
    -d condar.app -d api.condar.app -d portaria.condar.app -d morador.condar.app -d sindico.condar.app -d admin.condar.app
fi
nginx -t && systemctl reload nginx

echo "== backup diário (cron)"
grep -q condar/deploy/backup.sh /etc/crontab || echo "20 3 * * * root bash /opt/condar/deploy/backup.sh >> /var/log/condar-backup.log 2>&1" >> /etc/crontab

echo "== pronto"
curl -sf http://127.0.0.1:3000/health && echo && echo "API no ar. Teste: https://api.condar.app/health"
echo "Seed de demonstração (opcional): sudo -u condar bash -c 'cd $DIR && pnpm --filter api seed'"

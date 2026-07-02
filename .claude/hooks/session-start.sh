#!/bin/bash
# SessionStart hook: provisions local Postgres + Redis, installs deps and runs
# migrations so tests, linters and the app work in Claude Code on the web.
set -euo pipefail

# Only run in the remote (Claude Code on the web) environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/accessplatform"
REDIS_URL="redis://localhost:6379"

# --- Postgres ---------------------------------------------------------------
if command -v pg_ctlcluster >/dev/null 2>&1; then
  PG_VER="$(pg_lsclusters -h 2>/dev/null | awk 'NR==1{print $1}')"
  if [ -n "${PG_VER:-}" ]; then
    pg_ctlcluster "$PG_VER" main start >/dev/null 2>&1 || true
  fi
fi

# Wait for the socket, then ensure role, database and extensions exist.
for _ in $(seq 1 20); do
  if sudo -u postgres psql -tAc 'SELECT 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" >/dev/null 2>&1 || true
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='accessplatform'" | grep -q 1 \
  || sudo -u postgres createdb accessplatform >/dev/null 2>&1 || true
sudo -u postgres psql -d accessplatform -c \
  'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto;' >/dev/null 2>&1 || true

# --- Redis ------------------------------------------------------------------
redis-cli ping >/dev/null 2>&1 || redis-server --daemonize yes >/dev/null 2>&1 || true

# --- API env file -----------------------------------------------------------
if [ ! -f apps/api/.env ]; then
  cp apps/api/.env.example apps/api/.env
fi

# --- Dependencies + migrations ---------------------------------------------
pnpm install
DATABASE_URL="$DATABASE_URL" REDIS_URL="$REDIS_URL" pnpm --filter api migrate

# --- Persist env for the session so tests can connect ----------------------
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export DATABASE_URL='$DATABASE_URL'"
    echo "export REDIS_URL='$REDIS_URL'"
    echo "export JWT_SECRET='dev-session-secret'"
    echo "export JWT_REFRESH_SECRET='dev-session-refresh-secret'"
    echo "export BCRYPT_ROUNDS='4'"
  } >> "$CLAUDE_ENV_FILE"
fi

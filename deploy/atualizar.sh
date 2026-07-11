#!/usr/bin/env bash
# Atualiza o condar em produção: pull + build + migrate + restart. Rode como root.
set -euo pipefail
DIR=/opt/condar
git -C "$DIR" pull
sudo -u condar bash -c "cd $DIR && pnpm install --frozen-lockfile && pnpm --filter api migrate && pnpm -r build"
systemctl restart condar-api condar-workers
systemctl reload nginx
curl -sf http://127.0.0.1:3000/health && echo && echo "Atualizado."

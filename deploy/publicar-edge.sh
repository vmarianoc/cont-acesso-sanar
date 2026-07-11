#!/usr/bin/env bash
# Publica um release do Edge para TODOS os condomínios (OTA).
# Uso: bash deploy/publicar-edge.sh 1.1.0 "notas do release"
# Env: CONDAR_API (default https://api.condar.app), CONDAR_TOKEN (JWT superadmin)
set -euo pipefail
VERSAO="${1:?informe a versão x.y.z}"
NOTAS="${2:-}"
API="${CONDAR_API:-https://api.condar.app}"
[ -n "${CONDAR_TOKEN:-}" ] || { echo "Defina CONDAR_TOKEN (login superadmin)"; exit 1; }

cd "$(dirname "$0")/../apps/edge"
# versão no package.json = fonte da verdade do que os Edges reportam
node -e "const f='package.json',j=require('./'+f);j.version='$VERSAO';require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
TMP=$(mktemp /tmp/edge-XXXX.tgz)
tar -czf "$TMP" src package.json tsconfig.json edge.config.example.json README.md

curl -sf -X POST "$API/admin/edge/releases" \
  -H "Authorization: Bearer $CONDAR_TOKEN" \
  -F "versao=$VERSAO" -F "notas=$NOTAS" -F "pacote=@$TMP;type=application/gzip" \
  && echo && echo "Release $VERSAO publicado — os Edges atualizam em até 6h (ou no próximo restart)."
rm -f "$TMP"

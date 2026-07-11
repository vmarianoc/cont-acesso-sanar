#!/usr/bin/env bash
# Backup diário do Postgres do condar com rotação de 14 dias.
# Instale no cron (o bootstrap já faz): 20 3 * * * root bash /opt/condar/deploy/backup.sh
set -euo pipefail
DIR=/var/backups/condar
mkdir -p "$DIR"
ARQ="$DIR/condar-$(date +%F).dump"
sudo -u postgres pg_dump -Fc condar > "$ARQ"
find "$DIR" -name 'condar-*.dump' -mtime +14 -delete
echo "backup: $ARQ ($(du -h "$ARQ" | cut -f1))"

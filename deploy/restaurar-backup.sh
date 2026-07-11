#!/usr/bin/env bash
# Restauração reversível: antes de restaurar, salva o estado ATUAL em um
# backup extra — dá para voltar atrás se a restauração não for a esperada.
# Uso: bash deploy/restaurar-backup.sh /var/backups/condar/condar-2026-07-10.dump
set -euo pipefail
ARQ="${1:?informe o arquivo .dump}"
[ -f "$ARQ" ] || { echo "arquivo não existe: $ARQ"; exit 1; }
SEGURANCA="/var/backups/condar/pre-restauracao-$(date +%F-%H%M%S).dump"
echo "== salvando o estado atual em $SEGURANCA"
sudo -u postgres pg_dump -Fc condar > "$SEGURANCA"
echo "== parando serviços"
systemctl stop condar-api condar-workers
echo "== restaurando $ARQ"
sudo -u postgres dropdb condar
sudo -u postgres createdb -O condar condar
sudo -u postgres pg_restore -d condar --no-owner --role=condar "$ARQ"
echo "== subindo serviços"
systemctl start condar-api condar-workers
echo "Pronto. Para DESFAZER esta restauração: bash $0 $SEGURANCA"

#!/bin/sh
# Nightly backup: database dump + uploaded images, kept for BACKUP_KEEP_DAYS days.
# Runs once a day after 02:00 (Tashkent time). Files land in ./backups on the server.
set -eu
KEEP="${BACKUP_KEEP_DAYS:-30}"
mkdir -p /backups

backup() {
  day=$(date +%F)
  echo "[backup] $(date) starting"
  pg_dump -Fc -f "/backups/pos-$day.dump.tmp" && mv "/backups/pos-$day.dump.tmp" "/backups/pos-$day.dump"
  tar -czf "/backups/uploads-$day.tar.gz.tmp" -C /uploads . && mv "/backups/uploads-$day.tar.gz.tmp" "/backups/uploads-$day.tar.gz"
  find /backups -name 'pos-*.dump' -mtime +"$KEEP" -delete
  find /backups -name 'uploads-*.tar.gz' -mtime +"$KEEP" -delete
  echo "[backup] $(date) done: pos-$day.dump"
}

while true; do
  day=$(date +%F)
  hour=$(date +%H)
  if [ ! -f "/backups/pos-$day.dump" ] && [ "$hour" -ge 2 ]; then
    backup || echo "[backup] FAILED"
  fi
  sleep 1800
done

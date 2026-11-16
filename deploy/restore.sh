#!/bin/sh
# Restore a backup made by backup.sh. Run on the server from the project folder:
#   sh deploy/restore.sh backups/pos-2026-11-16.dump [backups/uploads-2026-11-16.tar.gz]
# WARNING: replaces all current data.
set -eu
DUMP="$1"
UPLOADS="${2:-}"
[ -f "$DUMP" ] || { echo "No such file: $DUMP"; exit 1; }
docker compose stop app
docker compose exec -T db sh -c 'dropdb -U pos --if-exists pos && createdb -U pos pos'
docker compose exec -T db pg_restore -U pos -d pos --no-owner < "$DUMP"
if [ -n "$UPLOADS" ]; then
  docker compose run --rm -T --no-deps --entrypoint sh -v "$(pwd)/$UPLOADS:/restore.tar.gz:ro" app \
    -c 'rm -rf /data/uploads/* && tar -xzf /restore.tar.gz -C /data/uploads'
fi
docker compose start app
echo "Restored from $DUMP"

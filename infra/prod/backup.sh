#!/bin/sh
# Daily backup on the VPS (ADR-16): the database (when it runs in the stack) and the uploaded files. Cron entry for the deploy user
# (02:30 Asia/Ho_Chi_Minh):
#   30 19 * * * sh /opt/campusstay/backup.sh >> /opt/campusstay/backups/backup.log 2>&1
# Keeps the newest 14 of each in /opt/campusstay/backups. Restore: see infra/prod/README.md.
set -eu
cd "$(dirname "$0")"
mkdir -p backups

stamp="$(date -u +%Y%m%d-%H%M)"
# A managed database (no db service, appendix A of the runbook) is backed up by its provider.
if docker compose ps --status running --services | grep -qx db; then
  docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/campusstay-$stamp.dump.tmp"
  mv "backups/campusstay-$stamp.dump.tmp" "backups/campusstay-$stamp.dump"
fi
docker compose exec -T api tar -C /app/data -czf - files > "backups/files-$stamp.tgz.tmp"
mv "backups/files-$stamp.tgz.tmp" "backups/files-$stamp.tgz"

for kind in campusstay files; do
  ls -1t backups/"$kind"-* 2>/dev/null | tail -n +15 | xargs -r rm --
done
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) wrote backups/*-$stamp"

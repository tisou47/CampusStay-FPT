#!/bin/sh
# Daily backup on the VPS (ADR-16): the database (when it runs in the stack) and the uploaded files. Cron entry for the deploy user
# (02:30 Asia/Ho_Chi_Minh):
#   30 19 * * * sh /opt/campusstay/backup.sh >> /opt/campusstay/backups/backup.log 2>&1
# Keeps the newest 14 of each in /opt/campusstay/backups. Restore: see infra/prod/README.md.
# The deploy runs it with BACKUP_PREFIX=predeploy- BACKUP_KEEP=5: those copies rotate on their own, so frequent
# deploys never push the daily backups out.
set -eu
cd "$(dirname "$0")"
mkdir -p backups

stamp="$(date -u +%Y%m%d-%H%M)"
p="${BACKUP_PREFIX:-}"
keep="${BACKUP_KEEP:-14}"
# A managed database (no db service, appendix A of the runbook) is backed up by its provider.
if docker compose ps --status running --services | grep -qx db; then
  docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/${p}campusstay-$stamp.dump.tmp"
  mv "backups/${p}campusstay-$stamp.dump.tmp" "backups/${p}campusstay-$stamp.dump"
fi
docker compose exec -T api tar -C /app/data -czf - files > "backups/${p}files-$stamp.tgz.tmp"
mv "backups/${p}files-$stamp.tgz.tmp" "backups/${p}files-$stamp.tgz"

for kind in "${p}campusstay" "${p}files"; do
  ls -1t backups/"$kind"-* 2>/dev/null | tail -n +"$((keep + 1))" | xargs -r rm --
done
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) wrote backups/${p}*-$stamp"

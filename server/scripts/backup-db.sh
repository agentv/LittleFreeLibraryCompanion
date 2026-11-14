#!/bin/sh
# Nightly database backup to S3 (backend R17). Run from cron on the server, e.g.
#   15 3 * * * /opt/lfl/server/scripts/backup-db.sh >> /var/log/lfl-backup.log 2>&1
# Needs the AWS CLI and an instance role allowed to write to BACKUP_BUCKET.
# Restore (test it): gunzip -c dump.sql.gz | docker compose exec -T db psql -U postgres
set -eu
BACKUP_BUCKET="${BACKUP_BUCKET:?set BACKUP_BUCKET}"
cd "$(dirname "$0")/../docker"
stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
docker compose exec -T db pg_dumpall -U postgres | gzip | aws s3 cp - "s3://${BACKUP_BUCKET}/lfl/db-${stamp}.sql.gz"
echo "backup ok ${stamp}"

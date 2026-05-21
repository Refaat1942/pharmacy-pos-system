#!/bin/bash
# ============================================================
#  PharmaPOS — Daily Database Backup
#  Dumps every Postgres database, compresses with gzip,
#  keeps the last 14 days, and logs the result.
#  Run via cron (see install instructions in deploy/README_BACKUP.md)
# ============================================================
set -u

BACKUP_DIR="/var/backups/pharmapos"
RETENTION_DAYS=14
LOG_FILE="/var/log/pharmapos-backup.log"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

log "=== Backup started ==="

if [ -f /opt/pharmapos/backend/.env ]; then
  set -a
  . /opt/pharmapos/backend/.env
  set +a
fi

PGUSER="${PGUSER:-pharmapos}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
export PGPASSWORD="${PGPASSWORD:-}"

DB_LIST=$(sudo -u postgres psql -tAc "SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres');" 2>>"$LOG_FILE")

if [ -z "$DB_LIST" ]; then
  log "ERROR: could not list databases. Aborting."
  exit 1
fi

FAIL=0
for DB in $DB_LIST; do
  OUT="$BACKUP_DIR/${DB}_${TIMESTAMP}.sql.gz"
  log "Dumping $DB -> $OUT"
  if sudo -u postgres pg_dump --no-owner --no-privileges --clean --if-exists "$DB" 2>>"$LOG_FILE" | gzip -9 > "$OUT"; then
    SIZE=$(du -h "$OUT" | cut -f1)
    log "  OK ($SIZE)"
  else
    log "  FAIL"
    rm -f "$OUT"
    FAIL=1
  fi
done

log "Pruning backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "*.sql.gz" -type f -mtime +$RETENTION_DAYS -print -delete | tee -a "$LOG_FILE"

TOTAL=$(du -sh "$BACKUP_DIR" | cut -f1)
COUNT=$(find "$BACKUP_DIR" -name "*.sql.gz" | wc -l)
log "Backup folder now holds $COUNT files ($TOTAL)"

if [ "$FAIL" -eq 0 ]; then
  log "=== Backup completed successfully ==="
  exit 0
else
  log "=== Backup completed WITH ERRORS ==="
  exit 1
fi

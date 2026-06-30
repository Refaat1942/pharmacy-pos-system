#!/bin/bash
# ============================================================
#  PharmaPOS — Full PostgreSQL backup (ETA pre-implementation)
#  Run on VPS BEFORE any ETA schema/code deployment.
#
#  Usage:
#    sudo bash /opt/pharmapos/deploy/eta-full-backup.sh
#
#  Output:
#    /var/backups/pharmapos/eta/<dbname>_full_<timestamp>.sql.gz
#    /var/backups/pharmapos/eta/backup_manifest_<timestamp>.txt
# ============================================================
set -u

BACKUP_ROOT="/var/backups/pharmapos/eta"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
MANIFEST="${BACKUP_ROOT}/backup_manifest_${TIMESTAMP}.txt"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$MANIFEST"; }

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"

log "=== ETA pre-implementation full backup started ==="
log "Host: $(hostname)"
log "User: $(whoami)"

if [ -f /etc/pharmapos.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/pharmapos.env
  set +a
  log "Loaded /etc/pharmapos.env"
elif [ -f /opt/pharmapos/backend/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /opt/pharmapos/backend/.env
  set +a
  log "Loaded /opt/pharmapos/backend/.env"
fi

PGUSER="${PGUSER:-pharmapos}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
export PGPASSWORD="${PGPASSWORD:-}"

log "PGHOST=$PGHOST PGPORT=$PGPORT PGUSER=$PGUSER"

if ! command -v pg_dump >/dev/null 2>&1; then
  log "ERROR: pg_dump not found. Install postgresql-client."
  exit 1
fi

# List all non-template databases
DB_LIST=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -tAc \
  "SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres');" 2>>"$MANIFEST") \
  || DB_LIST=$(sudo -u postgres psql -tAc \
  "SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres');" 2>>"$MANIFEST")

if [ -z "$DB_LIST" ]; then
  log "ERROR: could not list databases."
  exit 1
fi

FAIL=0
while IFS= read -r DB; do
  [ -z "$DB" ] && continue
  OUT="${BACKUP_ROOT}/${DB}_full_${TIMESTAMP}.sql.gz"
  log "Dumping database: $DB -> $OUT"
  if pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -Fc "$DB" 2>>"$MANIFEST" | gzip > "$OUT"; then
    SIZE=$(du -h "$OUT" | cut -f1)
    log "OK: $DB ($SIZE)"
  else
    log "FAIL: $DB"
    FAIL=1
  fi
done <<< "$DB_LIST"

# Also dump globals (roles, tablespaces) for complete restore
GLOBALS="${BACKUP_ROOT}/globals_${TIMESTAMP}.sql"
log "Dumping globals -> $GLOBALS"
pg_dumpall -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" --globals-only > "$GLOBALS" 2>>"$MANIFEST" \
  || sudo -u postgres pg_dumpall --globals-only > "$GLOBALS" 2>>"$MANIFEST" \
  || log "WARN: globals dump failed (non-fatal)"

log "Git commit at backup time:"
if [ -d /opt/pharmapos/.git ]; then
  git -C /opt/pharmapos rev-parse HEAD 2>>"$MANIFEST" | tee -a "$MANIFEST"
  git -C /opt/pharmapos branch --show-current 2>>"$MANIFEST" | tee -a "$MANIFEST"
fi

log "=== Backup finished (failures=$FAIL) ==="
log "Manifest: $MANIFEST"
echo ""
echo "Record these paths in docs/ETA_ROLLBACK.md before starting Phase 0."

exit "$FAIL"

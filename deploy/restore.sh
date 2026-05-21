#!/bin/bash
# ============================================================
#  PharmaPOS — Restore a single database from a backup file
#  Usage: sudo bash restore.sh <database_name> <backup_file.sql.gz>
#  Example: sudo bash restore.sh pharmacy /var/backups/pharmapos/pharmacy_20260521_030000.sql.gz
# ============================================================
set -e

if [ $# -ne 2 ]; then
  echo "Usage: $0 <database_name> <backup_file.sql.gz>"
  echo "Available backups:"
  ls -lh /var/backups/pharmapos/ 2>/dev/null || echo "  (none)"
  exit 1
fi

DB="$1"
FILE="$2"

if [ ! -f "$FILE" ]; then
  echo "ERROR: backup file not found: $FILE"
  exit 1
fi

echo "About to restore '$DB' from $FILE"
echo "This will OVERWRITE the current contents of '$DB'."
read -p "Type the database name again to confirm: " CONFIRM
if [ "$CONFIRM" != "$DB" ]; then
  echo "Aborted."
  exit 1
fi

echo "Stopping backend so nothing writes during restore..."
systemctl stop pharmapos || true

echo "Restoring..."
gunzip -c "$FILE" | sudo -u postgres psql "$DB"

echo "Restarting backend..."
systemctl start pharmapos

echo "Done. Verify the app is working before deleting any newer backups."

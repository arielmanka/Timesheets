#!/bin/bash
# =============================================================================
# MongoDB Backup Script
# Runs mongodump against the timesheets database and stores compressed backups.
# Intended to be run daily via cron or a scheduled container.
#
# Usage:  ./backup.sh
# Env:    MONGO_URI (default: mongodb://localhost:27017/timesheets)
#         BACKUP_DIR (default: ./backups)
#         RETENTION_DAYS (default: 30)
# =============================================================================

set -euo pipefail

MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/timesheets}"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/timesheets_$TIMESTAMP"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Iseconds)] Starting backup..."

mongodump \
  --uri="$MONGO_URI" \
  --out="$BACKUP_FILE" \
  --gzip

echo "[$(date -Iseconds)] Backup completed: $BACKUP_FILE"

# Rotate old backups
echo "[$(date -Iseconds)] Removing backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -maxdepth 1 -type d -name "timesheets_*" -mtime +"$RETENTION_DAYS" -exec rm -rf {} +

echo "[$(date -Iseconds)] Backup rotation complete."

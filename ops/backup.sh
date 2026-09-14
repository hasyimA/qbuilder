#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Quiz Builder — backup (database + media)
#
# Production target: PostgreSQL. Produces a gzipped SQL dump of the database
# and a tarball of the media directory, timestamped, and prunes backups older
# than BACKUP_RETENTION_DAYS.
#
# Prerequisites (must be installed on the server):
#   postgresql-client (pg_dump), tar, gzip
#
# Configuration — read from backend/.env (set at the bottom of the file):
#   DB_HOST, DB_PORT, DB_NAME, DB_USERNAME, DB_PASSWORD
#   BACKUP_DIR, BACKUP_RETENTION_DAYS, MEDIA_DIR
#   (all optional; sensible defaults below)
#
# Usage:
#   ops/backup.sh                 # run both dumps
#   ops/backup.sh --db-only       # skip media tarball
#   ops/backup.sh --media-only    # skip database dump
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/backend/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found" >&2
  exit 1
fi

# Load only the keys this script needs from backend/.env (secrets stay file-local).
read_env() { grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'"; }

DB_HOST="$(read_env DB_HOST)";         DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="$(read_env DB_PORT)";         DB_PORT="${DB_PORT:-5432}"
DB_NAME="$(read_env DB_DATABASE)";     DB_NAME="${DB_NAME:-quizbuilder}"
DB_USER="${DB_USERNAME:-$(read_env DB_USERNAME)}"; DB_USER="${DB_USER:-quizbuilder}"
DB_PASSWORD="${DB_PASSWORD:-$(read_env DB_PASSWORD)}"

BACKUP_DIR="$(read_env BACKUP_DIR)";   BACKUP_DIR="${BACKUP_DIR:-/srv/backups/quizbuilder}"
RETENTION_DAYS="$(read_env BACKUP_RETENTION_DAYS)"; RETENTION_DAYS="${RETENTION_DAYS:-14}"

MEDIA_DIR="$(read_env MEDIA_DIR)"
if [[ -z "$MEDIA_DIR" ]]; then MEDIA_DIR="$ROOT_DIR/backend/storage/app/public/media"; fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD  # clean inherited env

run_backup_db() {
  local dest="$BACKUP_DIR/db"
  mkdir -p "$dest"
  export PGPASSWORD="$DB_PASSWORD"
  echo "[backup] dumping database '$DB_NAME' -> $dest/quizbuilder-$TIMESTAMP.sql.gz"
  pg_dump --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
    --dbname="$DB_NAME" --format=plain --no-owner --no-privileges \
    | gzip > "$dest/quizbuilder-$TIMESTAMP.sql.gz"
  unset PGPASSWORD
}

run_backup_media() {
  if [[ ! -d "$MEDIA_DIR" ]]; then
    echo "[backup] media dir '$MEDIA_DIR' missing — skipping"; return 0
  fi
  local dest="$BACKUP_DIR/media"
  mkdir -p "$dest"
  echo "[backup] archiving '$MEDIA_DIR' -> $dest/media-$TIMESTAMP.tar.gz"
  tar -czf "$dest/media-$TIMESTAMP.tar.gz" -C "$(dirname "$MEDIA_DIR")" "$(basename "$MEDIA_DIR")"
}

prune_old() {
  local dir="$1" pattern="$2"
  [[ -d "$dir" ]] || return 0
  echo "[backup] pruning '$dir' older than $RETENTION_DAYS day(s)"
  find "$dir" -type f -name "$pattern" -mtime "+$RETENTION_DAYS" -delete
}

case "${1:-all}" in
  db)          run_backup_db ;;
  media)       run_backup_media ;;
  all)         run_backup_db; run_backup_media ;;
  *)           echo "usage: $0 [all|db|media]" >&2; exit 2 ;;
esac

prune_old "$BACKUP_DIR/db"    'quizbuilder-*.sql.gz'
prune_old "$BACKUP_DIR/media" 'media-*.tar.gz'

echo "[backup] done."
#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Quiz Builder — restore / restore-test (database)
#
# Restores a gzipped pg_dump into a target database. Includes a --test mode
# that restores into a throwaway database and drops it afterwards: the only
# reliable way to prove a backup actually works (untested backups are not
# reliable).
#
# Prerequisites: postgresql-client (psql), gzip.
#
# Configuration — read from backend/.env:
#   DB_HOST, DB_PORT, DB_NAME, DB_USERNAME, DB_PASSWORD
#
# Usage:
#   ops/restore.sh --test                            # prove the latest backup restores
#   ops/restore.sh --test BACKUP_FILE.sql.gz         # prove a specific backup restores
#   ops/restore.sh TARGET_DATABASE BACKUP_FILE.sql.gz  # restore into TARGET_DATABASE
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/backend/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found" >&2
  exit 1
fi

read_env() { grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'"; }

DB_HOST="$(read_env DB_HOST)";         DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="$(read_env DB_PORT)";         DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USERNAME:-$(read_env DB_USERNAME)}"; DB_USER="${DB_USER:-quizbuilder}"
DB_PASSWORD="${DB_PASSWORD:-$(read_env DB_PASSWORD)}"

BACKUP_DIR="$(read_env BACKUP_DIR)";   BACKUP_DIR="${BACKUP_DIR:-/srv/backups/quizbuilder}"

latest_dump() { ls -1t "$BACKUP_DIR"/db/quizbuilder-*.sql.gz 2>/dev/null | head -n1 || true; }

psql_run() { # psql -c "$sql" [dbname]
  local sql="$1" db="${2:-postgres}"
  PGPASSWORD="$DB_PASSWORD" psql --host="$DB_HOST" --port="$DB_PORT" \
    --username="$DB_USER" --dbname="$db" --set=ON_ERROR_STOP=1 --no-psqlrc -v -q -c "$sql"
}

restore_into() {
  local target="$1" file="$2"
  echo "[restore] dropping + recreating '$target'"
  psql_run "DROP DATABASE IF EXISTS $target (FORCE);"
  psql_run "CREATE DATABASE $target;"
  echo "[restore] applying $file -> $target"
  gzip -dc "$file" | PGPASSWORD="$DB_PASSWORD" psql --host="$DB_HOST" --port="$DB_PORT" \
    --username="$DB_USER" --dbname="$target" --set=ON_ERROR_STOP=1 --no-psqlrc -q
}

# --- argument parsing --------------------------------------------------------

if [[ "${1:-}" == "--test" ]]; then
  FILE="${2:-$(latest_dump)}"
  TEST_DB="quizbuilder__restoretest_$(date +%s)"
  if [[ -z "$FILE" || ! -f "$FILE" ]]; then
    echo "error: no backup file found (pass a path, or run ops/backup.sh first)" >&2
    exit 1
  fi
  restore_into "$TEST_DB" "$FILE"
  echo "[restore-test] verifying with a live query"
  psql_run "SELECT 1;" "$TEST_DB"
  psql_run "DROP DATABASE $TEST_DB (FORCE);"
  echo "[restore-test] OK — backup restores cleanly."
  exit 0
fi

if [[ $# -lt 2 ]]; then
  cat >&2 <<'EOF'
usage:
  ops/restore.sh --test [file]        restore-test a backup into a throwaway DB
  ops/restore.sh DB FILE.sql.gz        restore a backup into an existing target DB
EOF
  exit 2
fi

restore_into "$1" "$2"
echo "[restore] done."
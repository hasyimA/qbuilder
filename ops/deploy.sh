#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Quiz Builder — deploy (pull, build, migrate, restart)
#
# One-command release for the single-host layout described in DEPLOYMENT.md:
# pull the repository, install backend dependencies, run migrations, refresh
# Laravel caches, rebuild the Next.js frontend, repair runtime ownership, and
# restart services.
#
# Run this on the server from anywhere inside the repository.
#
# Prerequisites (installed on the server): git, composer, php, bun, sudo.
#
# Configuration — override any of these in the environment:
#   SERVICE_NAME          systemd unit for the Next.js server (quizbuilder-frontend)
#   PHP_SERVICE           PHP-FPM unit to reload after backend deploy (php8.5-fpm)
#   WEB_USER              user that owns runtime dirs (www-data)
#   BUN_BIN               path to the bun binary (bun, else ~/.bun/bin/bun)
#   NEXT_PUBLIC_API_URL   API base baked into the bundle at build time
#                         (falls back to frontend/.env.production, then .env.local)
#
# Usage:
#   ops/deploy.sh                 # full deploy
#   ops/deploy.sh --frontend-only # skip backend + migrations
#   ops/deploy.sh --backend-only  # skip the frontend build
#   ops/deploy.sh --no-pull       # deploy the current checkout as-is
#   ops/deploy.sh --no-migrate    # skip `migrate --force`
#   ops/deploy.sh --help
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
ENV_FILE="$BACKEND_DIR/.env"

SERVICE_NAME="${SERVICE_NAME:-quizbuilder-frontend}"
PHP_SERVICE="${PHP_SERVICE:-php8.5-fpm}"
WEB_USER="${WEB_USER:-www-data}"

DO_PULL=1
DO_BACKEND=1
DO_FRONTEND=1
DO_MIGRATE=1

for arg in "$@"; do
  case "$arg" in
    --no-pull)       DO_PULL=0 ;;
    --no-migrate)    DO_MIGRATE=0 ;;
    --frontend-only) DO_BACKEND=0; DO_MIGRATE=0 ;;
    --backend-only)  DO_FRONTEND=0 ;;
    --help|-h)       grep -E '^#( |$)' "$0" | cut -c3-; exit 0 ;;
    *) echo "error: unknown argument '$arg' (try --help)" >&2; exit 2 ;;
  esac
done

log() { printf '\n[deploy] %s\n' "$*"; }

run_root() {
  if [[ "$(id -u)" -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

read_env() { # read_env FILE KEY
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^${key}=" "$file" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
}

resolve_bun() {
  if [[ -n "${BUN_BIN:-}" ]]; then echo "$BUN_BIN"; return; fi
  if command -v bun >/dev/null 2>&1; then command -v bun; return; fi
  echo "$HOME/.bun/bin/bun"
}

resolve_api_url() {
  if [[ -n "${NEXT_PUBLIC_API_URL:-}" ]]; then echo "$NEXT_PUBLIC_API_URL"; return; fi
  local from_prod
  from_prod="$(read_env "$FRONTEND_DIR/.env.production" NEXT_PUBLIC_API_URL)"
  if [[ -n "$from_prod" ]]; then echo "$from_prod"; return; fi
  read_env "$FRONTEND_DIR/.env.local" NEXT_PUBLIC_API_URL
}

BUN_BIN="$(resolve_bun)"
PHP_BIN="${PHP_BIN:-php}"
COMPOSER_BIN="${COMPOSER_BIN:-composer}"

if [[ ! -d "$BACKEND_DIR" || ! -d "$FRONTEND_DIR" ]]; then
  echo "error: $ROOT_DIR does not look like the Quiz Builder repo" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found (copy backend/.env.example and configure it)" >&2
  exit 1
fi

if [[ "$DO_PULL" -eq 1 ]]; then
  log "pulling latest changes"
  git -C "$ROOT_DIR" pull --ff-only
fi

if [[ "$DO_BACKEND" -eq 1 ]]; then
  log "installing backend dependencies"
  (cd "$BACKEND_DIR" && "$COMPOSER_BIN" install --no-dev --optimize-autoloader --no-interaction)

  if [[ "$DO_MIGRATE" -eq 1 ]]; then
    log "running migrations"
    (cd "$BACKEND_DIR" && "$PHP_BIN" artisan migrate --force)
  fi

  log "caching config, routes, and views"
  (cd "$BACKEND_DIR" \
    && "$PHP_BIN" artisan config:cache \
    && "$PHP_BIN" artisan route:cache \
    && "$PHP_BIN" artisan view:cache)

  if [[ ! -L "$BACKEND_DIR/public/storage" ]]; then
    log "creating storage symlink"
    (cd "$BACKEND_DIR" && "$PHP_BIN" artisan storage:link)
  fi

  log "repairing backend ownership ($WEB_USER)"
  run_root chown -R "$WEB_USER":"$WEB_USER" \
    "$BACKEND_DIR/storage" "$BACKEND_DIR/bootstrap/cache"
fi

if [[ "$DO_FRONTEND" -eq 1 ]]; then
  API_URL="$(resolve_api_url)"
  if [[ -z "$API_URL" ]]; then
    echo "error: NEXT_PUBLIC_API_URL is not set (export it, or add it to frontend/.env.production)" >&2
    exit 1
  fi

  log "installing frontend dependencies"
  (cd "$FRONTEND_DIR" && "$BUN_BIN" install --frozen-lockfile)

  if [[ -e "$FRONTEND_DIR/.next" && ! -w "$FRONTEND_DIR/.next" ]]; then
    log "removing stale .next (not writable by $(id -un); needs elevated permissions)"
    run_root rm -rf "$FRONTEND_DIR/.next"
  fi

  log "building frontend (NEXT_PUBLIC_API_URL=$API_URL)"
  (cd "$FRONTEND_DIR" && NEXT_PUBLIC_API_URL="$API_URL" "$BUN_BIN" run build)

  log "repairing frontend ownership ($WEB_USER)"
  run_root chown -R "$WEB_USER":"$WEB_USER" "$FRONTEND_DIR/.next"
fi

log "restarting $SERVICE_NAME"
run_root systemctl restart "$SERVICE_NAME"

if [[ "$DO_BACKEND" -eq 1 ]]; then
  log "reloading $PHP_SERVICE (clears OPcache)"
  run_root systemctl reload "$PHP_SERVICE" || true
fi

log "waiting for $SERVICE_NAME"
sleep 2
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "error: $SERVICE_NAME is not active — check: journalctl -u $SERVICE_NAME -n 50" >&2
  exit 1
fi
echo "[deploy] $SERVICE_NAME is active"

if command -v curl >/dev/null 2>&1; then
  log "health check GET /api/health"
  curl -fsS http://127.0.0.1/api/health && echo
fi

log "done."

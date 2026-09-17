# Setup — Quiz Builder

Quick start for **development**, **staging** and **production**. For the full
production story (reverse proxy, HTTPS, rollback, checklist) see `DEPLOYMENT.md`.

## Architecture at a glance

```
frontend/  Next.js 16 + TypeScript + Tailwind  (port 3000, dev via vite)
backend/   Laravel 13 + PHP 8.5 + Sanctum      (port 8000, php artisan serve)
database   SQLite (dev/test) — PostgreSQL 14+  (staging/production)
```

Auth uses **Sanctum Bearer tokens**: the frontend logs in at `/api/login`,
receives a token, and sends it as `Authorization: Bearer <token>`. No cookies,
no CSRF surface. Tokens expire after `SANCTUM_TOKEN_TTL_MINUTES` (default
43200 = 30 days).

---

## 1. Development (local)

Prerequisites: PHP 8.3+ with `sqlite`/`pdo_sqlite`, Composer 2, Node 20+,
`bun` (or `npm`).

```bash
# Backend
cd backend
cp .env.example .env            # APP_ENV=local, DB_CONNECTION=sqlite (defaults fine)
php artisan key:generate
touch database/database.sqlite
php artisan migrate --seed       # seeds test@example.com and an admin account
php artisan storage:link         # for media uploads (dev)
php artisan serve                # http://localhost:8000

# Frontend (second terminal)
cd frontend
bun install
cp .env.example .env.local       # NEXT_PUBLIC_API_URL=http://localhost:8000
bun run dev                      # http://localhost:3000
```

Test user: `test@example.com` / `password` (created by `--seed`).

Admin: `--seed` creates `admin@example.com` / `password` in local/dev. Override
via `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD`; in production the admin
seeder is skipped unless `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set.

## 2. Staging

A production-like preview. Same procedure as production (`DEPLOYMENT.md`) but:

- `APP_ENV=staging`, `APP_DEBUG=true` (only if the host is non-public) or
  `false`.
- PostgreSQL, migrations on a dedicated staging DB.
- Use production schema/backups to keep parity: `ops/restore.sh --test` can
  restore a production dump into staging.

## 3. Production

Follow `DEPLOYMENT.md` end-to-end. Highlights:

- `APP_ENV=production`, `APP_DEBUG=false`.
- `DB_CONNECTION=pgsql` + a dedicated role/database (see §5).
- `FRONTEND_URLS` must equal the browser origin exactly (CORS, D35).
- Build the frontend with `NEXT_PUBLIC_API_URL=https://api.<domain>` — it is
  baked into the client bundle at build time and requires a rebuild to change.
- `php artisan migrate --force` (idempotent) and `db:seed --force` only if the
  demo dataset is wanted. The admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) is part of
  that seed — set both in the server environment or create the first admin
  manually.
- Backups via `ops/backup.sh all` + weekly `ops/restore.sh --test` (§12).

## 4. Environment files

| File | Where | Purpose |
|------|-------|---------|
| `backend/.env.example` | committed | documented template — copy to `.env`, fill in (incl. `ADMIN_*`) |
| `backend/.env` | never committed | real secrets (per environment) |
| `frontend/.env.example` | committed | template: `NEXT_PUBLIC_API_URL` |
| `frontend/.env.local` | never committed | dev override |
| `frontend/.env.production` | never committed | build-time API URL for `bun run build` |

## 5. Database migrations

```bash
php artisan migrate                # dev
php artisan migrate --force        # prod (idempotent, safe to repeat)
php artisan migrate:status         # inspect applied state
php artisan migrate:rollback       # revert last batch — DANGER on prod, see DEPLOYMENT.md §13
```

New migrations: `php artisan make:migration <name>` — follow the existing
naming convention (`2026_09_12_100000_add_filter_indexes_to_quizzes_and_questions.php`).

## 6. Running the test suite

```bash
# Backend (SQLite in-memory per test; no Redis/queue prerequisites)
cd backend
composer install
./vendor/bin/pint --test           # style gate
php artisan test                   # ~176 tests / ~500 assertions

# Frontend
cd frontend
bun install
bunx tsc --noEmit                  # types
bun run lint                       # eslint
bunx vitest run                    # ~276 tests / 28 files
```

`next build` is known to crash the toolchain in CI sandboxes (decision D9) —
run it on the deploy machine as the real build check.

## 7. Useful day-to-day commands

```bash
php artisan media:prune                 # list orphaned files in the media dir
php artisan media:prune --delete        # actually delete them (matches Media rows first!)
php artisan config:cache                # prod config freeze
php artisan route:cache                 # prod route freeze
php artisan storage:link                # recreate missing public/storage symlink
```

## 8. Troubleshooting

Start with `docs/troubleshooting.md` (login/CORS, upload, export, migration
issues, Laravel quirks, browser caching).
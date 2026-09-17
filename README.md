# Quiz Builder

Modern question authoring platform for creating Moodle-compatible quizzes.
Teachers build a question bank and quizzes (multiple choice, true/false,
short answer, essay) and export them to **Moodle XML** for import into a Moodle
course.

## Tech Stack

- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS (rich-text via TipTap)
- **Backend**: Laravel 13 + PHP 8.5 (Sanctum Bearer token auth)
- **Database**: SQLite (dev/test) / PostgreSQL 14+ (staging/production)
- **Exports**: Moodle XML — generated client-side, no server export endpoint

## Project Structure

```
quiz-builder/
├── frontend/       # Next.js application (src/lib/export → Moodle XML)
├── backend/        # Laravel API (routes/api.php, app/Services, app/Policies)
├── ops/            # Backup & restore scripts (backup.sh, restore.sh)
├── docs/           # setup, api, monitoring, troubleshooting, deploy, …
├── DEPLOYMENT.md   # Production deployment + release checklist
├── prd.md          # Product Requirements Document
└── README.md
```

## Quick start (development)

```bash
# Backend
cd backend
cp .env.example .env
php artisan key:generate
touch database/database.sqlite          # dev DB
php artisan migrate --seed              # seeds test user + admin account
php artisan storage:link                # media symlink (public/storage)
php artisan serve                       # http://localhost:8000

# Frontend (second terminal)
cd frontend
bun install
cp .env.example .env.local              # NEXT_PUBLIC_API_URL=http://localhost:8000
bun run dev                             # http://localhost:3000
```

Login with `test@example.com` / `password` (from the seeder). The seeder also
creates an admin (`admin@example.com` / `password` locally; override with
`ADMIN_NAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD`) for the `/admin/users` area.

## Environments

Three environments with strict separation — see `docs/setup.md`:

| Env | `APP_ENV` | DB | `.env` files |
|-----|-----------|----|--------------|
| development | `local` | SQLite | `backend/.env`, `frontend/.env.local` |
| staging | `staging` | PostgreSQL | per-host `.env` |
| production | `production` | PostgreSQL | per-host `.env`, secrets never committed |

Production notes: **secrets never live in the repo** — only `.env.example`
templates are committed. `NEXT_PUBLIC_API_URL` is **baked into the frontend at
build time** and requires a rebuild to change.

## Documentation

| Doc | Content |
|-----|---------|
| `DEPLOYMENT.md` | Production deploy, HTTPS, rollback, **release checklist** |
| `docs/setup.md` | Dev/staging/prod setup, environment files, DB, tests |
| `docs/api.md` | Complete REST reference (routes, payloads, rate limits, auth) |
| `docs/question-types.md` | The 4 question types + validation invariants |
| `docs/moodle-export.md` | Export pipeline, type mapping, import instructions |
| `docs/monitoring.md` | Logs, health checks, alert rules, runbook |
| `docs/troubleshooting.md` | Symptom → fix index |
| `prd.md` | Product Requirements Document |
| `docs/architecture/` | Architecture, content/domain models, **DECISIONS (D1–D4x)**, security, testing-strategy |

## Backups & restores

```bash
ops/backup.sh all                       # pg_dump + media tarball (+retention)
ops/restore.sh --test                   # proves the latest backup restores (required!)
ops/restore.sh <db> <backup.sql.gz>     # real restore
```

See `DEPLOYMENT.md` §12 and `docs/monitoring.md` §5.

## Tests & quality gates

```bash
# Backend
cd backend && ./vendor/bin/pint --test && php artisan test

# Frontend
cd frontend && bunx tsc --noEmit && bun run lint && bunx vitest run
```

> `next build` is known to crash the toolchain in CI sandboxes (decision D9);
> the deploy-time build is the real build gate.

## API Endpoints (summary)

Auth via `Authorization: Bearer <token>` (30-day expiry). See `docs/api.md`
for full details, payloads and per-user rate limits.

| Method | Endpoint | Auth | Mutates |
|--------|----------|------|---------|
| GET | `/api/health` | — | — |
| POST | `/api/register` · `/api/login` | — | throttled:login |
| POST | `/api/logout` | ✓ | ✓ |
| GET | `/api/user` | ✓ | |
| GET/POST | `/api/quizzes`, `/api/quizzes/filters/meta` | ✓ | POST |
| GET/PATCH/DELETE | `/api/quizzes/{quiz}` | ✓ | PATCH/DELETE |
| POST | `/api/quizzes/{quiz}/duplicate` | ✓ | ✓ |
| GET/POST | `/api/quizzes/{quiz}/questions`, …/order, …/duplicate, …/attach | ✓ | ✓ |
| DELETE | `/api/quizzes/{quiz}/questions/{question}` (detach) | ✓ | ✓ |
| GET/POST | `/api/questions`, `/api/questions/filters/meta` | ✓ | POST |
| GET/PATCH/DELETE | `/api/questions/{question}` | ✓ | ✓ |
| POST | `/api/questions/{question}/duplicate` | ✓ | ✓ |
| GET/POST/DELETE | `/api/media`, `/api/media/{media}` | ✓ | POST/DELETE (upload limit 30/min) |
| GET | `/api/admin/users`, `/api/admin/users/{user}` | admin | |
| PATCH | `/api/admin/users/{user}` | admin | ✓ |
| POST | `/api/admin/users/{user}/reset-password` · `.../revoke-tokens` | admin | ✓ |
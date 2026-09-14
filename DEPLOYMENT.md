# DEPLOYMENT — Quiz Builder (v1 Release)

Production deployment guide. Covers prerequisites, installation, configuration,
database, storage, build, HTTP serving, health checks, monitoring, backups and
rollback, plus the pre-release checklist.

- Stack: **Next.js 16** frontend + **Laravel 13** API + **PostgreSQL**.
- Auth: Laravel Sanctum **personal access tokens** (Bearer). No cookies, no CSRF surface.
- No queues and no scheduler are required — every job is executed synchronously
  inside the HTTP request (Moodle XML export runs in the browser). The queue
  sections below are therefore **N/A**; they are kept for when that changes.

---

## 1. Environments

Three environments are kept apart via `APP_ENV` and separate `.env` files.
Secrets **never** live in the repository — only `.env.example` files are
committed.

| Environment | `APP_ENV` | Database | `APP_DEBUG` | Purpose |
|-------------|-----------|----------|-------------|---------|
| development | `local` | SQLite | `true` | Local dev (`frontend` vite + `php artisan serve`) |
| staging     | `staging` | PostgreSQL | `true` (non-public) | Preview/acceptance against a prod-like server |
| production  | `production` | PostgreSQL | `false` | Real use |

Secrets management: start with the example files, fill real values on the
server, and store the resulting `.env` files outside the repo (or in a secret
manager / CI store of your choice). Rotate `APP_KEY` by regenerating it and
logging every user out (tokens are independent of `APP_KEY`; `APP_KEY` protects
sessions/cookies, which this app does not use for auth).

## 2. Prerequisites

Server requirements:

| Component | Version | Notes |
|-----------|---------|-------|
| OS | Ubuntu 22.04+ (Debian 12) | any LTS works |
| PHP | **8.3+** (8.5 recommended) | extensions: `pdo_pgsql`, `pgsql`, `mbstring`, `dom`, `fileinfo`, `intl`, `bcmath`, `gd` |
| Composer | 2.x | `composer install` |
| PostgreSQL | 14+ | production DB |
| Node.js | 20+ (with bun 1.x or npm) | Next.js build |
| Nginx or Caddy | any recent | reverse proxy + TLS |
| certbot (optional) | — | Let's Encrypt |

## 3. Installation

Use two directories: `/srv/quizbuilder/app` (the application) and
`/srv/quizbuilder/data` (persistent writes and backups).

```bash
# 1. Fetch the source (git tag = released version)
sudo mkdir -p /srv/quizbuilder/app /srv/quizbuilder/data
cd /srv/quizbuilder/app
git clone <repo-url> .        # or untar a release artifact
git checkout v1.0.0

# 2. Backend dependencies
cd backend
composer install --no-dev --optimize-autoloader --prefer-dist

# 3. Frontend dependencies + production build
cd ../frontend
bun install --frozen-lockfile
NEXT_PUBLIC_API_URL=https://api.yourdomain.com bun run build   # bakes the API URL into the bundle

# 4. Permissions for web user
cd ..
sudo chown -R www-data:www-data /srv/quizbuilder/app/backend/storage \
  /srv/quizbuilder/app/backend/bootstrap/cache
```

## 4. Environment configuration

```bash
cd backend
cp .env.example .env
php artisan key:generate      # APP_KEY (never commit)
```

Set at minimum (see `.env.example` for the full annotated list):

```ini
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.yourdomain.com
FRONTEND_URLS=https://app.yourdomain.com     # must match the browser origin exactly
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=quizbuilder
DB_USERNAME=quizbuilder
DB_PASSWORD=<strong-password>
LOG_CHANNEL=daily
LOG_LEVEL=error
FILESYSTEM_DISK=public
SANCTUM_TOKEN_TTL_MINUTES=43200      # 30 days, see D36
```

Frontend (`frontend/.env.local` on the build machine, or inline at build):

```ini
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

## 5. Database setup

```bash
sudo -u postgres psql
  CREATE ROLE quizbuilder LOGIN PASSWORD '...';
  CREATE DATABASE quizbuilder OWNER quizbuilder;
  \q

# verify connection + run migrations
cd backend
php artisan migrate --force          # idempotent; safe to re-run
php artisan db:seed --force          # OPTIONAL demo dataset (creates test@example.com / password)
```

Migrations are versioned and run inside transactions where the driver allows;
they are safe to run repeatedly. Indexes for the main filter paths are part of
the migration set (see `2026_09_12_100000_add_filter_indexes_*`).

### Testing migrations before a release

1. Restore the previous release's backup into a scratch database (or clone prod
   via `ops/restore.sh`).
2. `php artisan migrate --force` — it must apply cleanly (or roll back cleanly).
3. Run **both** smoke checks: `GET /api/health` and a signed-in teacher flow.

## 6. Storage setup

Media live on the Laravel **`public` disk**: `backend/storage/app/public/media/`,
served at `MEDIA_URL` via `/storage/media/...`.

| Item | Value |
|------|-------|
| Path | `backend/storage/app/public/media/` |
| Permissions | dirs `0755`, files `0644`, owner `www-data` |
| Persistent volume | bind-mount `/srv/quizbuilder/app/backend/storage/app/public` |
| URL | `https://api.yourdomain.com/storage/media/...` |
| Filenames | 32-char random + extension derived from sniffed MIME (D37) |
| Retention | files are deleted by the app on media delete (no TTL) |
| Cleanup | `php artisan media:prune` lists orphaned files, `--delete` removes them |

```bash
# create the public disk symlink
cd backend
php artisan storage:link          # creates public/storage -> ../storage/app/public

# always run after deploy/release if the link is missing (gitignored)
sudo -u www-data php artisan storage:link
```

## 7. Build

```bash
# Backend — no compile step; validate config + freeze the route cache
cd backend
composer install --no-dev --optimize-autoloader
php artisan config:cache && php artisan route:cache && php artisan view:cache

# Frontend
cd ../frontend
NEXT_PUBLIC_API_URL=https://api.yourdomain.com bun run build   # verifies types + lint + build

# Clear caches on rollback/rebuild if the app changes config often
cd ../backend && php artisan optimize:clear
```

## 8. Deployment / release

Recommended: **blue-green using two directories and a symlink**.

```
/srv/quizbuilder/releases/v1.0.0   # fresh build (untouched)
/srv/quizbuilder/app -> releases/v1.0.0
```

1. Build a new release in `releases/vX.Y.Z` (sections 3–7).
2. Point the `app` symlink to the new release.
3. Run `php artisan migrate --force` **before** switching traffic if possible,
   so old and new code tolerate the schema (additive-only migrations).
4. Switch the symlink; Nginx serves the new tree immediately on the next request.
5. Health check `GET /api/health` must return 200.

### Workers / queues

**N/A.** Nothing is queued in v1. If a queue is introduced (e.g. media
processing), add: `php artisan queue:work` under systemd and a `queue:restart`
step in the release procedure.

### Scheduler

**N/A.** Nothing is scheduled in v1. If a scheduler is introduced, add the
Laravel scheduler cron line and document the schedule below.

## 9. Reverse proxy + HTTPS (Nginx)

API host `api.yourdomain.com` and app host `app.yourdomain.com` may share one
server block or be separate Nginx sites. Minimum, correct config:

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    client_max_body_size 6m;          # media uploads up to 5MB + multipart overhead

    root /srv/quizbuilder/app/backend/public;
    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php8.5-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    # Never expose the framework internals directly
    location ~ /\.(?!well-known).* { deny all; }
}

server {
    listen 443 ssl http2;
    server_name app.yourdomain.com;
    root /srv/quizbuilder/app/frontend/.next/standalone;  # if using output:standalone
    # otherwise reverse-proxy to `next start`, e.g.:
    # location / { proxy_pass http://127.0.0.1:3000; ... }
}
```

- Enable HTTPS with **Let's Encrypt** (`certbot --nginx`).
- **HTTP→HTTPS** redirect: add a `server { listen 80; return 301 https://$host$request_uri; }` block.
- `APP_DEBUG=false` is mandatory in production to keep stack traces from leaking.

## 10. Health checks

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /health` | none | liveness + **database** probe (`{"status":"ok","database":"ok"}`) |
| `GET /up` | none | Laravel built-in stateless ping (returns `OK`) |

Example uptime config (UptimeRobot / Prometheus blackbox / systemd unit):

```
GET https://api.yourdomain.com/health
  expected: HTTP 200, body JSON status=ok
```

## 11. Monitoring & logging

See `docs/monitoring.md`. Minimum expected setup:

- **Error logs**: `backend/storage/logs/laravel-YYYY-MM-DD.log` (`LOG_CHANNEL=daily`).
- **Web access/error logs**: Nginx (`/var/log/nginx/access.log`, `error.log`).
- **Database errors**: PostgreSQL `postgresql.log`.
- **Storage errors**: filesystem writes logged by the app (`RuntimeException`
  in `MediaService`) — visible in the Laravel log.
- **Export failures**: exports run client-side; the browser console reports them.
  Server-side we only see what the client reported — a persistent check is to
  watch API 500s on `/api/media` and 4xx on the question/quiz writes.
- Optional: ship logs to Sentry/Loki; add `sentry` package only if the team
  commits to operating it.

## 12. Backups

Two independent backups, scripted in `ops/`:

| Backup | Tool | Script | Frequency (recommended) |
|--------|------|--------|--------------------------|
| Database | `pg_dump` (plain SQL, gzipped) | `ops/backup.sh db` | Nightly (every 24h) |
| Media | `tar.gz` of `storage/app/public/media` | `ops/backup.sh media` | Nightly |

```bash
# cron (as the app user)
0 2 * * * /srv/quizbuilder/app/ops/backup.sh all >> /var/log/quizbuilder-backup.log 2>&1

# restore-test — REQUIRED after every backup scheme change and weekly ideally
/srv/quizbuilder/app/ops/restore.sh --test
```

**Restore-test rule (hard requirement):** a backup has no value until
`ops/restore.sh --test` proves it can be applied to a clean database. The test
restores the newest dump into a throwaway database, runs `SELECT 1`, and drops
it. Put this on the **same cron line as the backup** if you can:

```
0 3 * * 0 /srv/quizbuilder/app/ops/restore.sh --test >> /var/log/quizbuilder-restore.log 2>&1
```

Retention: `BACKUP_RETENTION_DAYS` (default 14) prunes old files automatically.

> SQLite (development) note: backing up dev is just `cp database/database.sqlite
> backup.sqlite` — the Postgres scripts above are for staging/production.

## 13. Rollback

Because deploys are symlink swaps, rollback is instant and safe:

```bash
# 1. Point the symlink back to the previous healthy release
ln -sfn /srv/quizbuilder/releases/v1.0.0 /srv/quizbuilder/app

# 2. If the new release applied migrations, roll the schema back
cd /srv/quizbuilder/app/backend
php artisan migrate:rollback        # only for the LAST migration batch that broke things
# OR restore from the pre-release backup:
# /srv/quizbuilder/app/ops/restore.sh quizbuilder /srv/quizbuilder/backups/db/quizbuilder-<ts>.sql.gz

# 3. Restore media from the matching backup tarball if storage was affected
tar -xzf /srv/quizbuilder/backups/media/media-<ts>.tar.gz -C /srv/quizbuilder/app/backend/storage/app/public/

# 4. Verify GET /api/health + a teacher smoke test
```

Rollback must be exercised at least once against staging before the first
production release.

## 14. Release checklist (pre-production gate)

Before flipping to production, ALL of the following must be true:

- [ ] All automated tests pass: `backend: php artisan test` (Pint clean), `frontend: tsc`, `eslint`, `vitest`.
- [ ] Production build passes (`bun run build` with `NEXT_PUBLIC_API_URL` set).
- [ ] Migrations tested against a restored copy of the current production schema.
- [ ] A backup exists **and** `ops/restore.sh --test` passes.
- [ ] Rollback path rehearsed on staging (symlink swap + `migrate:rollback`).
- [ ] HTTPS active on both `app` and `api` hosts; HTTP redirects to HTTPS.
- [ ] `APP_DEBUG=false`.
- [ ] Authentication tested: register, login, logout, expired-token → 401.
- [ ] Authorization tested: user A cannot view/edit/delete user B's resources (returns 403).
- [ ] Upload tested: valid images (jpg/png/gif/webp ≤5MB), rejected non-images, rejected >5MB.
- [ ] Moodle XML export tested end-to-end against a real Moodle import (see `docs/moodle-export.md`).
- [ ] Browser tested: Chromium and Firefox on the teacher workflow (Safari/Edge best-effort).
- [ ] Critical bugs resolved; no open high-severity issues.
- [ ] Monitoring + logging verified (health endpoint green, logs reachable).
- [ ] Restore-the-backup drill recorded (who, when, result) — see §12.
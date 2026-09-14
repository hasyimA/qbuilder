# Monitoring — Quiz Builder (v1)

What to watch, where the logs live, and what an "unhealthy" indicator looks
like. Companion to `DEPLOYMENT.md` §11.

## 1. Health endpoints

| Endpoint | Auth | Behaviour |
|----------|------|-----------|
| `GET /up` | none | Laravel built-in stateless ping → `200 OK`. Liveness only; does **not** touch the database. |
| `GET /api/health` | none | **Liveness + DB probe.** 200 `{"status":"ok","database":"ok"}` when the DB answers; 503 `{"status":"degraded","database":"unreachable"}` when it does not. |

Point your uptime monitor at `https://api.<domain>/health`. Alerts:

- **200 expected** — any non-200 or `status != "ok"` for 2 consecutive checks.
- The `/up` route alone cannot detect a dead database — always alert on `/health`.

## 2. Logs

| Source | Location | Captures | Default level |
|--------|----------|----------|---------------|
| Laravel app | `backend/storage/logs/laravel-YYYY-MM-DD.log` (`LOG_CHANNEL=daily`) | exceptions, MediaService failures, auth failures, 5xx, queued-job failures (future) | `LOG_LEVEL=error` in prod |
| PHP-FPM | `/var/log/php*-fpm.log` | PHP errors/fatals not caught by the app | warning |
| Web server | `/var/log/nginx/access.log`, `/var/log/nginx/error.log` | HTTP codes, 4xx/5xx volume, upstream errors | — |
| PostgreSQL | `/var/log/postgresql/postgresql-*.log` | connection issues, lock waits, vacuum | — |

Laravel's built-in daily channel is sufficient for v1. Watch the error log for
these signatures:

- `RuntimeException` in `App\Services\MediaService` → storage write failure;
  check disk space and `storage/app/public` permissions/ownership.
- `AuthenticationException` spikes → client sending bad/expired tokens; check
  `SANCTUM_TOKEN_TTL_MINUTES` after desync clock issues (venues, sandbox).
- `ThrottleRequestsException` → rate-limit trips (D34). 10/min on login,
  30/min on upload, 120/min on mutations per user. Not necessarily an error —
  instrument to catch credential-stuffing/bursts.
- `QueryException` → schema/index problems; run `php artisan migrate:status`.

## 3. Business/UX signals (client-side)

Exports (Moodle XML) run entirely in the **browser** — a failed export logs in
the browser console, not the API. There is no server log for "user clicked
export". To detect export pain server-side, look for its effect:

- `GET /api/media` bursts when an export resolves many media files;
- 4xx/5xx on `/api/media` while users attempt exports.

If export analytics matter, add a client-side beacon (e.g. POST the export
result to an analytics endpoint) — out of scope for v1.

## 4. Database checks

- Connection pool / `FATAL: remaining connection slots` → raise max connections
  or reduce `pgbouncer` pool.
- Table bloat on `quiz_questions` (the join table) — run `VACUUM (ANALYZE)`
  weekly; `autovacuum` is on by default.
- Index health: the filter-path indexes added in
  `2026_09_12_100000_add_filter_indexes_to_quizzes_and_questions.php` should
  keep the dashboard filter queries on seq-scan-free plans; watch
  `pg_stat_user_indexes` for unused indexes.

## 5. Suggested alert rules (Prometheus/UptimeRobot/pager)

| Alert | Condition | Severity |
|-------|-----------|----------|
| API down | `/health` non-200 ×2 | critical |
| DB degraded | `/health` 503 | critical |
| 5xx rate | >1% of requests over 5 min | warning |
| Disk space | `< 10%` on `/srv/quizbuilder` and DB volume | critical |
| Backup freshness | youngest dump older than 26h | warning |
| Restore-test failure | `ops/restore.sh --test` exit ≠ 0 | critical |
| Login rate-limit trips | `ThrottleRequestsException` rising | warning |

## 6. Runbook summary

| Symptom | First action |
|---------|--------------|
| `/health` 503 | `pg_isready`; check `postgres.log`; check `DB_*` env are present in `backend/.env` |
| Upload 500s | disk space (`df -h`), `chown -R www-data storage`, `php artisan storage:link` |
| Mass 401s | `SANCTUM_TOKEN_TTL_MINUTES`/expiry; NTP skew between API and clients |
| Backup missing | check cron entry + `/var/log/quizbuilder-backup.log`; run `ops/backup.sh` manually |
| Stale files on `/storage/media/*` | `php artisan media:prune --delete` (dry-run first without `--delete`) |

## 7. Post-release monitoring window

After each release, for 48 hours:

- Scan `laravel-*.log` for new exception classes (compare against the previous
  baseline).
- Watch `access.log` for unexpected 404s (route changes) and 401/403 spikes.
- Confirm the backup cron ran and `ops/restore.sh --test` succeeded.
- Manually perform one export and one media upload on the production URL.
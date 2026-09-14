# Troubleshooting — Quiz Builder (v1)

Common problems by symptom. Each fix labels whether it is a **config**,
**app bug**, or **environment** issue, and where to look next.

## Login / auth

**"Login gagal / Unauthenticated"** right after logging in.
- Token not sent: the frontend must attach `Authorization: Bearer <token>` to
  every request — `frontend/src/lib/api.ts` does this automatically after
  `POST /api/login` stores the token.
- Token expired: `SANCTUM_TOKEN_TTL_MINUTES` (default 43200 = 30 days) counts
  from issue time. Reduce for stricter security, but remember the cost: the
  teacher must log in again.
- Clock skew: if the server clock jumps, token validity timestamps look wrong.
  Run NTP (`timedatectl`, `chronyd`).

**"Terlalu banyak permintaan" (429) on login.**
- The `login` rate-limit (10/min per email+IP, D34) tripped. Wait for
  `Retry-After`. Under attack? Harden further (fail2ban) rather than raising.

**CORS errors in the browser console** on every API call.
- `FRONTEND_URLS` in `backend/.env` must contain the **exact origin** shown in
  the address bar (scheme + host + port, e.g. `https://app.example.com`, no
  trailing slash). Wildcards are not accepted.
- Re-apply after `php artisan config:cache` or restart of `php artisan serve`.

## Quizzes / questions

**"404 Not Found" when opening a question or quiz.**
- Route-model binding uses UUIDs; ensure the frontend sends the full id.
- The resource may be another user's **and** non-shared — 404 vs 403: `show`
  on quizzes/questions returns 404 only for true misses; shares are read-only.

**"409 Conflict" on save.**
- Optimistic concurrency: you edited an older copy. The response carries the
  latest resource; reload and re-apply changes (expected UX, not a bug).

**"Cannot delete: used in N quiz(es)"**
- Detach the question from those quizzes first (`POST /api/quizzes/{q}/questions/{x}` delete = detach). Delete is only blocked while attached.

## Media / upload

**Upload fails: "file terlalu besar".**
- Hard cap is **5 MB** (`MAX_UPLOAD_BYTES` in `frontend/src/lib/api.ts`), and the
  frontend rejects before sending. The server also validates images. GIF/PNG/JPG/WebP only.
- PNG renamed to `.txt` is accepted but *renamed to PNG* by extension-from-MIME
  (D37); you won't be able to store a real non-image despite its extension.

**Uploads report success but `/storage/media/...` 404s.**
- Missing symlink: run `php artisan storage:link` (and re-run after deploys —
  `public/storage` is gitignored).
- Permission/ownership: `sudo chown -R www-data:www-data backend/storage backend/bootstrap/cache`.

**Storage is filling up but rows are gone.**
- Media rows and files delete together via the app, but crashed saves or manual
  DB edits can orphan files. `php artisan media:prune` lists orphans,
  `php artisan media:prune --delete` removes them (never destructive to rows).

## Moodle export

**"Soal mengandung gambar, tetapi penyedia media tidak tersedia" / unresolvable image.**
- The embedded image no longer exists in the library (deleted). Fix →
  replace/remove the image in the question, or re-upload it, then export again.

**Moodle import rejects the XML.**
- Ensure you exported with no validation errors (UI blocks export otherwise).
- Moodle ≥ 3.11. If your Moodle is older, upgrade or import through the question
  bank instead of the quiz directly.
- Image base64 can be large: keep the file under Moodle's upload limit
  (`maxbytes`); too-big files need raising `admin → security → HTTP security →
  maxbytes`/PHP `upload_max_filesize` + `post_max_size`.

## Migrations & backend

**`php artisan migrate` hangs or fails mid-way.**
- PostgreSQL: `SELECT * FROM pg_stat_activity;` — look for `cancelling`/locks;
  `migrate` is transactional per migration, so a failed batch is safe to re-run.
- Never hand-edit the `migrations` table.

**Endpoint returns 500, log shows `QueryException`.**
- Possible missing migration or schema drift. `php artisan migrate:status`;
  repair by running pending migrations, not by editing SQL.

**`composer install --no-dev` on the server fails on extension requirements.**
- Install PHP extensions: `php8.5-{pgsql,mbstring,dom,xml,intl,bcmath,gd,fileinfo}`.
  These are runtime-hard requirements because Laravel + this app rely on them.

**App suddenly logs users out / 401s across the board.**
- Likely `SANCTUM_TOKEN_TTL_MINUTES` changed, or tokens migrated. Tokens survive
  `APP_KEY` rotation (that affects only cookies/sessions, unused here); check
  `.env` diffs first.

## Frontend / build

**`bun run build` / `next build` crashes the toolchain.**
- Known sandbox limitation (decision D9): build on the deploy machine; CI uses
  `tsc --noEmit` + `eslint` + `vitest` as the gate. A true `next build` is part
  of the release checklist, not CI.

**API URL "not updating" after changing `NEXT_PUBLIC_API_URL`.**
- `NEXT_PUBLIC_*` vars are **inlined at build time**. Rebuild the frontend, and
  hard-refresh the browser (cache): `Ctrl/Cmd+Shift+R`.

**Stale UI / weird state after a deploy.**
- Token/state lives in the browser; after upgrading the API, refresh once. If a
  question shows a 409 loop, the stored `base_updated_at` is outdated on purpose.

## Backups & ops

**`ops/backup.sh` produces empty dumps.**
- Verify `DB_*` keys exist in `backend/.env` and are the values the app uses
  (`DB_DATABASE`, not `DB_NAME`). The script's defaults are dev-friendly
  (`quizbuilder`/`quizbuilder`).
- Run with `bash -x ops/backup.sh` to trace.

**`ops/restore.sh --test` fails.**
- The backup is broken — this is exactly what the test is for. Re-run
  `ops/backup.sh`, test again; never rotate out a backup schema change without a
  green restore test.

## Security notes (read before opening bugs)

- Rate limits (D34): login 10/min, uploads 30/min, other mutations 120/min per
  user. 429 is expected behaviour for auth/signup spam, not a config error.
- `APP_DEBUG` must be `false` on any non-local environment.
- Secrets live only in `.env` files (gitignored); keep backups of `.env`
  off-repo too (they contain `APP_KEY` + `DB_PASSWORD`).
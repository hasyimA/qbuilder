# API Reference — Quiz Builder (v1)

Source of truth: `backend/routes/api.php`. All endpoints (except health and
auth-in) require an `Authorization: Bearer <token>` header — tokens are issued
by `POST /api/login` and live `SANCTUM_TOKEN_TTL_MINUTES` (default 43200 = 30
days).

Base URL: `http://localhost:8000/api` (dev) / `https://api.<domain>/api` (prod).
Responses are JSON. Errors use Laravel's standard `422` (validation),
`401` (unauthenticated), `403` (forbidden), `404` (not found), `409`
(conflict), `429` (rate-limited), `500`.

## Rate limits (decision D34)

| Bucket | Limit | Scope | Applied to |
|--------|-------|-------|------------|
| `login` | 10 / min | per email + per IP | `POST /register`, `POST /login` |
| `mutations` | 120 / min | per user | all mutating endpoints |
| `upload` | 30 / min | per user | `POST /api/media` |

`429 Too Many Requests` includes `Retry-After`. Limits are disabled for the
`testing` environment.

---

## Health & auth

### GET /health
Public. Liveness + DB probe.

```json
200 {"status":"ok","service":"quiz-builder-api","database":"ok","timestamp":"..."}
503 {"status":"degraded","service":"quiz-builder-api","database":"unreachable","timestamp":"..."}
```
(Also exists: `GET /up` — Laravel built-in stateless ping, returns plain `OK`.)

### POST /register  *(throttle: login)*
```json
{"name":"...","email":"...","password":"...","password_confirmation":"..."}
```
→ `201` `{"data": {user}, "token": "<bearer>"}`

New accounts are created with `role: "user"`, `status: "active"`.

### POST /login  *(throttle: login)*
```json
{"email":"...","password":"..."}
```
→ `200` `{"data": {user}, "token": "<bearer>", "message": "..."}`

Returns `422 {"message":"This account has been suspended."}` for suspended
accounts (after the password check).

### POST /logout  *(mutations)*
Revokes the current token. → `200`

### GET /user  *(auth)*
Current user. → `200` `{"data": {user}}`

### GET /account  *(auth)*
Current user, for the self-service account page. Same `{user}` shape as
`GET /user`. → `200` `{"data": {user}}`

### PATCH /account/profile  *(mutations)*
```json
{"name": "Nama Baru"}
```
→ `200` `{"data": {user}, "message": "Profile updated successfully."}`

Only `name` may be changed. Sending `email`, `role`, `status`, or `password`
returns `422` — **email can only be changed by an administrator** (via
`PATCH /admin/users/{user}`).

### PATCH /account/password  *(mutations)*
```json
{"current_password":"...","password":"...","password_confirmation":"..."}
```
→ `200` `{"message": "Password updated successfully."}`

`current_password` must match the authenticated user's password and the new
password must be at least 8 characters and confirmed. On success every other
token is revoked; the token used for the request stays valid.

---

## Quizzes

### GET /quizzes  *(auth)*
Query params:

| Param | Values | Notes |
|-------|--------|-------|
| `tab` | `mine` (default) \| `shared` | shared = quizzes others shared with you |
| `search` | string | title match |
| `status` | `draft` \| `complete` | |
| `category` | string | |
| `tag` | string | tag name |
| `type` | string | filter by a question type present in the quiz |
| `min_questions` / `max_questions` | int | via the pivot join |
| `updated_from`/`updated_to` | ISO datetime | |
| `sort` | string | default `updated_at` |
| `sort_dir` | `asc` \| `desc` | |
| `per_page` | 1–100 (default 20) | |

→ `200` paginated `{"data": [QuizResource], "links":{...}, "meta":{...}}`

### GET /quizzes/filters/meta  *(auth)*
Filter-control options (categories, tags, question types). → `200` `{"data":{...}}`

### POST /quizzes  *(mutations)*
```json
{
  "title": "string|required",
  "description": "string",
  "subject": "string",
  "grade_level": "string",
  "category": "string",
  "status": "draft|complete",
  "visibility": "public|private|shared"
}
```
→ `201` `{"data": QuizResource, "message":"..."}`

### GET /quizzes/{quiz}  *(auth)*
Includes `questions_count`, `question_types`, `owner`, `tags`. → `200`

### PATCH /quizzes/{quiz}  *(mutations)*
Partial update of any scalar field above. → `200`

### DELETE /quizzes/{quiz}  *(mutations)*
Deletes the quiz (and its pivot rows). → `200`

### POST /quizzes/{quiz}/duplicate  *(mutations)*
Clones the quiz (new copy owned by requester; questions re-attached; tags
copied). → `201`

---

## Questions

### GET /questions  *(auth — bank)*
Query params (superset of quizzes): `search`, `status`, `type`, `category`,
`difficulty`, `tag`, `updated_from`, `updated_to`, `sort`
(`created_at|updated_at|status|type|default_mark`), `sort_dir`, `per_page`.
→ `200` paginated.

### GET /questions/filters/meta  *(auth)*
→ `200` `{"data":{...}}`

### POST /questions  *(mutations — bank store)*
```json
{
  "type": "multiple_choice|true_false|short_answer|essay|matching",
  "content": {"type":"doc","content":[...]},          // rich-text document (see docs/architecture/content-model.md)
  "default_mark": 1.0,
  "feedback_general": {doc}, "feedback_correct": {doc}, "feedback_incorrect": {doc},
  "category": "string",
  "difficulty": "string",
  "status": "draft|complete",
  "tags": ["tag1","tag2"],
  "options": [{ "content": {doc}, "is_correct": true, "fraction": 1, "feedback": {doc}, "match_answer": "string" }]
}
```
Type-specific validation: choice/true-false need ≥2 options and ≥1 correct;
every choice option needs visible text or a media-ish node (image/equation/
table) in its `content`; true_false exactly 2; `is_correct` OR `fraction>0`
marks correct; short_answer needs ≥1 non-empty accepted answer; matching needs
≥2 pairs, each with a non-empty statement (`content`) and `match_answer`
(≤ 2000 chars). → `201`

### GET /questions/{question}  *(auth)*
→ `200` `{"data": QuestionResource}` (includes `used_in_count`, `options`, `tags`).

### PATCH /questions/{question}  *(mutations)*
Same shape as store; sends full current resource + `base_updated_at` for
optimistic-concurrency. If the stored row is newer → `409`
`{"message":"This question has been modified...","data":<latest>}`.
→ `200`

### DELETE /questions/{question}  *(mutations)*
Refuses when used by quizzes (`409`). → `200`

### POST /questions/{question}/duplicate  *(mutations)*
Bank copy. → `201`

---

## Quiz ↔ question membership

### GET /quizzes/{quiz}/questions  *(auth)*
Ordered by `sort_order`. → `200` `{"data":[QuestionResource]}`

### POST /quizzes/{quiz}/questions  *(mutations)*
Create a question directly inside a quiz (same payload as bank store).
→ `201`

### PATCH /quizzes/{quiz}/questions/order  *(mutations)*
```json
{ "ordered_ids": [12, 45, 8] }
```
Setting a subset detaches the omitted questions. → `200`

### POST /quizzes/{quiz}/questions/{question}/duplicate  *(mutations)*
Copy a bank/shared question into the quiz. → `201`

### POST /quizzes/{quiz}/questions/{question}/attach  *(mutations)*
Attach an existing question; `422` when already attached. → `201`

### DELETE /quizzes/{quiz}/questions/{question}  *(mutations)*
Detach (does not delete the question from the bank). → `200` (or `404` if not
part of the quiz).

---

## Media

Upload constraints: `image` only (jpg/png/gif/webp), max **5 MB**
(`MAX_UPLOAD_BYTES` on the client; the server enforces via `UploadMediaRequest`
too). Files land at `storage/app/public/media/{32-char}.{ext}` — extension is
derived from the sniffed MIME (D37). Served at `/storage/media/...` after
`php artisan storage:link`.

### POST /media  *(mutations, throttle: upload)*
Multipart: `file` (required image), optional `alt_text`.
→ `201` `{"data": MediaResource, "message":"..."}`

`MediaResource`:
```json
{"id": 1, "filename": "logo.png", "mime_type": "image/png", "size": 4096,
 "url": "http://localhost:8000/storage/media/abc...def.png",
 "width": 800, "height": 600, "alt_text": "...", "created_at": "..."}
```

### GET /media/{media}  *(auth)*
Ownership-checked media metadata. → `200`

### DELETE /media/{media}  *(mutations)*
Authorize via ownership (must be the uploader). Removes DB row + file.
→ `200`

---

## Admin — user management

Requires an authenticated user with `role: "admin"` **and** `status: "active"`.
Every authenticated route runs the `active` middleware first, so a suspended
user gets `403 {"message":"Your account has been suspended."}`; a non-admin on
an admin route gets `403 {"message":"Administrator access required."}`. Login
rejects suspended accounts with `422 {"message":"This account has been suspended."}`.
The current user's `role` (`user|admin`) and `status` (`active|suspended`) are
included in every auth/user payload.

### GET /admin/users  *(auth, admin)*
Query params:

| Param | Values | Notes |
|-------|--------|-------|
| `search` | string | matches name or email |
| `role` | `user` \| `admin` | |
| `status` | `active` \| `suspended` | |
| `sort` | `name` \| `email` \| `created_at` \| `updated_at` | default `created_at` |
| `sort_dir` | `asc` \| `desc` | |
| `per_page` | 1–100 (default 20) | |

→ `200` paginated `{"data": [AdminUserResource], "links": {...}, "meta": {...}}`

`AdminUserResource` (list): `id`, `name`, `email`, `role`, `status`,
`quizzes_count`, `questions_count`, `media_count`, `created_at`, `updated_at`.

### POST /admin/users  *(mutations, admin)*
```json
{"name":"...","email":"...","password":"...","password_confirmation":"...","role":"user|admin","status":"active|suspended"}
```
`name` and `email` are required (`email` must be unique, `422` otherwise);
`role` defaults to `user` and `status` to `active`. Omit `password` to have a
strong temporary password generated (it is returned once and never stored in
plain text).

→ `201`
```json
{
  "data": AdminUserResource,
  "temporary_password": "…",
  "message": "User created successfully."
}
```
`temporary_password` is only present when the password was generated.

### POST /admin/users/import  *(mutations, admin)*
`multipart/form-data`: `file` (CSV, ≤ 2 MB, ≤ 500 data rows) and optional
`dry_run` (boolean, default `true`). Non-CSV uploads are rejected with `422`.

CSV header: `name,email,password,role,status` — `name` and `email` required per
row; `password` optional (generated when blank, minimum 8 characters when set);
`role` defaults to `user`, `status` to `active`. Invalid enum values, duplicate
emails inside the file, and emails already registered are reported per row.

→ `200`
```json
{
  "data": {
    "dry_run": true,
    "total_rows": 3,
    "valid_rows": 2,
    "error_rows": 1,
    "rows": [
      {"row": 2, "name": "…", "email": "…", "role": "user", "status": "active", "valid": true, "errors": []},
      {"row": 3, "name": "…", "email": "…", "role": null, "status": null, "valid": false, "errors": ["Role is invalid."]}
    ],
    "created": []
  },
  "message": "Import preview generated."
}
```
`dry_run=true` (the default) never writes. `dry_run=false` creates **all** rows
inside a transaction and only when `error_rows` is `0`; otherwise nothing is
written and `created` stays empty. On a real import, `created` lists
`{row,id,name,email,role,status}` plus `temporary_password` for rows that had no
password (shown once). Only CSV is supported today; XLSX is a follow-up.

### GET /admin/users/{user}  *(auth, admin)*
Adds `recent_quizzes` (latest 5: `id`, `title`, `status`, `updated_at`) and
`recent_questions` (latest 5: `id`, `type`, `status`, `excerpt`, `updated_at`).
→ `200`

### PATCH /admin/users/{user}  *(mutations, admin)*
```json
{"name":"...","email":"...","role":"user|admin","status":"active|suspended"}
```
All fields optional (`email` must be unique; `422` otherwise). Guards, all
`422`:
- cannot demote the **last remaining admin**;
- cannot suspend or demote **yourself**.

Suspending a user revokes **all** their tokens. → `200` `{"data": AdminUserResource}`

### POST /admin/users/{user}/reset-password  *(mutations, admin)*
```json
{"password":"...","password_confirmation":"..."}
```
Revokes the target's tokens; when resetting your own password the current
token is kept. → `200` `{"data": AdminUserResource}`

### POST /admin/users/{user}/revoke-tokens  *(mutations, admin)*
Revokes every token of the target. Revoking your own keeps the current session.
→ `200` `{"data":{"revoked_count":3}}`

---

## Authorization model

- Resource read/write is enforced by **gate policies** (`app/Policies/`),
  not controller if-checks:
  - `QuizPolicy`, `QuestionPolicy`, `MediaPolicy` — owner gets full control;
    the non-owner sees read-only or is rejected (`403`) for write.
  - "View" for sharing/duplicate paths deliberately permits read across the
    vault (`viewAny`-style scopes) so shared quizzes are usable — writes stay
    owner-only.
- Route-model binding uses UUIDs; responses never leak the owner's email on
  shared items (only `id`, `name`).

## Pagination / errors summary

- Pagination: Laravel paginator meta (`current_page`, `last_page`, `total`,
  links). Use `per_page` to control size.
- Validation failures: `422` with `{"message":"...","errors":{field:[msgs]}}`.
- Malformed bearer token or expiry: `401` `{"message":"Unauthenticated."}`.
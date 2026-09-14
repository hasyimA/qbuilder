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

### POST /login  *(throttle: login)*
```json
{"email":"...","password":"..."}
```
→ `200` `{"data": {user}, "token": "<bearer>", "message": "..."}`

### POST /logout  *(mutations)*
Revokes the current token. → `200`

### GET /user  *(auth)*
Current user. → `200` `{"data": {user}}`

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
  "type": "multiple_choice|true_false|short_answer|essay",
  "content": {"type":"doc","content":[...]},          // rich-text document (see docs/architecture/content-model.md)
  "default_mark": 1.0,
  "feedback_general": {doc}, "feedback_correct": {doc}, "feedback_incorrect": {doc},
  "category": "string",
  "difficulty": "string",
  "status": "draft|complete",
  "tags": ["tag1","tag2"],
  "options": [{ "content": {doc}, "is_correct": true, "fraction": 1, "feedback": {doc} }]
}
```
Type-specific validation: choice/true-false need ≥2 options and ≥1 correct;
true_false exactly 2; `is_correct` OR `fraction>0` marks correct; short_answer
needs ≥1 non-empty accepted answer. → `201`

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
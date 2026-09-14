# Security Architecture

## Overview

Security is a non-negotiable requirement. The system handles teacher-created educational content that will be deployed in school environments. Security must be built-in from the start, not bolted on later.

## Authentication

### Mechanism: Bearer Token (Sanctum API Token)

```
Client → POST /api/login → Server validates credentials
  → Issues Sanctum Personal Access Token
  → Client stores token in localStorage
  → Client sends token in Authorization header for subsequent requests
```

### Token Lifecycle

| Event | Action |
|-------|--------|
| Login | Create token, return to client |
| Register | Create token, return to client |
| API Request | Validate token via `auth:sanctum` middleware |
| Logout | Delete current access token |
| Token expired | Return 401, client redirects to login |

### Token Storage

- **Frontend**: `localStorage` (acceptable for SPA with bearer tokens)
- **Backend**: `personal_access_tokens` table
- **NOT using cookies** for API auth (stateless API)

### Password Policy

| Rule | Requirement |
|------|------------|
| Minimum length | 8 characters |
| Hashing | bcrypt (12 rounds) |
| Confirmation | Required on registration |

## Authorization

### Ownership-Based Authorization

Every resource operation must verify the requesting user owns the resource.

```
User A creates Quiz X
  → User A can read/update/delete Quiz X
  → User B CANNOT read/update/delete Quiz X (returns 403)
```

### Implementation: Policy Classes

```
app/Policies/
├── QuizPolicy.php
├── QuestionPolicy.php
├── QuestionOptionPolicy.php
└── MediaPolicy.php
```

### Policy Pattern

```php
class QuizPolicy
{
    public function view(User $user, Quiz $quiz): bool
    {
        return $user->id === $quiz->user_id;
    }

    public function update(User $user, Quiz $quiz): bool
    {
        return $user->id === $quiz->user_id;
    }

    public function delete(User $user, Quiz $quiz): bool
    {
        return $user->id === $quiz->user_id;
    }
}
```

### Usage in Controllers

```php
class QuizController extends Controller
{
    public function update(UpdateQuizRequest $request, Quiz $quiz): JsonResponse
    {
        $this->authorize('update', $quiz);
        // ... update logic
    }
}
```

### Question Authorization

Questions are more complex because they can belong to multiple quizzes. Authorization rules:

1. **Create**: User must own the quiz they're adding to
2. **Update**: User must own the question (original author)
3. **Delete**: User must own the quiz AND the question is in that quiz
4. **Duplicate**: User must own the source quiz

### Media Authorization

1. **Upload**: Any authenticated user can upload
2. **Read**: Owner only (private storage)
3. **Delete**: Owner only

## XSS Protection

### Backend HTML Sanitization

Content stored as JSON document model, but exported to HTML for Moodle. Sanitization occurs at export time and when rendering preview.

**Sanitize on**:
- Export to Moodle XML
- Preview rendering

**Allow**:
- `<b>`, `<i>`, `<u>`, `<s>` (formatting)
- `<p>`, `<br>` (structure)
- `<ul>`, `<ol>`, `<li>` (lists)
- `<table>`, `<tr>`, `<td>`, `<th>` (tables)
- `<a>` (links with validated href)
- `<img>` (images with validated src)

**Strip**:
- `<script>`, `<iframe>`, `<object>`, `<embed>`
- Event handlers (`onclick`, `onerror`, etc.)
- `javascript:` URLs
- `data:` URLs (except images that were uploaded)
- `<style>` tags
- All other non-whitelisted tags

### Frontend Sanitization

When pasting from Word/clipboard, incoming HTML is sanitized BEFORE inserting into the document model:

```
Clipboard HTML → Sanitizer → Normalizer → Document Model
```

### Sanitizer Module

```
frontend/src/lib/
└── sanitizer.ts        # Client-side HTML sanitization
backend/app/Services/
└── HtmlSanitizer.php   # Server-side HTML sanitization
```

## File Upload Security

### Allowed Types

| MIME Type | Extension | Max Size |
|-----------|-----------|----------|
| image/png | .png | 5MB |
| image/jpeg | .jpg, .jpeg | 5MB |
| image/webp | .webp | 5MB |

### Validation Layers

1. **Extension check**: Must be in allowed list
2. **MIME type check**: Check actual content type (not just client-provided)
3. **File signature validation**: Verify file magic bytes match MIME
4. **Image decode validation**: Attempt to decode as image to verify integrity
5. **Size limit**: Enforce maximum file size

### Implementation

```php
class UploadMediaRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'file' => [
                'required',
                'file',
                'max:5120',  // 5MB
                'mimes:png,jpg,jpeg,webp',
            ],
        ];
    }
}
```

### Storage Rules

- Files stored on the `public` disk under `storage/app/public/media/` (web-reachable via `/storage`).
- Filenames randomized (32-char random string) to prevent traversal and guessing.
- **Stored extension is derived from the sniffed MIME type** (`image/png → .png`, etc.), never from the client filename.
- DB display `filename` is `basename()` of the client name (path components stripped).
- Known trade-off, accepted for this phase: media are publicly fetchable if the random name is discovered. The privacy boundary is the JSON API + ownership policies. Signed-URL/private-storage is parked as a future improvement (DECISIONS D37.1).

### Dangerous File Prevention

- NEVER trust client-provided MIME type — validated via finfo sniffing (`image` + `mimes` rules) before any storage write.
- NEVER trust the client-supplied extension — the stored extension always mirrors the sniffed bytes.
- Strip EXIF data from images (privacy) — deferred, see Future Security Considerations.
- Reject files with executable content — covered by image+finfo validation.

## CSRF Protection

CSRF tokens are not needed for API routes using Bearer tokens. The `Authorization: Bearer` header is not automatically sent by browsers, so CSRF is not a concern.

For the Sanctum SPA cookie mode (if ever used): CSRF middleware is enabled via `EncryptCookies` and `ValidateCsrfToken` middleware.

## Rate Limiting

### Implementation

Named `RateLimiter` buckets are registered in `AppServiceProvider` and applied
as `throttle:` route middleware (`bootstrap/app.php` does not need changes).
Every bucket returns `Limit::none()` when the app is on the `testing` env so the
feature-test suite is unaffected by limit counters.

```php
RateLimiter::for('login', ...);      // email+IP
RateLimiter::for('upload', ...);     // user id
RateLimiter::for('mutations', ...);  // user id
```

### Limits

| Endpoint | Max Requests | Window | Key |
|----------|-------------|--------|-----|
| `POST /api/login`, `POST /api/register` | 10 | 1 min | lowercase email + IP |
| `POST /api/media` | 30 | 1 min | User ID (5/min anonymous) |
| All mutating `/api/...` (quizzes, questions, order, attach/detach, autosave, login/logout) | 120 | 1 min | User ID (10/min anonymous) |
| Read-only `/api/...` | unthrottled | - | - |

Mutating routes live in a dedicated `auth:sanctum` + `throttle:mutations` group;
reads are registered separately so the read/write split is auditable.

### Rate Limit Response

```json
{
  "message": "Too many attempts. Please try again later."
}
```

HTTP Status: `429 Too Many Requests`

## Input Validation

### Server-Side (Laravel)

All input validated via Form Request classes:

```php
class StoreQuizRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:10000',
            'subject' => 'nullable|string|max:255',
            'grade_level' => 'nullable|string|max:50',
            'category' => 'nullable|string|max:255',
        ];
    }
}
```

### Client-Side (Next.js)

Form validation for immediate feedback, but NEVER trust client-side validation alone.

```typescript
//前端: immediate feedback
if (title.length === 0) setError('Title is required');

// 后端: authoritative validation
$request->validate(['title' => 'required|string|max:255']);
```

## Content Validation

Question content (JSON document model) must be validated:

1. **Structure**: Must be a valid document with `type: "doc"`
2. **Node types**: Only allowed node types (paragraph, heading, image, equation, etc.)
3. **Media references**: Referenced mediaId must exist and belong to user
4. **Equation format**: LaTeX must be non-empty when equation node present
5. **Image dimensions**: Width/height must be positive integers

## Security Headers

### Laravel Response Headers

```php
// Already handled by Laravel middleware
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

### Content Security Policy (Future)

For production, add CSP headers to restrict script sources.

## Sensitive Data

### Never Log

- Passwords (hashed, but still avoid logging)
- API tokens
- User email addresses in plain text logs
- Question content (can contain exam material)

### Never Store in Plain Text

- Passwords (bcrypt)
- API tokens (hashed in DB)
- File system paths in URLs

## Database Security

### SQL Injection

Prevented by:
- Eloquent ORM parameterized queries
- Form Request validation
- No raw SQL with user input

### Migration Safety

- All migrations reviewed before deployment
- No destructive migrations without backups
- Soft deletes for recoverable data

## Future Security Considerations

| Feature | Security Implication | Phase |
|---------|---------------------|-------|
| Moodle API integration | OAuth2 token management | V2.0 |
| Multi-tenant | Organization-level isolation | Post-MVP |
| File sharing | Signed URL expiration | Library phase |
| Export history | Audit logging | Post-MVP |

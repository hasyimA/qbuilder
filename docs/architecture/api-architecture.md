# API Architecture

## Overview

REST API serving as the boundary between Next.js frontend and Laravel backend. All endpoints are under `/api/` prefix. Authentication via Bearer token (Sanctum).

## Conventions

### Base URL

```
http://localhost:8000/api
```

### Request Format

```
Content-Type: application/json
Accept: application/json
Authorization: Bearer {token}  (for authenticated requests)
```

### Response Format

**Success**:
```json
{
  "data": { ... },
  "message": "Resource created successfully."
}
```

**Success (list)**:
```json
{
  "data": [ ... ],
  "message": "Resources retrieved."
}
```

**Validation Error** (HTTP 422):
```json
{
  "message": "Validation failed.",
  "errors": {
    "field_name": ["Error message for this field."]
  }
}
```

**Authorization Error** (HTTP 403):
```json
{
  "message": "Unauthorized."
}
```

**Not Found** (HTTP 404):
```json
{
  "message": "Resource not found."
}
```

### HTTP Methods

| Method | Purpose | Idempotent |
|--------|---------|-----------|
| GET | Read resource | Yes |
| POST | Create resource | No |
| PATCH | Update resource (partial) | Yes |
| DELETE | Remove resource | Yes |

### Naming

- Plural nouns for collections: `/api/quizzes`, `/api/questions`
- Nested resources for ownership: `/api/quizzes/{quiz}/questions`
- Actions as sub-resources: `/api/questions/{question}/duplicate`
- No verbs in URLs

## Endpoint Map

### Authentication (Implemented)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/register` | No | Register new user |
| POST | `/api/login` | No | Login, get token |
| POST | `/api/logout` | Yes | Revoke token |
| GET | `/api/user` | Yes | Get current user |

### Quiz CRUD

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/quizzes` | Yes | List user's quizzes |
| POST | `/api/quizzes` | Yes | Create quiz |
| GET | `/api/quizzes/{quiz}` | Yes | Get quiz details |
| PATCH | `/api/quizzes/{quiz}` | Yes | Update quiz |
| DELETE | `/api/quizzes/{quiz}` | Yes | Delete quiz |

### Question CRUD

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/quizzes/{quiz}/questions` | Yes | List questions in quiz |
| POST | `/api/quizzes/{quiz}/questions` | Yes | Add question to quiz |
| GET | `/api/questions/{question}` | Yes | Get question details |
| PATCH | `/api/questions/{question}` | Yes | Update question |
| DELETE | `/api/questions/{question}` | Yes | Remove question from quiz |
| POST | `/api/questions/{question}/duplicate` | Yes | Duplicate question |
| PATCH | `/api/quizzes/{quiz}/questions/order` | Yes | Reorder questions |

### Answer Options

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/questions/{question}/options` | Yes | List options |
| POST | `/api/questions/{question}/options` | Yes | Add option |
| PATCH | `/api/options/{option}` | Yes | Update option |
| DELETE | `/api/options/{option}` | Yes | Delete option |

### Media

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/media` | Yes | Upload media |
| GET | `/api/media/{media}` | Yes | Get media metadata |
| DELETE | `/api/media/{media}` | Yes | Delete media |

### Export

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/quizzes/{quiz}/export/moodle` | Yes | Export Moodle XML |

### Library (Phase 9)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/library` | Yes | Browse shared quizzes |
| GET | `/api/library/search` | Yes | Search quizzes |
| POST | `/api/quizzes/{quiz}/clone` | Yes | Clone a quiz |

## Route Structure (Laravel)

```
routes/
├── api.php              # All API routes
├── web.php              # Minimal web routes (welcome page only)
└── console.php          # Artisan commands
```

### api.php Structure

```php
// Public routes
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    // Quizzes
    Route::apiResource('quizzes', QuizController::class);
    Route::patch('/quizzes/{quiz}/questions/order', QuestionOrderController::class);

    // Questions (nested under quiz for create, standalone for update)
    Route::apiResource('quizzes.questions', QuestionController::class);
    Route::apiResource('questions', QuestionController::class)->only(['show', 'update', 'destroy']);
    Route::post('/questions/{question}/duplicate', QuestionController::class . '@duplicate');

    // Options
    Route::apiResource('questions.options', QuestionOptionController::class);
    Route::apiResource('options', QuestionOptionController::class)->only(['update', 'destroy']);

    // Media
    Route::apiResource('media', MediaController::class)->only(['store', 'show', 'destroy']);

    // Export
    Route::post('/quizzes/{quiz}/export/moodle', ExportController::class . '@moodle');
});
```

## Controller Architecture

```
app/Http/Controllers/
├── Controller.php                    # Base class
└── Api/
    ├── AuthController.php            # Auth (implemented)
    ├── QuizController.php            # Quiz CRUD
    ├── QuestionController.php        # Question CRUD + duplicate
    ├── QuestionOrderController.php   # Reorder questions
    ├── QuestionOptionController.php  # Answer options
    ├── MediaController.php           # Upload/delete
    └── ExportController.php          # Moodle XML export
```

### Controller Pattern

Controllers are thin. Business logic lives in Service classes:

```php
class QuizController extends Controller
{
    public function store(StoreQuizRequest $request): JsonResponse
    {
        $quiz = $this->quizService->create($request->validated(), $request->user());

        return response()->json([
            'data' => QuizResource::make($quiz),
            'message' => 'Quiz created successfully.',
        ], 201);
    }
}
```

## Service Layer

```
app/Services/
├── QuizService.php
├── QuestionService.php
├── QuestionOptionService.php
├── MediaService.php
├── ClipboardParser.php           # Word/paste processing
└── Export/
    ├── MoodleXmlExporter.php      # Moodle XML generation
    └── MoodleXmlValidator.php     # Pre-export validation
```

### Service Pattern

```php
class QuizService
{
    public function create(array $data, User $user): Quiz
    {
        return Quiz::create([
            ...$data,
            'user_id' => $user->id,
            'status' => 'draft',
        ]);
    }

    public function reorder(int $quizId, array $order): void
    {
        foreach ($order as $index => $questionId) {
            QuizQuestion::where('quiz_id', $quizId)
                ->where('question_id', $questionId)
                ->update(['sort_order' => $index]);
        }
    }
}
```

## Resource Classes (API Transformation)

```
app/Http/Resources/
├── QuizResource.php
├── QuestionResource.php
├── QuestionOptionResource.php
└── MediaResource.php
```

Resource classes transform Eloquent models into API response shapes:

```php
class QuestionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'content' => $this->content,
            'default_mark' => $this->default_mark,
            'options' => QuestionOptionResource::collection($this->whenLoaded('options')),
            'status' => $this->status,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
```

## Request Validation

Validation uses Form Request classes:

```
app/Http/Requests/
├── StoreQuizRequest.php
├── UpdateQuizRequest.php
├── StoreQuestionRequest.php
├── UpdateQuestionRequest.php
├── StoreOptionRequest.php
├── UpdateOptionRequest.php
└── UploadMediaRequest.php
```

### Validation Pattern

```php
class StoreQuestionRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'type' => 'required|in:multiple_choice,true_false,short_answer,essay',
            'content' => 'required|array',
            'content.type' => 'required|in:doc',
            'default_mark' => 'required|numeric|min:0',
        ];
    }
}
```

## Error Handling

All errors follow a consistent format:

| HTTP Status | Meaning |
|-------------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthenticated |
| 403 | Unauthorized (forbidden) |
| 404 | Not Found |
| 422 | Validation Failed |
| 429 | Rate Limited |
| 500 | Server Error |

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/login` | 5 attempts | 1 minute |
| `/api/register` | 3 attempts | 1 minute |
| `/api/media` | 30 uploads | 1 minute |
| Other API | 60 requests | 1 minute |

## Pagination

List endpoints support cursor-based pagination:

```
GET /api/quizzes?page=1&per_page=20
```

Response:

```json
{
  "data": [...],
  "meta": {
    "current_page": 1,
    "last_page": 5,
    "per_page": 20,
    "total": 100
  }
}
```

For MVP, offset pagination is acceptable. Cursor pagination can be added for performance-critical endpoints (Library search).

## API Versioning

No versioning prefix for MVP. If breaking changes are needed later:

```
/api/v2/quizzes
```

Routes will be versioned in separate route files:

```
routes/
├── api.php
├── api_v2.php
```

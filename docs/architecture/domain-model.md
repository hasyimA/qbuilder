# Domain Model

## Domain Boundaries

The system is divided into 8 bounded contexts:

```
┌─────────────────────────────────────────────────────────┐
│                    AUTHENTICATION DOMAIN                 │
│  User registration, login, token management, profiles   │
└─────────────────────────┬───────────────────────────────┘
                          │ owns
┌─────────────────────────┼───────────────────────────────┐
│                    QUIZ DOMAIN                           │
│  Quiz CRUD, status, visibility, metadata, ordering      │
└────────┬────────────────┼───────────────────────────────┘
         │ contains
┌────────┴────────────────┼───────────────────────────────┐
│                QUESTION DOMAIN                           │
│  Question CRUD, types, content, scoring, feedback       │
└────────┬────────────────┼───────────────────────────────┘
         │ uses
┌────────┴────────────────┼───────────────────────────────┐
│            QUESTION TYPE DOMAIN                          │
│  Type definitions, schemas, validators, exporters       │
└─────────────────────────┼───────────────────────────────┘
                          │ references
┌─────────────────────────┼───────────────────────────────┐
│                  MEDIA DOMAIN                            │
│  Upload, storage, metadata, authorization               │
└─────────────────────────┼───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│                CLIPBOARD DOMAIN                          │
│  Paste parsing, Word normalization, bulk options        │
└─────────────────────────┼───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│                 EXPORT DOMAIN                            │
│  Moodle XML generation, validation, download            │
└─────────────────────────┼───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│                LIBRARY DOMAIN                            │
│  Quiz browsing, search, filter, clone, sharing          │
└─────────────────────────────────────────────────────────┘
```

## Entity Relationship

```
┌───────────┐
│   User    │
└─────┬─────┘
      │ 1:N
      ▼
┌───────────┐     ┌──────────────┐     ┌───────────┐
│   Quiz    │────▶│ QuizQuestion │◀────│ Question  │
└───────────┘  N:1└──────────────┘1:N  └─────┬─────┘
      │                                      │ 1:N
      │                                      ▼
      │                               ┌───────────────┐
      │                               │QuestionOption │
      │                               └───────────────┘
      │
      │ 1:N (via content references)
      ▼
┌───────────┐     ┌───────────┐
│   Media   │     │    Tag    │
└───────────┘     └───────────┘
```

## Entities

### User

Existing entity. Do not modify core structure.

| Field | Type | Notes |
|-------|------|-------|
| id | bigint (PK) | Auto-increment |
| name | string | |
| email | string (unique) | |
| email_verified_at | datetime (nullable) | |
| password | string | Hashed |
| remember_token | string (nullable) | |
| created_at | timestamp | |
| updated_at | timestamp | |

**Relationships**: hasMany(Quiz), hasMany(Media)

---

### Quiz

The primary container for a set of questions.

| Field | Type | Notes |
|-------|------|-------|
| id | bigint (PK) | Auto-increment |
| user_id | bigint (FK → users) | Owner |
| title | string(255) | Required |
| description | text (nullable) | Rich text (structured model) |
| subject | string(255) (nullable) | e.g., "Network System" |
| grade_level | string(50) (nullable) | e.g., "XI" |
| category | string(255) (nullable) | Quiz category |
| status | enum | draft, published, archived |
| visibility | enum | private, school, public |
| created_at | timestamp | |
| updated_at | timestamp | |

**Relationships**: belongsTo(User), belongsToMany(Question) via QuizQuestion

**Status Flow**:
```
draft → published → archived
```

**Visibility**:
```
private  → only owner
school   → owner's organization (future)
public   → anyone
```

---

### QuizQuestion

Pivot table connecting Quiz to Question with ordering.

| Field | Type | Notes |
|-------|------|-------|
| id | bigint (PK) | Auto-increment |
| quiz_id | bigint (FK → quizzes) | |
| question_id | bigint (FK → questions) | |
| sort_order | integer | Position in quiz (0-indexed) |

**Unique constraint**: (quiz_id, question_id)

**Purpose**: Enables one question to belong to multiple quizzes (future Question Bank). Sort order is per-quiz.

---

### Question

A single question that can belong to multiple quizzes.

| Field | Type | Notes |
|-------|------|-------|
| id | bigint (PK) | Auto-increment |
| user_id | bigint (FK → users) | Original author |
| type | enum | multiple_choice, true_false, short_answer, essay |
| content | json | Structured document model (see Content Model) |
| default_mark | decimal(6,2) | Default score value |
| feedback_general | json (nullable) | Structured document model |
| feedback_correct | json (nullable) | Structured document model |
| feedback_incorrect | json (nullable) | Structured document model |
| category | string(255) (nullable) | Question category |
| difficulty | enum (nullable) | easy, medium, hard |
| status | enum | draft, complete |
| created_at | timestamp | |
| updated_at | timestamp | |

**Relationships**: belongsTo(User), belongsToMany(Quiz) via QuizQuestion, hasMany(QuestionOption)

**Status Logic**:
- `draft`: Created but not fully validated
- `complete`: Passes minimum validation (has content, has required options)

---

### QuestionOption

Answer options for Multiple Choice questions. True/False is modeled as a special MC with 2 options.

| Field | Type | Notes |
|-------|------|-------|
| id | bigint (PK) | Auto-increment |
| question_id | bigint (FK → questions) | |
| content | json | Structured document model |
| is_correct | boolean | Whether this is the correct answer |
| fraction | decimal(5,2) | Score fraction (0.00 to 100.00) |
| feedback | json (nullable) | Per-option feedback |
| sort_order | integer | Display order (0-indexed) |
| created_at | timestamp | |
| updated_at | timestamp | |

**Notes**:
- Multiple Choice: One option has `is_correct=true`, others `fraction=0`
- Multiple Choice Complex: Multiple options can be correct with positive/negative fractions
- True/False: Two options (True/False), one marked correct

---

### Media

Files uploaded by users (images, potentially equations as images).

| Field | Type | Notes |
|-------|------|-------|
| id | bigint (PK) | Auto-increment |
| user_id | bigint (FK → users) | Owner |
| filename | string(255) | Original filename |
| mime_type | string(100) | image/png, image/jpeg, image/webp |
| size | unsigned bigint | File size in bytes |
| storage_path | string(500) | Path in storage disk |
| width | unsigned integer (nullable) | Image width in pixels |
| height | unsigned integer (nullable) | Image height in pixels |
| alt_text | string(255) (nullable) | Accessibility text |
| created_at | timestamp | |

**Relationships**: belongsTo(User)

**Storage Rules**:
- Development: `storage/app/public/media/{user_id}/{filename}`
- Production: S3 path `media/{user_id}/{uuid}.{ext}`
- NEVER store base64 in database

---

### Tag

Simple tagging system for quizzes and questions.

| Field | Type | Notes |
|-------|------|-------|
| id | bigint (PK) | Auto-increment |
| name | string(100) | Unique |
| slug | string(100) | URL-safe, unique |
| created_at | timestamp | |

**Relationships**: belongsToMany(Quiz), belongsToMany(Question)

---

### QuestionCategory

Categorization for questions.

| Field | Type | Notes |
|-------|------|-------|
| id | bigint (PK) | Auto-increment |
| name | string(255) | |
| slug | string(255) | URL-safe, unique |
| parent_id | bigint (FK → question_categories, nullable) | Self-referential hierarchy |
| created_at | timestamp | |
| updated_at | timestamp | |

---

## Future Entities (NOT MVP)

| Entity | Purpose | Phase |
|--------|---------|-------|
| QuestionVersion | Version history for questions | Post-MVP |
| QuizVersion | Version history for quizzes | Post-MVP |
| MoodleConnection | Direct Moodle API integration | V2.0 |
| Export | Export history tracking | Post-MVP |
| Review | Question review workflow | Post-MVP |
| Organization | Multi-tenant school support | Post-MVP |

## Domain Rules

1. **Quiz ownership**: Only the quiz owner can edit/delete a quiz.
2. **Question independence**: Questions are not tied to a specific quiz. They exist independently and are linked via QuizQuestion.
3. **Media ownership**: Media is owned by the user who uploaded it. Other users cannot access private media.
4. **Soft delete**: Use soft deletes for Questions and Quizzes to support versioning later.
5. **Sort order**: QuizQuestion.sort_order is per-quiz, not global. Reordering affects only the current quiz.
6. **Cascade rules**: Deleting a quiz removes QuizQuestion pivots but NOT the questions themselves. Deleting a question removes its QuestionOptions.

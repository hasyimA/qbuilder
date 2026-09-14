# System Architecture

## Overview

Quiz Builder is a web-based question authoring platform that produces Moodle-compatible quiz packages. The system follows a decoupled frontend-backend architecture with a REST API boundary.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                    CLIENT BROWSER                    │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │           Next.js SPA (Port 3000)             │   │
│  │                                               │   │
│  │  ┌─────────┐  ┌──────────┐  ┌────────────┐  │   │
│  │  │  Pages   │  │Components│  │  Features   │  │   │
│  │  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │   │
│  │       │              │              │          │   │
│  │  ┌────┴──────────────┴──────────────┴──────┐  │   │
│  │  │         Services / API Client            │  │   │
│  │  └──────────────────┬──────────────────────┘  │   │
│  └─────────────────────┼─────────────────────────┘   │
│                        │                              │
│                   HTTP/REST                           │
│                  Bearer Token                         │
│                        │                              │
└────────────────────────┼──────────────────────────────┘
                         │
┌────────────────────────┼──────────────────────────────┐
│                   API SERVER                           │
│                   (Port 8000)                          │
│                                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │              Laravel 13 Application              │  │
│  │                                                  │  │
│  │  ┌──────────┐  ┌───────────┐  ┌──────────────┐ │  │
│  │  │  Routes   │  │Middleware │  │ Controllers  │ │  │
│  │  └────┬─────┘  └─────┬─────┘  └──────┬───────┘ │  │
│  │       │              │                │         │  │
│  │  ┌────┴──────────────┴────────────────┴───────┐ │  │
│  │  │              Services Layer                 │ │  │
│  │  │  ┌────────────┐ ┌──────────┐ ┌──────────┐  │ │  │
│  │  │  │  Question   │ │  Media   │ │  Export   │  │ │  │
│  │  │  │  Service    │ │  Service │ │  Service  │  │ │  │
│  │  │  └────────────┘ └──────────┘ └──────────┘  │ │  │
│  │  └──────────────────┬──────────────────────────┘ │  │
│  │                     │                            │  │
│  │  ┌─────────────────┴──────────────────────────┐ │  │
│  │  │            Eloquent Models                  │ │  │
│  │  │  User, Quiz, Question, QuestionOption,     │ │  │
│  │  │  QuizQuestion, Media, Tag                   │ │  │
│  │  └─────────────────────┬──────────────────────┘ │  │
│  └────────────────────────┼────────────────────────┘  │
│                           │                            │
│  ┌────────────────────────┼────────────────────────┐  │
│  │              DATA LAYER                         │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │  │
│  │  │ SQLite   │  │  Redis   │  │  File Storage │  │  │
│  │  │ (dev)    │  │  (cache) │  │  (media)      │  │  │
│  │  └──────────┘  └──────────┘  └──────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend | Next.js | 16.x | App Router, SSR/SSG, API routes |
| Frontend | React | 19.x | UI rendering |
| Frontend | TypeScript | 5.x | Type safety |
| Frontend | Tailwind CSS | 4.x | Styling |
| Frontend | Tiptap | 3.x | Rich text editor (Phase 4) |
| Frontend | Bun | 1.3.x | Package manager |
| Backend | Laravel | 13.x | API framework |
| Backend | PHP | 8.5.x | Runtime |
| Backend | Sanctum | 4.x | API token auth |
| Database | SQLite | 3.x | Development |
| Database | PostgreSQL | 16+ | Production |
| Cache | Redis | 7+ | Session, queue, cache (production) |
| Storage | Local filesystem | - | Development media storage |
| Storage | S3-compatible | - | Production media storage |

## Request Flow

### Authentication Request

```
Browser → POST /api/login → Laravel Router → AuthController@login
  → Validates credentials → Issues Sanctum token → Returns {user, token}
Browser → Stores token in localStorage
```

### Authenticated API Request

```
Browser → API Request + Authorization: Bearer {token}
  → Laravel Router → Sanctum middleware → Validates token
  → Controller action → Service layer → Model → Database
  → JSON response → Browser → React state update → UI re-render
```

### Data Flow for Quiz Builder

```
User creates quiz → POST /api/quizzes → Quiz created in DB
  → User redirected to Quiz Builder → GET /api/quizzes/{id}/questions
  → User adds question → Modal opens → User fills editor
  → User saves → POST /api/quizzes/{quiz}/questions → Question saved
  → Modal closes/resets → Question list updated via API response
  → User reorders → PATCH /api/quizzes/{quiz}/questions/order
  → User exports → POST /api/quizzes/{quiz}/export/moodle
  → Server generates XML → File download response
```

## Architectural Principles

1. **Frontend is a SPA**: No full-page reloads. All navigation client-side via Next.js App Router.
2. **Backend is stateless API**: No session-based auth for API. Bearer tokens only.
3. **Content model is canonical**: Structured JSON document model in DB, NOT raw HTML. Different renderers for editor, preview, and export.
4. **Moodle is an export target**: Database schema is NOT shaped by Moodle XML. Internal model is independent.
5. **Question types are extensible**: Plugin-like architecture where adding a type requires no changes to core Quiz Builder code.
6. **Media is separate entity**: Images stored as files with metadata in DB. Never base64 in content.
7. **Parser is separate module**: Clipboard/Word parsing logic is NOT in UI components. Standalone testable module.

## Environment Configuration

### Development

| Service | URL | Notes |
|---------|-----|-------|
| Frontend | http://localhost:3000 | `bun run dev` |
| Backend | http://localhost:8000 | `php artisan serve` |
| Database | SQLite | `backend/database/database.sqlite` |
| Cache | Database driver | Default Laravel |

### Production (Target)

| Service | URL | Notes |
|---------|-----|-------|
| Frontend | https://app.quizbuilder.id | Vercel/Cloudflare |
| Backend | https://api.quizbuilder.id | VPS/Forge |
| Database | PostgreSQL | Managed or self-hosted |
| Cache | Redis | Managed or self-hosted |
| Storage | S3/MinIO | Media files |
| Queue | Redis | Background jobs |

## Deployment Architecture

```
┌─────────────────────────────────────────┐
│              CDN / Reverse Proxy         │
│              (Nginx / Cloudflare)        │
└────────┬──────────────┬─────────────────┘
         │              │
    ┌────┴────┐    ┌────┴────┐
    │ Frontend│    │ Backend │
    │ (Vercel)│    │ (VPS)   │
    └─────────┘    └────┬────┘
                        │
              ┌─────────┼─────────┐
              │         │         │
         ┌────┴──┐ ┌───┴───┐ ┌───┴────┐
         │Postgres│ │ Redis │ │  S3    │
         └───────┘ └───────┘ └────────┘
```

## Future Considerations (NOT MVP)

- **Moodle Direct Integration**: Moodle API connector after XML export is stable.
- **Multi-tenant**: Organization model for school-level deployment.
- **AI Question Generation**: Separate AI service, never inline in editor.
- **Real-time Collaboration**: WebSocket layer if needed.
- **Question Bank**: Cross-quiz question sharing with copy/reference modes.

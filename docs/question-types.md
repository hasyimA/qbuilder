# Question Types — Quiz Builder (v1)

Four question types are supported natively and map 1:1 to Moodle XML question
types on export. A question is defined by its **type**, a **rich-text
`content` document**, optional **feedback** documents, **options** (type
dependent), plus metadata (`category`, `difficulty`, `status`, `tags`).

Rich-text documents use a TipTap/ProseMirror JSON shape
(`{"type":"doc","content":[...]}`) with Mark maps to Moodle's HTML via
`doc-to-html.ts`. See `docs/architecture/content-model.md` for the document
spec, and `docs/moodle-export.md` for how each type serializes to Moodle.

## Type matrix

| Type | Moodle export type | Options required | Rules |
|------|--------------------|------------------|-------|
| `multiple_choice` | `multichoice` | ≥ 2 options, ≥ 1 correct | single-answer MCQ (radio) |
| `true_false` | `truefalse` | exactly 2 options | one `true`, one `false` |
| `short_answer` | `shortanswer` | ≥ 1 non-empty accepted answer | case-sensitive by default |
| `essay` | `essay` | none | free text; feedback-only |

## Per-type details

### multiple_choice
- Options carry `content` (document), correctness via `is_correct: true` **or**
  `fraction > 0` (fraction −100…100).
- Each option supports optional per-option `feedback`.
- Export: one `<multichoice>` with `<single><true/></single>`, correct
  `fraction="1"`, distractors `fraction="0"`.

### true_false
- Exactly two options; the correct one gets `is_correct true`.
- Export: `<truefalse>` with `<answer fraction="100">true|false</answer>`; the
  correct label wins.

### short_answer
- Accepted answers are options (≥1 with text); multiple accepted answers are
  allowed (validator requires ≥1).
- Export: each accepted answer becomes an `<answer>`; mark is split evenly
  across answers; answers are case-sensitive.

### essay
- No options. Rich text question; general/correct/incorrect feedback exported
  as the essay grader template.
- Export: `<essay>` — question HTML, feedback as `<graderinfo>`.

## Shared metadata

| Field | Allowed values | Purpose |
|-------|----------------|---------|
| `content` | document | the question text |
| `default_mark` | 0 → 9999.99 | default marks (Moodle `defaultgrade`) |
| `feedback_general/_correct/_incorrect` | document | export → `general/correct/incorrect feedback` |
| `category` | string ≤255 | Moodle category mapping |
| `difficulty` | string ≤20 | free tag (easy/medium/hard) — informational |
| `status` | `draft` | `complete` | UI lifecycle; only `complete` is quiz-ready |
| `tags` | string[] | bank filtering + Moodle tags |

## Validation invariants (enforced backend-side)

1. `content` must canonicalize to a valid doc.
2. Choice/false types: ≥ 2 options **and** ≥ 1 correct.
3. `true_false`: exactly 2 options.
4. `short_answer`: ≥ 1 accepted answer with visible text.
5. Option `content` documents must canonicalize.
6. Delete is refused (`409`) while a question is attached to ≥1 quiz — detach
   first.
# Moodle Export — Quiz Builder (v1)

The export pipeline produces a **Moodle XML** file the teacher downloads and
imports into Moodle (**Site administration → Course → Question bank / Quiz →
Import**). It runs entirely **client-side** in the browser: the quiz + question
data is already in the frontend from the API, so no export endpoint exists on
the server (see `docs/monitoring.md` §3 re: export failures being browser-only).

## Pipeline

```
quiz + questions (API state)
  └─ validateQuizForExport()           Indonesian error messages, all issues collected
       └─ resolveAllMedia()            fetch each embedded image; build MediaMap manifest
            └─ renderQuestion()         per-type Moodle XML renderer (escaping + HTML)
                 └─ exportMoodleXml()   assemble <quiz> … </quiz> (plus category block)
                      └─ download       <slug>-moodle.xml
```

Code: `frontend/src/lib/export/` — `index.ts` (facade), `moodle/moodle-xml-exporter.ts`
(assembly), `moodle/renderers/*` (one per type), `moodle/doc-to-html.ts`
(rich-text doc → safe HTML), `moodle/validation.ts`, `moodle/media.ts`
(API media resolution), `moodle/xml-escape.ts`.

## What gets exported

| Quiz/Question data | In XML |
|--------------------|--------|
| Quiz `category` | `<question type="category">` under `$course$/<category>` (skipped if empty) |
| Question `content` (rich text) | `<questiontext><text>` as HTML |
| Question `name` | auto-generated `«quiz-title» – Soal N` (unique) |
| `default_mark` | `<defaultgrade>` (must be > 0 to export) |
| `feedback_general/_correct/_incorrect` | respective `<general/correct/incorrect feedback>` |
| Options + `is_correct`/`fraction` | `<answer>` with `fraction` |
| Images inside documents | `<file name="…" encoding="base64">` per image, in the manifest |
| Tags / difficulty | not mapped (Moodle tags unsupported in import) |

## Type → Moodle mapping (`renderers/`)

| App type | Renderer file | Moodle behaviour |
|----------|---------------|------------------|
| `multiple_choice` | `multichoice.ts` | `<multichoice><single><true/></single>`; correct answer `fraction="1"`, distractors `fraction="0"` |
| `true_false` | `truefalse.ts` | `<truefalse>`; the option text that reads `true`/`false` marks the `<answer>`; exactly 1 correct |
| `short_answer` | `shortanswer.ts` | one `<answer>` per accepted option; mark split evenly; case-sensitive |
| `essay` | `essay.ts` | `<essay>`; feedback as grader template |
| `matching` | `matching.ts` | `<matching>`; one `<subquestion format="html">` per pair (statement `<text>` + `<answer><text>`), `shuffleanswers` true |

## Pre-export validation (fails fast, lists ALL issues)

Messages are Indonesian so teachers can act immediately. Blocking conditions:

- no title, or no questions;
- empty question text or content-structure issues (unsupported nodes/marks);
- `default_mark` non-positive;
- multiple choice: < 2 options, any option without text/image, or no correct answer;
- true/false: missing literal `True`/`False` option, or ≠ 1 correct;
- short answer: no non-empty accepted answer;
- matching: < 2 pairs, or any pair missing a statement or an answer;
- embedded images that cannot be resolved (`media-unresolvable`), e.g. the
  image was deleted from the media library;
- unknown question type.

Validation errors are thrown as `ExportValidationErrorList`; the UI renders the
list inline above the export button. None of the XML is produced until every
issue is resolved.

## Images / media in the export

- Images embedded in question/feedback/option documents are exported as base64
  `<file>` entries inside the owning element `<text>` (`<questiontext>`,
  `<answer>`, `<subquestion>`, feedback blocks) — Moodle then stores them in its
  own file system, so no external URLs are needed.
- Duplicate filenames across media get disambiguated (`<mediaId>-<filename>`).
- `resolveMediaFromApi` (`moodle/media.ts`) fetches `GET /api/media/{id}` for
  the binary + metadata. A failed fetch generates an exported error rather than
  a silently broken XML.

## Importing into Moodle

1. **Moodle 3.11+** recommended (validated against the Moodle XML schemas).
2. Course → **Question bank** or **Quiz** → **Import** → format **Moodle XML**.
3. Upload the downloaded `.xml`. Expect the category block to place questions
   under the quiz's category if one was set, otherwise under the course default.
4. Check per-question: Moodle may warn on duplicates only by question `name`;
   names are forced unique by the exporter.

## Filename

`moodleExportFilename(quizTitle)` → `«slugified-title»-moodle.xml` (e.g.
`remedial-fisika-kelas-x-moodle.xml`).

## Testing

`frontend/src/lib/export/**/*.test.ts` cover: validation (all rule branches),
doc→HTML safety (`isSafeHref` allowlist + KaTeX passthrough), XML escaping,
per-type rendering, filename slugging, media manifest + name collisions, and
round-trip import into a minimal Moodle XML parser fixture. Run with
`bunx vitest run`.
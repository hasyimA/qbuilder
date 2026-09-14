# Architecture Decision Record

Significant technical decisions made while building the Quiz Builder, including
trade-offs and known deviations. Each entry records context, the decision, and
the consequence.

---

## D1. Content model: ProseMirror/Tiptap JSON documents

**Status:** Accepted

**Context:** Question prompts need rich text (formatting, lists, links, tables,
images, equations) that round-trips losslessly between the Next.js editor and
the Laravel API, and eventually must export cleanly to Moodle.

**Decision:** The content of a question (and its options' content) is stored as a
ProseMirror/Tiptap JSON document (`{ "type": "doc", "content": [...] }`). The
model column is `text` and the API transmits raw JSON objects. The frontend
serializes the live editor state into this JSON; the backend canonicalizes and
validates it before persisting.

**Consequences:**
- Whitespace inside text nodes is significant and must survive transport. This
  forced an exception in Laravel's `TrimStrings` middleware (`D7`).
- Canonical form renames the mark `strike` -> `strikethrough` on both sides; see
  `content-model.md`.
- Options and feedback are single-line plain text; only the question prompt uses
  the rich editor (see `D2`).

## D2. Scope: rich editor applies to the question prompt only

**Status:** Accepted

**Context:** Full formatting everywhere quadruples editor, validation, and API
surface for Phase 5.

**Decision:** The Tiptap editor is used for `question.content` only. Options and
feedback remain plain-text inputs, serialized to a simple paragraph document via
`textToDoc`. Validation keeps the same document shape for all fields so the
scheme can be extended later without a breaking change.

**Consequences:** Smaller test surface; a future phase can lift options/feedback
to the rich editor by reusing the same document pipeline.

## D3. Editor dependency: Tiptap v3 (React)

**Status:** Accepted

**Context:** Need a maintained ProseMirror wrapper with extensions for links,
tables, images, code, placeholders, and undo/redo, plus custom React node views
for images and KaTeX equations.

**Decision:** Use `@tiptap/react` v3 and its extension suite (`starter-kit`,
`placeholder`, `link`, `table`, `image`, custom `image-node`/`equation-node`).
`katex` for equation rendering, `sanitize-html` for Word/Slack paste cleaning.

**Consequences:**
- Tiptap v3 has no default export on `@tiptap/extension-table`; import `Table`
  via its named exports.
- Custom React node views must render `<NodeViewWrapper>` (v3 requirement);
  omitting it raises "Please use the NodeViewWrapper component".
- `immediatelyRender: false` is required in Next.js (SSR) to avoid hydration
  mismatches.

## D4. Sanitization model: two independent allowlist canonicalizers

**Status:** Accepted

**Context:** Documents arrive from the browser (Tiptap), from existing tests, and
from future importers. The server must never trust client output.

**Decision:** The frontend (`src/lib/sanitizer.ts` + canonicalize in
`src/lib/document.ts`) and the backend (`App\Services\DocumentValidator`) each
implement the same allowlist canonicalizer: keep only known node types/marks,
map `strike` -> `strikethrough`, drop unknown nodes/marks, drop text inside
unknown nodes, drop `image` without a `mediaId` and `equation` without `latex`,
reject unsafe `href` schemes (`javascript:`, `data:`), drop attrs like
`class`/`style`, normalize tables, and impose depth/text length limits.

**Consequences:**
- Defense in depth: the client previews sanitized output, the server enforces it
  as the source of truth.
- The two implementations must stay in sync; the backend unit test suite
  (`DocumentValidatorTest`) mirrors the frontend cases in `sanitizer.test.ts`
  and `document.test.ts`.

## D5. API safety: duplicates of POST /api/quizzes

**Status:** Accepted

**Context:** Both `POST /api/quizzes` and `POST /api/quizzes/{id}/questions` can
create a question; initial API contract duplicated create/update flows rather
than reusing `QuestionService` in a shared route.

**Decision:** Keep both endpoints for cross-compatibility, but funnel both
through the same `App\Services\QuestionService` methods so behavior (including
canonicalization) cannot diverge.

**Consequences:** Verified by feature tests exercising both routes against the
same expectations.

## D6. Do not override `FormRequest::validated()`

**Status:** Accepted (negative decision)

**Context:** Nested rich-text documents arrive under array keys (`content`,
`options.*.content`, `feedback_*`). On a request with only array-level rules,
`Validator::validated()` collapses nested array keys without wildcard rules,
silently dropping the document children. Attempting to override `validated()`
on the FormRequest crashed PHP with "Fatal error: Premature end of PHP process".

**Decision:** Never override `validated()`. Each request validator exposes a
plain `normalizeDocuments(array $validated)` method that re-reads raw input
(`$this->input(...)`) and canonicalizes the documents; the controller calls it
with the collapsed `validated()` result.

**Consequences:** Validation errors still attach under the wildcard keys
(`options.0.content`) with custom messages while normalized payloads retain full
document structure.

## D7. Laravel `TrimStrings` exception for document fields

**Status:** Accepted

**Context:** `Illuminate\Foundation\Http\Middleware\TrimStrings` trims every
incoming string (including JSON bodies) against dotted attribute keys. Text
nodes like `"Safe text "` silently lost their trailing spaces, corrupting
canonical content and failing round-trip tests.

**Decision:** In `bootstrap/app.php`, register
`trimStrings(except: [...])` listing the document-bearing attribute keys
(`content`, `content.*`, `feedback_general`, `feedback_correct`,
`feedback_incorrect`, `options.*.content`, `options.*.feedback`). Note the
except list matches dotted *attribute keys*, not request paths, so `'api/*'` is
ineffective.

**Consequences:** Any future string field intended to keep whitespace must be
added to this list explicitly.

## D8. Backend gates: Pint + PHPUnit (no PHPStan/Rector out of box)

**Status:** Accepted

**Context:** A strict, reproducible quality gate for the Laravel side.

**Decision:** `./vendor/bin/pint --test` must pass (and `pint` applied on
violations) and `php artisan test` must be green before a phase is reported.
Laravel's default test stack (PHPUnit) is used; no PHPStan/Rector added.

**Consequences:** Style and behavior are machine-checked; the only remaining
verification is manual `artisan serve` smoke testing.

## D9. Known deviations and toolchain constraints

**Status:** Accepted

- **Bun `next build` segfault.** `bun run build` compiles successfully but Bun's
  server runtime crashes with a segmentation fault during build finalization
  (Bun bug 1.3.14, unrelated to project code). Gates therefore use
  `bunx tsc --noEmit` + `bun run lint` + `bun run test`, plus an actual
  `bun run build` recorded as "compiled successfully".
- **`laravel/boost` not installed.** Packagist was unreachable during Phase 4;
  the composer requirement was dropped rather than risk a broken dependency.
- **PHP GD not installed.** Media/image tests feed base64-encoded 1x1 PNG
  fixtures via `UploadedFile` instead of relying on GD to synthesize images.
- **Vitest jsdom quirks handled explicitly:** `globals: false` means RTL
  auto-cleanup does not run, so tests call `cleanup()` in `afterEach`;
  `jsdom` lacks `Range`, `scrollIntoView`, and `ResizeObserver`, so
  `src/test-setup.ts` polyfills them.

## D10. Model shape: media separated from document text

**Status:** Accepted

**Context:** Images rendered inside rich-text documents must be served and can
be reused across questions.

**Decision:** An image inside a document is the `image` node holding only
`mediaId`; the media resource (URL, mime, hash) lives in `media` storage. The
editor resolves preview URLs through `resolveMediaUrl`, and the API uploads via
a media endpoint returning the `mediaId` to embed. Documents never carry raw
data URLs.

**Consequences:** Addressed in the media/upload contract; an `image` node without
a valid `mediaId` is dropped by both canonicalizers.

## D11. Phase 6 — ClipboardParser owns all paste parsing

**Status:** Accepted

**Context:** Prior to Phase 6 the editor handled pastes inline. Word's HTML
clipboard is verbose (conditional comments, XML settings, VML, `o:`/`w:`/`m:`
namespaces) and hard to extract reliably from a UI component.

**Decision:** All clipboard parsing lives in `src/lib/clipboard/` behind a
single `ClipboardParser` facade (`src/lib/clipboard/index.ts`) exposing
`detectFormat`, `parseHTML`, `parsePlainText`, `parseOptions`, `parseQuestions`,
`extractImages`, `normalizeWordHTML` and `sanitizeHTML`. The editor only calls
`detectFormat`/`parseHTML`, and `QuestionEditor` calls `parseOptions`. UI code
never re-implements a parsing rule.

**Consequences:** A future feature (bulk question paste, custom importers) can
reuse the same pipeline untouched. The full paste pipeline is async because
embedded images are uploaded before insertion.

## D12. Phase 6 — Word paste pipeline: normalize → images → sanitize

**Status:** Accepted

**Context:** Paste must preserve paragraphs, lists, tables, formatting, images
and equations from Word, then still refuse XSS. Ordering matters: sanitizing
first would destroy data-URI images and OMML math before they could be handled.

**Decision:** The pipeline is strictly ordered:
  1. `normalizeWordHtml` (Word detection, comment/VML/xml trimming, `<o:p>`
     normalization, OMML→LaTeX via `D13`);
  2. `processImagesInHtml` — data-URI and http(s) images are uploaded through
     `media.upload` and rewritten to `<img data-media-id="…">`, failures become
     a visible `[image: alt]` marker (never silent loss);
  3. `sanitizeHtml` allowlists `data-media-id`, `data-width`, `data-height` on
     `img` and `data-equation` on `span`, and drops any image without a media
     reference.

**Consequences:** The sanitizer's image rules changed: standalone `<img src>`
without `data-media-id` is removed (it cannot be stored by the model), and
only numbers survive for width/height/`data-*` attributes. `image`/`equation`
node `parseHTML` uses `getAttrs` so transferred HTML (paste output) maps through
Tiptap with numeric `mediaId`/`width`/`height` and a `latex` format.

## D13. Phase 6 — OMML → LaTeX with a conservative in-house converter

**Status:** Accepted (no suitable npm dependency exists)

**Context:** Word equations arrive as OMML (`m:oMath`). `omml2latex` does not
exist on npm (404); the remaining candidates are unmaintained converters that
would have needed an OMML→MathML hop we could not verify.

**Decision:** Implement a small OMML→LaTeX converter (`src/lib/clipboard/omml.ts`)
covering the common school-level subset: runs, fractions, roots, super/sub/pre-
scripts, delimiters, n-ary operators (sum/product/integral), accents, bars,
group chars, function templates and equation arrays. Every converted result is
gated by `isRenderableLatex` (KaTeX `throwOnError`). Unsupported constructs make
the whole equation unconvertible, which the Word normalizer turns into a visible
`[equation: …]` fallback — the converter never emits partially-corrupt LaTeX.

**Consequences:** Behavior is deterministic and unit-tested; converting exotic
OMML is intentionally refused rather than guessed; the equation remains
renderable or visibly exposed.

## D14. Phase 6 — Bulk option parsing confidence rules

**Status:** Accepted

**Context:** Teachers paste option lists like `A. Router`, `B) Switch`, `(C)
Hub`, or `1. …`. Over-aggressive parsing would misfire on ordinary paragraphs.

**Decision:** `parseOptions` accepts one-letter (`A-H`, case-insensitive) or
numeric labels with `( )`, `.` or `)` separators, but only when: there are at
least two matching lines, the labels form a single consecutive sequence (letters
starting at `A`; numbers starting at `1`), and the separator is followed by
whitespace (so `A.Router` and `1.5` are rejected). Non-matching lines between
entries fold into the previous option. `parseQuestions` reuses the same rules
for a future bulk-paste feature and stays null unless sequence consistency
holds. The `OptionBulkPaste` component surfaces "No option pattern detected"
rather than mutating data.

**Consequences:** The example from the spec (`A. Router` … `D. Access Point`)
converts in one click; prose is left untouched.

## D15. Phase 6 — MediaService MIME whitelist at the service layer

**Status:** Accepted

**Context:** `UploadMediaRequest` validates MIME at the HTTP boundary, but the
paste pipeline and future bulk importers depend on `MediaService::upload` being
safe on its own.

**Decision:** `MediaService` enforces its own allowlist (`image/jpeg`,
`image/png`, `image/gif`, `image/webp`) and throws `RuntimeException` for any
other MIME before storing; filesystem width/height extraction stays GD-free
(`getimagesize`, base64 PNG fixtures in tests).

**Consequences:** Service-level reuse cannot bypass validation; covered by
`MediaServiceTest` (rejects text/plain, unique filenames, metadata recorded).

## D16. Phase 7 — Autosave engine decouples scheduling from status

**Status:** Accepted

**Context:** Early versions of `use-autosave` used a single timer for both
debounce and retry and re-armed on status commits. Two defects surfaced in real
time: a late `pending` microtask commit restarted the debounce timer (duplicate
PATCHes after a save/conflict), and retries owned by the effect died when React
bailed out on consecutive `failed` states.

**Decision:** Final engine uses two independent timers. Arming happens **once on
dirty-entry** (`prevDirtyRef`), never on status changes; retries are owned by
`run()` itself (`armRetry`, up to `maxRetries`, 409 stops, 422 → soft pending);
timer-fired runs are gated on `latest.current.isDirty`; a trailing re-arm inside
`run()` handles edits made while a save was in flight. `saveNow()` always
forces. Temporal coupling to status is removed entirely.

**Consequences:** One plant — one debounce; no saved/conflict/pending commit can
re-trigger a save. Hard failures auto-retry up to 5× at 5 s; network outages the
editor re-opens from a localStorage draft.

## D17. Phase 7 — Dirty detection keys output, not instance

**Status:** Accepted

**Context:** `isDirty` was memoized on `[form, initialSnapshot]`, but autosave
mutates `initialSnapshot.current` (a ref) in place, which the memo cache cannot
see — `isDirty` stayed stuck `true`, producing an endless autosave loop (15+
PATCHes observed in tests).

**Decision:** `isDirty = JSON.stringify(form) !== initialSnapshot.current`,
computed on every render, and the snapshot is seeded from the *actual* form
instance (`useRef` lazily initialized with `JSON.stringify(form)`). This also
fixes create mode, where `formFromQuestion()` generates random option keys via
`crypto.randomUUID()`: two independent calls never match, so a form started
"already dirty"; lazy seeding from the real form makes create state start clean.

**Consequences:** Ref mutation becomes visible; unknown-format draft forms are
treated as dirty and persisted (informative), never silently identical. Covered
by engine + editor integration tests.

## D18. Phase 7 — Optimistic `base_updated_at` with server-side 409

**Status:** Accepted

**Context:** Concurrent edits (two teachers, or two tabs) must not silently win.
The client autosave sends `base_updated_at` from the last-known question row.

**Decision:** `PATCH /questions/{id}` accepts optional `base_updated_at`;
`QuestionController` compares it against the current row's `updated_at` and
returns **409** (message + full `QuestionResource`) on mismatch, then unsets the
field before calling `QuestionService::update`. Omitting `base_updated_at`
(force save / conflict resolution) deliberately overwrites. The client keeps
the server version on 409 with two recovery paths: **Keep my version**
(re-saves with `base_updated_at` dropped) or **Reload server version**
(adopts server form, resets autosave state).

**Consequences:** Last-row-wins becomes user-visible and user-decided; covered by
`QuestionCrudTest` staleness scenarios and the conflict integration tests.

## D19. Phase 7 — Create-mode drafts stay local until explicit Save

**Status:** Accepted

**Context:** A new (unsaved, no id) question has no server row to PATCH, yet
closing the editor before "Save & next" loses work.

**Decision:** In create mode, autosave writes only to localStorage
(`quiz-builder:draft:quiz:{quiz-id}:new`, shared with the "edit" null-question
path) on debounce tick, `beforeunload`, and unmount-if-dirty; the server is
touched only on an explicit Save with the completed payload (which clears the
draft). Recovery offers "Pulihkan" (restore) / "Abaikan" (discard).
Question drafts use their own key namespace
`quiz-builder:draft:question:{question-id}`.

**Consequences:** A half-finished new question always survives a refresh; no
phantom server rows are created by background autosave. Recovery pauses
autosave until the user decides.
## D20. Phase 8 — Preview reuses the production renderer (RichTextEditor readOnly)

**Status:** Accepted

**Context:** A teacher must compare Editor → Preview without leaving the
question-editor workflow, and preview must render exactly what students will
see on export.

**Decision:** Preview renders the question content through the SAME production
renderer, `RichTextEditor` in its existing `readOnly` mode (Tiptap `editable:
false`, toolbar hidden) — never a second, hand-rolled renderer. Node views
already render production markup (document, image, table, equation); they
became read-only aware via `editor.isEditable` (hide alt input, "Edit
equation"/"Remove" controls, and selected outlines). A readOnly-only effect
syncs external `value` into the editor (`setContent(..., { emitUpdate: false })`,
guarded against canonical-identical content and `null` clears) for controlled,
re-renderable previews.

**Consequences:** Preview correctness is definitionally equal to export
rendering. The sync effect is scoped to `readOnly` so edit-mode behavior
(mounted-dirty remounts via `key`) is untouched and the (normalizing)
`setContent` cannot clobber live editing state.

## D21. Phase 8 — In-modal Edit / Teacher / Student segmented view

**Status:** Accepted

**Context:** Within the question modal the teacher wants three states: write,
then inspect as themselves, then as a student would see it.

**Decision:** `QuestionEditor` holds a `view` state (`edit` | `teacher` |
`student`); the header gets an `aria-pressed` segmented control and the body
swaps between the editable fields and `QuestionPreview`. Preview is fed the
LIVE form state, so unsaved edits (including `default_mark`) are visible
instantly. Footer Save/Cancel remain in preview, so the modal stays on the
edit→preview save path. Teacher preview marks correct options / accepted
answers; student preview hides them. Question text uses `text-sm sm:text-base`
with a `w-full max-w-2xl` document column.

**Consequences:** One component owns editor and preview, so no route/new page
is added and the reviewer loop (persist option → check export look) is a click
away. Preview-board concerns (SCORM/consumers) remain export-time only.

## D22. Phase 8 — Responsive + flake-proofing of the component test suite

**Status:** Accepted

**Context:** jsdom + many concurrently-mounted Tiptap editors in real time made
`waitFor` (default 1 s) and a 250 ms real debounce intermittently starved under
parallel worker load (observed: transient "Unsaved changes" pill missed, a
409-conflict status re-write, content asserts racing the readOnly value-sync).

**Decision:** (1) Table/tablescape overflow is handled in CSS —
`.rte-content .tableWrapper { overflow-x: auto; max-width: 100% }` — tested at
container widths 1280/768/375 by asserting preview classes, not via browser
feature detection. (2) The autosave engine's `pending` microtask preserves an
in-flight `saving`/`conflict`/`failed` status instead of overwriting it (two
conflict/recovery fixes), the integration file debounce was rounded up (1.5 s)
for head-room, async helpers get a global 10 s ceiling via
`configure({ asyncUtilTimeout })`, the suite caps `pool: 'forks'`,
`maxWorkers: 4`, and content assertions wait for the sync effect to apply
before querying. (3) Vitest 5 moved pool sizing to top-level
`maxWorkers` (no `poolOptions.forks`).

**Consequences:** Deterministic CI under load without weakening assertions:
five consecutive full-suite green runs (141 tests, 13 files), `tsc --noEmit`
clean, ESLint clean, backend unchanged (111 tests, Pint clean).

## D23. Phase 9 — Export through a Question Exporter facade (never hand-written XML)

**Status:** Accepted

**Context:** The PRD requires the editor never to serialize XML itself. Moodle
has its own XML dialect; producing it in UI code would couple components to
Moodle and make validation/importer/consumer extensions impossible.

**Decision:** A `QuestionExporter` abstraction lives in `src/lib/export/`
(`QuestionExporter`, `ExportContext`, `ExportResult`,
`ExportValidationErrorList`). The sole production implementation is
`moodleXmlExporter` (`format: 'moodle-xml'`), which runs a fixed pipeline:
`validateQuizForExport` → `resolveAllMedia` → render per-question via
`renderQuestion` (renderers per type) → `moodleExportFilename`. Exporting throws
`ExportValidationErrorList` (Indonesian, teacher-facing messages, e.g. "Soal 3
(opsi jawaban) …") before any XML is emitted, so broken exports are impossible.
UI code (builder page Export button) only calls the facade and renders errors;
it never touches XML.

**Consequences:** A future SCORM/GIFT/interactive consumer adds a new exporter
behind the same interface. Message style and error codes are user-visible.

## D24. Phase 9 — Media inlining and equation policy

**Status:** Accepted

**Context:** Moodle stores images as files inside the element that references
them; teachers also paste LaTeX equations into question text.

**Decision:** `docToHtml` rewrites `image` nodes to
`<img src="@@PLUGINFILE@@/{exportFilename}">`; `renderElement` returns the
element's HTML plus a `<file name="…" path="/" encoding="base64">` manifest
that is placed inside the SAME element (questiontext/answer/feedback) that
references it. `resolveMediaFromApi` fetches the storage URL and inlines the
file as base64; a resolver is required whenever any image is referenced
(validation error `media-no-resolver`), unresolvable ids become
`media-unresolvable`. File names are `sanitizeFilename`d with a `{mediaId}-`
prefix on collision. Equations are exported as `<tex>{latex}</tex>`; the Moodle
side requires the TeX notation filter to be enabled, which the UI must document.

**Consequences:** Imported quizzes render images without external storage;
Moodle needs the TeX filter for equations (manual setup step). Media is
re-downloaded per export — acceptable for teacher-sized quizzes.

## D25. Phase 9 — Fraction policy, unknown flags, and validation gating

**Status:** Accepted

**Context:** Moodle represents scores as decimal fractions (0..1) and restricts
partial-credit percentages; the model stores fractions as percentages and has no
case-sensitivity flag for short answers.

**Decision:** Single-correct answers export `fraction="1"`; multiple-correct
MCQs compute equal share `round(100 / correctCount, 5)` (Moodle's valid-grade
list accepts it within tolerance) as `fraction="0.5"`-style decimals. Wrong
options are always `0`. `true`/`false` answers carry the literal text Moodle
matches plus `fraction` from `is_correct`. Short answers export only accepted
options and hardcode `<usecase>0</usecase>` because the model has no
case-sensitivity flag (documented). Question names are slugified
`{quiz-title}_Q{n}` and made unique by a `NameTracker`. Validation runs before
rendering (see D23) and `question-text` emptiness ignores text but not
image/equation/table content, since a question may be composed purely of media.

**Consequences:** Moodle import can never silently mis-score a multiple-answer
MCQ or accept a wrong short answer. Case sensitivity of short answers is lost in
export (model limitation).

## D26. Phase 10 — Single library list endpoint, not a query DSL

**Status:** Accepted

**Context:** The Quiz Library needs search, filters (status, category, tag,
question type, min question count, updated date), sorting and pagination for
two scopes ("my quizzes" and "shared with me"). It must never load the whole
table on the client.

**Decision:** One endpoint — `GET /api/quizzes` — is extended with a `tab`
param (`mine` default, or `shared` = `user_id != me` and `visibility` in
`public`/`school`) plus every filter/sort as query params, and it already
supports `per_page`/`page` via Laravel pagination. Question-type badges need a
per-row aggregate; a correlated `addSelect` subquery (GROUP_CONCAT of DISTINCT
types) broke the paginator's count query, so `listQuizzes` instead eager-loads
`questions:id,type` for the page in one query and the `QuizResource` derives
`question_types` from the loaded relation (or the raw attribute on single-quiz
paths). `QuizResource` also now exposes `owner` and `tags` for the shared tab.
Filter options come from a dedicated `GET /api/quizzes/filters/meta`.

**Consequences:** One round-trip per dashboard screen, always paged. Eager
loading question ids for a page of ≤100 quizzes is acceptable; question bodies
are excluded (`questions:id,type`) so payload stays small.

## D27. Phase 10 — Cloning is the only way to take someone else's quiz

**Status:** Accepted

**Context:** Users must be able to work with quizzes they don't own, but
`update`/`delete`/`addQuestion` policies are owner-only and must stay that way.

**Decision:** `POST /api/quizzes/{quiz}/duplicate` is authorized by the `view`
policy (owner, or `public`/`school` for others — `school` was added to `view`
so school-shared quizzes are readable). `QuizService::duplicate` clones the
quiz (`title` gets a ` (Salinan)` suffix), copies tags, then each question via
`QuestionService::duplicateIntoQuiz`, extending the service to re-assign
question ownership to the cloning user per copy. The copy always starts as
`draft` + `private`. The clone badge and title suffix make it obvious the new
quiz is a working copy; editing that copy is ordinary owner edit.

**Consequences:** No shared write path to audit; ownership of cloned questions
is correct for later standalone editing/export. `UpdateQuizRequest` allows the
`school` visibility value introduced by the model/validation gap from the
original migration.

## D28. Phase 10 — Dashboard UX: server-driven filters, debounced search, local loading state

**Status:** Accepted

**Context:** The React Compiler lint rule `react-hooks/set-state-in-effect`
rejects calls to `setState` synchronously inside an effect body, and a naive
"set loading then fetch" effect caused a stuck-spinner bug: the initial 300 ms
debounce timer fired after the first load, set `loading = true`, and no effect
re-ran to clear it.

**Decision:** The library component never calls `setState` synchronously in an
effect: `loading`, error/notice clears and `page` resets happen inside the
event handlers (tab switch, filter change, pagination, duplicate/delete
refresh via a `reloadKey` counter). The search debounce is guarded by a ref so
an unchanged search is a no-op and cannot flip loading. Refresh flows reuse the
same list effect keyed on `reloadKey`. Export reuses the Phase 9 exporter via a
new `exportQuizMoodle(quizId)` helper + `downloadStringFile`, extracted from
the builder's `handleExport` so the dashboard and preview page share it.

**Consequences:** No stale spinner, single click→load path, lint-clean,
identical export behaviour across pages.

## D29. Phase 10 — Dashboard test strategy

**Status:** Accepted

**Context:** The library renders a responsive layout where the desktop table and
the mobile cards are always present in the DOM (CSS toggles visibility), so
every row/action appears twice, and the component hits the network via a mock.

**Decision:** Component tests use `vi.hoisted` mocks for `@/lib/api` (list,
duplicate, delete, filtersMeta), `@/lib/export/export-quiz`, `next/link` and
`next/navigation`, asserting against `getAllBy*` selectors (table + card) and
real-timer `waitFor` for the 300 ms debounce. `buildQuizQuery` is tested as a
pure function (`URLSearchParams` round-trip, default omission, `updated_from`
derivation).

**Consequences:** The dashboard and query builder are covered without a backend;
selector duplication is an accepted cost of the CSS-only responsive toggle.

## D30. Phase 11 — Question bank references its questions (no snapshot/versioning)

**Status:** Accepted

**Context:** The Phase 11 PRD separates Quiz from Question Bank and demands the
behavior when a question is used by several quizzes be decided explicitly, not
implicitly: question reference vs. snapshot copy vs. per-version history.

**Decision:** A bank question lives once in `questions` and quizzes only carry
references through the `quiz_questions` pivot (which already existed). Edits to a
bank question propagate to every quiz that references it. Snapshot/versioning is
rejected for this phase: it would duplicate question content per quiz, add
version tables, and complicate the editor's optimistic concurrency — revisit only
when attempts/grade history needs immutable copies of a question at attempt time.

**Consequences:** Editing a shared question updates its text in all quizzes that
use it, matching the teacher's mental model of "one bank question, used in many
quizzes". No immutable copies exist in this phase.

## D31. Phase 11 — Deleting a referenced question is blocked; detaching removes only the pivot

**Status:** Accepted

**Context:** Previously `quiz_questions.question_id` cascaded on delete, so
removing a question silently removed it from every quiz. The PRD forbids implicit
choices.

**Decision:** Two explicit operations. (1) `DELETE /api/questions/{id}` returns
`409 Cannot delete: this question is used in {n} quiz(es)` while any quiz
references it; the UI disables the button and explains why. (2) Removing a
question from a quiz is a detach: `DELETE /api/quizzes/{quiz}/questions/{question}`
deletes only the pivot row (404 if the question was not part of the quiz), so the
question stays in the bank for reuse elsewhere.

**Consequences:** Group delete of an unused question is still possible; used
questions require a detach-per-quiz first. The builder's delete button now calls
detach and always leaves the bank copy intact.

## D32. Phase 11 — Question search uses a derived `search_text` column

**Status:** Accepted

**Context:** Question bodies are ProseMirror JSON inside a JSON column, tags live
in a pivot, and options/feedback are separate columns. Searching across all of them
in SQL per keystroke is awkward.

**Decision:** Add a `search_text` column, backfilled and maintained by `DocumentValidator`
plain-text extraction on the content, options, feedbacks, category and difficulty.
The `Question` model recomputes it on save. The bank list endpoint filters on
`search_text`/`category` plus structured filters (status, type, difficulty, tag,
updated-within) resolved by `filters/meta`.

**Consequences:** Fast single-column `LIKE` search; a tiny denormalization cost
kept in sync by the service/booting hook. Tag search uses the pivot via `whereHas`.

## D33. Phase 11 — Bank editor reuses QuestionEditor; bank metadata lives page-side

**Status:** Accepted

**Context:** The bank needs standalone create/edit pages whose form (content,
options, feedback) already exists inside `QuestionEditor`, which is only used
inside the quiz builder today.

**Decision:** The `/bank/new` and `/bank/[id]` pages render `QuestionEditor` with
`quizId={0}` (the draft key only) plus a side panel for category, difficulty,
tags and status. The page's `onSave` merges panel metadata into the
`QuestionPayload` before calling `questions.bank.create` or `questions.update`.
`QuestionEditor` itself is unchanged; its autosave skips create mode and, in edit
mode, autosaves only content (metadata is PATCH-only and so never clobbered).

**Consequences:** No editor refactor was needed; create-mode drafts stay local per
D19. Metadata saved via the explicit Save button, which also carries the editor's
conflict-free-write path.

## D34. Phase 12 — Rate limits: login/register, upload and all mutations, disabled in tests

**Status:** Accepted

**Context:** The 2026 security audit found the API had *no* rate limiting at any
endpoint (the api route group carried only `SubstituteBindings`). This left
login, upload, autosave and every mutating endpoint open to spamming.

**Decision:** Named `RateLimiter` buckets registered in `AppServiceProvider`:
`login` (10/min keyed by lowercase email + IP — covers login *and* register),
`upload` (30/min per user) and `mutations` (120/min per user; 10/min anonymous
IP) applied as `throttle:` middleware on the mutating routes. Reads stay
unthrottled. When `app()->environment('testing')` every bucket returns
`Limit::none()`, so the feature suite is untouched by limit counters. Mutations
were also grouped in a dedicated `auth:sanctum` + `throttle:mutations` route
group (explicit routes replaced `apiResource`), which makes the read/write split
auditable at a glance.

**Consequences:** 429s prevent credential stuffing and upload/autosave floods in
production; tests keep their 147/390 green. Autosave is debounced client-side
and well under 120/min for a human teacher.

## D35. Phase 12 — CORS locked to configured origins; Bearer-only auth keeps CSRF out of scope

**Status:** Accepted

**Context:** `config/cors.php` allowed `*` with `supports_credentials: false`.
Combined with pure `Authorization: Bearer` tokens (Sanctum API mode, no
`statefulApi()`), browsers never attach credentials automatically, so CSRF was
never exploitable — but wildcard CORS is a standing foot-gun for any future
cookie mode.

**Decision:** `allowed_origins` is now `FRONTEND_URLS` (comma-separated env,
default `http://localhost:3000`). No CSRF machinery is added because no cookie
auth exists. Recorded explicitly so nobody "fixes the CSRF gap" by wiring
`statefulApi()` without also re-deriving the CORS/origin rules.

**Consequences:** Other origins are rejected pre-flight; credentials remain
false; `sanctum/csrf-cookie` path still publishes the (unused) cookie endpoint.

## D36. Phase 12 — Sanctum tokens expire after 30 days

**Status:** Accepted

**Context:** `config/sanctum.php` had `'expiration' => null`; revoked tokens died
only on logout, so a leaked token stayed valid forever.

**Decision:** Set `expiration` to `SANCTUM_TOKEN_TTL_MINUTES` defaulting to 30
days. Sanctum's Guard already enforces both `config` age and per-token
`expires_at`. Logout continues to delete the current token (multi-device
friendly).

**Consequences:** Stale sessions fail closed after 30 days with a 401 that the
client already routes to the login page.

## D37. Phase 12 — Uploaded file extension comes from sniffed MIME; display name is basename-sanitized

**Status:** Accepted

**Context:** `MediaService` derived the stored extension from the untrusted
client filename (`getClientOriginalExtension()`), so the on-disk extension could
lie about the bytes even though the MIME itself was already finfo-sniffed and
enforced by `UploadMediaRequest` (`image` + `mimes:jpg,jpeg,png,gif,webp`, 5MB).

**Decision:** `MediaService` maps the sniffed MIME type to a fixed extension
(`image/png → .png`, etc.); the stored path and content always agree. The DB
display `filename` is `basename()` of the client name so path-like names never
reach storage/database. Integration tests prove a PNG renamed to `.txt` is
stored as `.png` and a `../../portal.png` name is stored as `portal.png`.

**Consequences:** Serving via `/storage` can never mislabel content-type by
extension. Media remain on the public disk with unguessable 32-char random
filenames (D37.1, below).

## D37.1 Phase 12 — Media keep the public-disk unguessable-name design (signed URLs deferred)

**Status:** Accepted

**Context:** `security.md` originally aspired to "outside web root + signed
URLs"; the shipped system stores media on Laravel's `public` disk and serves
them over `/storage/...`, gated only by the randomized 32-char filename. The
authorized JSON endpoint (`/api/media/{id}`, policy-protected) remains the
primary reference; the raw `/storage` URL is still fetchable by anyone who
guesses the name.

**Decision:** Accept the public-disk design for this phase because (a) every
Moodle export must embed absolute image URLs, which work only if the files are
actually web-reachable, and (b) 32-char random names make guessing infeasible.
Signed-URL/private-storage migration is explicitly parked as a future security
improvement, not a silent gap.

**Consequences:** No data is reproducible from the storage name alone; the real
privacy boundary for content is the JSON API + ownership policies. Flagged in
the Phase 12 report as a known limitation.

## D38. Phase 12 — Defense in depth on export/paste: link scheme allowlist and client 5MB pre-check

**Status:** Accepted

**Context:** The frontend XSS audit found only KaTeX-generated
`dangerouslySetInnerHTML` (escaped, safe). Import (`sanitizer.ts`) already strips
dangerous schemes, but the Moodle exporter re-emitted any `link` mark href
verbatim and nothing checked file size before uploading.

**Decision:** `doc-to-html.ts` now runs `isSafeHref` before emitting `<a href>`
(unsafe links degrade to plain text); `media.upload` in `api.ts` rejects files
over 5 MB client-side before any network call, matching the server rule and
covering paste-from-clipboard, embedded data: URIs and remote fetch paths.

**Consequences:** Exported XML can never contain `javascript:` links even if the
document model is corrupted; oversized pasted images fail fast with a clear
message instead of a 422 round trip.

## D39. Phase 12 — A shared focus-trap dialog primitive and code-split editor

**Status:** Accepted

**Context:** The accessibility audit found every modal already kept `role="dialog"`
and `aria-modal="true"` but none trapped keyboard focus, no `aria-labelledby`
wiring, no Escape-to-close on the small dialogs, and the Tiptap editor was
bundled into the builder page's initial chunk.

**Decision:** A reusable `DialogSurface` (`components/ui/dialog.tsx`) provides
focus trap, initial focus, focus restore, Escape-close and `aria-labelledby`;
applied to the bank picker, insert-into-quiz, bank preview and the discard
confirmation. The large editor sheet uses `useFocusTrap(autofocus:false, restore:false)`
since it already owns Escape and focus restore. The builder imports
`QuestionEditor` via `next/dynamic` (`ssr:false`) so the Tiptap bundle loads only
when a question is opened. Search/filter controls gained `aria-label`/labels.

**Consequences:** Full-keyboard operation and screen-reader labelling across all
dialogs; the builder's initial JS drops by the editor chunk size. Component tests
lock the trap behaviour (263 total across the frontend gate).

## D40. Phase 12 — E2E/browser testing is out of scope for this environment; regression relies on API + component tests

**Status:** Accepted

**Context:** The sandbox has no Chromium/Firefox (no Playwright install), so the
"Do a minimal browser run" PRD item cannot be executed literally from here.

**Decision:** The E2E story is specified as a written runbook (navigate from the
library through the builder to a Moodle export) to be executed against the real
deployment; the regression safety net is the layer that *is* executable here:
147 backend feature tests (auth, ownership, uploads, bank) + 242 frontend
component/unit tests including the new dialog, upload-guard and export
hardening tests.

**Consequences:** Cross-browser quirks (Safari/Edge) remain unverified and are
logged as a release checkpoint rather than a silent skip. Any real E2E addition
should run the same teacher workflow and assert the browser shell, not re-cover
logic the layer below already pins.


## D41. Phase 13 — Per-environment config: env separation, `.env.example` as the template, secrets never in the repo

**Status:** Accepted

**Context:** Staging and production must not share secrets or drift, and the
only signed-in surface is Bearer-token auth.

**Decision:** `backend/.env.example` is the canonical, fully-annotated template
(every runtime variable + ops-only keys documented), and `frontend/.env.example`
(sole var `NEXT_PUBLIC_API_URL`) is added. Environments map to `APP_ENV`:
`local`/`staging`/`production`; `.env` files are per-host and gitignored
(no value committed, including `APP_KEY`/`DB_PASSWORD`). No secrets manager is
imposed — teams may use env files, a vault or CI stores as long as the repo
stays secret-free.

**Consequences:** Copying `.env.example` + filling values is the only way to
provision an environment; bad configs become easy to diff between hosts. Because
`NEXT_PUBLIC_*` values are inlined at build time, a rebuild is required whenever
the API origin changes — documented in setup/DEPLOYMENT and the frontend gate.

## D42. Phase 13 — Health strategy: keep Laravel's `/up` and add DB-probing `GET /api/health`

**Status:** Accepted

**Context:** A load balancer/uptime monitor needs to distinguish "PHP alive"
from "app actually healthy". Laravel's built-in `withRouting(health: '/up')` is
stateless and cheap but cannot detect a dead database.

**Decision:** Keep `GET /up` as the stateless liveness ping and add
`GET /api/health` (public, throttled by nothing) which runs `select 1` and
returns `200 {status:ok,database:ok}` or `503 {status:degraded,database:unreachable}`.
HealthTest pins both branches (2 tests).

**Consequences:** Uptime monitors should target `/api/health`, not `/up`, to get
DB-failure alerts. The endpoint is trivial and stays out of the rate-limit
groups so monitors never trip 429s.

## D43. Phase 13 — Dedicated filter-path indexes via a migration, not generated with the schema

**Status:** Accepted

**Context:** Quiz/question filtering joins `tags`, `quiz_questions` and `users`
on searchable columns; index creation is already covered by the original
migrations, but the primary filter columns deserve composite coverage and were
chosen to live next to the filter behaviour, not the table creation.

**Decision:** Add `2026_09_12_100000_add_filter_indexes_to_quizzes_and_questions.php`
with composite indexes on `questions(user_status_updated, category, difficulty)`
and `quizzes(user_visibility_status_updated)`, matching the WHERE/ORDER paths
the dashboard uses. Migrations remain additive and idempotent.

**Consequences:** Sneak-peek `EXPLAIN` on filter queries drops to index scans;
large Postgres tables benefit; SQLite dev/test stay on the same plan shape.

## D44. Phase 13 — Orphaned-media cleanup as an explicit maintenance command

**Status:** Accepted

**Context:** Media deletes are transactional, but crashed saves or manual DB
edits can leave files orphaned in `storage/app/public/media`; perfect
consistency isn't guaranteed by "always delete with the row".

**Decision:** `php artisan media:prune` lists orphans (files with no matching
`media` row); `--delete` removes them. Default is dry-run — destructive action
must be explicit. 3 feature tests (list/delete/none) with `Storage::fake('public')`.

**Consequences:** Ops can recover disk space safely; the command is documented
in setup and the ops runbook.

## D45. Phase 13 — Backups are scripted and, critically, restore-tested

**Status:** Accepted

**Context:** "We have backups" is different from "we can restore". The PRD
demands operational procedures for launch.

**Decision:** `ops/backup.sh` produces a gzipped `pg_dump` (plain SQL) plus a
tarball of `storage/app/public/media`, timestamped, with retention pruning
(`BACKUP_RETENTION_DAYS`, default 14). `ops/restore.sh --test` restores the
newest dump into a throwaway database, runs `SELECT 1`, and drops it — the
lowest-effort proof a backup restores. A real restore (`ops/restore.sh <db> <file>`)
drops/recreates the target. Vars are read from `backend/.env` (ops-only keys:
`BACKUP_DIR`, `BACKUP_MEDIA_DIR`).

**Consequences:** A failed `--test` is now a deploy-blocking failure (release
checklist item). SQLite/dev backup is documented as a plain file copy since the
scripts target Postgres.

## D46. Phase 13 — Documentation set is the release artefact: setup, API, types, export, monitoring, troubleshooting

**Status:** Accepted

**Context:** The repo's dev-only README understates how hard production is;
`docs/architecture/api-architecture.md` is design-intent, not the actual
contract.

**Decision:** Ship `DEPLOYMENT.md` (prereqs → HTTPS → rollback → release
checklist), `docs/setup.md` (3 environments + env files), `docs/api.md`
(accurate contract derived from `routes/api.php`, controllers and request
classes — replaces reliance on the aspirational design doc), `docs/question-types.md`,
`docs/moodle-export.md`, `docs/monitoring.md`, `docs/troubleshooting.md`; README
gains the doc index and endpoint summary.

**Consequences:** The API doc must be regenerated whenever routes change; a
"docs drift" item is pinned on route edits. Monitoring and backup procedures have
concrete executable we-can-run-now targets instead of prose.

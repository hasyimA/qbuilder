# Content Model

## Canonical Document Model

All rich content in the system (question text, answer options, feedback) is stored as a **structured JSON document model**, NOT as raw HTML. This ensures:

1. Content is renderable to multiple targets (editor, preview, Moodle XML)
2. Images are referenced by Media ID, not embedded base64
3. Equations are stored as LaTeX, not as rendered HTML/OMML
4. Content is validatable at the node level

## Document Structure

The content model is inspired by ProseMirror/Tiptap's JSON document format:

```typescript
interface Document {
  type: "doc";
  content: Block[];
}

type Block = Paragraph | Heading | BulletList | OrderedList | Image | Table | Equation;

interface Paragraph {
  type: "paragraph";
  content: Inline[];
}

interface Heading {
  type: "heading";
  attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 };
  content: Inline[];
}

interface Text {
  type: "text";
  text: string;
  marks?: Mark[];
}

type Mark = Bold | Italic | Underline | Strikethrough | Link | Code;

interface Bold { type: "bold" }
interface Italic { type: "italic" }
interface Underline { type: "underline" }
interface Strikethrough { type: "strikethrough" }
interface Code { type: "code" }

interface Link {
  type: "link";
  attrs: { href: string; title?: string };
}

interface Image {
  type: "image";
  attrs: {
    mediaId: number;    // References Media entity
    alt?: string;
    width?: number;
    height?: number;
  };
}

interface BulletList {
  type: "bulletList";
  content: ListItem[];
}

interface OrderedList {
  type: "orderedList";
  attrs: { start?: number };
  content: ListItem[];
}

interface ListItem {
  type: "listItem";
  content: Block[];  // Allows nested blocks
}

interface Table {
  type: "table";
  content: TableRow[];
}

interface TableRow {
  type: "tableRow";
  content: TableCell[];
}

interface TableCell {
  type: "tableCell";
  attrs?: { colspan?: number; rowspan?: number };
  content: Block[];
}

interface Equation {
  type: "equation";
  attrs: {
    format: "latex";
    value: string;  // LaTeX source
  };
}
```

## JSON Examples

### Simple Question

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Perangkat yang digunakan untuk menghubungkan jaringan lokal ke internet adalah..." }
      ]
    }
  ]
}
```

### Question with Image

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Perhatikan topologi jaringan berikut." }
      ]
    },
    {
      "type": "image",
      "attrs": { "mediaId": 42, "alt": "Topologi jaringan star" }
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Jumlah maksimum perangkat yang dapat terhubung langsung ke switch adalah..." }
      ]
    }
  ]
}
```

### Question with Equation

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Hitunglah nilai x dari persamaan berikut:" }
      ]
    },
    {
      "type": "equation",
      "attrs": { "format": "latex", "value": "2x + 5 = 15" }
    }
  ]
}
```

### Question with Table and Formatting

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Perhatikan tabel berikut:" }
      ]
    },
    {
      "type": "table",
      "content": [
        {
          "type": "tableRow",
          "content": [
            { "type": "tableCell", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Protokol", "marks": [{ "type": "bold" }] }] }] },
            { "type": "tableCell", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Port", "marks": [{ "type": "bold" }] }] }] }
          ]
        },
        {
          "type": "tableRow",
          "content": [
            { "type": "tableCell", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "HTTP" }] }] },
            { "type": "tableCell", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "80" }] }] }
          ]
        }
      ]
    }
  ]
}
```

### Answer Option with Image

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Router" }
      ]
    },
    {
      "type": "image",
      "attrs": { "mediaId": 43, "alt": "Gambar router" }
    }
  ]
}
```

## Storage Format

Content is stored in the database as JSON:

```sql
-- questions.content column
ALTER TABLE questions ADD COLUMN content JSON NOT NULL;

-- question_options.content column
ALTER TABLE question_options ADD COLUMN content JSON NOT NULL;
```

**Validation**: Backend must validate that stored JSON conforms to the document model schema before saving. Invalid documents must be rejected with clear error messages.

## Conversion Pipeline

### Editor → Storage

```
Tiptap Editor
    │
    ▼
Tiptap JSON (editor internal format)
    │
    ▼
normalizeToCanonical()
    │
    ▼
Canonical Document Model
    │
    ▼
JSON serialize → API → Database
```

### Storage → Editor

```
Database JSON
    │
    ▼
JSON parse → Canonical Document Model
    │
    ▼
loadIntoTiptap()
    │
    ▼
Tiptap Editor renders content
```

### Storage → Preview Renderer

```
Database JSON
    │
    ▼
Canonical Document Model
    │
    ▼
PreviewRenderer.render(document)
    │
    ▼
HTML (safe, sandboxed)
    │
    ▼
Display in preview pane
```

### Storage → Moodle XML Exporter

```
Database JSON
    │
    ▼
Canonical Document Model
    │
    ▼
MoodleExporter.export(document)
    │
    ├── Text nodes → escaped HTML text
    ├── Bold/Italic → <b>/<i> tags
    ├── Image → file references with @@PLUGINFILE@@
    ├── Equation → <tex> or <moodletext> with LaTeX
    ├── Table → <table> HTML
    └── Links → <a> tags
    │
    ▼
Moodle-compatible HTML/XML string
```

## Rule: No Arbitrary HTML Storage

Content must NEVER be stored as raw HTML strings. Every piece of rich content goes through the canonical document model.

**Exception**: Moodle XML export generates HTML strings as output, but these are never stored back into the database.

## Empty Document

An empty document is represented as:

```json
{
  "type": "doc",
  "content": []
}
```

## Minimum Valid Document

For a question to be considered "complete", its content must contain at least one paragraph with at least one text node with non-empty text:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "..." }  // at least one character
      ]
    }
  ]
}
```

## Tiptap Integration (Phase 4)

Tiptap will be configured with custom extensions that map 1:1 to the canonical model:

| Tiptap Extension | Model Node |
|------------------|------------|
| Document | doc |
| Paragraph | paragraph |
| Heading | heading |
| Bold | bold mark |
| Italic | italic mark |
| Underline | underline mark |
| Strike | strikethrough mark |
| Link | link mark |
| Image (custom) | image node |
| BulletList | bulletList node |
| OrderedList | orderedList node |
| ListItem | listItem node |
| Table | table node |
| Equation (custom) | equation node |
| Code | code mark |

Custom extensions (Image, Equation) will use Tiptap Node views with React components for interactive rendering.

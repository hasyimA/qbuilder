import type { DocContent } from '@/lib/types';
import { docToHtml } from './doc-to-html';
import { cdata } from './xml-escape';
import type { MediaResolution } from '../types';

export interface ResolvedMediaEntry extends MediaResolution {
  /** Moodle file name used in `@@PLUGINFILE@@/...` and the `<file>` manifest. */
  exportFilename: string;
}

export type MediaMap = Map<number, ResolvedMediaEntry>;

/** Renders a DocContent element (questiontext / answer / feedback ...) plus its <file> manifest. */
export interface ElementParts {
  html: string;
  files: string;
}

export function renderElement(doc: DocContent | null | undefined, media: MediaMap): ElementParts {
  if (!doc) return { html: '', files: '' };
  const result = docToHtml(doc, {
    filenameFor: (mediaId) => media.get(mediaId)?.exportFilename ?? `_missing_${mediaId}`,
  });
  const files = result.images
    .map((image) => {
      const entry = media.get(image.mediaId);
      if (!entry) return '';
      return (
        `<file name="${escapeAttr(entry.exportFilename)}" path="/" encoding="base64">` +
        `${entry.base64}</file>`
      );
    })
    .join('');
  return { html: result.html, files };
}

function replaceAll(input: string, target: string, replacement: string): string {
  return input.split(target).join(replacement);
}

function escapeAttr(input: string): string {
  return replaceAll(replaceAll(replaceAll(input, '&', '&amp;'), '<', '&lt;'), '"', '&quot;');
}

/** "Jaringan Komputer 2026" -> "jaringan_komputer_2026" with a safe fallback. */
export function slugify(input: string, fallback: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

export function sanitizeFilename(name: string): string {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^[._-]+/g, '');
  return cleaned || 'media';
}

export function defaultGrade(mark: number | string): string {
  const value = typeof mark === 'number' ? mark : parseFloat(String(mark));
  return Number.isFinite(value) ? String(value) : '1';
}

/**
 * Moodle's fixed list of valid answer grades, as percentages. Moodle's XML
 * importer reads the `fraction` attribute as a percentage (Moodle's own
 * exporter writes `100 * $answer->fraction`) and divides it by 100 before
 * matching it against its list of valid grades. Grades outside this list make
 * the importer skip the question ("grades do not match grade options").
 */
const MOODLE_VALID_GRADES = [
  '100',
  '90',
  '80',
  '75',
  '70',
  '66.666',
  '60',
  '50',
  '40',
  '33.333',
  '30',
  '25',
  '20',
  '16.666',
  '14.2857',
  '12.5',
  '11.111',
  '10',
  '5',
  '0',
];

export function snapToMoodleGrade(percent: number): string {
  let best = MOODLE_VALID_GRADES[0];
  let bestDistance = Number.MAX_SAFE_INTEGER;
  for (const grade of MOODLE_VALID_GRADES) {
    const distance = Math.abs(parseFloat(grade) - percent);
    if (distance < bestDistance) {
      best = grade;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The `fraction` attribute for Moodle's `<answer>` element. Input is the
 * percentage (0..100) this app already stores for options; output is snapped
 * to a grade Moodle will accept on import.
 */
export function fractionDecimal(percent: number | string): string {
  const value = typeof percent === 'number' ? percent : parseFloat(String(percent));
  if (!Number.isFinite(value)) return '0';
  return snapToMoodleGrade(value);
}

/** Equal-split partial credit for multiple-answer MCQs: percent rounded to 5 decimals. */
export function partialCreditPercent(correctCount: number): string {
  if (correctCount <= 0) return '0';
  const raw = 100 / correctCount;
  // A rounding that lands on Moodle's valid-grade list within its 1e-5 tolerance.
  return raw.toFixed(5).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Reads well in Moodle's question bank. When the question has text, the title
 * is the first five words of it (e.g. "Berapa hasil dari 5"); otherwise it
 * falls back to the quiz-slug style name like "jaringan_komputer_2026_Q1".
 */
export function questionName(quizTitle: string, index: number, contentText?: string): string {
  const text = (contentText ?? '').trim().replace(/\s+/g, ' ');
  if (text) {
    const words = text.split(' ').slice(0, 5).join(' ');
    const truncated = words.length > 64 ? `${words.slice(0, 61)}...` : words;
    return truncated;
  }
  const slug = slugify(quizTitle, 'quiz');
  return `${slug}_Q${index}`;
}

export interface QuestionShellInput {
  type: string;
  name: string;
  questionText: ElementParts;
  generalFeedback: ElementParts;
  mark: string;
  /** Type-specific tags emitted before the closing </question>. */
  extra?: string;
}

export function questionShell(input: QuestionShellInput): string {
  const lines = [
    '  <question type="' + input.type + '">',
    '    <name>',
    '      <text>' + escapeText(input.name) + '</text>',
    '    </name>',
    '    <questiontext format="html">',
    '      <text>' + cdata(input.questionText.html) + '</text>',
    input.questionText.files ? '      ' + input.questionText.files : '',
    '    </questiontext>',
    '    <generalfeedback format="html">',
    '      <text>' + cdata(input.generalFeedback.html) + '</text>',
    input.generalFeedback.files ? '      ' + input.generalFeedback.files : '',
    '    </generalfeedback>',
    '    <defaultgrade>' + input.mark + '</defaultgrade>',
    '    <hidden>0</hidden>',
  ];
  if (input.extra) lines.push(input.extra);
  lines.push('  </question>');
  return lines.filter((line) => line !== '').join('\n');
}

export function feedbackElement(parts: ElementParts, indent = 6): string {
  const line = ' '.repeat(indent);
  const line2 = ' '.repeat(indent + 2);
  if (!parts.html && !parts.files) {
    return line + '<feedback format="html"><text></text></feedback>';
  }
  return (
    line + '<feedback format="html">\n' +
    line2 + '<text>' + cdata(parts.html) + '</text>\n' +
    (parts.files ? line2 + parts.files + '\n' : '') +
    line + '</feedback>'
  );
}

/**
 * Renders an HTML block element (e.g. `<graderinfo>`) with the same
 * `<text>`/`<file>` structure Moodle expects.
 */
export function blockElement(tag: string, parts: ElementParts, indent = 4): string {
  const line = ' '.repeat(indent);
  const line2 = ' '.repeat(indent + 2);
  if (!parts.html && !parts.files) {
    return `${line}<${tag} format="html"><text></text></${tag}>`;
  }
  return (
    line + `<${tag} format="html">\n` +
    line2 + '<text>' + cdata(parts.html) + '</text>\n' +
    (parts.files ? line2 + parts.files + '\n' : '') +
    line + `</${tag}>`
  );
}

function escapeText(input: string): string {
  return replaceAll(replaceAll(replaceAll(input, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
}

/** Tracks used Moodle question names so exports never contain duplicates. */
export interface NameTracker {
  used: Set<string>;
}

export function createNameTracker(): NameTracker {
  return { used: new Set() };
}

export function uniqueQuestionName(
  quizTitle: string,
  index: number,
  tracker: NameTracker,
  contentText?: string
): string {
  const base = questionName(quizTitle, index, contentText);
  let candidate = base;
  let suffix = 2;
  while (tracker.used.has(candidate)) {
    candidate = `${base}_v${suffix}`;
    suffix += 1;
  }
  tracker.used.add(candidate);
  return candidate;
}
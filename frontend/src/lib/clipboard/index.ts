import type { UploadedImage } from '@/components/rich-text/editor-context';
import { processImagesInHtml } from './extract-images';
import { sanitizeHtml } from '@/lib/sanitizer';
import { isWordHtml, normalizeWordHtml } from './word';

// ClipboardParser: single abstraction that owns every clipboard-reading rule
// for the editor. UI code asks the parser what was pasted and inserts the
// prepared fragment; it never re-implements parsing itself.

export interface ClipboardDataLike {
  types?: readonly string[];
  files?: readonly File[] | FileList | null;
  getData?: (type: string) => string;
}

export type DetectedClipboardFormat =
  | 'html'
  | 'text'
  | 'image-file'
  | 'files'
  | 'unknown';

export type ClipboardParseResult =
  | { kind: 'html'; content: string }
  | { kind: 'text'; content: string; options: string[] | null }
  | { kind: 'images'; files: File[] }
  | { kind: 'empty' };

export function detectFormat(data: ClipboardDataLike): DetectedClipboardFormat {
  const types = new Set((data.types ?? []).map((type) => String(type).toLowerCase()));

  if (data.getData && types.has('text/html') && data.getData('text/html').trim() !== '') {
    return 'html';
  }

  const files = Array.from(data.files ?? []);
  if (files.length > 0) {
    return files.some((file) => file.type.startsWith('image/')) ? 'image-file' : 'files';
  }

  if (data.getData && types.has('text/plain') && data.getData('text/plain').trim() !== '') {
    return 'text';
  }

  return 'unknown';
}

function imageFiles(
  files: readonly File[] | FileList | null | undefined
): File[] {
  return Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
}

/**
 * The full Word/HTML paste pipeline: normalize Word markup, convert OMML math,
 * upload embedded images, then sanitize. Returns HTML ready for the editor.
 */
export async function parseHTML(
  html: string,
  options: { uploadImage?: (file: File) => Promise<UploadedImage> } = {}
): Promise<string> {
  if (!html) return '';

  const wordReady = isWordHtml(html) ? normalizeWordHtml(html) : html;
  const withImages = await processImagesInHtml(wordReady, options.uploadImage);

  return sanitizeHtml(withImages);
}

export function parsePlainText(text: string): {
  text: string;
  options: string[] | null;
} {
  return { text, options: parseOptions(text) };
}

export async function parseClipboardData(
  data: ClipboardDataLike,
  options: { uploadImage?: (file: File) => Promise<UploadedImage> } = {}
): Promise<ClipboardParseResult> {
  const format = detectFormat(data);

  if (format === 'html') {
    return {
      kind: 'html',
      content: await parseHTML(data.getData?.('text/html') ?? '', options),
    };
  }

  if (format === 'image-file') {
    return { kind: 'images', files: imageFiles(data.files) };
  }

  if (format === 'text') {
    const content = data.getData?.('text/plain') ?? '';
    return { kind: 'text', content, options: parseOptions(content) };
  }

  return { kind: 'empty' };
}

// ---------------------------------------------------------------------------
// Bulk option parsing
// ---------------------------------------------------------------------------

const OPTION_LINE =
  /^\s*(?:\(\s*([A-Ha-h]|\d{1,2})\s*\)|([A-Ha-h]|\d{1,2})\s*[.)])\s+(.*)$/;

/**
 * Detects a list of options such as
 * `A. Router` / `B) Switch` / `(C) Hub` / `1. Router` / `a. router`.
 *
 * Confidence rules (kept explicit so paragraphs are never mistaken for
 * options):
 *   - every recognised entry must be labelled with a single letter (A-H) or a
 *     small number and followed by punctuation + whitespace;
 *   - at least two lines must match;
 *   - labels must form a single consecutive sequence (A, B, C, … or 1, 2, 3, …)
 *     with letters as the primary form; numbered lists must start at 1;
 *   - lines between entries are folded into the previous option instead of
 *     breaking the block.
 *
 * Returns the option texts, or null when the text does not look like options.
 */
export function parseOptions(text: string): string[] | null {
  if (!text) return null;

  const entries: Array<{ label: string; text: string }> = [];
  let started = false;

  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trimEnd();
    const match = OPTION_LINE.exec(line);

    if (match) {
      const optionText = (match[3] ?? '').trim();
      if (optionText === '') continue;
      entries.push({ label: (match[1] ?? match[2] ?? '').toUpperCase(), text: optionText });
      started = true;
      continue;
    }

    if (started) {
      const fold = line.trim();
      if (fold && entries.length > 0) {
        entries[entries.length - 1].text += ` ${fold}`;
      }
    }
  }

  if (entries.length < 2) return null;

  const first = entries[0].label;
  const isLetter = /^[A-H]$/.test(first);
  const isNumber = /^\d+$/.test(first);

  if (!isLetter && !isNumber) return null;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const expected = isLetter
      ? String.fromCharCode(65 + i)
      : String(1 + i);
    if (entry.label !== expected) return null;
  }

  return entries.map((entry) => entry.text.trim());
}

// ---------------------------------------------------------------------------
// Bulk question parsing (future bulk-paste support)
// ---------------------------------------------------------------------------

const QUESTION_HEAD = /^\s*([1-9][0-9]{0,2})\s*[.)]\s+(.*)$/;

export interface ParsedQuestion {
  number: number;
  prompt: string;
  options?: string[];
}

/**
 * Detects a numbered block of questions (`1. …`, `2. …`) and splits options
 * out of each block when the option pattern applies. Returns null when the
 * text does not confidently look like questions with options.
 */
export function parseQuestions(text: string): ParsedQuestion[] | null {
  if (!text) return null;

  const lines = text.split(/\r\n|\r|\n/);
  const blocks: Array<{ number: number; prompt: string; rest: string[] }> = [];
  let current: { number: number; prompt: string; rest: string[] } | null = null;

  let expected = 1;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const match = QUESTION_HEAD.exec(line);
    if (match && Number(match[1]) === expected) {
      current = { number: expected, prompt: (match[2] ?? '').trim(), rest: [] };
      blocks.push(current);
      expected += 1;
      continue;
    }
    if (current) {
      const trimmed = line.trim();
      if (trimmed) current.rest.push(trimmed);
    }
  }

  if (blocks.length === 0) return null;

  const someBlockHasOptions = blocks.some(
    (block) => parseOptions(block.rest.join('\n')) !== null
  );
  if (blocks.length === 1) {
    if (!someBlockHasOptions) return null;
  } else {
    const allSingleLine = blocks.every((block) => block.rest.length === 0);
    if (!allSingleLine && !someBlockHasOptions) return null;
  }

  return blocks.map((block) => {
    const options = parseOptions(block.rest.join('\n'));
    const prompt = block.prompt || block.rest[0] || '';
    return {
      number: block.number,
      prompt,
      ...(options ? { options } : { options: undefined }),
    };
  });
}

export * from './word';
export * from './omml';
export { processImagesInHtml as extractImages } from './extract-images';
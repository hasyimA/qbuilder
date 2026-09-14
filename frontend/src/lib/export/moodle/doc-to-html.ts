import { isSafeHref } from '@/lib/sanitizer';
import type { DocContent } from '@/lib/types';

/** A media reference collected while serializing. */
export interface ImageRef {
  mediaId: number;
  alt?: string;
  width?: number;
  height?: number;
}

export interface DocToHtmlOptions {
  /** Maps a media id to the Moodle file name used in `@@PLUGINFILE@@/...`. */
  filenameFor?: (mediaId: number) => string;
}

export interface DocToHtmlResult {
  html: string;
  images: ImageRef[];
}

/** Thrown when an unknown node/mark type is serialized. Never silent. */
export class UnsupportedContentError extends Error {
  readonly nodeType: string;
  readonly path: string;

  constructor(nodeType: string, path: string, node?: DocContent | null) {
    const snippet = node ? '; content=' + JSON.stringify(node).slice(0, 240) : '';
    super(`Unsupported content node "${nodeType}" at ${path}${snippet}`);
    this.name = 'UnsupportedContentError';
    this.nodeType = nodeType;
    this.path = path;
  }
}

const KNOWN_NODES = new Set([
  'doc',
  'paragraph',
  'heading',
  'text',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'hardBreak',
  'image',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'equation',
]);

const KNOWN_MARKS = new Set([
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'strike',
  'code',
  'link',
  'subscript',
  'superscript',
]);

const ALIGN_VALUES = new Set(['left', 'center', 'right', 'justify']);

function escapeText(input: string): string {
  return input
    .split('&')
    .join('&amp;')
    .split('<')
    .join('&lt;')
    .split('>')
    .join('&gt;')
    .split('"')
    .join('&quot;');
}

function escapeAttr(input: string): string {
  return escapeText(input).split("'").join('&#39;');
}

function alignStyle(textAlign: unknown): string {
  if (typeof textAlign !== 'string' || !ALIGN_VALUES.has(textAlign)) return '';
  return ` style="text-align:${textAlign}"`;
}

function intAttr(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function openMarks(marks: unknown, path: string): string[] {
  if (!Array.isArray(marks)) return [];
  const tags: string[] = [];
  for (const mark of marks) {
    if (!mark || typeof mark !== 'object') continue;
    const type = (mark as { type?: unknown }).type;
    if (typeof type !== 'string' || !KNOWN_MARKS.has(type)) {
      throw new UnsupportedContentError(`mark:${String(type)}`, `${path}.marks`);
    }
    switch (type) {
      case 'bold':
        tags.push('<strong>');
        break;
      case 'italic':
        tags.push('<em>');
        break;
      case 'underline':
        tags.push('<u>');
        break;
      case 'strikethrough':
      case 'strike':
        tags.push('<s>');
        break;
      case 'code':
        tags.push('<code>');
        break;
      case 'subscript':
        tags.push('<sub>');
        break;
      case 'superscript':
        tags.push('<sup>');
        break;
      case 'link': {
        const href = (mark as { attrs?: { href?: unknown; title?: unknown } }).attrs?.href;
        if (typeof href === 'string' && isSafeHref(href)) {
          const title =
            typeof (mark as { attrs?: { title?: unknown } }).attrs?.title === 'string'
              ? (mark as { attrs: { title: string } }).attrs.title
              : '';
          const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
          tags.push(`<a href="${escapeAttr(href)}"${titleAttr}>`);
        }
        break;
      }
      default:
        break;
    }
  }
  return tags;
}

function closeMarks(marks: unknown): string[] {
  if (!Array.isArray(marks)) return [];
  const tags: string[] = [];
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    const mark = marks[i];
    if (!mark || typeof mark !== 'object') continue;
    const type = (mark as { type?: unknown }).type;
    if (typeof type !== 'string') continue;
    switch (type) {
      case 'bold':
        tags.push('</strong>');
        break;
      case 'italic':
        tags.push('</em>');
        break;
      case 'underline':
        tags.push('</u>');
        break;
      case 'strikethrough':
      case 'strike':
        tags.push('</s>');
        break;
      case 'code':
        tags.push('</code>');
        break;
      case 'subscript':
        tags.push('</sub>');
        break;
      case 'superscript':
        tags.push('</sup>');
        break;
      case 'link':
        if (typeof (mark as { attrs?: { href?: unknown } }).attrs?.href === 'string' && isSafeHref((mark as { attrs?: { href?: unknown } }).attrs?.href)) {
          tags.push('</a>');
        }
        break;
      default:
        break;
    }
  }
  return tags;
}

interface Ctx {
  filenameFor?: (mediaId: number) => string;
  images: ImageRef[];
}

function serializeInline(node: DocContent, path: string): string {
  if (node.type !== 'text') {
    throw new UnsupportedContentError(node.type, path);
  }
  const text = typeof node.text === 'string' ? escapeText(node.text) : '';
  const open = openMarks(node.marks, path);
  const close = closeMarks(node.marks);
  return `${open.join('')}${text}${close.join('')}`;
}

export function docToHtml(doc: DocContent, options: DocToHtmlOptions = {}): DocToHtmlResult {
  const ctx: Ctx = { filenameFor: options.filenameFor, images: [] };

  function block(node: DocContent, path: string): string {
    switch (node.type) {
      case 'paragraph': {
        const textAlign = (node.attrs as Record<string, unknown> | undefined)?.textAlign;
        const children = inline(node.content, path);
        return `<p${alignStyle(textAlign)}>${children}</p>`;
      }
      case 'heading': {
        const attrs = node.attrs as Record<string, unknown> | undefined;
        const level = typeof attrs?.level === 'number' ? attrs.level : 1;
        const children = inline(node.content, path);
        return `<h${level}${alignStyle(attrs?.textAlign)}>${children}</h${level}>`;
      }
      case 'bulletList':
        return `<ul>${listItems(node, path)}</ul>`;
      case 'orderedList': {
        const start = (node.attrs as Record<string, unknown> | undefined)?.start;
        const startAttr = typeof start === 'number' && start > 1 ? ` start="${start}"` : '';
        return `<ol${startAttr}>${listItems(node, path)}</ol>`;
      }
      case 'blockquote':
        return `<blockquote>${children(node, path)}</blockquote>`;
      case 'codeBlock': {
        const code = typeof node.text === 'string' ? escapeText(node.text) : '';
        const rows = (node.content ?? [])
          .map((child) =>
            child.type === 'text' && typeof child.text === 'string'
              ? escapeText(child.text)
              : ''
          )
          .join('');
        return `<pre><code>${rows || code}</code></pre>`;
      }
      case 'horizontalRule':
        return '<hr>';
      case 'image': {
        const attrs = node.attrs as Record<string, unknown> | undefined;
        const mediaId = typeof attrs?.mediaId === 'number' ? attrs.mediaId : 0;
        const alt = typeof attrs?.alt === 'string' ? attrs.alt : '';
        const width = intAttr(attrs?.width);
        const height = intAttr(attrs?.height);
        ctx.images.push({ mediaId, alt, width, height });

        const filename =
          typeof ctx.filenameFor === 'function' ? ctx.filenameFor(mediaId) : `media-${mediaId}`;
        const widthAttr = width ? ` width="${width}"` : '';
        const heightAttr = height ? ` height="${height}"` : '';
        const altAttr = alt ? ` alt="${escapeAttr(alt)}"` : ' alt=""';
        return `<img src="@@PLUGINFILE@@/${filename}"${altAttr}${widthAttr}${heightAttr}/>`;
      }
      case 'equation': {
        const value = typeof (node.attrs as Record<string, unknown> | undefined)?.value === 'string'
          ? (node.attrs as Record<string, unknown>).value as string
          : '';
        return `<tex>${value}</tex>`;
      }
      case 'table': {
        const rows = (node.content ?? [])
          .map((row, i) => block(row, `${path}.content[${i}]`))
          .join('');
        // Moodle's HTML sanitizer keeps the `style` attribute, and borders on
        // cells survive too. The Bootstrap classes render a nicer look where
        // the theme loads them; the inline borders are the theme-independent
        // fallback so tables always show a visible grid.
        return '<table class="table table-bordered" style="border:1px solid #555;border-collapse:collapse;width:100%"><tbody>' +
          rows + '</tbody></table>';
      }
      case 'tableRow':
        return `<tr>${(node.content ?? [])
          .map((cell, i) => block(cell, `${path}.content[${i}]`))
          .join('')}</tr>`;
      case 'tableCell':
      case 'tableHeader': {
        const tag = node.type === 'tableHeader' ? 'th' : 'td';
        const attrs = node.attrs as Record<string, unknown> | undefined;
        const colspan = typeof attrs?.colspan === 'number' && attrs.colspan >= 1 ? attrs.colspan : 1;
        const rowspan = typeof attrs?.rowspan === 'number' && attrs.rowspan >= 1 ? attrs.rowspan : 1;
        const colAttr = colspan > 1 ? ` colspan="${colspan}"` : '';
        const rowAttr = rowspan > 1 ? ` rowspan="${rowspan}"` : '';
        const textAlign = attrs?.textAlign;
        const alignStyleAttr =
          typeof textAlign === 'string' && ALIGN_VALUES.has(textAlign)
            ? `;text-align:${textAlign}`
            : '';
        // Grid border + padding per cell survive Moodle's HTML sanitizer.
        const cellStyle =
          ` style="border:1px solid #555;padding:4px 8px${alignStyleAttr}"`;
        // Cells contain block children (typically paragraphs) in the editor's
        // canonical schema, so serialize them as blocks, not inline runs.
        return `<${tag}${colAttr}${rowAttr}${cellStyle}>${children(node, path)}</${tag}>`;
      }
      case 'hardBreak':
        return '<br>';
      default:
        throw new UnsupportedContentError(node.type, path, node);
    }
  }

  function inline(nodes: DocContent[] | undefined, path: string): string {
    if (!Array.isArray(nodes)) return '';
    return nodes
      .map((child, i) => {
        if (child.type === 'text') return serializeInline(child, `${path}.content[${i}]`);
        // Inline-positioned node (image, equation, hardBreak).
        if (child.type === 'image' || child.type === 'equation' || child.type === 'hardBreak') {
          return block(child, `${path}.content[${i}]`);
        }
        // Block nodes that end up in an inline slot (e.g. a paragraph inside a
        // table cell or nested by pasted content) serialize as blocks instead
        // of failing the whole export.
        return block(child, `${path}.content[${i}]`);
      })
      .join('');
  }

  function listItems(node: DocContent, path: string): string {
    if (!Array.isArray(node.content)) return '';
    return node.content
      .map((item, i) => {
        if (item.type !== 'listItem') {
          throw new UnsupportedContentError(item.type, `${path}.content[${i}]`, item);
        }
        return `<li>${children(item, `${path}.content[${i}]`)}</li>`;
      })
      .join('');
  }

  function children(node: DocContent, path: string): string {
    if (!Array.isArray(node.content)) return '';
    return node.content
      .map((child, i) => block(child, `${path}.content[${i}]`))
      .join('');
  }

  if (!KNOWN_NODES.has(doc.type)) {
    throw new UnsupportedContentError(doc.type, 'doc');
  }
  const html = doc.type === 'doc' ? children(doc, 'doc') : block(doc, 'doc');
  return { html, images: ctx.images };
}

/** Walks a document and reports any unsupported node/mark types (used by validation). */
export function collectContentIssues(doc: DocContent | null | undefined): Array<{ code: string; message: string }> {
  const issues: Array<{ code: string; message: string }> = [];

  function walkNode(node: DocContent, path: string): void {
    if (!node || typeof node.type !== 'string') return;
    if (!KNOWN_NODES.has(node.type)) {
      issues.push({
        code: 'unsupported-content',
        message: `Jenis konten "${node.type}" tidak didukung untuk ekspor Moodle.`,
      });
    }
    if (node.type === 'text' && Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (
          mark &&
          typeof mark === 'object' &&
          typeof (mark as { type?: unknown }).type === 'string' &&
          !KNOWN_MARKS.has((mark as { type: string }).type)
        ) {
          issues.push({
            code: 'unsupported-content',
            message: `Pemarkahan "${(mark as { type: string }).type}" tidak didukung untuk ekspor Moodle.`,
          });
        }
      }
    }
    if (Array.isArray(node.content)) {
      node.content.forEach((child, i) => walkNode(child, `${path}.content[${i}]`));
    }
  }

  if (doc) walkNode(doc, 'doc');
  return issues;
}

/** Collects distinct media ids referenced by `image` nodes anywhere in a doc. */
export function collectMediaIds(doc: DocContent | null | undefined): number[] {
  const ids = new Set<number>();

  function walk(node: DocContent): void {
    if (node.type === 'image') {
      const mediaId = (node.attrs as Record<string, unknown> | undefined)?.mediaId;
      if (typeof mediaId === 'number' && Number.isInteger(mediaId) && mediaId > 0) {
        ids.add(mediaId);
      }
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  }

  if (doc) walk(doc);
  return [...ids];
}

/**
 * A document counts as empty only when it carries no meaningful content:
 * no non-blank text, and not even an image, equation or table (a teacher may
 * compose a question purely from media).
 */
export function isDocEmpty(doc: DocContent | null | undefined): boolean {
  if (!doc) return true;
  for (const node of walkAll(doc)) {
    switch (node.type) {
      case 'text':
        if (typeof node.text === 'string' && node.text.trim() !== '') return false;
        break;
      case 'image':
      case 'equation':
      case 'table':
        return false;
      default:
        break;
    }
  }
  return true;
}

function walkAll(doc: DocContent): DocContent[] {
  const out: DocContent[] = [];
  const stack: DocContent[] = [doc];
  while (stack.length > 0) {
    const node = stack.pop() as DocContent;
    out.push(node);
    if (Array.isArray(node.content)) stack.push(...node.content);
  }
  return out;
}
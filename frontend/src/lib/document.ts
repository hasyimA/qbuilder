import type { DocContent } from '@/lib/types';

export const MARK_TYPE_BY_NAME: Record<string, string> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strikethrough: 'strikethrough',
  strike: 'strikethrough',
  code: 'code',
  link: 'link',
};

export const DOC_NODES = new Set([
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

export const DOC_MARKS = new Set(['bold', 'italic', 'underline', 'strikethrough', 'strike', 'code', 'link']);

const TEXT_ALIGN_VALUES = new Set(['left', 'center', 'right', 'justify']);
const HEADING_LEVELS = new Set([1, 2, 3, 4, 5, 6]);

const NODE_ATTR_ALLOWLIST: Record<string, Set<string>> = {
  heading: new Set(['level', 'textAlign']),
  paragraph: new Set(['textAlign']),
  orderedList: new Set(['start', 'textAlign']),
  image: new Set(['mediaId', 'alt', 'width', 'height']),
  equation: new Set(['format', 'value']),
  tableCell: new Set(['colspan', 'rowspan', 'textAlign']),
  tableHeader: new Set(['colspan', 'rowspan', 'textAlign']),
};

const MAX_DEPTH = 20;

const SAFE_LINK_SCHEMES = /^(https?|mailto|tel):/i;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

export function isSafeHref(href: unknown): boolean {
  if (typeof href !== 'string') return false;
  const value = href.trim();
  if (!value) return false;
  if (SCHEME_PATTERN.test(value)) {
    return SAFE_LINK_SCHEMES.test(value);
  }
  return true;
}

function cleanAttrs(nodeType: string, attrs: unknown): Record<string, unknown> | undefined {
  if (!attrs || typeof attrs !== 'object') return undefined;

  const allowlist = NODE_ATTR_ALLOWLIST[nodeType];
  if (!allowlist) return undefined;

  const cleaned: Record<string, unknown> = {};

  if (nodeType === 'heading') {
    const level = (attrs as Record<string, unknown>).level;
    if (typeof level === 'number' && HEADING_LEVELS.has(level)) cleaned.level = level;
  }

  if (nodeType === 'orderedList') {
    const start = (attrs as Record<string, unknown>).start;
    if (typeof start === 'number' && Number.isInteger(start) && start >= 1) cleaned.start = start;
  }

  if (nodeType === 'image') {
    const mediaId = (attrs as Record<string, unknown>).mediaId;
    if (typeof mediaId === 'number' && Number.isInteger(mediaId) && mediaId > 0) {
      cleaned.mediaId = mediaId;
    } else {
      return undefined;
    }
    const alt = (attrs as Record<string, unknown>).alt;
    if (typeof alt === 'string') cleaned.alt = alt.slice(0, 255);
    const width = (attrs as Record<string, unknown>).width;
    if (typeof width === 'number' && Number.isInteger(width) && width > 0) cleaned.width = width;
    const height = (attrs as Record<string, unknown>).height;
    if (typeof height === 'number' && Number.isInteger(height) && height > 0) cleaned.height = height;
  }

  if (nodeType === 'equation') {
    const format = (attrs as Record<string, unknown>).format;
    if (format !== 'latex') return undefined;
    const value = (attrs as Record<string, unknown>).value;
    if (typeof value !== 'string') return undefined;
    cleaned.format = 'latex';
    cleaned.value = value.slice(0, 2000);
  }

  if (nodeType === 'tableCell' || nodeType === 'tableHeader') {
    const colspan = (attrs as Record<string, unknown>).colspan;
    const rowspan = (attrs as Record<string, unknown>).rowspan;
    if (typeof colspan === 'number' && Number.isInteger(colspan) && colspan >= 1) cleaned.colspan = colspan;
    if (typeof rowspan === 'number' && Number.isInteger(rowspan) && rowspan >= 1) cleaned.rowspan = rowspan;
  }

  if (allowlist.has('textAlign')) {
    const align = (attrs as Record<string, unknown>).textAlign;
    if (typeof align === 'string' && TEXT_ALIGN_VALUES.has(align)) cleaned.textAlign = align;
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function cleanMarks(marks: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(marks)) return undefined;

  const cleaned: Array<Record<string, unknown>> = [];

  for (const mark of marks) {
    if (!mark || typeof mark !== 'object') continue;
    const type = (mark as { type?: unknown }).type;
    const canonicalType = typeof type === 'string' ? MARK_TYPE_BY_NAME[type] : undefined;
    if (!canonicalType) continue;

    if (canonicalType === 'link') {
      const attrs = (mark as { attrs?: unknown }).attrs;
      if (!attrs || typeof attrs !== 'object') continue;
      const href = (attrs as { href?: unknown }).href;
      if (!isSafeHref(href)) continue;
      const title = (attrs as { title?: unknown }).title;
      const cleanedAttrs: Record<string, unknown> = { href: href as string };
      if (typeof title === 'string' && title.trim() !== '') cleanedAttrs.title = title.slice(0, 255);
      cleaned.push({ type: 'link', attrs: cleanedAttrs });
      continue;
    }

    cleaned.push({ type: canonicalType });
  }

  return cleaned.length > 0 ? cleaned : undefined;
}

function walk(node: unknown, depth: number): DocContent | null {
  if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return null;

  const candidate = node as Record<string, unknown>;
  const type = candidate.type;
  if (typeof type !== 'string' || !DOC_NODES.has(type)) return null;

  if (type === 'text') {
    const text = candidate.text;
    if (typeof text !== 'string' || text.length === 0) return null;
    if (text.length > 20000) return null;

    const output: DocContent = { type: 'text', text };
    const marks = cleanMarks(candidate.marks);
    if (marks) output.marks = marks as DocContent[];
    return output;
  }

  const output: DocContent = { type };

  const attrs = cleanAttrs(type, candidate.attrs);
  if (attrs) output.attrs = attrs;

  if (type === 'image' || type === 'equation') {
    if (!attrs) return null;
    return output;
  }

  const content = candidate.content;
  if (Array.isArray(content)) {
    const children = content
      .map((child) => walk(child, depth + 1))
      .filter((child): child is DocContent => child !== null);
    if (children.length > 0) output.content = children;
  }

  return output;
}

export interface CanonicalizeResult {
  doc: DocContent | null;
}

export function canonicalizeDoc(doc: unknown): DocContent | null {
  return walk(doc, 0);
}

export function hasContentText(doc: unknown): boolean {
  const canonical = canonicalizeDoc(doc);
  if (!canonical) return false;
  return plainText(canonical).trim().length > 0;
}

export function plainText(doc: unknown, depth = 0): string {
  if (!doc || typeof doc !== 'object' || depth > 8) return '';
  const node = doc as Record<string, unknown>;

  if (node.type === 'text' && typeof node.text === 'string') {
    return node.text;
  }

  if (Array.isArray(node.content)) {
    const inline = ['paragraph', 'heading', 'listItem', 'tableCell', 'tableHeader'];
    const separator = typeof node.type === 'string' && inline.includes(node.type) ? '' : '\n';
    return node.content.map((child) => plainText(child, depth + 1)).filter(Boolean).join(separator);
  }

  return '';
}

function mapDoc(node: DocContent, mapper: (node: DocContent) => DocContent): DocContent {
  const mapped = mapper(node);
  if (Array.isArray(mapped.content)) {
    return { ...mapped, content: mapped.content.map((child) => mapDoc(child, mapper)) };
  }
  return mapped;
}

export function toEditorContent(doc: DocContent | null | undefined): DocContent {
  const canonical = canonicalizeDoc(doc);
  if (!canonical) return { type: 'doc', content: [] };

  return mapDoc(canonical, (node) => {
    if (node.type === 'text' && Array.isArray(node.marks)) {
      return {
        ...node,
        marks: node.marks.map((mark) =>
          mark.type === 'strikethrough' ? { ...mark, type: 'strike' } : mark
        ),
      };
    }
    return node;
  });
}
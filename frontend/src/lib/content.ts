import type { DocContent } from './types';

export function emptyDoc(): DocContent {
  return { type: 'doc', content: [] };
}

export function paragraphDoc(text: string): DocContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

export function textToDoc(text: string): DocContent {
  const trimmed = text.trim();
  if (!trimmed) return emptyDoc();
  return paragraphDoc(trimmed);
}

export function docToText(doc: DocContent | null | undefined, depth = 0): string {
  if (!doc || depth > 6) return '';

  if (doc.text !== undefined) {
    return typeof doc.text === 'string' ? doc.text : '';
  }

  if (Array.isArray(doc.content)) {
    return doc.content.map((node) => docToText(node, depth + 1)).filter(Boolean).join('\n');
  }

  return '';
}

export function docToPlainText(doc: DocContent | null | undefined): string {
  const text = docToText(doc);
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export function isDocEmpty(doc: DocContent | null | undefined): boolean {
  const text = docToPlainText(doc);
  return text.length === 0;
}
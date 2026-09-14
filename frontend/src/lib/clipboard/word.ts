import { convertOmmlElement, isRenderableLatex } from './omml';

// Word detection + normalization for text/html clipboard payloads.
//
// Word's HTML copy is verbose and includes IE-era conditional comments, XML
// settings blocks, namespace-prefixed markup (`o:`, `w:`, `m:`, `v:`), inline
// `mso-` styles and `<v:shape>` VML duplicates. We normalize it into clean,
// semantic HTML that the rest of the sanitization pipeline can consume.

const WORD_MARKERS = [
  'urn:schemas-microsoft-com:office:office',
  'urn:schemas-microsoft-com:office:word',
  'MsoNormal',
  '<o:p',
  '<!--[if',
  'xmlns:m',
];

export function isWordHtml(html: string): boolean {
  if (!html) return false;
  return WORD_MARKERS.some((marker) => html.includes(marker));
}

function removeCommentNodes(root: Element): void {
  const removed: Array<{ node: Node; parent: Node }> = [];

  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.COMMENT_NODE) {
        removed.push({ node: child, parent: node });
      } else {
        walk(child);
      }
    }
  };
  walk(root);

  for (const { node, parent } of removed) {
    parent.removeChild(node);
  }
}

const DROP_TAGS = new Set([
  'xml',
  'style',
  'link',
  'meta',
  'title',
  'head',
  'script',
  'template',
  'v:group',
  'v:shape',
  'v:imagedata',
  'o:shapedefaults',
  'o:shapelayout',
]);

function dropNoiseElements(root: Element): void {
  for (const child of Array.from(root.querySelectorAll('*'))) {
    const name = child.tagName.toLowerCase();
    if (DROP_TAGS.has(name)) {
      child.remove();
    }
  }
}

function collectMathElements(root: Element): Element[] {
  const out: Element[] = [];

  const walk = (node: Element): void => {
    for (const child of Array.from(node.children)) {
      const name = child.tagName.toLowerCase();
      if (name.endsWith(':omath') || name.endsWith(':omathpara')) {
        out.push(child);
        continue;
      }
      walk(child);
    }
  };

  walk(root);
  return out;
}

function convertMathElements(root: Element): void {
  const doc = root.ownerDocument;
  for (const el of collectMathElements(root)) {
    const latex = convertOmmlElement(el);
    if (latex !== null && isRenderableLatex(latex)) {
      const span = doc.createElement('span');
      span.setAttribute('data-equation', latex);
      el.replaceWith(span);
    } else {
      // Honest fallback: keep the math text visible instead of dropping it.
      const fallback = doc.createElement('code');
      const text = el.textContent?.trim() ?? '';
      fallback.textContent = text === '' ? '[equation]' : `[equation: ${text}]`;
      el.replaceWith(fallback);
    }
  }
}

function normalizeParagraphMarks(root: Element): void {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const name = el.tagName.toLowerCase();
    if (name !== 'o:p') continue;

    const hasText = (el.textContent ?? '').trim().length > 0;
    if (hasText) {
      const fragment = root.ownerDocument.createDocumentFragment();
      while (el.firstChild) {
        fragment.appendChild(el.firstChild);
      }
      el.replaceWith(fragment);
    } else {
      const br = root.ownerDocument.createElement('br');
      el.replaceWith(br);
    }
  }
}

/**
 * Converts a Word HTML payload into clean semantic HTML:
 * - removes comment nodes, XML settings, VML, embedded style/link blocks
 * - converts OMML equations into `<span data-equation="…">` (or a visible
 *   `[equation: …]` fallback when conversion would not be accurate)
 * - normalizes `<o:p>` paragraph markers
 */
export function normalizeWordHtml(html: string): string {
  if (!html) return '';

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  if (!body) return html;

  removeCommentNodes(body);
  dropNoiseElements(body);
  convertMathElements(body);
  normalizeParagraphMarks(body);

  return body.innerHTML;
}
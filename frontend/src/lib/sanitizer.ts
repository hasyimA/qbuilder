const ALLOWED_TAGS: Record<string, string[]> = {
  p: [],
  br: [],
  div: [],
  span: ['data-equation'],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  ul: [],
  ol: ['start'],
  li: [],
  blockquote: [],
  hr: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  u: [],
  s: [],
  strike: [],
  del: [],
  ins: [],
  code: [],
  pre: [],
  sub: [],
  sup: [],
  small: [],
  a: ['href', 'title'],
  img: ['src', 'alt', 'width', 'height', 'data-media-id', 'data-width', 'data-height'],
  table: [],
  thead: [],
  tbody: [],
  tfoot: [],
  tr: [],
  th: ['colspan', 'rowspan'],
  td: ['colspan', 'rowspan'],
  caption: [],
};

const REMOVE_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'template',
]);

const SAFE_LINK_SCHEMES = /^(https?|mailto|tel):/i;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

export function isSafeHref(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (SCHEME_PATTERN.test(trimmed)) {
    return SAFE_LINK_SCHEMES.test(trimmed);
  }
  return true;
}

export function isSafeImageSrc(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (SCHEME_PATTERN.test(trimmed)) {
    return /^https?:/i.test(trimmed);
  }
  return true;
}

function cleanAttributes(element: Element, tag: string): void {
  const allowed = ALLOWED_TAGS[tag] ?? [];

  for (const attr of Array.from(element.attributes)) {
    if (!allowed.includes(attr.name)) {
      element.removeAttribute(attr.name);
    }
  }

  if (tag === 'a') {
    const href = element.getAttribute('href');
    if (!isSafeHref(href)) {
      element.removeAttribute('href');
    }
  }

  if (tag === 'img') {
    const mediaId = element.getAttribute('data-media-id');
    const hasMediaReference = mediaId !== null && /^\d+$/.test(mediaId);
    if (!hasMediaReference) {
      element.remove();
      return;
    }
    element.removeAttribute('src');
    for (const dim of ['width', 'height', 'data-width', 'data-height']) {
      const value = element.getAttribute(dim);
      if (value !== null && !/^\d+$/.test(value)) {
        element.removeAttribute(dim);
      }
    }
  }

  if (tag === 'ol') {
    const start = element.getAttribute('start');
    if (start !== null && (!/^\d+$/.test(start) || Number(start) < 1)) {
      element.removeAttribute('start');
    }
  }

  if (tag === 'th' || tag === 'td') {
    for (const dim of ['colspan', 'rowspan']) {
      const value = element.getAttribute(dim);
      if (value !== null && (!/^\d+$/.test(value) || Number(value) < 1)) {
        element.removeAttribute(dim);
      }
    }
  }
}

function cleanElement(node: Element): void {
  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toLowerCase();

    if (REMOVE_TAGS.has(tag)) {
      child.remove();
      continue;
    }

    if (!(tag in ALLOWED_TAGS)) {
      const displaced = Array.from(child.childNodes);
      child.replaceWith(...displaced);
      for (const item of displaced) {
        if (item instanceof Element) cleanElement(item);
      }
      continue;
    }

    cleanAttributes(child, tag);
    cleanElement(child);
  }
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const body = parsed.body;
  if (!body) return '';

  cleanElement(body);

  return body.innerHTML;
}

export function stripHtmlToFragment(html: string): string {
  return sanitizeHtml(html);
}
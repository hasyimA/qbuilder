import { describe, expect, it } from 'vitest';
import {
  canonicalizeDoc,
  hasContentText,
  isSafeHref,
  plainText,
  toEditorContent,
} from '@/lib/document';

describe('canonicalizeDoc', () => {
  it('normalizes a simple paragraph document', () => {
    const input = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] };

    expect(canonicalizeDoc(input)).toEqual(input);
  });

  it('maps tiptap strike mark to canonical strikethrough', () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi', marks: [{ type: 'strike' }] }] },
      ],
    };

    const result = canonicalizeDoc(input);
    const text = result?.content?.[0]?.content?.[0];
    expect(text?.marks).toEqual([{ type: 'strikethrough' }]);
  });

  it('keeps strikethrough as-is', () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi', marks: [{ type: 'strikethrough' }] }] },
      ],
    };

    const result = canonicalizeDoc(input);
    expect(result?.content?.[0]?.content?.[0]?.marks).toEqual([{ type: 'strikethrough' }]);
  });

  it('rejects unsafe link hrefs', () => {
    const input = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }],
        },
      ],
    };

    const result = canonicalizeDoc(input);
    expect(result?.content?.[0]?.content?.[0]?.marks).toBeUndefined();
  });

  it('keeps safe link href and drops extra attrs', () => {
    const input = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'https://a.com', target: '_blank', rel: 'nofollow', class: 'y' } }] },
          ],
        },
      ],
    };

    const result = canonicalizeDoc(input);
    expect(result?.content?.[0]?.content?.[0]?.marks).toEqual([
      { type: 'link', attrs: { href: 'https://a.com' } },
    ]);
  });

  it('drops unknown node types', () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'ok' }] },
        { type: 'script', content: [{ type: 'text', text: 'alert(1)' }] },
      ],
    };

    const result = canonicalizeDoc(input);
    expect(result?.content).toHaveLength(1);
  });

  it('drops unknown mark types', () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'marquee' }] }] },
      ],
    };

    const result = canonicalizeDoc(input);
    expect(result?.content?.[0]?.content?.[0]?.marks).toBeUndefined();
  });

  it('requires image mediaId to be a positive integer', () => {
    const result = canonicalizeDoc({ type: 'doc', content: [{ type: 'image', attrs: { mediaId: 0 } }] });
    expect(result?.content).toBeUndefined();
  });

  it('keeps valid image attrs and drops junk', () => {
    const input = {
      type: 'doc',
      content: [{ type: 'image', attrs: { mediaId: 5, alt: 'Diagram', width: 300, height: 200, onerror: 'x' } }],
    };

    const result = canonicalizeDoc(input);
    expect(result?.content?.[0]?.attrs).toEqual({ mediaId: 5, alt: 'Diagram', width: 300, height: 200 });
  });

  it('only accepts latex equations with a string value', () => {
    const ok = canonicalizeDoc({
      type: 'doc',
      content: [{ type: 'equation', attrs: { format: 'latex', value: 'x^2' } }],
    });
    expect(ok?.content?.[0]?.attrs).toEqual({ format: 'latex', value: 'x^2' });

    const bad = canonicalizeDoc({
      type: 'doc',
      content: [{ type: 'equation', attrs: { format: 'html', value: '<b>x</b>' } }],
    });
    expect(bad?.content).toBeUndefined();
  });

  it('preserves table structure with colspan attrs', () => {
    const input = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            { type: 'tableRow', attrs: {}, content: [{ type: 'tableCell', attrs: { colspan: 2 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'c' }] }] }] },
          ],
        },
      ],
    };

    const result = canonicalizeDoc(input);
    expect(result?.content?.[0]?.type).toBe('table');
    expect(result?.content?.[0]?.content?.[0]?.content?.[0]?.attrs).toEqual({ colspan: 2 });
  });

  it('returns null for non-object input', () => {
    expect(canonicalizeDoc(null)).toBeNull();
    expect(canonicalizeDoc('x')).toBeNull();
  });
});

describe('toEditorContent', () => {
  it('maps canonical strikethrough to tiptap strike', () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi', marks: [{ type: 'strikethrough' }] }] },
      ],
    };

    const result = toEditorContent(input);
    expect(result.content?.[0]?.content?.[0]?.marks).toEqual([{ type: 'strike' }]);
  });

  it('returns an empty doc for null input', () => {
    expect(toEditorContent(null)).toEqual({ type: 'doc', content: [] });
  });
});

describe('hasContentText/plainText', () => {
  it('detects text presence and renders plain text', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'What is ' }, { type: 'text', text: 'TCP?' }] }] };
    expect(hasContentText(doc)).toBe(true);
    expect(plainText(doc)).toBe('What is TCP?');
  });

  it('returns false for empty doc', () => {
    expect(hasContentText({ type: 'doc', content: [] })).toBe(false);
  });
});

describe('isSafeHref', () => {
  it('validates schemes', () => {
    expect(isSafeHref('https://x.com')).toBe(true);
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('')).toBe(false);
    expect(isSafeHref(5)).toBe(false);
  });
});
import { describe, expect, it } from 'vitest';
import { isSafeHref, isSafeImageSrc, sanitizeHtml } from '@/lib/sanitizer';

describe('sanitizeHtml', () => {
  it('keeps plain formatting tags', () => {
    const result = sanitizeHtml('<p>Hello <b>world</b> <i>italic</i> <u>under</u></p>');

    expect(result).toContain('<p>Hello <b>world</b> <i>italic</i> <u>under</u></p>');
  });

  it('strips script tags entirely', () => {
    const result = sanitizeHtml('<p>safe</p><script>alert(1)</script>');

    expect(result).not.toContain('script');
    expect(result).not.toContain('alert(1)');
  });

  it('strips event handler attributes', () => {
    const result = sanitizeHtml('<p onclick="alert(1)" onerror="x()">safe</p>');

    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onerror');
  });

  it('rejects javascript: links', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a><a href="https://ok.com">ok</a>');

    expect(result).not.toContain('javascript:');
    expect(result).toContain('href="https://ok.com"');
  });

  it('rejects data: links', () => {
    const result = sanitizeHtml('<a href="data:text/html;base64,xxx">click</a>');

    expect(result).not.toContain('data:text/html');
  });

  it('rejects iframe, embed and object', () => {
    const result = sanitizeHtml('<p>a</p><iframe src="https://evil.com"></iframe><embed src="x"><object data="y"></object>');

    expect(result).not.toContain('iframe');
    expect(result).not.toContain('embed');
    expect(result).not.toContain('object');
  });

  it('unwraps disallowed tags but keeps their text', () => {
    const result = sanitizeHtml('<p>Before <font color="red">colored</font> after</p>');

    expect(result).not.toContain('font');
    expect(result).toContain('colored');
  });

  it('keeps tables with colspan/rowspan but strips style', () => {
    const result = sanitizeHtml(
      '<table style="border:1px"><tr><td colspan="2" rowspan="1" style="color:red">cell</td></tr></table>'
    );

    expect(result).toContain('<table>');
    expect(result).toContain('<td colspan="2" rowspan="1"');
    expect(result).not.toContain('border:1px');
    expect(result).not.toContain('color:red');
  });

  it('keeps media-referenced images and strips non-numeric dimensions', () => {
    const result = sanitizeHtml(
      '<img src="https://a.com/x.png" data-media-id="7" width="abc" data-width="12" alt="pic">'
    );

    expect(result).toContain('data-media-id="7"');
    expect(result).toContain('data-width="12"');
    expect(result).not.toContain('src=');
    expect(result).not.toContain('width="abc"');
    expect(result).toContain('alt="pic"');
  });

  it('drops images without a media reference and keeps equation spans', () => {
    const result = sanitizeHtml(
      '<img src="data:image/png;base64,AAAA"><img data-media-id="3"><span data-equation="\\frac{1}{2}">x</span>'
    );

    expect(result).not.toContain('data:image');
    expect(result).not.toContain('<img src="data:image/png;base64,AAAA">');
    expect(result).toContain('<img data-media-id="3">');
    expect(result).toContain('data-equation="\\frac{1}{2}"');
  });

  it('keeps Word-style structure tags (lists, headings, blockquote)', () => {
    const input =
      '<h2>Section</h2><ul><li>one</li><li>two</li></ul><ol start="3"><li>three</li></ol><blockquote>quote</blockquote>';
    const result = sanitizeHtml(input);

    expect(result).toContain('<h2>Section</h2>');
    expect(result).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(result).toContain('<ol start="3">');
    expect(result).toContain('<blockquote>quote</blockquote>');
  });

  it('strips style/class/id attributes', () => {
    const result = sanitizeHtml('<p class="x" id="y" contenteditable="true" style="a">text</p>');

    expect(result).not.toContain('class="x"');
    expect(result).not.toContain('id="y"');
    expect(result).not.toContain('contenteditable');
    expect(result).not.toContain('style=');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml('<script>alert(1)</script>')).toBe('');
  });
});

describe('isSafeHref/isSafeImageSrc', () => {
  it('accepts http, https, mailto, tel and rejects javascript/data/vbscript', () => {
    expect(isSafeHref('https://a.com')).toBe(true);
    expect(isSafeHref('mailto:a@b.com')).toBe(true);
    expect(isSafeHref('tel:+62123')).toBe(true);
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('data:text/html,<b>x</b>')).toBe(false);
    expect(isSafeHref('vbscript:x')).toBe(false);
    expect(isSafeHref('/relative/path')).toBe(true);
    expect(isSafeHref('relative')).toBe(true);
  });

  it('image src only accepts http(s) or relative', () => {
    expect(isSafeImageSrc('https://a.com/x.png')).toBe(true);
    expect(isSafeImageSrc('/media/x.png')).toBe(true);
    expect(isSafeImageSrc('data:image/png;base64,xxx')).toBe(false);
    expect(isSafeImageSrc('javascript:x')).toBe(false);
  });
});
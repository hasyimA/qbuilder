import { describe, expect, it } from 'vitest';
import { isWordHtml, normalizeWordHtml } from '@/lib/clipboard/word';

const WORD_HTML_FIXTURE = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
<head><meta charset="utf-8"><style>@font-face{font-family:Calibri}</style></head>
<body>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<p class=MsoNormal><b>Question:</b> Solve for x.</p>
<p class=MsoNormal>Equation: <m:oMath><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f><m:r><m:t> x</m:t></m:r></m:oMath></p>
<p class=MsoNormal>A. zero<o:p></o:p></p>
<p class=MsoNormal><o:p></o:p></p>
<p class=MsoNormal>B. one<img src="data:image/png;base64,iVBORw0KGgo=" alt="graph"></p>
</body></html>
`;

describe('isWordHtml', () => {
  it('detects Word markup markers', () => {
    expect(isWordHtml(WORD_HTML_FIXTURE)).toBe(true);
  });

  it('returns false for ordinary HTML', () => {
    expect(isWordHtml('<p>plain <b>html</b></p>')).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(isWordHtml('')).toBe(false);
  });
});

describe('normalizeWordHtml', () => {
  const output = normalizeWordHtml(WORD_HTML_FIXTURE);

  it('removes conditional comments and XML settings', () => {
    expect(output).not.toContain('<!--');
    expect(output).not.toContain('<xml>');
    expect(output).not.toContain('WordDocument');
  });

  it('removes embedded style blocks', () => {
    expect(output).not.toContain('<style>');
    expect(output).not.toContain('@font-face');
  });

  it('converts OMML into an equation span', () => {
    expect(output).toContain('data-equation="\\frac{1}{2} x"');
    expect(output).not.toContain('m:oMath');
  });

  it('replaces empty <o:p> markers with <br> and unwraps non-empty ones', () => {
    expect(output).not.toContain('<o:p');
    expect(output).not.toContain('zero</o:p>');
    expect(output).toContain('A. zero');
  });

  it('keeps formatting and images in place for later sanitization', () => {
    expect(output).toContain('<b>Question:</b>');
    expect(output).toContain('data:image/png;base64');
    expect(output).toContain('alt="graph"');
  });

  it('returns text unchanged for empty input', () => {
    expect(normalizeWordHtml('')).toBe('');
  });
});

describe('normalizeWordHtml fallback equations', () => {
  it('keeps unconvertible math as a visible [equation] note', () => {
    const html =
      '<p>x <m:oMath><m:r><m:t>a</m:t></m:r><m:frobnicate><m:t>?</m:t></m:frobnicate></m:oMath></p>';
    const output = normalizeWordHtml(html);

    expect(output).toContain('equation');
    expect(output).toContain('?');
  });
});
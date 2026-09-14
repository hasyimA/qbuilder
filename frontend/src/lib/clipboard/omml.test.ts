import { describe, expect, it } from 'vitest';
import { convertOmmlElement, isRenderableLatex } from '@/lib/clipboard/omml';

function omml(inner: string): Element {
  const doc = new DOMParser().parseFromString(
    `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${inner}</m:oMath>`,
    'text/html'
  );
  const el = doc.body.firstElementChild;
  if (!el) throw new Error('fixture parse failed');
  return el;
}

function tex(inner: string): string | null {
  return convertOmmlElement(omml(inner));
}

describe('convertOmmlElement', () => {
  it('converts a simple run of text', () => {
    expect(tex('<m:r><m:t>2x+3</m:t></m:r>')).toBe('2x+3');
  });

  it('converts unicode operators to LaTeX commands', () => {
    expect(tex('<m:r><m:t>a ≤ b ≠ c × d ÷ e</m:t></m:r>')).toBe(
      'a \\leq b \\neq c \\times d \\div e'
    );
  });

  it('converts fractions', () => {
    expect(
      tex('<m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f>')
    ).toBe('\\frac{1}{2}');
  });

  it('converts square roots', () => {
    expect(tex('<m:rad><m:e><m:r><m:t>x+1</m:t></m:r></m:e></m:rad>')).toBe(
      '\\sqrt{x+1}'
    );
  });

  it('converts superscripts and subscripts', () => {
    expect(
      tex('<m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>')
    ).toBe('x^{2}');
    expect(
      tex('<m:sSub><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sub><m:r><m:t>i</m:t></m:r></m:sub></m:sSub>')
    ).toBe('x_{i}');
  });

  it('converts n-ary summation with limits', () => {
    expect(
      tex(
        '<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr>' +
          '<m:sub><m:r><m:t>i=1</m:t></m:r></m:sub>' +
          '<m:sup><m:r><m:t>n</m:t></m:r></m:sup>' +
          '<m:e><m:r><m:t>i</m:t></m:r></m:e></m:nary>'
      )
    ).toBe('\\sum_{i=1}^n i');
  });

  it('converts delimiters', () => {
    expect(
      tex('<m:d><m:dPr><m:begChr m:val="["/></m:dPr><m:e><m:r><m:t>a</m:t></m:r></m:e></m:d>')
    ).toBe('\\left[a\\right]');
  });

  it('converts an equation array as aligned lines', () => {
    expect(
      tex(
        '<m:eqArr><m:e><m:r><m:t>x</m:t></m:r><m:r><m:t>=1</m:t></m:r></m:e>' +
          '<m:e><m:r><m:t>y</m:t></m:r><m:r><m:t>=2</m:t></m:r></m:e></m:eqArr>'
      )
    ).toBe('\\begin{aligned}x=1\\\\ y=2 \\end{aligned}');
  });

  it('returns null for a single unrecognised construct', () => {
    expect(tex('<m:r><m:t>x</m:t></m:r><m:weirdElement><m:t>?</m:t></m:weirdElement>')).toBeNull();
  });

  it('returns null for empty math', () => {
    expect(tex('')).toBeNull();
  });
});

describe('isRenderableLatex', () => {
  it('accepts well-formed LaTeX', () => {
    expect(isRenderableLatex('\\frac{1}{2}')).toBe(true);
    expect(isRenderableLatex('x^{2}+y_{1}')).toBe(true);
  });

  it('rejects malformed LaTeX', () => {
    expect(isRenderableLatex('\\frac{1')).toBe(false);
    expect(isRenderableLatex('')).toBe(false);
    expect(isRenderableLatex('   ')).toBe(false);
  });
});
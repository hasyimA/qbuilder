import { describe, expect, it } from 'vitest';
import { cdata, escapeXml } from '../moodle/xml-escape';

describe('xml escaping', () => {
  it('escapes XML metacharacters in text', () => {
    const input = `Tom & Jerry <swift> "quote" 'apostrophe'`;
    expect(escapeXml(input)).toBe(
      'Tom &amp; Jerry &lt;swift&gt; &quot;quote&quot; &apos;apostrophe&apos;'
    );
  });

  it('handles Indonesian characters and accents unchanged', () => {
    const input = 'Jaringan komputer § é ñ π 日本語 سؤال';
    expect(escapeXml(input)).toBe(input);
  });

  it('wraps content in CDATA without touching inner HTML', () => {
    expect(cdata('<p>A & B</p>')).toBe('<![CDATA[<p>A & B</p>]]>');
  });

  it('splits CDATA terminators safely', () => {
    const input = '<p>a]]>b</p>';
    const wrapped = cdata(input);
    expect(wrapped).toBe('<![CDATA[<p>a]]]]><![CDATA[>b</p>]]>');
    // After XML parsing the two sections concatenate back to the original text.
  });
});
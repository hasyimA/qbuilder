import { describe, expect, it } from 'vitest';
import { docToHtml, collectMediaIds, collectContentIssues, UnsupportedContentError } from '../moodle/doc-to-html';
import type { DocContent } from '@/lib/types';
import { textDoc, richDoc } from './_support';

describe('docToHtml', () => {
  it('serializes paragraphs and escapes text', () => {
    const doc: DocContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '5 < 7 & "yes"' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Kedua' }] },
      ],
    };
    expect(docToHtml(doc).html).toBe('<p>5 &lt; 7 &amp; &quot;yes&quot;</p><p>Kedua</p>');
  });

  it('maps marks to html tags', () => {
    const doc: DocContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'r', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'i', marks: [{ type: 'italic' }] },
            { type: 'text', text: 'u', marks: [{ type: 'underline' }] },
            { type: 'text', text: 's', marks: [{ type: 'strikethrough' }] },
            { type: 'text', text: 'c', marks: [{ type: 'code' }] },
            { type: 'text', text: 'l', marks: [{ type: 'link', attrs: { href: '/a?b=1&c=2' } }] },
            { type: 'text', text: 'sub', marks: [{ type: 'subscript' }] },
            { type: 'text', text: 'sup', marks: [{ type: 'superscript' }] },
          ],
        },
      ],
    };
    expect(docToHtml(doc).html).toBe(
      '<p><strong>r</strong><em>i</em><u>u</u><s>s</s><code>c</code>' +
        '<a href="/a?b=1&amp;c=2">l</a><sub>sub</sub><sup>sup</sup></p>'
    );
  });

  it('renders headings with level and align style', () => {
    const doc: DocContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 3, textAlign: 'center' },
          content: [{ type: 'text', text: 'Judul' }],
        },
      ],
    };
    expect(docToHtml(doc).html).toBe('<h3 style="text-align:center">Judul</h3>');
  });

  it('renders lists, blockquote, hr, code block and br', () => {
    const doc: DocContent = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
            },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 2 },
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }],
            },
          ],
        },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kutipan' }] }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1 < 2;' }] },
        { type: 'horizontalRule' },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }],
        },
      ],
    };
    const html = docToHtml(doc).html;
    expect(html).toContain('<ul><li><p>A</p></li></ul>');
    expect(html).toContain('<ol start="2"><li><p>B</p></li></ol>');
    expect(html).toContain('<blockquote><p>Kutipan</p></blockquote>');
    expect(html).toContain('<pre><code>const x = 1 &lt; 2;</code></pre>');
    expect(html).toContain('<hr>');
    expect(html).toContain('<p>a<br>b</p>');
  });

  it('renders table, image (@@PLUGINFILE@@) and equation', () => {
    const html = docToHtml(richDoc(), { filenameFor: () => 'router-5.png' }).html;
    expect(html).toContain('<h2>Transmisi Data</h2>');
    expect(html).toContain('<strong><em>meneruskan</em></strong>');
    expect(html).toContain('<a href="https://example.test/router" title="contoh"> frame ke</a>');
    expect(html).toContain('<code>kode</code>');
    expect(html).toContain('<ul><li><p>Item A</p></li><li><p>Item B</p></li></ul>');
    expect(html).toContain('<img src="@@PLUGINFILE@@/router-5.png" alt="Diagram Router" width="600" height="400"/>');
    expect(html).toContain('<tex>E=mc^2</tex>');
    expect(html).toContain('<table class="table table-bordered" style="border:1px solid #555;border-collapse:collapse;width:100%"><tbody>');
    expect(html).toContain('<th style="border:1px solid #555;padding:4px 8px"><p>Perangkat</p></th><th style="border:1px solid #555;padding:4px 8px"><p>Fungsi</p></th>');
    expect(html).toContain('<td style="border:1px solid #555;padding:4px 8px"><p>Router</p></td><td style="border:1px solid #555;padding:4px 8px"><p>Meneruskan paket</p></td>');
  });

  it('serializes real editor tables whose cells contain paragraphs (regression)', () => {
    const doc: DocContent = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  attrs: {},
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Paket' }],
                    },
                  ],
                },
                {
                  type: 'tableCell',
                  attrs: {},
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: '1460 B' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const html = docToHtml(doc).html;
    expect(html).toBe(
      '<table class="table table-bordered" style="border:1px solid #555;border-collapse:collapse;width:100%"><tbody><tr><th style="border:1px solid #555;padding:4px 8px"><p>Paket</p></th><td style="border:1px solid #555;padding:4px 8px"><p>1460 B</p></td></tr></tbody></table>'
    );
  });

  it('serializes block nodes nested in inline slots instead of failing', () => {
    const doc: DocContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'nested' }],
            },
          ],
        },
      ],
    };
    expect(() => docToHtml(doc)).not.toThrow();
    expect(docToHtml(doc).html).toBe('<p><p>nested</p></p>');
  });

  it('includes a content snippet in unsupported-node errors', () => {
    const doc: DocContent = {
      type: 'doc',
      content: [{ type: 'mystery', content: [{ type: 'text', text: 'x' }] }],
    };
    let message = '';
    try {
      docToHtml(doc);
    } catch (err) {
      message = err instanceof Error ? err.message : '';
    }
    expect(message).toContain('doc.content[0]');
    expect(message).toContain('"mystery"');
  });

  it('drops unsafe link schemes while keeping the link text', () => {
    const doc: DocContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'safe', marks: [{ type: 'link', attrs: { href: 'https://example.test' } }] },
            { type: 'text', text: ' protocol', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
            { type: 'text', text: ' local', marks: [{ type: 'link', attrs: { href: '/relative' } }] },
          ],
        },
      ],
    };
    const html = docToHtml(doc).html;
    expect(html).toBe(
      '<p><a href="https://example.test">safe</a> protocol<a href="/relative"> local</a></p>'
    );
    expect(html).not.toContain('javascript:');
  });

  it('collects image media ids for the manifest', () => {
    expect(collectMediaIds(richDoc())).toEqual([5]);
  });

  it('throws on unsupported node types instead of emitting broken markup', () => {
    const doc: DocContent = {
      type: 'doc',
      content: [{ type: 'widget', content: [{ type: 'text', text: 'x' }] }],
    };
    expect(() => docToHtml(doc)).toThrow(UnsupportedContentError);
  });

  it('reports unsupported nodes/marks through collectContentIssues', () => {
    const issues = collectContentIssues({
      type: 'doc',
      content: [
        { type: 'widget' },
        { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'rainbow' }] }] },
      ],
    });
    const messages = issues.map((i) => i.message);
    expect(messages.some((m) => m.includes('Jenis konten "widget" tidak didukung'))).toBe(true);
    expect(messages.some((m) => m.includes('Pemarkahan "rainbow" tidak didukung'))).toBe(true);
  });

  it('serializes an empty doc to an empty string', () => {
    expect(docToHtml({ type: 'doc', content: [] }).html).toBe('');
    expect(docToHtml(textDoc('Halo')).html).toBe('<p>Halo</p>');
  });
});
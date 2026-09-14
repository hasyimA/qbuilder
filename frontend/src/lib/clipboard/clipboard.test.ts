import { describe, expect, it, vi } from 'vitest';
import {
  detectFormat,
  parseClipboardData,
  parseHTML,
  parseOptions,
  parsePlainText,
  parseQuestions,
  type ClipboardDataLike,
} from '@/lib/clipboard';

function clipboardData(partial: Partial<ClipboardDataLike>): ClipboardDataLike {
  return {
    types: [],
    getData: () => '',
    files: [],
    ...partial,
  };
}

describe('detectFormat', () => {
  it('prefers text/html over text/plain', () => {
    expect(
      detectFormat(
        clipboardData({
          types: ['text/html', 'text/plain'],
          getData: (type) => (type === 'text/html' ? '<p>hi</p>' : 'hi'),
        })
      )
    ).toBe('html');
  });

  it('falls back to plain text when HTML is missing', () => {
    expect(
      detectFormat(
        clipboardData({
          types: ['text/plain'],
          getData: (type) => (type === 'text/plain' ? 'hi' : ''),
        })
      )
    ).toBe('text');
  });

  it('detects pasted image files', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    expect(
      detectFormat(clipboardData({ types: ['Files'], files: [file] }))
    ).toBe('image-file');
  });

  it('reports unknown for empty clipboard data', () => {
    expect(detectFormat(clipboardData({}))).toBe('unknown');
  });

  it('reports files (non-image) as files', () => {
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    expect(detectFormat(clipboardData({ types: ['Files'], files: [file] }))).toBe('files');
  });
});

describe('parseHTML', () => {
  it('sanitizes script/style/on* and keeps safe links', async () => {
    const output = await parseHTML(
      '<p>Safe <b>text</b></p><script>alert(1)</script><style>p{}</style>' +
        '<a href="javascript:x()">bad</a><a href="https://ok.example/x">good</a>'
    );

    expect(output).toContain('Safe <b>text</b>');
    expect(output).not.toContain('script');
    expect(output).not.toContain('alert(1)');
    expect(output).not.toContain('javascript:');
    expect(output).toContain('href="https://ok.example/x"');
    expect(output).not.toContain('style>');
  });

  it('uploads pasted data-URI images and keeps media references', async () => {
    const uploadImage = vi
      .fn()
      .mockResolvedValue({ id: 42, url: '/media/u.png', width: 12, height: 34 });

    const output = await parseHTML(
      '<p>Diagram:</p><p><img src="data:image/png;base64,iVBORw0KGgo=" alt="topo"></p>',
      { uploadImage }
    );

    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(output).toContain('data-media-id="42"');
    expect(output).toContain('data-width="12"');
    expect(output).not.toContain('data:image/png');
    expect(output).not.toContain('src=');
  });

  it('marks images that cannot be uploaded instead of dropping silently', async () => {
    const uploadImage = vi.fn();
    const output = await parseHTML(
      '<p><img src="data:image/png;base64,@@@@😱" alt="broken"></p>',
      { uploadImage }
    );

    expect(uploadImage).not.toHaveBeenCalled();
    expect(output).toContain('[image: broken]');
  });

  it('keeps equations already expressed as spans', async () => {
    const output = await parseHTML('<p>Solves to <span data-equation="\\frac{1}{2}">x</span></p>');

    expect(output).toContain('<span data-equation="\\frac{1}{2}">');
  });

  it('preserves tables with spans', async () => {
    const output = await parseHTML(
      '<table><tr><td colspan="2">a</td><td rowspan="2">b</td></tr></table>'
    );

    expect(output).toContain('colspan="2"');
    expect(output).toContain('rowspan="2"');
  });

  it('handles large content without loss', async () => {
    const paragraphs = Array.from({ length: 200 }, (_, i) => `<p>Paragraph number ${i} with <b>bold</b>.</p>`).join('');
    const output = await parseHTML(paragraphs);

    expect(output).toContain('Paragraph number 199');
    expect((output.match(/<p>/g) ?? []).length).toBe(200);
  });

  it('returns empty string for empty input', async () => {
    expect(await parseHTML('')).toBe('');
  });
});

describe('parseClipboardData', () => {
  it('routes html pastes through the full pipeline', async () => {
    const result = await parseClipboardData(
      clipboardData({
        types: ['text/html'],
        getData: () => '<p>Hello</p><script>x()</script>',
      })
    );

    expect(result.kind).toBe('html');
    if (result.kind === 'html') {
      expect(result.content).toContain('Hello');
      expect(result.content).not.toContain('script');
    }
  });

  it('parses text pastes and detects options', async () => {
    const result = await parseClipboardData(
      clipboardData({
        types: ['text/plain'],
        getData: () => 'A. Router\nB. Switch',
      })
    );

    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.options).toEqual(['Router', 'Switch']);
    }
  });

  it('returns empty for unreadable clipboard data', async () => {
    const result = await parseClipboardData(clipboardData({ types: [] }));
    expect(result.kind).toBe('empty');
  });
});

describe('parseOptions', () => {
  const WORD_FIXTURE = 'A. Router\nB. Switch\nC. Hub\nD. Access Point';

  it('parses A. B. C. lists', () => {
    expect(parseOptions(WORD_FIXTURE)).toEqual([
      'Router',
      'Switch',
      'Hub',
      'Access Point',
    ]);
  });

  it('parses A) and (A) and lowercase a. patterns', () => {
    expect(parseOptions('a. Router\nb) Switch')).toEqual(['Router', 'Switch']);
    expect(parseOptions('(A) Router\n(B) Switch')).toEqual(['Router', 'Switch']);
  });

  it('parses numbered 1. and 1) lists', () => {
    expect(parseOptions('1. apples\n2) oranges\n3. bananas')).toEqual([
      'apples',
      'oranges',
      'bananas',
    ]);
  });

  it('folds continuation lines into the previous option', () => {
    expect(parseOptions('A. Router\n   forwards packets\nB. Switch')).toEqual([
      'Router forwards packets',
      'Switch',
    ]);
  });

  it('rejects non-sequential letter labels', () => {
    expect(parseOptions('A. one\nC. three\nD. four')).toBeNull();
  });

  it('rejects mixed letter/number labels', () => {
    expect(parseOptions('A. one\n2. two')).toBeNull();
  });

  it('rejects a single option line', () => {
    expect(parseOptions('A. One option only')).toBeNull();
  });

  it('rejects plain prose', () => {
    expect(
      parseOptions('This is just a regular sentence.\nAnother sentence follows.')
    ).toBeNull();
  });

  it('rejects labels that are not followed by whitespace', () => {
    expect(parseOptions('A.Router\nB.Switch')).toBeNull();
    expect(parseOptions('1.5 is a number\n2.6 too')).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(parseOptions('')).toBeNull();
    expect(parseOptions('   ')).toBeNull();
  });
});

describe('parsePlainText', () => {
  it('reports parsed options alongside text', () => {
    const result = parsePlainText('A. one\nB. two');
    expect(result.text).toBe('A. one\nB. two');
    expect(result.options).toEqual(['one', 'two']);
  });
});

describe('parseQuestions', () => {
  it('parses a numbered block of questions with options', () => {
    const fixture = [
      '1. What device forwards packets between networks?',
      'A. Router',
      'B. Switch',
      '2. Which protocol operates at the network layer?',
      'A. IP',
      'B. TCP',
    ].join('\n');

    const result = parseQuestions(fixture);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result?.[0].prompt).toContain('forwards packets');
    expect(result?.[0].options).toEqual(['Router', 'Switch']);
    expect(result?.[1].prompt).toContain('network layer');
    expect(result?.[1].options).toEqual(['IP', 'TCP']);
  });

  it('returns null for prose without numbered questions', () => {
    expect(parseQuestions('Just some prose.\nMore prose.')).toBeNull();
  });

  it('returns null for a single question without options', () => {
    expect(parseQuestions('1. A single question without options.')).toBeNull();
  });
});
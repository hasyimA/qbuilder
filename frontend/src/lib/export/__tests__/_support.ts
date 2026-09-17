import type { DocContent, Question, Quiz } from '@/lib/types';
import type { MediaResolution } from '@/lib/export';

export function textDoc(text: string): DocContent {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

export function option(
  text: string,
  isCorrect: boolean,
  fraction = isCorrect ? 100 : 0,
  feedback = '',
  matchAnswer?: string
): {
  content: DocContent;
  match_answer?: string | null;
  is_correct: boolean;
  fraction: number;
  sort_order: number;
  feedback?: DocContent | null;
} {
  return {
    content: textDoc(text),
    match_answer: matchAnswer ?? null,
    is_correct: isCorrect,
    fraction,
    sort_order: 0,
    feedback: feedback ? textDoc(feedback) : null,
  };
}

export function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 1,
    type: 'multiple_choice',
    content: textDoc('Manakah perangkat yang meneruskan paket?'),
    default_mark: 1,
    feedback_general: null,
    feedback_correct: null,
    feedback_incorrect: null,
    category: null,
    difficulty: null,
    status: 'complete',
    sort_order: 0,
    options: [
      option('Router', true, 100, 'Benar, router meneruskan paket.'),
      option('Switch', false),
      option('Hub', false),
      option('Repeater', false),
    ],
    created_at: '2026-01-01T00:00:00.000000Z',
    updated_at: '2026-01-01T00:00:00.000000Z',
    ...overrides,
  };
}

export function makeQuiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    id: 7,
    title: 'Jaringan Komputer 2026',
    description: null,
    subject: 'TJKT',
    grade_level: 'XI',
    category: 'PPLG/Ujian Tengah',
    status: 'published',
    visibility: 'private',
    questions_count: 0,
    created_at: '2026-01-01T00:00:00.000000Z',
    updated_at: '2026-01-01T00:00:00.000000Z',
    ...overrides,
  };
}

export function mediaStub(): (mediaId: number) => Promise<MediaResolution> {
  return async (mediaId) => ({
    filename: `router-${mediaId}.png`,
    mimeType: 'image/png',
    base64: `BASE64DATA${mediaId}`,
    width: 600,
    height: 400,
  });
}

/** A doc exercising headings, emphasis, code, links, lists, image, equation, table. */
export function richDoc(): DocContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Transmisi Data' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Perangkat ' },
          {
            type: 'text',
            text: 'meneruskan',
            marks: [{ type: 'bold' }, { type: 'italic' }],
          },
          {
            type: 'text',
            text: ' frame ke',
            marks: [{ type: 'link', attrs: { href: 'https://example.test/router', title: 'contoh' } }],
          },
          { type: 'text', text: ' dengan ' },
          { type: 'text', text: 'kode', marks: [{ type: 'code' }] },
          { type: 'text', text: '.' },
        ],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item A' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item B' }] }],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Gambar: ' },
          {
            type: 'image',
            attrs: { mediaId: 5, alt: 'Diagram Router', width: 600, height: 400 },
          },
        ],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Energi: ' }, { type: 'equation', attrs: { format: 'latex', value: 'E=mc^2' } }],
      },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableHeader',
                attrs: { colspan: 1, rowspan: 1 },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Perangkat' }] }],
              },
              {
                type: 'tableHeader',
                attrs: {},
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fungsi' }] }],
              },
            ],
          },
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: {},
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Router' }] }],
              },
              {
                type: 'tableCell',
                attrs: { colspan: 1, rowspan: 1 },
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Meneruskan paket' }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

export const PNG_1x1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
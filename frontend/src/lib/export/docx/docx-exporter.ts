import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { SchoolSettings } from '@/lib/api';
import type { Question, Quiz } from '@/lib/types';
import { docToPlainText } from '@/lib/content';
import type { MediaResolution, ResolveMedia } from '../types';
import { collectMediaIdsFromDoc, docToDocxBlocks } from './doc-to-docx';
import type { DocxBlock, DocxInlineContext } from './doc-to-docx';

export type DocxExportMode = 'complete' | 'student';

export interface DocxExportOptions {
  quiz: Quiz & { owner?: { id: number; name: string } | null };
  questions: Question[];
  school: SchoolSettings;
  mode: DocxExportMode;
  duration?: string;
  examDate?: string;
  resolveMedia?: ResolveMedia;
}

const QUESTION_TYPE_ADMIN_LABEL: Record<Question['type'], string> = {
  multiple_choice: 'Pilihan Ganda',
  true_false: 'Benar / Salah',
  short_answer: 'Isian Singkat',
  essay: 'Esai / Uraian',
  matching: 'Menjodohkan',
};

function noBorderCell(children: Paragraph[], widthPct?: number): TableCell {
  return new TableCell({
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
    children,
  });
}

function cellParagraph(text: string, bold = false, align?: (typeof AlignmentType)[keyof typeof AlignmentType]): Paragraph {
  return new Paragraph({
    alignment: align,
    spacing: { after: 20 },
    children: [new TextRun({ text, bold, size: 21 })],
  });
}

function buildKopHeader(opts: DocxExportOptions): DocxBlock[] {
  const { school, quiz, duration, examDate } = opts;
  const blocks: DocxBlock[] = [];

  if (school.school_subtitle) {
    blocks.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [
          new TextRun({
            text: school.school_subtitle.toUpperCase(),
            bold: true,
            size: 20,
            color: '374151',
          }),
        ],
      })
    );
  }

  blocks.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [
        new TextRun({
          text: (school.school_name || 'SMK Bina Rahayu').toUpperCase(),
          bold: true,
          size: 28,
        }),
      ],
    })
  );

  if (school.school_address) {
    blocks.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: school.school_address,
            size: 18,
            color: '4B5563',
          }),
        ],
      })
    );
  }

  blocks.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: {
        top: { color: '111827', size: 18, style: BorderStyle.SINGLE, space: 4 },
        bottom: { color: '111827', size: 6, style: BorderStyle.SINGLE, space: 4 },
      },
      spacing: { before: 40, after: 140 },
      children: [
        new TextRun({
          text: `${(school.default_exam_title || quiz.title).toUpperCase()} — TA ${school.academic_year} (SEMESTER ${school.semester.toUpperCase()})`,
          bold: true,
          size: 22,
        }),
      ],
    })
  );

  const metaRows: Array<[string, string, string, string]> = [
    ['Judul Naskah', `: ${quiz.title}`, 'Jumlah Soal', `: ${opts.questions.length} butir`],
    ['Mata Pelajaran', `: ${quiz.subject || '-'}`, 'Alokasi Waktu', `: ${duration?.trim() || '-'}`],
    ['Kelas / Tingkat', `: ${quiz.grade_level || '-'}`, 'Tanggal Ujian', `: ${examDate?.trim() || '-'}`],
    ['Guru Penyusun', `: ${quiz.owner?.name || '-'}`, 'Kategori', `: ${quiz.category || '-'}`],
  ];

  blocks.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: metaRows.map(
        ([l1, v1, l2, v2]) =>
          new TableRow({
            children: [
              noBorderCell([cellParagraph(l1, true)], 18),
              noBorderCell([cellParagraph(v1)], 34),
              noBorderCell([cellParagraph(l2, true)], 18),
              noBorderCell([cellParagraph(v2)], 30),
            ],
          })
      ),
    })
  );

  blocks.push(
    new Paragraph({
      border: {
        bottom: { color: '9CA3AF', size: 6, style: BorderStyle.SINGLE, space: 4 },
      },
      spacing: { before: 80, after: 160 },
      children: [
        new TextRun({
          text: 'Petunjuk Umum: ',
          bold: true,
          size: 20,
        }),
        new TextRun({
          text: quiz.description?.trim() || 'Bacalah setiap soal dengan teliti sebelum menjawab.',
          italics: true,
          size: 20,
          color: '374151',
        }),
      ],
    })
  );

  return blocks;
}

function buildQuestionBlocks(
  q: Question,
  index: number,
  ctx: DocxInlineContext
): DocxBlock[] {
  const blocks: DocxBlock[] = [];
  const numPrefix = `${index + 1}. `;
  const stemBlocks = docToDocxBlocks(q.content, ctx, {
    prefix: numPrefix,
    prefixBold: true,
    spacingAfter: 80,
  });

  if (stemBlocks.length > 0) {
    blocks.push(...stemBlocks);
  } else {
    blocks.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: `${numPrefix}(Soal tanpa teks)`, bold: true })],
      })
    );
  }

  if (q.type === 'multiple_choice') {
    const correctCount = q.options.filter((o) => o.is_correct).length;
    if (correctCount > 1) {
      blocks.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `(Pilih ${correctCount} jawaban yang benar)`,
              italics: true,
              size: 19,
              color: '4B5563',
            }),
          ],
        })
      );
    }

    q.options.forEach((opt, optIdx) => {
      const letter = String.fromCharCode(65 + optIdx);
      const optBlocks = docToDocxBlocks(opt.content, ctx, {
        prefix: `${letter}. `,
        prefixBold: false,
        indentLeft: 360,
        spacingAfter: 50,
      });
      blocks.push(...optBlocks);
    });
  } else if (q.type === 'true_false') {
    blocks.push(
      new Paragraph({
        indent: { left: 360 },
        spacing: { after: 40 },
        children: [new TextRun({ text: 'A. Benar' })],
      }),
      new Paragraph({
        indent: { left: 360 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'B. Salah' })],
      })
    );
  } else if (q.type === 'short_answer') {
    blocks.push(
      new Paragraph({
        indent: { left: 360 },
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: 'Jawaban: ........................................................................',
            color: '4B5563',
          }),
        ],
      })
    );
  } else if (q.type === 'essay') {
    blocks.push(
      new Paragraph({
        indent: { left: 360 },
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: `[Bobot: ${q.default_mark} poin]`,
            italics: true,
            size: 19,
            color: '4B5563',
          }),
        ],
      })
    );
  } else if (q.type === 'matching') {
    const rows = [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F4F6' },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [cellParagraph('Pernyataan', true)],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F4F6' },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [cellParagraph('Pasangan / Jawaban', true)],
          }),
        ],
      }),
      ...q.options.map((opt, idx) => {
        const stmt = docToPlainText(opt.content).trim() || `Pernyataan ${idx + 1}`;
        return new TableRow({
          children: [
            new TableCell({
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [cellParagraph(`${idx + 1}. ${stmt}`)],
            }),
            new TableCell({
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [cellParagraph('........................................')],
            }),
          ],
        });
      }),
    ];

    blocks.push(
      new Table({
        width: { size: 95, type: WidthType.PERCENTAGE },
        rows,
      })
    );
  }

  blocks.push(new Paragraph({ spacing: { after: 120 } }));
  return blocks;
}

function summarizeAnswerKey(q: Question): string {
  if (q.type === 'multiple_choice') {
    const correctIndices: number[] = [];
    q.options.forEach((opt, i) => {
      if (opt.is_correct) correctIndices.push(i);
    });
    const letters = correctIndices.map((i) => String.fromCharCode(65 + i)).join(', ');
    if (correctIndices.length > 1) {
      const wrongCount = q.options.length - correctIndices.length;
      const pos = Number((100 / correctIndices.length).toFixed(2));
      const neg = wrongCount > 0 ? Number((100 / wrongCount).toFixed(2)) : 0;
      return wrongCount > 0 ? `${letters} (+${pos}% / -${neg}%)` : `${letters} (+${pos}%)`;
    }
    return letters || '-';
  }
  if (q.type === 'true_false') {
    const trueOpt = q.options.find((o) => docToPlainText(o.content).trim().toLowerCase() === 'true');
    return trueOpt?.is_correct ? 'Benar' : 'Salah';
  }
  if (q.type === 'short_answer') {
    return q.options
      .map((o) => docToPlainText(o.content).trim())
      .filter(Boolean)
      .join(' / ') || '-';
  }
  if (q.type === 'matching') {
    return q.options
      .map((o, idx) => `${idx + 1} → ${o.match_answer || '-'}`)
      .join('; ');
  }
  return 'Lihat Pedoman Penskoran';
}

function buildAnswerKeySection(opts: DocxExportOptions, ctx: DocxInlineContext): DocxBlock[] {
  const blocks: DocxBlock[] = [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: 'KUNCI JAWABAN & PEDOMAN PENSKORAN',
          bold: true,
          size: 24,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: [
        new TextRun({
          text: `${opts.quiz.title} — ${opts.quiz.subject || ''} (${opts.quiz.grade_level || ''})`,
          size: 20,
          color: '4B5563',
        }),
      ],
    }),
  ];

  const headerRow = new TableRow({
    children: [
      { label: 'No', width: 8 },
      { label: 'Tipe Soal', width: 20 },
      { label: 'Kunci Jawaban', width: 44 },
      { label: 'Bobot', width: 12 },
      { label: 'Kesulitan', width: 16 },
    ].map(
      (col) =>
        new TableCell({
          width: { size: col.width, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'E5E7EB' },
          margins: { top: 80, bottom: 80, left: 80, right: 80 },
          children: [cellParagraph(col.label, true)],
        })
    ),
  });

  const dataRows = opts.questions.map(
    (q, idx) =>
      new TableRow({
        children: [
          String(idx + 1),
          q.type === 'multiple_choice' && q.options.filter((o) => o.is_correct).length > 1
            ? 'PG Kompleks'
            : QUESTION_TYPE_ADMIN_LABEL[q.type],
          summarizeAnswerKey(q),
          String(q.default_mark),
          q.difficulty || '-',
        ].map(
          (text) =>
            new TableCell({
              margins: { top: 60, bottom: 60, left: 80, right: 80 },
              children: [cellParagraph(text)],
            })
        ),
      })
  );

  blocks.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    })
  );

  const notes = opts.questions
    .map((q, idx) => ({ q, idx }))
    .filter(
      ({ q }) =>
        docToPlainText(q.grader_info).trim() !== '' ||
        docToPlainText(q.feedback_general).trim() !== ''
    );

  if (notes.length > 0) {
    blocks.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({
            text: 'Pedoman Penskoran & Pembahasan Tambahan',
            bold: true,
            size: 22,
          }),
        ],
      })
    );

    for (const { q, idx } of notes) {
      const targetDoc =
        docToPlainText(q.grader_info).trim() !== '' ? q.grader_info : q.feedback_general;
      blocks.push(
        ...docToDocxBlocks(targetDoc, ctx, {
          prefix: `Soal ${idx + 1}: `,
          prefixBold: true,
          spacingAfter: 80,
        })
      );
    }
  }

  // Signature block
  blocks.push(
    new Paragraph({ spacing: { before: 320 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            noBorderCell(
              [
                cellParagraph('Mengetahui,', false, AlignmentType.CENTER),
                cellParagraph('Kepala Sekolah / Wakakur', false, AlignmentType.CENTER),
                new Paragraph({ spacing: { before: 600 } }),
                cellParagraph(opts.school.principal_name || '__________________________', true, AlignmentType.CENTER),
                ...(opts.school.principal_nip
                  ? [cellParagraph(`NIP. ${opts.school.principal_nip}`, false, AlignmentType.CENTER)]
                  : []),
              ],
              50
            ),
            noBorderCell(
              [
                cellParagraph(opts.examDate?.trim() || '........................, ................ 20....', false, AlignmentType.CENTER),
                cellParagraph('Guru Mata Pelajaran', false, AlignmentType.CENTER),
                new Paragraph({ spacing: { before: 600 } }),
                cellParagraph(opts.quiz.owner?.name || '__________________________', true, AlignmentType.CENTER),
              ],
              50
            ),
          ],
        }),
      ],
    })
  );

  return blocks;
}

export async function buildDocxDocument(opts: DocxExportOptions): Promise<Document> {
  const mediaIds = new Set<number>();
  for (const q of opts.questions) {
    collectMediaIdsFromDoc(q.content, mediaIds);
    collectMediaIdsFromDoc(q.grader_info, mediaIds);
    collectMediaIdsFromDoc(q.feedback_general, mediaIds);
    for (const opt of q.options) {
      collectMediaIdsFromDoc(opt.content, mediaIds);
    }
  }

  const mediaMap = new Map<number, MediaResolution>();
  if (opts.resolveMedia && mediaIds.size > 0) {
    await Promise.all(
      Array.from(mediaIds).map(async (id) => {
        try {
          const resolved = await opts.resolveMedia!(id);
          mediaMap.set(id, resolved);
        } catch {
          // Leave missing; docToDocxBlocks renders a readable placeholder.
        }
      })
    );
  }

  const ctx: DocxInlineContext = { mediaMap };
  const children: DocxBlock[] = [...buildKopHeader(opts)];

  opts.questions.forEach((q, idx) => {
    children.push(...buildQuestionBlocks(q, idx, ctx));
  });

  if (opts.mode === 'complete') {
    children.push(...buildAnswerKeySection(opts, ctx));
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${opts.quiz.title} — Halaman `, size: 18, color: '6B7280' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '6B7280' }),
                  new TextRun({ text: ' dari ', size: 18, color: '6B7280' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '6B7280' }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

export async function exportQuizToDocxBlob(opts: DocxExportOptions): Promise<Blob> {
  const doc = await buildDocxDocument(opts);
  return Packer.toBlob(doc);
}

export function docxFilename(title: string, mode: DocxExportMode): string {
  const slug =
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'kuis';
  return mode === 'complete' ? `${slug}_administrasi.docx` : `${slug}_naskah_siswa.docx`;
}

import type { Question, Quiz } from '@/lib/types';
import type { ExportContext, ExportResult, ExportValidationError } from '../types';
import { ExportValidationErrorList } from '../types';
import { validateQuizForExport } from './validation';
import { collectMediaIds } from './doc-to-html';
import { docToPlainText } from '@/lib/content';
import {
  createNameTracker,
  sanitizeFilename,
  slugify,
  uniqueQuestionName,
  type MediaMap,
  type ResolvedMediaEntry,
} from './shared';
import { escapeXml } from './xml-escape';
import { renderQuestion } from './renderers';

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';

async function resolveAllMedia(
  quizTitle: string,
  questions: Question[],
  resolveMedia?: ExportContext['resolveMedia']
): Promise<{ media: MediaMap; errors: ExportValidationError[] }> {
  const media: MediaMap = new Map();
  const errors: ExportValidationError[] = [];

  const ids = new Set<number>();
  for (const q of questions) {
    for (const doc of [q.content, q.feedback_general ?? null, q.feedback_correct ?? null, q.feedback_incorrect ?? null]) {
      for (const id of collectMediaIds(doc)) ids.add(id);
    }
    for (const option of q.options) {
      for (const id of collectMediaIds(option.content)) ids.add(id);
      for (const id of collectMediaIds(option.feedback ?? null)) ids.add(id);
    }
  }

  if (ids.size === 0) return { media, errors };
  if (!resolveMedia) {
    errors.push({
      code: 'media-no-resolver',
      message:
        'Soal mengandung gambar, tetapi penyedia media tidak tersedia. ' +
        'Gagal mengekspor gambar ke Moodle.',
    });
    return { media, errors };
  }

  const usedFilenames = new Map<string, number>();
  for (const mediaId of ids) {
    try {
      const resolved = await resolveMedia(mediaId);
      let filename = sanitizeFilename(resolved.filename);
      const counter = usedFilenames.get(filename) ?? 0;
      if (counter > 0) {
        filename = `${mediaId}-${filename}`;
      }
      usedFilenames.set(filename, counter + 1);

      const entry: ResolvedMediaEntry = {
        ...resolved,
        exportFilename: filename,
      };
      media.set(mediaId, entry);
    } catch (reason) {
      const detail = reason instanceof Error ? ` (${reason.message})` : '';
      errors.push({
        code: 'media-unresolvable',
        message: `Gambar media #${mediaId} tidak dapat dimuat untuk ekspor${detail}.`,
      });
    }
  }

  return { media, errors };
}

function categoryBlock(quiz: Quiz): string {
  // Always route imported questions into a question-bank category named after
  // the quiz in this app, instead of the default category.
  const name = quiz.title.trim() || 'Quiz';
  return (
    '  <question type="category">' +
    '\n    <category>' +
    '\n      <text>$course$/' + escapeXml(name) + '</text>' +
    '\n    </category>' +
    '\n  </question>'
  );
}

/** Fetches and exports a quiz as a valid Moodle XML document. */
export async function exportMoodleXml(
  context: ExportContext
): Promise<ExportResult> {
  const validationErrors = validateQuizForExport(context.quiz, context.questions);
  if (validationErrors.length > 0) {
    throw new ExportValidationErrorList(validationErrors);
  }

  const { media, errors: mediaErrors } = await resolveAllMedia(
    context.quiz.title,
    context.questions,
    context.resolveMedia
  );
  if (mediaErrors.length > 0) {
    throw new ExportValidationErrorList(mediaErrors);
  }

  const nameTracker = createNameTracker();
  const sorted = [...context.questions].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const questionBlocks = sorted.map((q, index) => {
    const name = uniqueQuestionName(
      context.quiz.title,
      index + 1,
      nameTracker,
      docToPlainText(q.content)
    );
    return renderQuestion(q, { name, media });
  });

  const body = [
    XML_HEADER,
    '<quiz>',
    categoryBlock(context.quiz),
    questionBlocks.join('\n'),
    '</quiz>',
  ]
    .filter((block) => block !== '')
    .join('\n');

  return {
    xml: body,
    mediaManifest: media,
  };
}

/** A safe download file name for the exported quiz. */
export function moodleExportFilename(quizTitle: string): string {
  return `${slugify(quizTitle, 'quiz')}-moodle.xml`;
}
import type { Question, Quiz } from '@/lib/types';
import { docToPlainText } from '@/lib/content';
import { collectContentIssues, isDocEmpty } from './doc-to-html';
import type { ExportValidationError } from '../types';

/**
 * Runs pre-export validation and collects all issues before producing any XML.
 * Messages are in Indonesian so teachers can act on them.
 */
export function validateQuizForExport(quiz: Quiz, questions: Question[]): ExportValidationError[] {
  const errors: ExportValidationError[] = [];

  if (!quiz.title?.trim()) {
    errors.push({ code: 'quiz-empty-title', message: 'Quiz tidak memiliki judul.' });
  }

  if (questions.length === 0) {
    errors.push({ code: 'quiz-no-questions', message: 'Tidak ada soal untuk diekspor.' });
    return errors;
  }

  questions.forEach((q, idx) => {
    const i = idx + 1;
    const ref = (field: string) => `Soal ${i} (${field})`;

    if (isDocEmpty(q.content)) {
      errors.push({
        code: 'question-empty',
        message: ref('teks soal kosong') + ' Teks soal tidak boleh kosong.',
        questionIndex: i,
      });
    }

    const mark =
      typeof q.default_mark === 'number' ? q.default_mark : parseFloat(String(q.default_mark));
    if (!Number.isFinite(mark) || mark <= 0) {
      errors.push({
        code: 'question-invalid-mark',
        message: ref('mark tidak valid') + ' Nilai default mark harus lebih dari 0.',
        questionIndex: i,
      });
    }

    // Content structure issues (unsupported nodes/marks).
    const contentIssues = collectContentIssues(q.content);
    for (const issue of contentIssues) {
      errors.push({
        code: issue.code,
        message: ref(issue.message.split(':')[0]) + ' ' + issue.message,
        questionIndex: i,
      });
    }

    // Per-type validation.
    switch (q.type) {
      case 'multiple_choice':
        validateMultipleChoice(q, i, ref, errors);
        break;
      case 'true_false':
        validateTrueFalse(q, i, ref, errors);
        break;
      case 'short_answer':
        validateShortAnswer(q, i, ref, errors);
        break;
      case 'essay':
        validateEssay();
        break;
      default:
        errors.push({
          code: 'question-unknown-type',
          message: ref(`tipe "${q.type}"`) + ' Jenis soal tidak didukung untuk ekspor Moodle.',
          questionIndex: i,
        });
    }
  });

  return errors;
}

function validateMultipleChoice(
  q: Question,
  idx: number,
  ref: (f: string) => string,
  errors: ExportValidationError[]
): void {
  const opts = q.options ?? [];
  if (opts.length < 2) {
    errors.push({
      code: 'mcq-not-enough-options',
      message: ref('opsi jawaban') + ` Minimal 2 opsi jawaban untuk Multiple Choice.`,
      questionIndex: idx,
    });
    return;
  }

  for (let j = 0; j < opts.length; j += 1) {
    const plain = docToPlainText(opts[j].content).trim();
    if (!plain) {
      errors.push({
        code: 'mcq-empty-option',
        message: ref(`opsi ${j + 1} kosong`) + ' Semua opsi jawaban harus memiliki teks.',
        questionIndex: idx,
      });
    }
  }

  const correctCount = opts.filter((o) => o.is_correct).length;
  if (correctCount === 0) {
    errors.push({
      code: 'mcq-no-correct',
      message: ref('tidak ada jawaban benar') + ' Minimal 1 opsi harus ditandai sebagai jawaban yang benar.',
      questionIndex: idx,
    });
  }
}

function validateTrueFalse(
  q: Question,
  idx: number,
  ref: (f: string) => string,
  errors: ExportValidationError[]
): void {
  const opts = q.options ?? [];
  const texts = opts.map((o) => docToPlainText(o.content).trim().toLowerCase());
  const hasTrue = texts.some((t) => t === 'true');
  const hasFalse = texts.some((t) => t === 'false');

  if (!hasTrue || !hasFalse) {
    errors.push({
      code: 'tf-missing-options',
      message: ref('opsi True/False') + ' Soal True/False harus memiliki opsi "True" dan "False".',
      questionIndex: idx,
    });
  }

  const correctCount = opts.filter((o) => o.is_correct).length;
  if (correctCount !== 1) {
    errors.push({
      code: 'tf-multiple-correct',
      message: ref('opsi benar') + ' Soal True/False harus memiliki tepat 1 jawaban yang benar.',
      questionIndex: idx,
    });
  }
}

function validateShortAnswer(
  q: Question,
  idx: number,
  ref: (f: string) => string,
  errors: ExportValidationError[]
): void {
  const opts = (q.options ?? []).filter((o) => docToPlainText(o.content).trim());
  if (opts.length === 0) {
    errors.push({
      code: 'short-answer-no-options',
      message: ref('jawaban') + ' Short Answer minimal 1 jawaban yang benar.',
      questionIndex: idx,
    });
  }
}

function validateEssay(): void {
  // Essay requires only question text (already validated above).
}
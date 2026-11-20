import { quizzes, questions, schoolSettings } from '@/lib/api';
import type { SchoolSettings } from '@/lib/api';
import { moodleXmlExporter, resolveMediaFromApi } from './index';
import { downloadBlobFile, downloadStringFile } from './download';
import { docxFilename, exportQuizToDocxBlob } from './docx/docx-exporter';
import type { DocxExportMode } from './docx/docx-exporter';

export interface BuiltMoodleXml {
  title: string;
  xml: string;
  questionCount: number;
}

/**
 * Fetches a quiz plus its questions, validates and renders Moodle XML.
 * Throws `ExportValidationErrorList` when validation fails.
 */
export async function buildQuizMoodleXml(quizId: number): Promise<BuiltMoodleXml> {
  const detail = await quizzes.get(quizId);
  const questionList = await questions.list(quizId);
  const result = await moodleXmlExporter.export({
    quiz: detail.data,
    questions: questionList.data,
    resolveMedia: resolveMediaFromApi,
  });

  return {
    title: detail.data.title,
    xml: result.xml,
    questionCount: questionList.data.length,
  };
}

/**
 * Fetches a quiz plus its questions, exports to Moodle XML and triggers a
 * download. Throws `ExportValidationErrorList` when validation fails — callers
 * decide how to surface that to the user.
 */
export async function exportQuizMoodle(quizId: number): Promise<string> {
  const built = await buildQuizMoodleXml(quizId);
  downloadStringFile(moodleXmlExporter.filename(built.title), built.xml);

  return built.title;
}

export async function exportQuizDocx(
  quizId: number,
  options: {
    mode: DocxExportMode;
    school?: SchoolSettings;
    duration?: string;
    examDate?: string;
  }
): Promise<string> {
  const [detail, questionList, schoolRes] = await Promise.all([
    quizzes.get(quizId),
    questions.list(quizId),
    options.school ? Promise.resolve({ data: options.school }) : schoolSettings.get(),
  ]);

  const sorted = [...questionList.data].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  const blob = await exportQuizToDocxBlob({
    quiz: detail.data,
    questions: sorted,
    school: schoolRes.data,
    mode: options.mode,
    duration: options.duration,
    examDate: options.examDate,
    resolveMedia: resolveMediaFromApi,
  });

  downloadBlobFile(docxFilename(detail.data.title, options.mode), blob);
  return detail.data.title;
}

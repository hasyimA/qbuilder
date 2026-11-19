import { quizzes, questions } from '@/lib/api';
import { moodleXmlExporter, resolveMediaFromApi } from './index';
import { downloadStringFile } from './download';

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

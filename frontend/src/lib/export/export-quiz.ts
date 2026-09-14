import { quizzes, questions } from '@/lib/api';
import { moodleXmlExporter } from './index';
import { resolveMediaFromApi } from './index';
import { downloadStringFile } from './download';

/**
 * Fetches a quiz plus its questions, exports to Moodle XML and triggers a
 * download. Throws `ExportValidationErrorList` when validation fails — callers
 * decide how to surface that to the user.
 */
export async function exportQuizMoodle(quizId: number): Promise<string> {
  const detail = await quizzes.get(quizId);
  const questionList = await questions.list(quizId);
  const result = await moodleXmlExporter.export({
    quiz: detail.data,
    questions: questionList.data,
    resolveMedia: resolveMediaFromApi,
  });
  downloadStringFile(moodleXmlExporter.filename(detail.data.title), result.xml);

  return detail.data.title;
}
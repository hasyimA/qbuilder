import type { Question } from '@/lib/types';
import type { MediaMap } from '../shared';
import { defaultGrade } from '../shared';
import { renderMultipleChoice } from './multichoice';
import { renderShortAnswer } from './shortanswer';
import { renderEssay } from './essay';
import { renderTrueFalse } from './truefalse';

export interface RenderQuestionDeps {
  name: string;
  media: MediaMap;
}

export function renderQuestion(q: Question, deps: RenderQuestionDeps): string {
  const renderDeps = { name: deps.name, mark: defaultGrade(q.default_mark), media: deps.media };
  switch (q.type) {
    case 'multiple_choice':
      return renderMultipleChoice(q, renderDeps);
    case 'true_false':
      return renderTrueFalse(q, renderDeps);
    case 'short_answer':
      return renderShortAnswer(q, renderDeps);
    case 'essay':
      return renderEssay(q, renderDeps);
    default:
      throw new Error(`Unsupported question type for Moodle export: ${String(q.type)}`);
  }
}
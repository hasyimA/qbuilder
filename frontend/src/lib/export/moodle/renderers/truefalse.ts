import type { DocContent, Question } from '@/lib/types';
import { docToPlainText } from '@/lib/content';
import type { RenderDeps } from './multichoice';
import { questionShell, renderElement, feedbackElement, defaultGrade } from '../shared';

/** The raw `<text>` of the answer, which Moodle matches to `true`/`false`. */
function trueFalseText(option: DocContent): 'true' | 'false' | null {
  const normalized = docToPlainText(option).trim().toLowerCase();
  if (normalized === 'true') return 'true';
  if (normalized === 'false') return 'false';
  return null;
}

export function renderTrueFalse(q: Question, deps: RenderDeps): string {
  const questionText = renderElement(q.content, deps.media);
  const generalFeedback = renderElement(q.feedback_general ?? null, deps.media);

  const trueAnswer = q.options.find((o) => trueFalseText(o.content) === 'true');
  const falseAnswer = q.options.find((o) => trueFalseText(o.content) === 'false');

  const parts: string[] = [];
  for (const [text, option] of [
    ['true', trueAnswer],
    ['false', falseAnswer],
  ] as const) {
    const fraction = option?.is_correct ? '100' : '0';
    const fb = renderElement(option?.feedback ?? null, deps.media);
    parts.push(
      '      <answer fraction="' + fraction + '" format="html">' + '\n' +
        '        <text>' + text + '</text>' + '\n' +
        (fb.html || fb.files ? feedbackElement(fb, 8) + '\n' : '') +
        '      </answer>'
    );
  }

  const extra = parts.join('\n');
  return questionShell({
    type: 'truefalse',
    name: deps.name,
    questionText,
    generalFeedback,
    mark: defaultGrade(deps.mark),
    extra,
  });
}
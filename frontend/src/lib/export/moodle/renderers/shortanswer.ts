import type { Question } from '@/lib/types';
import { docToPlainText } from '@/lib/content';
import type { RenderDeps } from './multichoice';
import {
  questionShell,
  renderElement,
  feedbackElement,
  defaultGrade,
  snapToMoodleGrade,
} from '../shared';

export function renderShortAnswer(q: Question, deps: RenderDeps): string {
  const questionText = renderElement(q.content, deps.media);
  const generalFeedback = renderElement(q.feedback_general ?? null, deps.media);

  const accepted = q.options.filter((o) => {
    const percent = typeof o.fraction === 'number' ? o.fraction : parseFloat(String(o.fraction));
    return o.is_correct && docToPlainText(o.content).trim() !== '' && (!Number.isFinite(percent) || percent > 0);
  });

  const answers = accepted
    .map((option) => {
      const fb = renderElement(option.feedback ?? null, deps.media);
      const text = docToPlainText(option.content);
      return (
        '      <answer fraction="' + fractionFor(option.fraction) + '" format="html">' + '\n' +
        '        <text>' + escapedText(text) + '</text>' + '\n' +
        (fb.html || fb.files ? feedbackElement(fb, 8) + '\n' : '') +
        '      </answer>'
      );
    })
    .join('\n');

  const extra = [
    '    <usecase>' + '0' + '</usecase>',
    '    <answernumbering>abc</answernumbering>',
    answers,
  ]
    .filter((x) => x !== '')
    .join('\n');

  return questionShell({
    type: 'shortanswer',
    name: deps.name,
    questionText,
    generalFeedback,
    mark: defaultGrade(deps.mark),
    extra,
  });
}

function fractionFor(fraction: number | string): string {
  const value = typeof fraction === 'number' ? fraction : parseFloat(String(fraction));
  if (!Number.isFinite(value) || value <= 0) return '100';
  // The app stores short-answer grades as percent (0..100); legacy rows may
  // carry them as a 0..1 fraction. Moodle's XML importer reads the `fraction`
  // attribute as percent, so snap to a valid grade it will accept.
  const percent = value > 1 ? value : value * 100;
  return snapToMoodleGrade(percent);
}

function escapedText(input: string): string {
  return input.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
}
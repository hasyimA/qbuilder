import type { Question } from '@/lib/types';
import type { RenderDeps } from './multichoice';
import { questionShell, renderElement, blockElement, defaultGrade } from '../shared';
import { cdata } from '../xml-escape';

function subquestion(promptHtml: string, promptFiles: string, answer: string): string {
  return (
    '    <subquestion format="html">' + '\n' +
    '      <text>' + cdata(promptHtml) + '</text>' + '\n' +
    (promptFiles ? '      ' + promptFiles + '\n' : '') +
    '      <answer>' + '\n' +
    '        <text>' + cdata(answer) + '</text>' + '\n' +
    '      </answer>' + '\n' +
    '    </subquestion>'
  );
}

export function renderMatching(q: Question, deps: RenderDeps): string {
  const questionText = renderElement(q.content, deps.media);
  const generalFeedback = renderElement(q.feedback_general ?? null, deps.media);

  const subquestions = (q.options ?? [])
    .map((option) => {
      const prompt = renderElement(option.content, deps.media);
      return subquestion(prompt.html, prompt.files, option.match_answer ?? '');
    })
    .join('\n');

  const extra = [
    '    <shuffleanswers>true</shuffleanswers>',
    blockElement('correctfeedback', { html: '', files: '' }),
    blockElement('partiallycorrectfeedback', { html: '', files: '' }),
    blockElement('incorrectfeedback', { html: '', files: '' }),
    subquestions,
  ]
    .filter((line) => line !== '')
    .join('\n');

  return questionShell({
    type: 'matching',
    name: deps.name,
    questionText,
    generalFeedback,
    mark: defaultGrade(deps.mark),
    extra,
  });
}

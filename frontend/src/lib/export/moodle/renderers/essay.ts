import type { Question } from '@/lib/types';
import type { RenderDeps } from './multichoice';
import { questionShell, renderElement, defaultGrade } from '../shared';

export function renderEssay(q: Question, deps: RenderDeps): string {
  const questionText = renderElement(q.content, deps.media);
  const generalFeedback = renderElement(q.feedback_general ?? null, deps.media);

  const extra = [
    '    <responseformat>editor</responseformat>',
    '    <responserequired>1</responserequired>',
    '    <responsefieldlines>15</responsefieldlines>',
    '    <attachments>0</attachments>',
    '    <attachmentsrequired>0</attachmentsrequired>',
    '    <graderinfo format="html"><text></text></graderinfo>',
    '    <responsetemplate format="html"><text></text></responsetemplate>',
  ].join('\n');

  return questionShell({
    type: 'essay',
    name: deps.name,
    questionText,
    generalFeedback,
    mark: defaultGrade(deps.mark),
    extra,
  });
}
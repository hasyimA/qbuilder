import type { Question } from '@/lib/types';
import type { MediaMap, ElementParts } from '../shared';
import {
  questionShell,
  renderElement,
  feedbackElement,
  defaultGrade,
  fractionDecimal,
  partialCreditPercent,
} from '../shared';
import { cdata } from '../xml-escape';

export interface RenderDeps {
  name: string;
  mark: string;
  media: MediaMap;
}

function answerBlock(parts: ElementParts, fraction: string): string {
  return (
    '      <answer fraction="' + fraction + '" format="html">' + '\n' +
    '        <text>' + cdata(parts.html) + '</text>' + '\n' +
    (parts.files ? '        ' + parts.files + '\n' : '') +
    feedbackElement({ html: '', files: '' }, 8) +
    '\n      </answer>'
  );
}

function blockFeedback(label: string, parts: ElementParts): string {
  return (
    '    <' + label + ' format="html">' + '\n' +
    '      <text>' + cdata(parts.html) + '</text>' + '\n' +
    (parts.files ? '      ' + parts.files + '\n' : '') +
    '    </' + label + '>'
  );
}

export function renderMultipleChoice(q: Question, deps: RenderDeps): string {
  const questionText = renderElement(q.content, deps.media);
  const generalFeedback = renderElement(q.feedback_general ?? null, deps.media);

  const correct = q.options.filter((o) => o.is_correct);
  const single = correct.length === 1;
  const equalShare = single ? '100' : partialCreditPercent(correct.length);

  const answers = q.options
    .map((option) => {
      const isCorrect = Boolean(option.is_correct);
      const percent = isCorrect ? equalShare : '0';
      const text = renderElement(option.content, deps.media);
      let block = answerBlock(text, fractionDecimal(percent));
      const optionFeedback = renderElement(option.feedback ?? null, deps.media);
      if (optionFeedback.html || optionFeedback.files) {
        block = block.replace(
          feedbackElement({ html: '', files: '' }, 8),
          feedbackElement(optionFeedback, 8)
        );
      }
      return block;
    })
    .join('\n');

  const correctFeedback = renderElement(q.feedback_correct ?? null, deps.media);
  const incorrectFeedback = renderElement(q.feedback_incorrect ?? null, deps.media);

  const extra = [
    '    <single>' + (single ? 'true' : 'false') + '</single>',
    '    <shuffleanswers>true</shuffleanswers>',
    '    <answernumbering>abc</answernumbering>',
    answers,
    blockFeedback('correctfeedback', correctFeedback),
    blockFeedback('partiallycorrectfeedback', { html: '', files: '' }),
    blockFeedback('incorrectfeedback', incorrectFeedback),
  ].join('\n');

  return questionShell({
    type: 'multichoice',
    name: deps.name,
    questionText,
    generalFeedback,
    mark: defaultGrade(deps.mark),
    extra,
  });
}
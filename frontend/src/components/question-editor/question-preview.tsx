import RichTextEditor from '@/components/rich-text/rich-text-editor';
import { QUESTION_TYPE_LABELS, type DocContent, type QuestionType } from '@/lib/types';

export type PreviewMode = 'teacher' | 'student';

export interface PreviewOption {
  key: string;
  text: string;
  is_correct: boolean;
}

interface QuestionPreviewProps {
  type: QuestionType;
  questionContent: DocContent;
  defaultMark: string;
  options: PreviewOption[];
  mode: PreviewMode;
  resolveMediaUrl?: (mediaId: number) => Promise<string>;
}

function letter(index: number): string {
  return String.fromCharCode(65 + index);
}

export default function QuestionPreview({
  type,
  questionContent,
  defaultMark,
  options,
  mode,
  resolveMediaUrl,
}: QuestionPreviewProps) {
  const showCorrect = mode === 'teacher';

  return (
    <div data-testid="question-preview" className="mx-auto w-full max-w-2xl min-w-0 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="preview-mode"
            className={
              mode === 'teacher'
                ? 'rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700'
                : 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700'
            }
          >
            {mode === 'teacher' ? 'Teacher preview' : 'Student preview'}
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            {QUESTION_TYPE_LABELS[type]}
          </span>
        </div>
        <span className="text-sm text-gray-500">Mark {defaultMark || '0'}</span>
      </header>

      <section aria-label="Question" className="text-sm sm:text-base">
        <RichTextEditor
          readOnly
          value={questionContent}
          resolveMediaUrl={resolveMediaUrl}
          ariaLabel="Question preview content"
        />
      </section>

      <section aria-label="Answer options" className="space-y-3">
        {type === 'essay' ? (
          <>
            <textarea
              disabled
              rows={4}
              aria-label="Essay answer"
              className="w-full min-w-0 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700"
              placeholder={mode === 'student' ? 'Write your essay here…' : ''}
            />
            {showCorrect && (
              <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500">
                Essay question — graded manually. Review the rubric before publishing.
              </p>
            )}
          </>
        ) : (
          <ul role="list" className="space-y-2">
            {options.map((opt, index) => {
              const isCorrect = showCorrect && opt.is_correct;
              return (
                <li
                  key={opt.key}
                  data-testid={`option-${letter(index)}`}
                  data-correct={isCorrect ? 'true' : undefined}
                  className={`flex min-w-0 items-center gap-3 rounded-md border px-3 py-2 ${
                    isCorrect
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-4 w-4 flex-none rounded-full border-2 ${
                      isCorrect ? 'border-emerald-500' : 'border-gray-300'
                    } ${isCorrect ? 'bg-emerald-500' : ''}`}
                  />
                  <span className="w-6 flex-none text-sm font-medium text-gray-400">
                    {letter(index)}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-sm text-gray-800">
                    {opt.text || `Option ${letter(index)}`}
                  </span>
                  {isCorrect && (
                    <span
                      data-testid="correct-badge"
                      className="flex-none rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white"
                    >
                      Correct answer
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {type === 'short_answer' && (
          <div>
            <input
              disabled
              aria-label="Short answer"
              className="w-full min-w-0 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700"
              value={mode === 'teacher' && options[0]?.text ? '' : ''}
              placeholder={
                mode === 'teacher' && options[0]?.text
                  ? 'Students type their answer here'
                  : 'Students type their answer here'
              }
            />
            {showCorrect && options.some((opt) => opt.text) && (
              <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
                Accepted answer:{' '}
                <span className="font-medium text-gray-800" data-testid="accepted-answer">
                  {options.find((opt) => opt.text)?.text}
                </span>
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
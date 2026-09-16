'use client';

import type { QuestionType } from '@/lib/types';
import { QUESTION_TYPE_LABELS } from '@/lib/types';
import { DialogSurface } from '@/components/ui';

interface QuestionTypeDialogProps {
  onCancel: () => void;
  onSelect: (type: QuestionType) => void;
}

const TYPE_DETAILS: Record<QuestionType, string> = {
  multiple_choice: 'Pilih satu jawaban benar dari beberapa opsi.',
  true_false: 'Pernyataan dengan jawaban Benar atau Salah.',
  short_answer: 'Jawaban berupa teks singkat yang dicocokkan.',
  essay: 'Jawaban uraian bebas tanpa kunci otomatis.',
};

const TYPE_ORDER: QuestionType[] = ['multiple_choice', 'true_false', 'short_answer', 'essay'];

function TypeIcon({ type }: { type: QuestionType }) {
  const common = 'h-5 w-5';
  switch (type) {
    case 'multiple_choice':
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'true_false':
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case 'short_answer':
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-2 14h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case 'essay':
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
  }
}

export default function QuestionTypeDialog({ onCancel, onSelect }: QuestionTypeDialogProps) {
  return (
    <DialogSurface
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      panelClassName="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] min-h-0 overflow-y-auto"
      ariaLabel="Pilih Jenis Soal"
      dataTestid="question-type-dialog"
      onClose={onCancel}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pilih Jenis Soal</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Editor akan menyesuaikan dengan jenis soal yang dipilih.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {TYPE_ORDER.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            data-testid={`question-type-option-${type}`}
            className="flex w-full items-start gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left hover:border-blue-400 hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-gray-100 text-gray-500">
              <TypeIcon type={type} />
            </span>
            <span>
              <span className="block text-sm font-medium text-gray-900">
                {QUESTION_TYPE_LABELS[type]}
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">{TYPE_DETAILS[type]}</span>
            </span>
            <span className="ml-auto flex-none text-gray-300">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          data-testid="question-type-cancel"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Batal
        </button>
      </div>
    </DialogSurface>
  );
}
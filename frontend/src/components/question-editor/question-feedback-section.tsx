'use client';

import { useState } from 'react';
import RichTextEditor from '@/components/rich-text/rich-text-editor';
import { docToPlainText } from '@/lib/content';
import type { DocContent, QuestionType } from '@/lib/types';

interface QuestionFeedbackSectionProps {
  type: QuestionType;
  general: DocContent;
  correct: DocContent;
  incorrect: DocContent;
  graderInfo: DocContent;
  onGeneralChange: (doc: DocContent) => void;
  onCorrectChange: (doc: DocContent) => void;
  onIncorrectChange: (doc: DocContent) => void;
  onGraderInfoChange: (doc: DocContent) => void;
}

function hasText(doc: DocContent): boolean {
  return docToPlainText(doc).trim().length > 0;
}

function Collapsible({
  title,
  hint,
  defaultOpen,
  testId,
  children,
}: {
  title: string;
  hint: string;
  defaultOpen: boolean;
  testId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-gray-200" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid={`${testId}-toggle`}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span>
          <span className="block text-sm font-medium text-gray-700">{title}</span>
          <span className="mt-0.5 block text-xs text-gray-500">{hint}</span>
        </span>
        <svg
          className={`h-4 w-4 flex-none text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="animate-fade-in space-y-4 border-t border-gray-100 px-3 py-3">{children}</div>}
    </div>
  );
}

export default function QuestionFeedbackSection({
  type,
  general,
  correct,
  incorrect,
  graderInfo,
  onGeneralChange,
  onCorrectChange,
  onIncorrectChange,
  onGraderInfoChange,
}: QuestionFeedbackSectionProps) {
  const isMultipleChoice = type === 'multiple_choice';
  const anyFeedback = hasText(general) || (isMultipleChoice && (hasText(correct) || hasText(incorrect)));

  return (
    <div className="space-y-3">
      <Collapsible
        title="Umpan Balik"
        hint="Tampil ke siswa saat meninjau jawaban (pembahasan)."
        defaultOpen={anyFeedback}
        testId="feedback-section"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Umpan Balik / Pembahasan
          </label>
          <RichTextEditor
            value={general}
            onChange={onGeneralChange}
            placeholder="Jelaskan mengapa jawaban tersebut benar atau salah…"
            ariaLabel="Umpan balik umum"
          />
        </div>

        {isMultipleChoice && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Saat Jawaban Benar
              </label>
              <RichTextEditor
                value={correct}
                onChange={onCorrectChange}
                placeholder="Umpan balik bila siswa menjawab benar…"
                ariaLabel="Umpan balik jawaban benar"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Saat Jawaban Salah
              </label>
              <RichTextEditor
                value={incorrect}
                onChange={onIncorrectChange}
                placeholder="Umpan balik bila siswa menjawab salah…"
                ariaLabel="Umpan balik jawaban salah"
              />
            </div>
          </div>
        )}
      </Collapsible>

      {type === 'essay' && (
        <Collapsible
          title="Informasi Penilai (Grader Information)"
          hint="Hanya terlihat oleh guru — isi kunci jawaban atau kalimat kunci untuk koreksi."
          defaultOpen={hasText(graderInfo)}
          testId="grader-info-section"
        >
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Konten ini tidak ditampilkan ke siswa. Gunakan untuk kunci jawaban, poin-poin penting,
            atau rubrik penilaian esai.
          </div>
          <RichTextEditor
            value={graderInfo}
            onChange={onGraderInfoChange}
            placeholder="Tulis kunci jawaban / kalimat kunci untuk penilaian esai…"
            ariaLabel="Informasi penilai"
          />
        </Collapsible>
      )}
    </div>
  );
}
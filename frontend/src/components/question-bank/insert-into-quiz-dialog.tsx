'use client';

import { useEffect, useRef, useState } from 'react';
import { quizzes, questions } from '@/lib/api';
import type { Quiz } from '@/lib/api';
import type { Question } from '@/lib/types';
import { DialogSurface } from '@/components/ui/dialog';

interface Props {
  question: Question;
  onCancel: () => void;
  onAttached: (question: Question, quiz: Quiz) => void;
}

export default function InsertIntoQuizDialog({ question, onCancel, onAttached }: Props) {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [quizList, setQuizList] = useState<Quiz[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedSearchRef = useRef('');

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = search.trim();
      if (trimmed === appliedSearchRef.current) return;
      appliedSearchRef.current = trimmed;
      setAppliedSearch(trimmed);
      setLoading(true);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  useEffect(() => {
    let active = true;

    quizzes
      .list({ search: appliedSearch || undefined, tab: 'mine', perPage: 20 })
      .then((response) => {
        if (active) setQuizList(response.data);
      })
      .catch(() => {
        if (active) setError('Gagal memuat daftar kuis.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appliedSearch]);

  async function handleAttach() {
    if (selectedQuizId === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await questions.attach(selectedQuizId, question.id);
      const quiz = quizList.find((q) => q.id === selectedQuizId) ?? { id: selectedQuizId, title: '' } as Quiz;
      onAttached(result.data, quiz);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message ?? 'Gagal menambahkan soal ke kuis.');
      setSaving(false);
    }
  }

  return (
    <DialogSurface
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      panelClassName="w-full max-w-md rounded-xl bg-white p-6"
      titleId="bank-insert-title"
      onClose={onCancel}
      dataTestid="bank-insert-dialog"
    >
      <div className="mb-4">
        <h2 id="bank-insert-title" className="text-lg font-semibold text-gray-900">Masukkan ke Kuis</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Pilih kuis yang ingin menerima soal ini.
        </p>
      </div>

        <input
          data-testid="bank-insert-search"
          type="search"
          aria-label="Cari judul kuis"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari judul kuis..."
          className="w-full border rounded px-3 py-2 text-sm mb-4"
        />

        <div data-testid="bank-insert-list" className="max-h-60 overflow-y-auto border rounded bg-gray-50 divide-y divide-gray-100">
          {loading ? (
            <p className="p-4 text-sm text-gray-500 text-center">Memuat kuis...</p>
          ) : quizList.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 text-center">Tidak ada kuis ditemukan.</p>
          ) : (
            quizList.map((quiz) => (
              <label
                key={quiz.id}
                data-testid={`bank-insert-option-${quiz.id}`}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-100 ${
                  selectedQuizId === quiz.id ? 'bg-blue-50' : ''
                }`}
              >
                <input
                  type="radio"
                  name="insert-quiz"
                  value={quiz.id}
                  checked={selectedQuizId === quiz.id}
                  onChange={() => setSelectedQuizId(quiz.id)}
                  className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{quiz.title}</p>
                  <p className="text-xs text-gray-500">
                    {quiz.questions_count} soal · {quiz.status}
                  </p>
                </div>
              </label>
            ))
          )}
        </div>

        {error && (
          <p data-testid="bank-insert-error" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Batal
          </button>
          <button
            data-testid="bank-insert-confirm"
            onClick={handleAttach}
            disabled={selectedQuizId === null || saving}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
    </DialogSurface>
  );
}
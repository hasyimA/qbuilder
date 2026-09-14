'use client';

import { useEffect, useRef, useState } from 'react';
import { questions } from '@/lib/api';
import type { Question } from '@/lib/types';
import { docToPlainText } from '@/lib/content';
import { DialogSurface } from '@/components/ui/dialog';

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'Mudah',
  medium: 'Sedang',
  hard: 'Sulit',
};

interface Props {
  quizId: number;
  existingIds: number[];
  onCancel: () => void;
  onAttached: (question: Question) => void;
}

export default function BankPickerDialog({ quizId, existingIds, onCancel, onAttached }: Props) {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [bankList, setBankList] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<number | null>(null);
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
      setError(null);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  useEffect(() => {
    let active = true;

    questions.bank
      .list({ search: appliedSearch, perPage: 25 })
      .then((response) => {
        if (!active) return;
        setBankList(response.data);
      })
      .catch(() => {
        if (active) setError('Gagal memuat bank soal.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appliedSearch]);

  async function handleAdd(question: Question) {
    if (addingId !== null) return;
    setAddingId(question.id);
    setError(null);
    try {
      const res = await questions.attach(quizId, question.id);
      onAttached(res.data);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message ?? 'Gagal menambahkan soal ke kuis.');
      setAddingId(null);
    }
  }

  return (
    <DialogSurface
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      panelClassName="w-full max-w-lg rounded-xl bg-white p-6"
      titleId="bank-picker-title"
      onClose={onCancel}
      dataTestid="bank-picker-dialog"
    >
      <div className="mb-4">
        <h2 id="bank-picker-title" className="text-lg font-semibold text-gray-900">Dari Bank Soal</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Pilih soal dari bank untuk ditambahkan ke kuis ini.
        </p>
      </div>

        <input
          data-testid="bank-picker-search"
          type="search"
          aria-label="Cari soal di bank"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari soal di bank..."
          className="w-full border rounded px-3 py-2 text-sm mb-4"
        />

        <div data-testid="bank-picker-list" className="max-h-64 overflow-y-auto border rounded bg-gray-50 divide-y divide-gray-100">
          {loading ? (
            <p className="p-4 text-sm text-gray-500 text-center">Memuat bank soal...</p>
          ) : bankList.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 text-center">Tidak ada soal ditemukan.</p>
          ) : (
            bankList.map((question) => {
              const alreadyAdded = existingIds.includes(question.id);
              return (
                <div key={question.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    {question.category && (
                      <p className="text-xs text-gray-400 mb-0.5">{question.category}</p>
                    )}
                    <p className="text-sm text-gray-900 truncate">{docToPlainText(question.content)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {question.difficulty
                        ? (DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty)
                        : 'Tanpa tingkat'}
                      {question.status === 'complete' ? ' · Lengkap' : ' · Draf'}
                    </p>
                  </div>
                  <button
                    data-testid={`bank-picker-add-${question.id}`}
                    onClick={() => void handleAdd(question)}
                    disabled={alreadyAdded || addingId === question.id}
                    className={`flex-none rounded px-3 py-1.5 text-xs font-medium ${
                      alreadyAdded
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                    }`}
                  >
                    {alreadyAdded ? 'Sudah ada' : addingId === question.id ? 'Menambah...' : 'Tambah'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {error && (
          <p data-testid="bank-picker-error" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Tutup
          </button>
        </div>
    </DialogSurface>
  );
}
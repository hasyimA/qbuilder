'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { media, questions, resolveApiUrl } from '@/lib/api';
import type {
  QuestionFilterType,
  QuestionFiltersMeta,
  QuestionStatus,
  Quiz,
} from '@/lib/api';
import type { Question } from '@/lib/types';
import { docToPlainText } from '@/lib/content';
import { ConfirmDialog, Notice, Select } from '@/components/ui';
import { usePageTitle } from '@/hooks/use-page-title';
import QuestionPreview, { type PreviewOption } from '@/components/question-editor/question-preview';
import InsertIntoQuizDialog from '@/components/question-bank/insert-into-quiz-dialog';
import { DialogSurface } from '@/components/ui/dialog';

const TYPE_SHORT: Record<QuestionFilterType, string> = {
  multiple_choice: 'PG',
  true_false: 'B/S',
  short_answer: 'Isian',
  essay: 'Esai',
};

const TYPE_LABEL: Record<QuestionFilterType, string> = {
  multiple_choice: 'Pilihan Ganda',
  true_false: 'Benar / Salah',
  short_answer: 'Isian Singkat',
  essay: 'Esai',
};

const STATUS_LABEL: Record<QuestionStatus, string> = {
  draft: 'Draf',
  complete: 'Lengkap',
};

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'Mudah',
  medium: 'Sedang',
  hard: 'Sulit',
};

interface Filters {
  type: QuestionFilterType | '';
  status: QuestionStatus | '';
  category: string;
  difficulty: string;
  tag: string;
  updatedWithin: '' | '7' | '30';
}

const EMPTY_FILTERS: Filters = {
  type: '',
  status: '',
  category: '',
  difficulty: '',
  tag: '',
  updatedWithin: '',
};

export default function QuestionBank() {
  usePageTitle('Bank Soal — Quiz Builder');
  const [deleteConfirm, setDeleteConfirm] = useState<Question | null>(null);
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [meta, setMeta] = useState<QuestionFiltersMeta>({
    categories: [],
    difficulties: [],
    tags: [],
    statuses: [],
    types: [],
  });
  const [busy, setBusy] = useState<{ id: number; action: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [insertFor, setInsertFor] = useState<Question | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedSearchRef = useRef('');

  useEffect(() => {
    questions.bank
      .filtersMeta()
      .then((response) => setMeta(response.data))
      .catch(() => {});

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = search.trim();
      if (trimmed === appliedSearchRef.current) return;
      appliedSearchRef.current = trimmed;
      setAppliedSearch(trimmed);
      setPage(1);
      setLoading(true);
      setError(null);
    }, 300);
  }, [search]);

  useEffect(() => {
    let active = true;

    questions.bank
      .list({
        page,
        search: appliedSearch,
        status: filters.status || undefined,
        type: filters.type || undefined,
        category: filters.category || undefined,
        difficulty: filters.difficulty || undefined,
        tag: filters.tag || undefined,
        updatedWithin: filters.updatedWithin || undefined,
      })
      .then((response) => {
        if (!active) return;
        setData(response.data);
        setTotal(response.meta.total);
        setLastPage(Math.max(response.meta.last_page, 1));
        if (page > response.meta.last_page) {
          setLoading(true);
          setPage(Math.max(response.meta.last_page, 1));
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        const apiErr = err as { status?: number };
        if (apiErr.status === 401) {
          localStorage.removeItem('token');
          router.push('/login');
        } else {
          setError('Gagal memuat bank soal.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey, page, appliedSearch, filters, router]);

  function changeFilter<T extends keyof Filters>(key: T, value: Filters[T]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
    setLoading(true);
    setError(null);
    setNotice(null);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setSearch('');
    setAppliedSearch('');
    appliedSearchRef.current = '';
    setPage(1);
    setLoading(true);
    setError(null);
    setNotice(null);
  }

  async function handleLogout() {
    localStorage.removeItem('token');
    router.push('/login');
  }

  async function handleUnusedDelete(question: Question) {
    const usedIn = question.used_in_count ?? 0;
    if (usedIn > 0) {
      setError(
        `Soal ini dipakai di ${usedIn} kuis. Hapus dari kuis tersebut terlebih dahulu sebelum menghapus dari bank.`
      );
      return;
    }
    setDeleteConfirm(null);
    setBusy({ id: question.id, action: 'delete' });
    setError(null);
    setNotice(null);
    try {
      await questions.delete(question.id);
      setNotice('Soal telah dihapus dari bank.');
      setReloadKey((key) => key + 1);
      setLoading(true);
    } catch {
      setError('Gagal menghapus soal.');
    } finally {
      setBusy(null);
    }
  }

  async function handleDuplicate(question: Question) {
    setBusy({ id: question.id, action: 'duplicate' });
    setError(null);
    setNotice(null);
    try {
      await questions.bank.duplicate(question.id);
      setNotice('Soal berhasil digandakan ke bank.');
      setReloadKey((key) => key + 1);
      setLoading(true);
    } catch {
      setError('Gagal menggandakan soal.');
    } finally {
      setBusy(null);
    }
  }

  function handleAttached(question: Question, quiz: Quiz) {
    setInsertFor(null);
    setNotice(`Soal disimpan ke kuis "${quiz.title}".`);
    setReloadKey((key) => key + 1);
    setLoading(true);
  }

  async function resolveMediaUrl(mediaId: number): Promise<string> {
    const response = await media.get(mediaId);
    return resolveApiUrl(response.data.url);
  }

  const perPage = 20;
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Bank Soal</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Simpan soal sekali, pakai ulang di kuis mana pun.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/bank/new"
              data-testid="bank-create"
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              + Buat Soal
            </Link>
            <button onClick={handleLogout} className="text-gray-600 hover:text-gray-800">
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <section data-testid="bank-toolbar" className="bg-white rounded-lg border p-4 mb-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              data-testid="bank-search"
              type="search"
              aria-label="Cari soal di bank soal"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari teks soal, kategori, atau jawaban..."
              className="flex-1 min-w-56 border rounded px-3 py-2 text-sm"
            />
            <Select
              data-testid="bank-filter-type"
              aria-label="Filter jenis soal"
              value={filters.type}
              onChange={(event) => changeFilter('type', event.target.value as QuestionFilterType)}
              className="w-44"
            >
              <option value="">Semua jenis</option>
              {meta.types.map((type) => (
                <option key={type.value} value={type.value}>
                  {TYPE_LABEL[type.value] ?? type.label}
                </option>
              ))}
            </Select>
            <Select
              data-testid="bank-filter-status"
              aria-label="Filter status soal"
              value={filters.status}
              onChange={(event) => changeFilter('status', event.target.value as QuestionStatus)}
              className="w-40"
            >
              <option value="">Semua status</option>
              {meta.statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {STATUS_LABEL[status.value] ?? status.label}
                </option>
              ))}
            </Select>
            <Select
              data-testid="bank-filter-category"
              aria-label="Filter kategori soal"
              value={filters.category}
              onChange={(event) => changeFilter('category', event.target.value)}
              className="w-44"
            >
              <option value="">Semua kategori</option>
              {meta.categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
            <Select
              data-testid="bank-filter-difficulty"
              aria-label="Filter tingkat kesulitan"
              value={filters.difficulty}
              onChange={(event) => changeFilter('difficulty', event.target.value)}
              className="w-44"
            >
              <option value="">Semua tingkat</option>
              {meta.difficulties.map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {DIFFICULTY_LABEL[difficulty] ?? difficulty}
                </option>
              ))}
            </Select>
            <Select
              data-testid="bank-filter-tag"
              aria-label="Filter tag"
              value={filters.tag}
              onChange={(event) => changeFilter('tag', event.target.value)}
              className="w-44"
            >
              <option value="">Semua tag</option>
              {meta.tags.map((tag) => (
                <option key={tag.id} value={tag.slug}>
                  {tag.name}
                </option>
              ))}
            </Select>
            <Select
              data-testid="bank-filter-updated"
              aria-label="Filter waktu diperbarui"
              value={filters.updatedWithin}
              onChange={(event) => changeFilter('updatedWithin', event.target.value as '' | '7' | '30')}
              className="w-44"
            >
              <option value="">Kapan saja diperbarui</option>
              <option value="7">7 hari terakhir</option>
              <option value="30">30 hari terakhir</option>
            </Select>
            <button
              data-testid="bank-filter-reset"
              onClick={resetFilters}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Reset filter
            </button>
          </div>
        </section>

        {error && (
          <div data-testid="bank-error" className="mb-5">
            <Notice tone="error" onDismiss={() => setError(null)}>{error}</Notice>
          </div>
        )}
        {notice && (
          <div data-testid="bank-notice" className="mb-5">
            <Notice tone="success" autoDismissMs={6000} onDismiss={() => setNotice(null)}>
              {notice}
            </Notice>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-lg border py-16 text-center text-gray-500" data-testid="bank-loading">
            Memuat…
          </div>
        ) : data.length === 0 ? (
          <div className="bg-white rounded-lg border py-16 text-center" data-testid="bank-empty">
            <p className="text-gray-500 mb-4">
              Belum ada soal di bank. Buat soal pertama Anda agar bisa dipakai ulang di kuis mana pun.
            </p>
            <Link
              href="/bank/new"
              className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700"
            >
              Buat soal pertama
            </Link>
          </div>
        ) : (
          <>
            <div className="hidden lg:block bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Soal</th>
                    <th className="px-4 py-3 font-medium">Tipe</th>
                    <th className="px-4 py-3 font-medium">Diperbarui</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Dipakai</th>
                    <th className="px-4 py-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.map((question) => (
                    <TableRow
                      key={question.id}
                      question={question}
                      busy={busy}
                      onPreview={() => setPreviewQuestion(question)}
                      onInsert={() => setInsertFor(question)}
                      onDuplicate={() => handleDuplicate(question)}
                      onDelete={() => setDeleteConfirm(question)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden space-y-3">
              {data.map((question) => (
                <CardRow
                  key={question.id}
                  question={question}
                  busy={busy}
                  onPreview={() => setPreviewQuestion(question)}
                  onInsert={() => setInsertFor(question)}
                  onDuplicate={() => handleDuplicate(question)}
                  onDelete={() => setDeleteConfirm(question)}
                />
              ))}
            </div>

            <Pagination
              page={page}
              lastPage={lastPage}
              total={total}
              from={from}
              to={to}
              onChange={(number) => {
                setPage(number);
                setLoading(true);
              }}
            />
          </>
        )}
      </main>

      {previewQuestion && (
        <PreviewDialog question={previewQuestion} resolveMediaUrl={resolveMediaUrl} onClose={() => setPreviewQuestion(null)} />
      )}

      {insertFor && (
        <InsertIntoQuizDialog
          question={insertFor}
          onCancel={() => setInsertFor(null)}
          onAttached={handleAttached}
        />
      )}

      {deleteConfirm && (
        <ConfirmDialog
          open
          title="Hapus soal dari bank?"
          message={<p>Soal akan dihapus permanen dari bank soal. Tindakan ini tidak dapat dibatalkan.</p>}
          confirmLabel="Hapus"
          onConfirm={() => void handleUnusedDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

interface RowProps {
  question: Question;
  busy: { id: number; action: string } | null;
  onPreview: () => void;
  onInsert: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function TableRow({ question, busy, onPreview, onInsert, onDuplicate, onDelete }: RowProps) {
  return (
    <tr data-testid={`bank-row-${question.id}`} className="hover:bg-gray-50">
      <td className="px-4 py-3 min-w-0">
        {question.tags && question.tags.length > 0 && (
          <p className="text-xs text-gray-400 mb-0.5">
            {question.tags.map((tag) => `#${tag.name}`).join(' ')}
          </p>
        )}
        <p className="text-gray-900 line-clamp-2 max-w-md">{docToPlainText(question.content)}</p>
        {question.category && (
          <p className="text-xs text-gray-500 mt-0.5">{question.category}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="inline-block text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
          {TYPE_SHORT[question.type]}
        </span>
        {question.difficulty && (
          <span className="ml-1 inline-block text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
            {DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-gray-600">{formatDate(question.updated_at)}</td>
      <td className="px-4 py-3">
        <span
          className={`text-xs px-2 py-1 rounded ${
            question.status === 'complete'
              ? 'bg-green-100 text-green-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {STATUS_LABEL[question.status] ?? question.status}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-600">
        <span data-testid={`bank-used-${question.id}`}>
          {(question.used_in_count ?? 0) > 0 ? `${question.used_in_count} kuis` : '—'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-3 text-sm">
          <Actions
            question={question}
            busy={busy}
            onPreview={onPreview}
            onInsert={onInsert}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        </div>
      </td>
    </tr>
  );
}

function CardRow({ question, busy, onPreview, onInsert, onDuplicate, onDelete }: RowProps) {
  return (
    <div data-testid={`bank-row-${question.id}`} className="bg-white rounded-lg border p-4">
      <div className="flex justify-between items-start gap-2">
        <span className="inline-block text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
          {TYPE_LABEL[question.type]}
        </span>
        <span
          className={`text-xs px-2 py-1 rounded shrink-0 ${
            question.status === 'complete'
              ? 'bg-green-100 text-green-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {STATUS_LABEL[question.status] ?? question.status}
        </span>
      </div>
      <p className="text-sm text-gray-900 line-clamp-2 mt-2">{docToPlainText(question.content)}</p>
      <p className="text-xs text-gray-500 mt-1">
        Diperbarui {formatDate(question.updated_at)}
        {(question.used_in_count ?? 0) > 0 && ` · dipakai ${question.used_in_count} kuis`}
      </p>
      {question.category && <p className="text-xs text-gray-500 mt-0.5">{question.category}</p>}
      {question.tags && question.tags.length > 0 && (
        <p className="text-xs text-gray-400 mt-1">
          {question.tags.map((tag) => `#${tag.name}`).join(' ')}
        </p>
      )}
      <div className="mt-3 border-t pt-3 flex items-center gap-3 text-sm">
        <Actions
          question={question}
          busy={busy}
          onPreview={onPreview}
          onInsert={onInsert}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

function Actions({ question, busy, onPreview, onInsert, onDuplicate, onDelete }: RowProps) {
  const isBusy = busy?.id === question.id;
  const usedIn = question.used_in_count ?? 0;

  return (
    <>
      <button
        data-testid={`bank-action-${question.id}-preview`}
        onClick={onPreview}
        disabled={isBusy}
        className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
      >
        Pratinjau
      </button>
      <Link
        href={`/bank/${question.id}`}
        data-testid={`bank-action-${question.id}-edit`}
        className="text-blue-600 hover:text-blue-800"
      >
        Edit
      </Link>
      <button
        data-testid={`bank-action-${question.id}-insert`}
        onClick={onInsert}
        disabled={isBusy}
        className="text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
      >
        Masukkan ke Kuis
      </button>
      <button
        data-testid={`bank-action-${question.id}-duplicate`}
        onClick={onDuplicate}
        disabled={isBusy}
        className="text-teal-600 hover:text-teal-800 disabled:opacity-50"
      >
        Duplikat
      </button>
      <button
        data-testid={`bank-action-${question.id}-delete`}
        onClick={onDelete}
        disabled={isBusy || usedIn > 0}
        title={
          usedIn > 0
            ? `Dipakai di ${usedIn} kuis — hapus dari kuis tersebut dulu`
            : 'Hapus soal dari bank'
        }
        className="text-red-600 hover:text-red-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Hapus
      </button>
    </>
  );
}

function PreviewDialog({
  question,
  resolveMediaUrl,
  onClose,
}: {
  question: Question;
  resolveMediaUrl: (mediaId: number) => Promise<string>;
  onClose: () => void;
}) {
  const options: PreviewOption[] = question.options.map((option, index) => ({
    key: String.fromCharCode(65 + index),
    text: docToPlainText(option.content),
    is_correct: option.is_correct,
  }));

  return (
    <DialogSurface
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      panelClassName="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl bg-white p-6"
      ariaLabel="Pratinjau soal"
      onClose={onClose}
      dataTestid="bank-preview-dialog"
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-600">Pratinjau soal</p>
        <button
          data-testid="bank-preview-close"
          onClick={onClose}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          Tutup
        </button>
      </div>
      <QuestionPreview
        type={question.type}
        questionContent={question.content}
        defaultMark={String(question.default_mark)}
        options={options}
        mode="teacher"
        resolveMediaUrl={resolveMediaUrl}
      />
    </DialogSurface>
  );
}

interface PaginationProps {
  page: number;
  lastPage: number;
  total: number;
  from: number;
  to: number;
  onChange: (page: number) => void;
}

function Pagination({ page, lastPage, total, from, to, onChange }: PaginationProps) {
  if (total === 0) return null;

  return (
    <div
      data-testid="bank-pagination"
      className="flex flex-wrap items-center justify-between gap-3 mt-5 text-sm"
    >
      <p className="text-gray-500" data-testid="bank-total">
        Menampilkan {from}–{to} dari {total} soal
      </p>
      <div className="flex items-center gap-1">
        <button
          data-testid="bank-pagination-prev"
          onClick={() => onChange(Math.max(page - 1, 1))}
          disabled={page <= 1}
          className="px-3 py-1.5 border rounded bg-white disabled:opacity-40 hover:enabled:bg-gray-50"
        >
          Sebelumnya
        </button>
        {pageNumbers(page, lastPage).map((number) => (
          <button
            key={number}
            data-testid={`bank-pagination-page-${number}`}
            onClick={() => onChange(number)}
            className={`px-3 py-1.5 border rounded ${
              number === page
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white hover:bg-gray-50'
            }`}
          >
            {number}
          </button>
        ))}
        <button
          data-testid="bank-pagination-next"
          onClick={() => onChange(Math.min(page + 1, lastPage))}
          disabled={page >= lastPage}
          className="px-3 py-1.5 border rounded bg-white disabled:opacity-40 hover:enabled:bg-gray-50"
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}

function pageNumbers(page: number, lastPage: number): number[] {
  const start = Math.max(1, Math.min(page - 2, lastPage - 4));
  const end = Math.min(lastPage, start + 4);
  const numbers: number[] = [];
  for (let i = start; i <= end; i += 1) numbers.push(i);
  return numbers;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
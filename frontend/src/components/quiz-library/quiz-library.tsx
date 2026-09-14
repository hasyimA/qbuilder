'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, quizzes } from '@/lib/api';
import type { Quiz, QuizFiltersMeta, QuizTab, QuizQuestionType } from '@/lib/api';
import { ExportValidationErrorList, formatExportErrors } from '@/lib/export';
import { exportQuizMoodle } from '@/lib/export/export-quiz';
import { ConfirmDialog, Notice } from '@/components/ui';

const QUESTION_TYPE_SHORT: Record<QuizQuestionType, string> = {
  multiple_choice: 'PG',
  true_false: 'B/S',
  short_answer: 'Isian',
  essay: 'Esai',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draf',
  published: 'Terbit',
  archived: 'Arsip',
};

const VISIBILITY_LABEL: Record<string, string> = {
  private: 'Pribadi',
  school: 'Sekolah',
  public: 'Publik',
};

interface Filters {
  status: string;
  category: string;
  tag: string;
  type: string;
  minQuestions: number;
  updatedWithin: string;
}

const EMPTY_FILTERS: Filters = {
  status: '',
  category: '',
  tag: '',
  type: '',
  minQuestions: 0,
  updatedWithin: '',
};

export default function QuizLibrary() {
  const [deleteConfirm, setDeleteConfirm] = useState<Quiz | null>(null);
  const router = useRouter();

  const [tab, setTab] = useState<QuizTab>('mine');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Quiz[]>([]);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [meta, setMeta] = useState<QuizFiltersMeta>({ categories: [], tags: [], types: [] });
  const [busy, setBusy] = useState<{ id: number; action: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedSearchRef = useRef('');

  useEffect(() => {
    quizzes
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

    quizzes
      .list({
        page,
        tab,
        search: appliedSearch,
        status: filters.status,
        category: filters.category,
        tag: filters.tag,
        type: filters.type,
        minQuestions: filters.minQuestions || undefined,
        updatedWithin: (filters.updatedWithin || undefined) as '7' | '30' | undefined,
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
          setError('Gagal memuat daftar kuis.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey, page, tab, appliedSearch, filters, router]);

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
    try {
      await auth.logout();
    } finally {
      localStorage.removeItem('token');
      router.push('/login');
    }
  }

  async function handleDuplicate(quiz: Quiz) {
    setBusy({ id: quiz.id, action: 'duplicate' });
    setError(null);
    setNotice(null);
    try {
      await quizzes.duplicate(quiz.id);
      setNotice(`Kuis "${quiz.title}" berhasil digandakan: ${quiz.title} (Salinan).`);
      setReloadKey((key) => key + 1);
      setLoading(true);
    } catch {
      setError('Gagal menggandakan kuis.');
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(quiz: Quiz) {
    setDeleteConfirm(null);
    setBusy({ id: quiz.id, action: 'delete' });
    setError(null);
    setNotice(null);
    try {
      await quizzes.delete(quiz.id);
      setNotice(`Kuis "${quiz.title}" telah dihapus.`);
      setReloadKey((key) => key + 1);
      setLoading(true);
    } catch {
      setError('Gagal menghapus kuis.');
    } finally {
      setBusy(null);
    }
  }

  async function handleExport(quiz: Quiz) {
    setBusy({ id: quiz.id, action: 'export' });
    setError(null);
    setNotice(null);
    try {
      const title = await exportQuizMoodle(quiz.id);
      setNotice(`Kuis "${title}" berhasil diekspor ke Moodle XML.`);
    } catch (err) {
      if (err instanceof ExportValidationErrorList) {
        setError(formatExportErrors(err.errors));
      } else {
        const reason = err instanceof Error ? err.message : 'Terjadi kesalahan saat ekspor.';
        setError(`Ekspor gagal: ${reason}`);
      }
    } finally {
      setBusy(null);
    }
  }

  const from = total === 0 ? 0 : (page - 1) * 20 + 1;
  const to = Math.min(page * 20, total);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Perpustakaan Kuis</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/bank"
              data-testid="quiz-nav-bank"
              className="text-blue-600 px-3 py-2 rounded hover:text-blue-800"
            >
              Bank Soal
            </Link>
            <Link
              href="/quizzes/new"
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              + Kuis Baru
            </Link>
            <button onClick={handleLogout} className="text-gray-600 hover:text-gray-800">
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div data-testid="quiz-tabs" className="flex gap-1 mb-5 border-b border-gray-200">
          <button
            data-testid="quiz-tab-mine"
            onClick={() => {
              setTab('mine');
              setPage(1);
              setLoading(true);
              setError(null);
              setNotice(null);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === 'mine'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Kuis Saya
          </button>
          <button
            data-testid="quiz-tab-shared"
            onClick={() => {
              setTab('shared');
              setPage(1);
              setLoading(true);
              setError(null);
              setNotice(null);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === 'shared'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Dibagikan untuk Saya
          </button>
        </div>

        <section
          data-testid="quiz-toolbar"
          className="bg-white rounded-lg border p-4 mb-5 space-y-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              data-testid="quiz-search"
              type="search"
              aria-label="Cari kuis"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari judul atau deskripsi..."
              className="flex-1 min-w-56 border rounded px-3 py-2 text-sm"
            />
            <select
              data-testid="quiz-filter-status"
              aria-label="Filter status kuis"
              value={filters.status}
              onChange={(event) => changeFilter('status', event.target.value)}
              className="border rounded px-3 py-2 text-sm bg-white"
            >
              <option value="">Semua status</option>
              <option value="draft">Draf</option>
              <option value="published">Terbit</option>
              <option value="archived">Arsip</option>
            </select>
            <select
              data-testid="quiz-filter-type"
              aria-label="Filter jenis kuis"
              value={filters.type}
              onChange={(event) => changeFilter('type', event.target.value)}
              className="border rounded px-3 py-2 text-sm bg-white"
            >
              <option value="">Semua jenis</option>
              {meta.types.map((type) => (
                <option key={type} value={type}>
                  {QUESTION_TYPE_SHORT[type]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              data-testid="quiz-filter-category"
              aria-label="Filter kategori kuis"
              value={filters.category}
              onChange={(event) => changeFilter('category', event.target.value)}
              className="border rounded px-3 py-2 text-sm bg-white"
            >
              <option value="">Semua kategori</option>
              {meta.categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              data-testid="quiz-filter-tag"
              aria-label="Filter tag kuis"
              value={filters.tag}
              onChange={(event) => changeFilter('tag', event.target.value)}
              className="border rounded px-3 py-2 text-sm bg-white"
            >
              <option value="">Semua tag</option>
              {meta.tags.map((tag) => (
                <option key={tag.id} value={tag.slug}>
                  {tag.name}
                </option>
              ))}
            </select>
            <select
              data-testid="quiz-filter-min"
              aria-label="Filter jumlah soal minimum"
              value={filters.minQuestions}
              onChange={(event) => changeFilter('minQuestions', Number(event.target.value))}
              className="border rounded px-3 py-2 text-sm bg-white"
            >
              <option value={0}>Semua jumlah soal</option>
              <option value={1}>≥ 1 soal</option>
              <option value={5}>≥ 5 soal</option>
              <option value={10}>≥ 10 soal</option>
              <option value={25}>≥ 25 soal</option>
            </select>
            <select
              data-testid="quiz-filter-updated"
              aria-label="Filter waktu diperbarui kuis"
              value={filters.updatedWithin}
              onChange={(event) => changeFilter('updatedWithin', event.target.value)}
              className="border rounded px-3 py-2 text-sm bg-white"
            >
              <option value="">Kapan saja diperbarui</option>
              <option value="7">7 hari terakhir</option>
              <option value="30">30 hari terakhir</option>
            </select>
            <button
              data-testid="quiz-filter-reset"
              onClick={resetFilters}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Reset filter
            </button>
          </div>
        </section>

        {error && (
          <div data-testid="quiz-error" className="mb-5">
            <Notice tone="error" onDismiss={() => setError(null)}>{error}</Notice>
          </div>
        )}
        {notice && (
          <div data-testid="quiz-notice" className="mb-5">
            <Notice tone="success" autoDismissMs={6000} onDismiss={() => setNotice(null)}>
              {notice}
            </Notice>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-lg border py-16 text-center text-gray-500" data-testid="quiz-loading">
            Memuat…
          </div>
        ) : data.length === 0 ? (
          <div className="bg-white rounded-lg border py-16 text-center" data-testid="quiz-empty">
            <p className="text-gray-500 mb-4">
              {tab === 'mine'
                ? 'Belum ada kuis. Buat kuis pertama Anda.'
                : 'Belum ada kuis yang dibagikan untuk Anda.'}
            </p>
            {tab === 'mine' && (
              <Link
                href="/quizzes/new"
                className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700"
              >
                Buat kuis pertama
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="hidden lg:block bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Kuis</th>
                    <th className="px-4 py-3 font-medium">Soal</th>
                    <th className="px-4 py-3 font-medium">Diperbarui</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Visibilitas</th>
                    <th className="px-4 py-3 font-medium">Pemilik</th>
                    <th className="px-4 py-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.map((quiz) => (
                    <TableRow
                      key={quiz.id}
                      quiz={quiz}
                      owned={tab === 'mine'}
                      busy={busy}
                      onDuplicate={() => handleDuplicate(quiz)}
                      onDelete={() => setDeleteConfirm(quiz)}
                      onExport={() => handleExport(quiz)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden space-y-3">
              {data.map((quiz) => (
                <CardRow
                  key={quiz.id}
                  quiz={quiz}
                  owned={tab === 'mine'}
                  busy={busy}
                  onDuplicate={() => handleDuplicate(quiz)}
                  onDelete={() => setDeleteConfirm(quiz)}
                  onExport={() => handleExport(quiz)}
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

      {deleteConfirm && (
        <ConfirmDialog
          open
          title="Hapus kuis?"
          message={<p>Kuis &ldquo;{deleteConfirm.title}&rdquo; akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.</p>}
          confirmLabel="Hapus"
          onConfirm={() => void handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

interface RowProps {
  quiz: Quiz;
  owned: boolean;
  busy: { id: number; action: string } | null;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
}

function TableRow({ quiz, owned, busy, onDuplicate, onDelete, onExport }: RowProps) {
  return (
    <tr data-testid={`quiz-row-${quiz.id}`} className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <Link href={owned ? `/quizzes/${quiz.id}` : `/quizzes/${quiz.id}/preview`} className="font-medium text-gray-900 hover:text-blue-600">
          {quiz.title}
        </Link>
        {quiz.description && (
          <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{quiz.description}</p>
        )}
        {quiz.tags.length > 0 && (
          <p className="text-xs text-gray-400 mt-1">
            {quiz.tags.map((tag) => `#${tag.name}`).join(' ')}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-gray-700">{quiz.questions_count}</span>
        {quiz.question_types.map((type) => (
          <span
            key={type}
            className="ml-1.5 inline-block text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700"
          >
            {QUESTION_TYPE_SHORT[type as QuizQuestionType]}
          </span>
        ))}
      </td>
      <td className="px-4 py-3 text-gray-600">{formatDate(quiz.updated_at)}</td>
      <td className="px-4 py-3">
        <span
          className={`text-xs px-2 py-1 rounded ${
            quiz.status === 'published'
              ? 'bg-green-100 text-green-800'
              : quiz.status === 'draft'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-gray-100 text-gray-700'
          }`}
        >
          {STATUS_LABEL[quiz.status] ?? quiz.status}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-600">{VISIBILITY_LABEL[quiz.visibility] ?? quiz.visibility}</td>
      <td className="px-4 py-3 text-gray-600">{quiz.owner?.name ?? '—'}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-3 text-sm">
          <Actions
            quiz={quiz}
            owned={owned}
            busy={busy}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onExport={onExport}
          />
        </div>
      </td>
    </tr>
  );
}

function CardRow({ quiz, owned, busy, onDuplicate, onDelete, onExport }: RowProps) {
  return (
    <div data-testid={`quiz-row-${quiz.id}`} className="bg-white rounded-lg border p-4">
      <div className="flex justify-between items-start gap-2">
        <Link
          href={owned ? `/quizzes/${quiz.id}` : `/quizzes/${quiz.id}/preview`}
          className="font-medium text-gray-900 hover:text-blue-600"
        >
          {quiz.title}
        </Link>
        <span
          className={`text-xs px-2 py-1 rounded shrink-0 ${
            quiz.status === 'published'
              ? 'bg-green-100 text-green-800'
              : quiz.status === 'draft'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-gray-100 text-gray-700'
          }`}
        >
          {STATUS_LABEL[quiz.status] ?? quiz.status}
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {quiz.questions_count} soal · Diperbarui {formatDate(quiz.updated_at)} ·{' '}
        {quiz.owner?.name ?? '—'}
      </p>
      {quiz.description && (
        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{quiz.description}</p>
      )}
      <div className="mt-3 border-t pt-3 flex items-center gap-3 text-sm">
        <Actions
          quiz={quiz}
          owned={owned}
          busy={busy}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onExport={onExport}
        />
      </div>
    </div>
  );
}

function Actions({ quiz, owned, busy, onDuplicate, onDelete, onExport }: RowProps) {
  const isBusy = busy?.id === quiz.id;

  return (
    <>
      <Link
        href={owned ? `/quizzes/${quiz.id}` : `/quizzes/${quiz.id}/preview`}
        className="text-gray-600 hover:text-gray-800"
        data-testid={`quiz-action-${quiz.id}-open`}
      >
        Buka
      </Link>
      {owned && (
        <>
          <Link
            href={`/quizzes/${quiz.id}/builder`}
            className="text-blue-600 hover:text-blue-800"
            data-testid={`quiz-action-${quiz.id}-edit`}
          >
            Edit
          </Link>
          <button
            data-testid={`quiz-action-${quiz.id}-delete`}
            onClick={onDelete}
            disabled={isBusy}
            className="text-red-600 hover:text-red-800 disabled:opacity-50"
          >
            Hapus
          </button>
        </>
      )}
      <Link
        href={`/quizzes/${quiz.id}/preview`}
        className="text-indigo-600 hover:text-indigo-800"
        data-testid={`quiz-action-${quiz.id}-preview`}
      >
        Pratinjau
      </Link>
      <button
        data-testid={`quiz-action-${quiz.id}-duplicate`}
        onClick={onDuplicate}
        disabled={isBusy}
        className="text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
      >
        {owned ? 'Duplikat' : 'Salin ke Saya'}
      </button>
      <button
        data-testid={`quiz-action-${quiz.id}-export`}
        onClick={onExport}
        disabled={isBusy}
        className="text-orange-600 hover:text-orange-800 disabled:opacity-50"
      >
        Ekspor
      </button>
    </>
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
      data-testid="quiz-pagination"
      className="flex flex-wrap items-center justify-between gap-3 mt-5 text-sm"
    >
      <p className="text-gray-500" data-testid="quiz-total">
        Menampilkan {from}–{to} dari {total} kuis
      </p>
      <div className="flex items-center gap-1">
        <button
          data-testid="quiz-pagination-prev"
          onClick={() => onChange(Math.max(page - 1, 1))}
          disabled={page <= 1}
          className="px-3 py-1.5 border rounded bg-white disabled:opacity-40 hover:enabled:bg-gray-50"
        >
          Sebelumnya
        </button>
        {pageNumbers(page, lastPage).map((number) => (
          <button
            key={number}
            data-testid={`quiz-pagination-page-${number}`}
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
          data-testid="quiz-pagination-next"
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
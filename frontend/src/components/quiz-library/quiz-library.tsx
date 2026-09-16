'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, quizzes } from '@/lib/api';
import type { Quiz, QuizFiltersMeta, QuizTab, QuizQuestionType } from '@/lib/api';
import { ExportValidationErrorList, formatExportErrors } from '@/lib/export';
import { exportQuizMoodle } from '@/lib/export/export-quiz';
import { Badge, buttonClassNames, ConfirmDialog, inputClassNames, Notice, Select, Spinner } from '@/components/ui';
import CreateQuizDialog from './create-quiz-dialog';

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

function statusTone(status: string): 'green' | 'amber' | 'gray' {
  return status === 'published' ? 'green' : status === 'draft' ? 'amber' : 'gray';
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </label>
      {children}
    </div>
  );
}

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
  const [createOpen, setCreateOpen] = useState(false);
  const router = useRouter();

  const [userName, setUserName] = useState('');
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
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const name = (JSON.parse(raw) as { name?: string }).name ?? '';
        const timer = setTimeout(() => setUserName(name), 0);
        return () => clearTimeout(timer);
      }
    } catch {
      return undefined;
    }
    return undefined;
  }, []);

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

  const avatarInitial = userName.trim().charAt(0).toUpperCase();
  const greeting = userName ? `Halo, ${userName}` : 'Halo';

  const activeFilterCount =
    [filters.status, filters.type, filters.category, filters.tag, filters.updatedWithin].filter(
      (value) => value !== '' && value !== undefined
    ).length + (filters.minQuestions > 0 ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0 || search.trim() !== '';

  const from = total === 0 ? 0 : (page - 1) * 20 + 1;
  const to = Math.min(page * 20, total);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold shadow-sm">
              Q
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-600">
                Quiz Builder
              </p>
              <h1 className="text-xl font-bold leading-tight">Perpustakaan Kuis</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {userName && (
              <span className="hidden md:inline-flex items-center gap-2 text-sm text-gray-600">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-sm font-semibold">
                  {avatarInitial}
                </span>
                {userName}
              </span>
            )}
            <Link
              href="/bank"
              data-testid="quiz-nav-bank"
              className={buttonClassNames('ghost', 'sm')}
            >
              Bank Soal
            </Link>
            <button
              onClick={() => setCreateOpen(true)}
              data-testid="quiz-create-button"
              className={buttonClassNames('primary', 'sm')}
            >
              + Kuis Baru
            </button>
            <button onClick={handleLogout} className={buttonClassNames('ghost', 'sm')}>
              Keluar
            </button>
          </div>
        </div>
      </header>

      <div className="bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600">
        <div className="max-w-7xl mx-auto px-4 py-6 text-white flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold">{greeting}</h2>
            <p className="text-sm text-blue-100 mt-1">
              Buat, kelola, dan ekspor kuis ke Moodle XML dalam hitungan menit.
            </p>
          </div>
          {total > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm">
              <span className="text-xl font-bold">{total}</span>
              <span>kuis</span>
            </span>
          )}
        </div>
      </div>

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
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
                  <path d="M3 4h18l-6.75 7.5V19l-4.5 2v-9.5L3 4z" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Cari &amp; Filter</h2>
                <p className="text-xs text-gray-500">
                  {hasActiveFilters
                    ? activeFilterCount > 0
                      ? `${activeFilterCount} filter aktif — tampilkan hasil sesuai kriteria`
                      : 'Hasil sesuai pencarian'
                    : 'Susun kuis berdasarkan status, kategori, tag, dan lainnya.'}
                </p>
              </div>
            </div>
            <button
              data-testid="quiz-filter-reset"
              onClick={resetFilters}
              disabled={!hasActiveFilters}
              className={buttonClassNames('ghost', 'sm')}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-3.5 w-3.5"
              >
                <path d="M3 12a9 9 0 109-9M3 3v6h6" />
              </svg>
              Reset
            </button>
          </div>

          <div className="relative">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            >
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M16.5 16.5L21 21" />
            </svg>
            <input
              data-testid="quiz-search"
              type="search"
              aria-label="Cari kuis"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari judul atau deskripsi kuis…"
              className={inputClassNames('md', 'pl-10 pr-10')}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                data-testid="quiz-search-clear"
                aria-label="Kosongkan pencarian"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <FilterGroup label="Status">
              <Select
                size="sm"
                data-testid="quiz-filter-status"
                aria-label="Filter status kuis"
                value={filters.status}
                onChange={(event) => changeFilter('status', event.target.value)}
              >
                <option value="">Semua status</option>
                <option value="draft">Draf</option>
                <option value="published">Terbit</option>
                <option value="archived">Arsip</option>
              </Select>
            </FilterGroup>
            <FilterGroup label="Jenis">
              <Select
                size="sm"
                data-testid="quiz-filter-type"
                aria-label="Filter jenis kuis"
                value={filters.type}
                onChange={(event) => changeFilter('type', event.target.value)}
              >
                <option value="">Semua jenis</option>
                {meta.types.map((type) => (
                  <option key={type} value={type}>
                    {QUESTION_TYPE_SHORT[type]}
                  </option>
                ))}
              </Select>
            </FilterGroup>
            <FilterGroup label="Kategori">
              <Select
                size="sm"
                data-testid="quiz-filter-category"
                aria-label="Filter kategori kuis"
                value={filters.category}
                onChange={(event) => changeFilter('category', event.target.value)}
              >
                <option value="">Semua kategori</option>
                {meta.categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </FilterGroup>
            <FilterGroup label="Tag">
              <Select
                size="sm"
                data-testid="quiz-filter-tag"
                aria-label="Filter tag kuis"
                value={filters.tag}
                onChange={(event) => changeFilter('tag', event.target.value)}
              >
                <option value="">Semua tag</option>
                {meta.tags.map((tag) => (
                  <option key={tag.id} value={tag.slug}>
                    {tag.name}
                  </option>
                ))}
              </Select>
            </FilterGroup>
            <FilterGroup label="Jumlah soal">
              <Select
                size="sm"
                data-testid="quiz-filter-min"
                aria-label="Filter jumlah soal minimum"
                value={filters.minQuestions}
                onChange={(event) => changeFilter('minQuestions', Number(event.target.value))}
              >
                <option value={0}>Semua jumlah</option>
                <option value={1}>≥ 1 soal</option>
                <option value={5}>≥ 5 soal</option>
                <option value={10}>≥ 10 soal</option>
                <option value={25}>≥ 25 soal</option>
              </Select>
            </FilterGroup>
            <FilterGroup label="Diperbarui">
              <Select
                size="sm"
                data-testid="quiz-filter-updated"
                aria-label="Filter waktu diperbarui kuis"
                value={filters.updatedWithin}
                onChange={(event) => changeFilter('updatedWithin', event.target.value)}
              >
                <option value="">Kapan saja</option>
                <option value="7">7 hari terakhir</option>
                <option value="30">30 hari terakhir</option>
              </Select>
            </FilterGroup>
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
          <div data-testid="quiz-loading" className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 bg-gray-200 rounded" />
                  <div className="h-3 w-2/3 bg-gray-200 rounded" />
                </div>
                <div className="hidden sm:block h-6 w-20 bg-gray-200 rounded-full" />
                <div className="h-6 w-16 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 px-6 text-center" data-testid="quiz-empty">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="mx-auto h-12 w-12 text-gray-300"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-gray-500 mt-4 mb-5">
              {tab === 'mine'
                ? 'Belum ada kuis. Buat kuis pertama Anda.'
                : 'Belum ada kuis yang dibagikan untuk Anda.'}
            </p>
            {tab === 'mine' ? (
              <button
                onClick={() => setCreateOpen(true)}
                data-testid="quiz-create-empty-button"
                className={buttonClassNames('primary')}
              >
                Buat kuis pertama
              </button>
            ) : (
              <p className="text-xs text-gray-400">Coba buka tab Kuis Saya untuk melihat kuis milik Anda.</p>
            )}
          </div>
        ) : (
          <>
            <div className="hidden lg:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3 font-semibold">Kuis</th>
                    <th className="px-4 py-3 font-semibold">Soal</th>
                    <th className="px-4 py-3 font-semibold">Diperbarui</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Visibilitas</th>
                    <th className="px-4 py-3 font-semibold">Pemilik</th>
                    <th className="px-4 py-3 font-semibold text-right">Aksi</th>
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

      {createOpen && <CreateQuizDialog onClose={() => setCreateOpen(false)} />}
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
    <tr data-testid={`quiz-row-${quiz.id}`} className="hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3">
        <Link href={`/quizzes/${quiz.id}/preview`} className="font-medium text-gray-900 hover:text-blue-600">
          {quiz.title}
        </Link>
        {quiz.description && (
          <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{quiz.description}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {quiz.subject && <Badge tone="blue">{quiz.subject}</Badge>}
          {quiz.category && <Badge tone="gray">{quiz.category}</Badge>}
          {quiz.grade_level && (
            <span className="text-[11px] text-gray-400">Kelas {quiz.grade_level}</span>
          )}
        </div>
        {quiz.tags.length > 0 && (
          <p className="text-xs text-gray-400 mt-1">
            {quiz.tags.map((tag) => `#${tag.name}`).join(' ')}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-gray-700">{quiz.questions_count}</span>
        {quiz.question_types.map((type) => (
          <span key={type} className="ml-1.5 inline-block align-middle">
            <Badge tone="indigo">{QUESTION_TYPE_SHORT[type as QuizQuestionType]}</Badge>
          </span>
        ))}
      </td>
      <td className="px-4 py-3 text-gray-600">{formatDate(quiz.updated_at)}</td>
      <td className="px-4 py-3">
        <Badge tone={statusTone(quiz.status)}>{STATUS_LABEL[quiz.status] ?? quiz.status}</Badge>
      </td>
      <td className="px-4 py-3 text-gray-600">{VISIBILITY_LABEL[quiz.visibility] ?? quiz.visibility}</td>
      <td className="px-4 py-3 whitespace-nowrap text-gray-600">{quiz.owner?.name ?? '—'}</td>
      <td className="px-4 py-3">
        <Actions
          quiz={quiz}
          owned={owned}
          busy={busy}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onExport={onExport}
        />
      </td>
    </tr>
  );
}

function CardRow({ quiz, owned, busy, onDuplicate, onDelete, onExport }: RowProps) {
  return (
    <div data-testid={`quiz-row-${quiz.id}`} className="bg-white rounded-xl border border-gray-200 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-[border-color,box-shadow] duration-200 hover:border-gray-300 hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)]">
      <div className="flex justify-between items-start gap-2">
        <Link
          href={`/quizzes/${quiz.id}/preview`}
          className="font-medium text-gray-900 hover:text-blue-600"
        >
          {quiz.title}
        </Link>
        <Badge tone={statusTone(quiz.status)} className="shrink-0">
          {STATUS_LABEL[quiz.status] ?? quiz.status}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {quiz.subject && <Badge tone="blue">{quiz.subject}</Badge>}
        {quiz.category && <Badge tone="gray">{quiz.category}</Badge>}
        {quiz.question_types.map((type) => (
          <Badge key={type} tone="indigo">
            {QUESTION_TYPE_SHORT[type as QuizQuestionType]}
          </Badge>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-1.5">
        {quiz.questions_count} soal · Diperbarui {formatDate(quiz.updated_at)} ·{' '}
        {quiz.owner?.name ?? '—'}
      </p>
      {quiz.description && (
        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{quiz.description}</p>
      )}
      <div className="mt-3 border-t pt-3">
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
  const busyAction = isBusy ? busy?.action : null;
  const openHref = owned ? `/quizzes/${quiz.id}` : `/quizzes/${quiz.id}/preview`;

  return (
    <div className="flex items-center justify-end gap-1">
      <RowActionLink
        href={openHref}
        label="Buka"
        icon="open"
        tone="gray"
        testid={`quiz-action-${quiz.id}-open`}
      />
      {owned && (
        <>
          <RowActionLink
            href={`/quizzes/${quiz.id}/builder`}
            label="Edit"
            icon="edit"
            tone="blue"
            testid={`quiz-action-${quiz.id}-edit`}
          />
          <RowActionButton
            label="Hapus"
            icon="delete"
            tone="red"
            testid={`quiz-action-${quiz.id}-delete`}
            disabled={isBusy}
            busy={busyAction === 'delete'}
            onClick={onDelete}
          />
        </>
      )}
      <RowActionLink
        href={`/quizzes/${quiz.id}/preview`}
        label="Pratinjau"
        icon="preview"
        tone="indigo"
        testid={`quiz-action-${quiz.id}-preview`}
      />
      <RowActionButton
        label={owned ? 'Duplikat' : 'Salin ke Saya'}
        icon="duplicate"
        tone="emerald"
        testid={`quiz-action-${quiz.id}-duplicate`}
        disabled={isBusy}
        busy={busyAction === 'duplicate'}
        onClick={onDuplicate}
      />
      <RowActionButton
        label="Ekspor"
        icon="export"
        tone="orange"
        testid={`quiz-action-${quiz.id}-export`}
        disabled={isBusy}
        busy={busyAction === 'export'}
        onClick={onExport}
      />
    </div>
  );
}

const ROW_ACTION_TONES: Record<string, string> = {
  gray: 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
  blue: 'text-blue-600 hover:bg-blue-50 hover:text-blue-700',
  indigo: 'text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700',
  emerald: 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700',
  orange: 'text-orange-600 hover:bg-orange-50 hover:text-orange-700',
  red: 'text-red-600 hover:bg-red-50 hover:text-red-700',
};

const ROW_ACTION_ICONS: Record<string, string> = {
  open: 'M7 17L17 7M17 7H8m9 0v9',
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.5-9.5a2.121 2.121 0 013 3L13 15l-4 1 1-4 8.5-8.5z',
  preview:
    'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  duplicate:
    'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
  delete:
    'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  export: 'M12 3v12m0 0l-4-4m4 4l4-4M5 21h14',
};

function rowActionClass(tone: string): string {
  return `inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
    ROW_ACTION_TONES[tone] ?? ROW_ACTION_TONES.gray
  }`;
}

function ActionIcon({ path }: { path: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d={path} />
    </svg>
  );
}

interface RowActionLinkProps {
  href: string;
  label: string;
  icon: string;
  tone: string;
  testid: string;
}

function RowActionLink({ href, label, icon, tone, testid }: RowActionLinkProps) {
  return (
    <Link
      href={href}
      data-testid={testid}
      title={label}
      aria-label={label}
      className={rowActionClass(tone)}
    >
      <ActionIcon path={ROW_ACTION_ICONS[icon]} />
      <span className="sr-only">{label}</span>
    </Link>
  );
}

interface RowActionButtonProps {
  label: string;
  icon: string;
  tone: string;
  testid: string;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}

function RowActionButton({
  label,
  icon,
  tone,
  testid,
  disabled,
  busy,
  onClick,
}: RowActionButtonProps) {
  const text = busy ? `Memproses ${label.toLowerCase()}…` : label;
  return (
    <button
      type="button"
      data-testid={testid}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={rowActionClass(tone)}
    >
      {busy ? <Spinner className="h-4 w-4" /> : <ActionIcon path={ROW_ACTION_ICONS[icon]} />}
      <span className="sr-only">{text}</span>
    </button>
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
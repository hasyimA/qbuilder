'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, quizzes } from '@/lib/api';
import type { Quiz, QuizFiltersMeta, QuizTab, QuizQuestionType } from '@/lib/api';
import { ExportValidationErrorList, formatExportErrors } from '@/lib/export';
import { exportQuizMoodle } from '@/lib/export/export-quiz';
import { Badge, buttonClassNames, ConfirmDialog, inputClassNames, Notice, Spinner } from '@/components/ui';

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

const TOOLBAR_SELECT =
  'rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

function statusTone(status: string): 'green' | 'amber' | 'gray' {
  return status === 'published' ? 'green' : status === 'draft' ? 'amber' : 'gray';
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

  const from = total === 0 ? 0 : (page - 1) * 20 + 1;
  const to = Math.min(page * 20, total);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
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
            <Link href="/quizzes/new" className={buttonClassNames('primary', 'sm')}>
              + Kuis Baru
            </Link>
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
          className="bg-white rounded-lg border p-4 mb-5 space-y-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-56">
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
                placeholder="Cari judul atau deskripsi..."
                className={inputClassNames('md', 'pl-9')}
              />
            </div>
            <select
              data-testid="quiz-filter-status"
              aria-label="Filter status kuis"
              value={filters.status}
              onChange={(event) => changeFilter('status', event.target.value)}
              className={TOOLBAR_SELECT}
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
              className={TOOLBAR_SELECT}
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
              className={TOOLBAR_SELECT}
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
              className={TOOLBAR_SELECT}
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
              className={TOOLBAR_SELECT}
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
              className={TOOLBAR_SELECT}
            >
              <option value="">Kapan saja diperbarui</option>
              <option value="7">7 hari terakhir</option>
              <option value="30">30 hari terakhir</option>
            </select>
            <button
              data-testid="quiz-filter-reset"
              onClick={resetFilters}
              className={buttonClassNames('ghost', 'sm', 'text-blue-600')}
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
          <div data-testid="quiz-loading" className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 bg-white rounded-lg border p-4 animate-pulse">
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
          <div className="bg-white rounded-lg border py-16 px-6 text-center" data-testid="quiz-empty">
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
              <Link href="/quizzes/new" className={buttonClassNames('primary')}>
                Buat kuis pertama
              </Link>
            ) : (
              <p className="text-xs text-gray-400">Coba buka tab Kuis Saya untuk melihat kuis milik Anda.</p>
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
  const busyAction = busy?.id === quiz.id ? busy?.action : null;

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
          {busyAction === 'delete' ? (
            <span className="inline-flex items-center gap-1 text-red-400">
              <Spinner className="h-4 w-4" />
              Menghapus…
            </span>
          ) : (
            <button
              data-testid={`quiz-action-${quiz.id}-delete`}
              onClick={onDelete}
              disabled={busy?.id === quiz.id}
              className="text-red-600 hover:text-red-800 disabled:opacity-50"
            >
              Hapus
            </button>
          )}
        </>
      )}
      <Link
        href={`/quizzes/${quiz.id}/preview`}
        className="text-indigo-600 hover:text-indigo-800"
        data-testid={`quiz-action-${quiz.id}-preview`}
      >
        Pratinjau
      </Link>
      {busyAction === 'duplicate' ? (
        <span className="inline-flex items-center gap-1 text-emerald-500">
          <Spinner className="h-4 w-4" />
          {owned ? 'Menggandakan…' : 'Menyalin…'}
        </span>
      ) : (
        <button
          data-testid={`quiz-action-${quiz.id}-duplicate`}
          onClick={onDuplicate}
          disabled={busy?.id === quiz.id}
          className="text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
        >
          {owned ? 'Duplikat' : 'Salin ke Saya'}
        </button>
      )}
      {busyAction === 'export' ? (
        <span className="inline-flex items-center gap-1 text-orange-500">
          <Spinner />
          Mengekspor…
        </span>
      ) : (
        <button
          data-testid={`quiz-action-${quiz.id}-export`}
          onClick={onExport}
          disabled={busy?.id === quiz.id}
          className="text-orange-600 hover:text-orange-800 disabled:opacity-50"
        >
          Ekspor
        </button>
      )}
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
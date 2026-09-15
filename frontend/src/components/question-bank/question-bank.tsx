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
import {
  Badge,
  buttonClassNames,
  ConfirmDialog,
  inputClassNames,
  Notice,
  Select,
  Spinner,
} from '@/components/ui';
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

  const activeFilterCount = [
    filters.type,
    filters.status,
    filters.category,
    filters.difficulty,
    filters.tag,
    filters.updatedWithin,
  ].filter((value) => value !== '' && value !== undefined).length;
  const hasActiveFilters = activeFilterCount > 0 || search.trim() !== '';

  const perPage = 20;
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

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
              <h1 className="text-xl font-bold leading-tight">Bank Soal</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/bank/new"
              data-testid="bank-create"
              className={buttonClassNames('primary', 'sm')}
            >
              + Buat Soal
            </Link>
            <button onClick={handleLogout} className={buttonClassNames('ghost', 'sm')}>
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <section
          data-testid="bank-toolbar"
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Cari &amp; Filter</h2>
                <p className="text-xs text-gray-500">
                  {hasActiveFilters
                    ? activeFilterCount > 0
                      ? `${activeFilterCount} filter aktif — tampilkan hasil sesuai kriteria`
                      : 'Hasil sesuai pencarian'
                    : 'Temukan soal berdasarkan jenis, kategori, tag, dan lainnya.'}
                </p>
              </div>
            </div>
            <button
              data-testid="bank-filter-reset"
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
                data-testid="bank-search"
                type="search"
                aria-label="Cari soal di bank soal"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari teks soal, kategori, atau jawaban..."
                className={inputClassNames('md', 'pl-10')}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  data-testid="bank-search-clear"
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
          <div data-testid="bank-loading" className="space-y-3">
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
          <div className="bg-white rounded-xl border border-gray-200 py-16 px-6 text-center" data-testid="bank-empty">
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
                d="M9 12h6m-6 4h3m4-8h.01M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zm4 12h.01"
              />
            </svg>
            <p className="text-gray-500 mt-4 mb-5">
              Belum ada soal di bank. Buat soal pertama Anda agar bisa dipakai ulang di kuis mana pun.
            </p>
            <Link href="/bank/new" className={buttonClassNames('primary')}>
              Buat soal pertama
            </Link>
          </div>
        ) : (
          <>
            <div className="hidden lg:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3 font-semibold">Soal</th>
                    <th className="px-4 py-3 font-semibold">Tipe</th>
                    <th className="px-4 py-3 font-semibold">Diperbarui</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Dipakai</th>
                    <th className="px-4 py-3 font-semibold text-right">Aksi</th>
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
    <tr data-testid={`bank-row-${question.id}`} className="hover:bg-slate-50 transition-colors">
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
        <Badge tone="indigo" className="mr-1.5">
          {TYPE_SHORT[question.type]}
        </Badge>
        {question.difficulty && (
          <Badge tone="gray">{DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty}</Badge>
        )}
      </td>
      <td className="px-4 py-3 text-gray-600">{formatDate(question.updated_at)}</td>
      <td className="px-4 py-3">
        <Badge tone={statusTone(question.status)}>
          {STATUS_LABEL[question.status] ?? question.status}
        </Badge>
      </td>
      <td className="px-4 py-3 text-gray-600">
        <span data-testid={`bank-used-${question.id}`}>
          {(question.used_in_count ?? 0) > 0 ? `${question.used_in_count} kuis` : '—'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
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

const CARD_CLASS = [
  'bg-white rounded-xl border border-gray-200 p-4',
  'shadow-[0_1px_2px_rgba(16,24,40,0.05)]',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-gray-300 hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)]',
].join(' ');

function statusTone(status: string): 'green' | 'amber' {
  return status === 'complete' ? 'green' : 'amber';
}

function CardRow({ question, busy, onPreview, onInsert, onDuplicate, onDelete }: RowProps) {
  return (
    <div data-testid={`bank-row-${question.id}`} className={CARD_CLASS}>
      <div className="flex justify-between items-start gap-2">
        <Badge tone="indigo">{TYPE_LABEL[question.type]}</Badge>
        <Badge tone={statusTone(question.status)} className="shrink-0">
          {STATUS_LABEL[question.status] ?? question.status}
        </Badge>
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
      <div className="mt-3 border-t pt-3 flex items-center gap-1">
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
  const busyAction = isBusy ? busy?.action : null;
  const usedIn = question.used_in_count ?? 0;

  return (
    <>
      <RowActionButton
        label="Pratinjau"
        icon="preview"
        tone="indigo"
        testid={`bank-action-${question.id}-preview`}
        disabled={isBusy}
        busy={busyAction === 'preview'}
        onClick={onPreview}
      />
      <RowActionLink
        href={`/bank/${question.id}`}
        label="Edit"
        icon="edit"
        tone="blue"
        testid={`bank-action-${question.id}-edit`}
      />
      <RowActionButton
        label="Masukkan ke Kuis"
        icon="insert"
        tone="emerald"
        testid={`bank-action-${question.id}-insert`}
        disabled={isBusy}
        busy={busyAction === 'insert'}
        onClick={onInsert}
      />
      <RowActionButton
        label="Duplikat"
        icon="duplicate"
        tone="teal"
        testid={`bank-action-${question.id}-duplicate`}
        disabled={isBusy}
        busy={busyAction === 'duplicate'}
        onClick={onDuplicate}
      />
      <RowActionButton
        label={
          usedIn > 0
            ? `Dipakai di ${usedIn} kuis — hapus dari kuis tersebut dulu`
            : 'Hapus soal dari bank'
        }
        icon="delete"
        tone="red"
        testid={`bank-action-${question.id}-delete`}
        disabled={isBusy || usedIn > 0}
        busy={busyAction === 'delete'}
        onClick={onDelete}
      />
    </>
  );
}

const BANK_ACTION_TONES: Record<string, string> = {
  blue: 'text-blue-600 hover:bg-blue-50 hover:text-blue-700',
  indigo: 'text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700',
  emerald: 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700',
  teal: 'text-teal-600 hover:bg-teal-50 hover:text-teal-700',
  red: 'text-red-600 hover:bg-red-50 hover:text-red-700',
};

const BANK_ACTION_ICONS: Record<string, string> = {
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.5-9.5a2.121 2.121 0 013 3L13 15l-4 1 1-4 8.5-8.5z',
  preview:
    'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  insert:
    'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12l4.5 4.5L16.5 12M12 16.5V3',
  duplicate:
    'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
  delete:
    'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
};

function bankActionClass(tone: string): string {
  return `inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
    BANK_ACTION_TONES[tone] ?? BANK_ACTION_TONES.indigo
  }`;
}

function BankActionIcon({ path }: { path: string }) {
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
      className={bankActionClass(tone)}
    >
      <BankActionIcon path={BANK_ACTION_ICONS[icon]} />
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
      className={bankActionClass(tone)}
    >
      {busy ? <Spinner className="h-4 w-4" /> : <BankActionIcon path={BANK_ACTION_ICONS[icon]} />}
      <span className="sr-only">{text}</span>
    </button>
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
  const options: PreviewOption[] = (question.options ?? []).map((option, index) => ({
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
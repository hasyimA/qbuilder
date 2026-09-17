'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Filter, Pencil, Copy, Download, ExternalLink, Eye, RotateCcw, Search, Trash2, X, Library } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { quizzes } from '@/lib/api';
import type { Quiz, QuizFiltersMeta, QuizTab, QuizQuestionType } from '@/lib/api';
import { ExportValidationErrorList, formatExportErrors } from '@/lib/export';
import { exportQuizMoodle } from '@/lib/export/export-quiz';
import { Badge, buttonClassNames, ConfirmDialog, FilterChips, inputClassNames, interactiveCardClass, Notice, Select, Spinner, surfaceClass } from '@/components/ui';
import type { FilterChipItem } from '@/components/ui';
import CreateQuizDialog from './create-quiz-dialog';

const QUESTION_TYPE_SHORT: Record<QuizQuestionType, string> = {
  multiple_choice: 'PG',
  true_false: 'B/S',
  short_answer: 'Isian',
  essay: 'Esai',
  matching: 'Jodoh',
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

  function clearSearch() {
    setSearch('');
    setAppliedSearch('');
    setPage(1);
    setLoading(true);
    setError(null);
    setNotice(null);
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

  const activeFilterCount =
    [filters.status, filters.type, filters.category, filters.tag, filters.updatedWithin].filter(
      (value) => value !== '' && value !== undefined
    ).length + (filters.minQuestions > 0 ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0 || search.trim() !== '';

  const filterChips: FilterChipItem[] = [];
  if (appliedSearch.trim()) {
    filterChips.push({
      key: 'search',
      label: 'Cari',
      value: `“${appliedSearch.trim()}”`,
      onRemove: clearSearch,
    });
  }
  if (filters.status) {
    filterChips.push({
      key: 'status',
      label: 'Status',
      value: STATUS_LABEL[filters.status] ?? filters.status,
      onRemove: () => changeFilter('status', ''),
    });
  }
  if (filters.type) {
    filterChips.push({
      key: 'type',
      label: 'Jenis',
      value: QUESTION_TYPE_SHORT[filters.type as QuizQuestionType] ?? filters.type,
      onRemove: () => changeFilter('type', ''),
    });
  }
  if (filters.category) {
    filterChips.push({
      key: 'category',
      label: 'Kategori',
      value: filters.category,
      onRemove: () => changeFilter('category', ''),
    });
  }
  if (filters.tag) {
    const tag = meta.tags.find((t) => t.slug === filters.tag);
    filterChips.push({
      key: 'tag',
      label: 'Tag',
      value: tag?.name ?? filters.tag,
      onRemove: () => changeFilter('tag', ''),
    });
  }
  if (filters.minQuestions > 0) {
    filterChips.push({
      key: 'min',
      label: 'Jumlah soal',
      value: `≥ ${filters.minQuestions}`,
      onRemove: () => changeFilter('minQuestions', 0),
    });
  }
  if (filters.updatedWithin) {
    filterChips.push({
      key: 'updated',
      label: 'Diperbarui',
      value: `${filters.updatedWithin} hari terakhir`,
      onRemove: () => changeFilter('updatedWithin', ''),
    });
  }

  const from = total === 0 ? 0 : (page - 1) * 20 + 1;
  const to = Math.min(page * 20, total);

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Perpustakaan Kuis</h1>
          <p className="mt-1 text-sm text-gray-500">
            Buat, kelola, dan ekspor kuis ke Moodle XML dalam hitungan menit.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          data-testid="quiz-create-button"
          className={buttonClassNames('primary', 'sm')}
        >
          + Kuis Baru
        </button>
      </div>

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
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors duration-200 ${
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
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors duration-200 ${
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
          className={surfaceClass('p-5 mb-5 space-y-5')}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Filter className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Cari &amp; Filter</h2>
                <p className="text-xs text-gray-500">
                  {activeFilterCount > 0
                    ? `${activeFilterCount} filter aktif — klik × untuk menghapus filter`
                    : hasActiveFilters
                      ? 'Hasil pencarian tampil di bawah'
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
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset
            </button>
          </div>

          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            />
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
                <X className="h-4 w-4" aria-hidden="true" />
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

          <FilterChips items={filterChips} testidBase="quiz" />
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
              <div key={i} className={surfaceClass('flex items-center gap-4 p-4 animate-pulse')}>
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
          <div className={surfaceClass('animate-fade-in-up py-16 px-6 text-center')} data-testid="quiz-empty">
            <Library className="mx-auto h-12 w-12 text-gray-300" aria-hidden="true" />
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
            <div className={`hidden lg:block ${surfaceClass('overflow-hidden')}`}>
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
                  {data.map((quiz, index) => (
                    <TableRow
                      key={quiz.id}
                      index={index}
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
              {data.map((quiz, index) => (
                <CardRow
                  key={quiz.id}
                  index={index}
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
  index?: number;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
}

function staggerDelay(index = 0): React.CSSProperties {
  return { animationDelay: `${Math.min(index, 12) * 40}ms` };
}

function TableRow({ quiz, owned, busy, index = 0, onDuplicate, onDelete, onExport }: RowProps) {
  return (
    <tr
      data-testid={`quiz-row-${quiz.id}`}
      className="animate-fade-in hover:bg-slate-50 transition-colors"
      style={staggerDelay(index)}
    >
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

function CardRow({ quiz, owned, busy, index = 0, onDuplicate, onDelete, onExport }: RowProps) {
  return (
    <div
      data-testid={`quiz-row-${quiz.id}`}
      className={interactiveCardClass('p-4 animate-fade-in-up')}
      style={staggerDelay(index)}
    >
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
        icon={ROW_ACTION_ICONS.open}
        tone="gray"
        testid={`quiz-action-${quiz.id}-open`}
      />
      {owned && (
        <>
          <RowActionLink
            href={`/quizzes/${quiz.id}/builder`}
            label="Edit"
            icon={ROW_ACTION_ICONS.edit}
            tone="blue"
            testid={`quiz-action-${quiz.id}-edit`}
          />
          <RowActionButton
            label="Hapus"
            icon={ROW_ACTION_ICONS.delete}
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
        icon={ROW_ACTION_ICONS.preview}
        tone="indigo"
        testid={`quiz-action-${quiz.id}-preview`}
      />
      <RowActionButton
        label={owned ? 'Duplikat' : 'Salin ke Saya'}
        icon={ROW_ACTION_ICONS.duplicate}
        tone="emerald"
        testid={`quiz-action-${quiz.id}-duplicate`}
        disabled={isBusy}
        busy={busyAction === 'duplicate'}
        onClick={onDuplicate}
      />
      <RowActionButton
        label="Ekspor"
        icon={ROW_ACTION_ICONS.export}
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

const ROW_ACTION_ICONS: Record<string, LucideIcon> = {
  open: ExternalLink,
  edit: Pencil,
  preview: Eye,
  duplicate: Copy,
  delete: Trash2,
  export: Download,
};

function rowActionClass(tone: string): string {
  return `inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
    ROW_ACTION_TONES[tone] ?? ROW_ACTION_TONES.gray
  }`;
}

function ActionIcon({ icon }: { icon: LucideIcon }) {
  const Icon = icon;
  return <Icon aria-hidden="true" className="h-4 w-4" />;
}

interface RowActionLinkProps {
  href: string;
  label: string;
  icon: LucideIcon;
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
      <ActionIcon icon={icon} />
      <span className="sr-only">{label}</span>
    </Link>
  );
}

interface RowActionButtonProps {
  label: string;
  icon: LucideIcon;
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
      {busy ? <Spinner className="h-4 w-4" /> : <ActionIcon icon={icon} />}
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
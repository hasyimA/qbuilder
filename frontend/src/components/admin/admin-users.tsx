'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Filter, RotateCcw, Search, Users, X } from 'lucide-react';
import { AppShell } from '@/components/layout';
import { adminUsers } from '@/lib/api';
import type { AdminUser, UserRole, UserStatus } from '@/lib/api';
import {
  Badge,
  buttonClassNames,
  FilterChips,
  inputClassNames,
  interactiveCardClass,
  Notice,
  Select,
  surfaceClass,
} from '@/components/ui';
import type { FilterChipItem } from '@/components/ui';
import { AdminAccessLoading, AdminForbiddenState, readStoredUser } from './admin-access';

const ROLE_LABEL: Record<UserRole, string> = { user: 'Pengguna', admin: 'Admin' };
const STATUS_LABEL: Record<UserStatus, string> = { active: 'Aktif', suspended: 'Ditangguhkan' };

type Access = 'checking' | 'ok' | 'forbidden';

export default function AdminUsers() {
  const router = useRouter();
  const [access, setAccess] = useState<Access>('checking');

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.replace('/login');
      return;
    }

    const stored = readStoredUser();
    queueMicrotask(() => {
      setAccess(stored && stored.role === 'admin' ? 'ok' : 'forbidden');
    });
  }, [router]);

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === appliedSearch) return;

    const timer = setTimeout(() => {
      setAppliedSearch(trimmed);
      setPage(1);
      setError(null);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, appliedSearch]);

  useEffect(() => {
    if (access !== 'ok') return;

    let active = true;
    queueMicrotask(() => {
      if (active) setLoading(true);
    });

    adminUsers
      .list({ page, search: appliedSearch, role, status })
      .then((response) => {
        if (!active) return;
        setData(response.data);
        setTotal(response.meta.total);
        setLastPage(Math.max(response.meta.last_page, 1));
      })
      .catch((err: unknown) => {
        if (!active) return;
        const apiErr = err as { status?: number };
        if (apiErr.status === 401) {
          localStorage.removeItem('token');
          router.replace('/login');
        } else if (apiErr.status === 403) {
          setAccess('forbidden');
        } else {
          setError('Gagal memuat daftar pengguna.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [access, page, appliedSearch, role, status, router]);

  const hasFilters = appliedSearch.trim() !== '' || role !== '' || status !== '';

  function resetFilters() {
    setSearch('');
    setAppliedSearch('');
    setRole('');
    setStatus('');
    setPage(1);
    setError(null);
  }

  function changeRole(value: UserRole | '') {
    setRole(value);
    setPage(1);
    setError(null);
  }

  function changeStatus(value: UserStatus | '') {
    setStatus(value);
    setPage(1);
    setError(null);
  }

  const filterChips: FilterChipItem[] = [];
  if (appliedSearch.trim()) {
    filterChips.push({
      key: 'search',
      label: 'Cari',
      value: `“${appliedSearch.trim()}”`,
      onRemove: () => {
        setSearch('');
        setAppliedSearch('');
        setPage(1);
      },
    });
  }
  if (role) {
    filterChips.push({
      key: 'role',
      label: 'Peran',
      value: ROLE_LABEL[role],
      onRemove: () => changeRole(''),
    });
  }
  if (status) {
    filterChips.push({
      key: 'status',
      label: 'Status',
      value: STATUS_LABEL[status],
      onRemove: () => changeStatus(''),
    });
  }

  const from = total === 0 ? 0 : (page - 1) * 20 + 1;
  const to = Math.min(page * 20, total);

  if (access === 'checking') return <AdminAccessLoading />;
  if (access === 'forbidden') return <AdminForbiddenState />;

  return (
    <AppShell>
      <div className="animate-fade-in">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Manajemen Akun</h1>
            <p className="mt-1 text-sm text-gray-500">
              Kelola peran, status, dan kredensial pengguna Quiz Builder.
            </p>
          </div>
        </div>

        <section data-testid="admin-users-toolbar" className={surfaceClass('p-5 mb-5 space-y-4')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Filter className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Cari &amp; Filter</h2>
                <p className="text-xs text-gray-500">
                  Telusuri berdasarkan nama atau email, lalu saring peran dan status.
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="admin-users-reset"
              onClick={resetFilters}
              disabled={!hasFilters}
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
              data-testid="admin-users-search"
              type="search"
              aria-label="Cari pengguna"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama atau email…"
              className={inputClassNames('md', 'pl-10 pr-10')}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Kosongkan pencarian"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Peran
              </label>
              <Select
                size="sm"
                data-testid="admin-users-filter-role"
                aria-label="Filter peran pengguna"
                value={role}
                onChange={(event) => changeRole(event.target.value as UserRole | '')}
              >
                <option value="">Semua peran</option>
                <option value="user">Pengguna</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Status
              </label>
              <Select
                size="sm"
                data-testid="admin-users-filter-status"
                aria-label="Filter status pengguna"
                value={status}
                onChange={(event) => changeStatus(event.target.value as UserStatus | '')}
              >
                <option value="">Semua status</option>
                <option value="active">Aktif</option>
                <option value="suspended">Ditangguhkan</option>
              </Select>
            </div>
          </div>

          <FilterChips items={filterChips} testidBase="admin-users" />
        </section>

        {error && (
          <div data-testid="admin-users-error" className="mb-5">
            <Notice tone="error" onDismiss={() => setError(null)}>
              {error}
            </Notice>
          </div>
        )}

        {loading ? (
          <div data-testid="admin-users-loading" className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={surfaceClass('flex items-center gap-4 p-4 animate-pulse')}>
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-gray-200" />
                  <div className="h-3 w-2/3 rounded bg-gray-200" />
                </div>
                <div className="hidden h-6 w-20 rounded-full bg-gray-200 sm:block" />
                <div className="h-6 w-16 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className={surfaceClass('animate-fade-in-up px-6 py-16 text-center')} data-testid="admin-users-empty">
            <Users className="mx-auto h-12 w-12 text-gray-300" aria-hidden="true" />
            <p className="mt-4 text-gray-500">Tidak ada pengguna yang cocok dengan filter ini.</p>
          </div>
        ) : (
          <>
            <div className={`hidden lg:block ${surfaceClass('overflow-hidden')}`}>
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3 font-semibold">Pengguna</th>
                    <th className="px-4 py-3 font-semibold">Aktivitas</th>
                    <th className="px-4 py-3 font-semibold">Peran</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Terdaftar</th>
                    <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.map((user, index) => (
                    <tr
                      key={user.id}
                      data-testid={`admin-user-row-${user.id}`}
                      className="animate-fade-in transition-colors hover:bg-slate-50"
                      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="font-medium text-gray-900 hover:text-blue-600"
                        >
                          {user.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-gray-500">{user.email}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {user.quizzes_count} kuis · {user.questions_count} soal · {user.media_count} media
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={user.role === 'admin' ? 'indigo' : 'gray'}>{ROLE_LABEL[user.role]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={user.status === 'active' ? 'green' : 'red'}>
                          {STATUS_LABEL[user.status]}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(user.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/users/${user.id}`}
                          data-testid={`admin-user-action-${user.id}`}
                          className={buttonClassNames('secondary', 'sm')}
                        >
                          Kelola
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 lg:hidden">
              {data.map((user, index) => (
                <div
                  key={user.id}
                  data-testid={`admin-user-row-${user.id}`}
                  className={interactiveCardClass('animate-fade-in-up p-4')}
                  style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {user.name}
                      </Link>
                      <p className="truncate text-xs text-gray-500">{user.email}</p>
                    </div>
                    <Badge tone={user.status === 'active' ? 'green' : 'red'} className="shrink-0">
                      {STATUS_LABEL[user.status]}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge tone={user.role === 'admin' ? 'indigo' : 'gray'}>{ROLE_LABEL[user.role]}</Badge>
                    <span className="text-xs text-gray-500">
                      {user.quizzes_count} kuis · {user.questions_count} soal · {user.media_count} media
                    </span>
                  </div>
                  <div className="mt-3 border-t pt-3">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className={buttonClassNames('secondary', 'sm', 'w-full')}
                    >
                      Kelola
                    </Link>
                  </div>
                </div>
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
              }}
            />
          </>
        )}
      </div>
    </AppShell>
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
      data-testid="admin-users-pagination"
      className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p className="text-gray-500">
        Menampilkan {from}–{to} dari {total} pengguna
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid="admin-users-pagination-prev"
          onClick={() => onChange(Math.max(page - 1, 1))}
          disabled={page <= 1}
          className="rounded border bg-white px-3 py-1.5 disabled:opacity-40 hover:enabled:bg-gray-50"
        >
          Sebelumnya
        </button>
        <span className="px-2 text-gray-600">
          {page} / {lastPage}
        </span>
        <button
          type="button"
          data-testid="admin-users-pagination-next"
          onClick={() => onChange(Math.min(page + 1, lastPage))}
          disabled={page >= lastPage}
          className="rounded border bg-white px-3 py-1.5 disabled:opacity-40 hover:enabled:bg-gray-50"
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

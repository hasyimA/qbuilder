'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { AppShell } from '@/components/layout';
import { buttonClassNames, Spinner } from '@/components/ui';
import type { UserRole } from '@/lib/api';

export interface StoredUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

/**
 * Reads the cached user from localStorage. Only used for optimistic UI gating —
 * the API remains the source of truth and a 403 still falls back to the
 * forbidden state.
 */
export function readStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredUser>;
    if (typeof parsed.id !== 'number') return null;

    return {
      id: parsed.id,
      name: parsed.name ?? '',
      email: parsed.email ?? '',
      role: parsed.role === 'admin' ? 'admin' : 'user',
    };
  } catch {
    return null;
  }
}

export function AdminAccessLoading() {
  return (
    <AppShell>
      <div className="flex items-center justify-center py-24">
        <Spinner label="Memuat…" />
      </div>
    </AppShell>
  );
}

export function AdminForbiddenState() {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <ShieldAlert className="h-6 w-6 text-red-600" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-gray-900">Akses ditolak</h1>
        <p className="mt-1 max-w-md text-sm text-gray-500">
          Halaman ini hanya untuk administrator. Anda tidak memiliki izin untuk membukanya.
        </p>
        <Link href="/" className={buttonClassNames('secondary', 'md', 'mt-6')}>
          Kembali ke Perpustakaan
        </Link>
      </div>
    </AppShell>
  );
}

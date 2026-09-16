'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { auth } from '@/lib/api';

function navLinkClass(active: boolean): string {
  return [
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150',
    active
      ? 'bg-blue-50 text-blue-700'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
  ].join(' ');
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const name = (JSON.parse(raw) as { name?: string }).name ?? '';
        const t = setTimeout(() => setUserName(name), 0);
        return () => clearTimeout(t);
      }
    } catch {
      return undefined;
    }
    return undefined;
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await auth.logout();
    } finally {
      localStorage.removeItem('token');
      router.push('/login');
    }
  }

  const onLibrary = pathname === '/' || pathname.startsWith('/quizzes');
  const onBank = pathname === '/bank' || pathname.startsWith('/bank/');

  const firstName = userName.trim().split(/\s+/)[0] ?? '';
  const initial = userName.trim().charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Beranda">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-bold text-white shadow-sm">
                Q
              </span>
              <span className="hidden truncate text-[15px] font-semibold text-gray-900 sm:block">
                Quiz Builder
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {userName && (
              <span className="hidden items-center gap-2 pr-1 text-sm text-gray-600 md:inline-flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                  {initial}
                </span>
                <span className="max-w-40 truncate">{firstName}</span>
              </span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-gray-600 transition-[color,background-color] duration-150 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Keluar dari aplikasi"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>

        <nav aria-label="Navigasi utama" className="flex items-center gap-1 overflow-x-auto pb-2">
          <Link href="/" aria-current={onLibrary ? 'page' : undefined} className={navLinkClass(onLibrary)}>
            Perpustakaan Kuis
          </Link>
          <Link href="/bank" aria-current={onBank ? 'page' : undefined} className={navLinkClass(onBank)}>
            Bank Soal
          </Link>
        </nav>
      </div>
    </header>
  );
}
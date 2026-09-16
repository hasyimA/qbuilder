'use client';

import type { ReactNode } from 'react';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-md">
            Q
          </span>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1.5 text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-gray-400">Quiz Builder — buat dan kelola bank soal & kuis Anda.</p>
      </div>
    </div>
  );
}
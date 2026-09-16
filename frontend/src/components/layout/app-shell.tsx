'use client';

import type { ReactNode } from 'react';
import { TopNav } from './top-nav';

export type AppShellSize = 'default' | 'narrow';

const WIDTHS: Record<AppShellSize, string> = {
  default: 'max-w-7xl',
  narrow: 'max-w-3xl',
};

export function AppShell({ children, size = 'default' }: { children: ReactNode; size?: AppShellSize }) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <TopNav />
      <main className={`mx-auto w-full flex-1 px-4 py-6 sm:px-6 ${WIDTHS[size]}`}>{children}</main>
    </div>
  );
}
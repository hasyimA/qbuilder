'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QuizLibrary from '@/components/quiz-library/quiz-library';
import { AppShell } from '@/components/layout';
import { Spinner } from '@/components/ui';
import { usePageTitle } from '@/hooks/use-page-title';

export default function DashboardPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  usePageTitle('Perpustakaan Kuis — Quiz Builder');

  useEffect(() => {
    (async () => {
      if (!localStorage.getItem('token')) {
        router.replace('/login');
        return;
      }
      await Promise.resolve();
      setChecked(true);
    })();
  }, [router]);

  if (!checked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner label="Memuat…" />
      </div>
    );
  }

  return (
    <AppShell>
      <QuizLibrary />
    </AppShell>
  );
}
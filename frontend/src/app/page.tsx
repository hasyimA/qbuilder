'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QuizLibrary from '@/components/quiz-library/quiz-library';

export default function DashboardPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

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

  if (!checked) return null;

  return <QuizLibrary />;
}
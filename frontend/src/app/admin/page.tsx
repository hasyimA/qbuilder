'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout';
import { Spinner } from '@/components/ui';
import { usePageTitle } from '@/hooks/use-page-title';

export default function AdminIndexPage() {
  const router = useRouter();

  usePageTitle('Admin — Quiz Builder');

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.replace('/login');
      return;
    }

    router.replace('/admin/users');
  }, [router]);

  return (
    <AppShell>
      <div className="flex justify-center py-24">
        <Spinner label="Mengalihkan…" />
      </div>
    </AppShell>
  );
}

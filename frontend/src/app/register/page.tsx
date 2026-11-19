'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/layout';
import { Notice } from '@/components/ui';
import { usePageTitle } from '@/hooks/use-page-title';

export default function RegisterPage() {
  usePageTitle('Masuk dengan e-Learning — Quiz Builder');
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <AuthShell
      title="Pendaftaran Mandiri Dinonaktifkan"
      subtitle="Akses Quiz Builder hanya menggunakan akun guru e-Learning Moodle."
    >
      <Notice tone="info">
        Anda akan dialihkan ke halaman masuk. Jika belum dialihkan,{' '}
        <Link href="/login" className="font-semibold underline">
          klik di sini untuk masuk dengan e-Learning
        </Link>
        .
      </Notice>
    </AuthShell>
  );
}

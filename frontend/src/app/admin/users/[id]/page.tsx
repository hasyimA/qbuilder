'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout';
import AdminUserDetailView from '@/components/admin/admin-user-detail';
import { usePageTitle } from '@/hooks/use-page-title';

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = Number(params.id);

  usePageTitle('Detail Pengguna — Quiz Builder');

  if (!Number.isFinite(userId) || userId <= 0) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <p className="text-gray-600">Pengguna tidak ditemukan.</p>
          <Link href="/admin/users" className="text-blue-600 hover:text-blue-800">
            Kembali ke Manajemen Akun
          </Link>
        </div>
      </AppShell>
    );
  }

  return <AdminUserDetailView userId={userId} />;
}

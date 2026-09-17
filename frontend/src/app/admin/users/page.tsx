'use client';

import AdminUsers from '@/components/admin/admin-users';
import { usePageTitle } from '@/hooks/use-page-title';

export default function AdminUsersPage() {
  usePageTitle('Manajemen Akun — Quiz Builder');

  return <AdminUsers />;
}

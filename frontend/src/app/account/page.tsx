'use client';

import AccountSettings from '@/components/account/account-settings';
import { usePageTitle } from '@/hooks/use-page-title';

export default function AccountPage() {
  usePageTitle('Pengaturan Akun — Quiz Builder');

  return <AccountSettings />;
}

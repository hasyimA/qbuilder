'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldAlert, UserCog } from 'lucide-react';
import { AppShell } from '@/components/layout';
import { account } from '@/lib/api';
import type { User, UserRole, UserStatus } from '@/lib/api';
import { Badge, Button, Input, Notice, Spinner, surfaceClass } from '@/components/ui';
import type { NoticeTone } from '@/components/ui';

const ROLE_LABEL: Record<UserRole, string> = { user: 'Pengguna', admin: 'Admin' };
const STATUS_LABEL: Record<UserStatus, string> = { active: 'Aktif', suspended: 'Ditangguhkan' };

type Access = 'checking' | 'ok' | 'denied';

interface NoticeState {
  tone: NoticeTone;
  text: string;
}

export default function AccountSettings() {
  const router = useRouter();

  const [access, setAccess] = useState<Access>('checking');
  const [user, setUser] = useState<User | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<NoticeState | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<NoticeState | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.replace('/login');
      return;
    }

    let active = true;

    account
      .get()
      .then((response) => {
        if (!active) return;
        setUser(response.data);
        setName(response.data.name);
        setAccess('ok');
      })
      .catch((err: unknown) => {
        if (!active) return;
        const apiErr = err as { status?: number };
        if (apiErr.status === 401) {
          localStorage.removeItem('token');
          router.replace('/login');
        } else if (apiErr.status === 403) {
          setAccess('denied');
        } else {
          setLoadError(extractError(err, 'Gagal memuat informasi akun.'));
          setAccess('denied');
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  function handleUnauthorized(): boolean {
    localStorage.removeItem('token');
    router.replace('/login');
    return true;
  }

  async function saveProfile() {
    if (!user || savingProfile) return;

    if (name.trim() === '') {
      setProfileError('Nama wajib diisi.');
      return;
    }

    setSavingProfile(true);
    setProfileError(null);
    setProfileNotice(null);

    try {
      const response = await account.updateProfile(name.trim());
      setUser(response.data);
      setName(response.data.name);

      try {
        const raw = localStorage.getItem('user');
        const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        localStorage.setItem('user', JSON.stringify({ ...stored, name: response.data.name }));
      } catch {
        // Cached profile is only a display hint; the API stays the source of truth.
      }
      window.dispatchEvent(new Event('user-updated'));

      setProfileNotice({ tone: 'success', text: 'Nama berhasil diperbarui.' });
    } catch (err) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 401) {
        handleUnauthorized();
        return;
      }
      setProfileError(extractError(err, 'Gagal memperbarui nama.'));
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    if (savingPassword) return;

    if (currentPassword === '') {
      setPasswordError('Kata sandi saat ini wajib diisi.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Kata sandi baru minimal 8 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    setSavingPassword(true);
    setPasswordError(null);
    setPasswordNotice(null);

    try {
      await account.updatePassword({
        current_password: currentPassword,
        password: newPassword,
        password_confirmation: confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice({
        tone: 'success',
        text: 'Kata sandi berhasil diubah. Sesi di perangkat lain telah dikeluarkan.',
      });
    } catch (err) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 401) {
        handleUnauthorized();
        return;
      }
      setPasswordError(extractError(err, 'Gagal mengubah kata sandi.'));
    } finally {
      setSavingPassword(false);
    }
  }

  if (access === 'checking') {
    return (
      <AppShell size="narrow">
        <div className="flex items-center justify-center py-24">
          <Spinner label="Memuat pengaturan akun…" />
        </div>
      </AppShell>
    );
  }

  if (access === 'denied' || !user) {
    return (
      <AppShell size="narrow">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <ShieldAlert className="h-6 w-6 text-red-600" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-gray-900">Tidak dapat mengakses akun</h1>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            {loadError ?? 'Akun Anda ditangguhkan atau tidak memiliki akses. Hubungi administrator.'}
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Kembali ke halaman masuk
          </Link>
        </div>
      </AppShell>
    );
  }

  const profileChanged = name.trim() !== user.name;

  return (
    <AppShell size="narrow">
      <div className="animate-fade-in">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Pengaturan Akun</h1>
          <p className="mt-1 text-sm text-gray-500">Kelola nama dan kata sandi akun Anda.</p>
        </header>

        <section className={surfaceClass('p-5')} data-testid="account-info">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <UserCog className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Informasi Akun</h2>
              <p className="text-xs text-gray-500">Ringkasan akun yang sedang Anda gunakan.</p>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoRow label="Nama" value={user.name} testid="account-info-name" />
            <InfoRow label="Email" value={user.email} testid="account-info-email" />
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Peran</dt>
              <dd className="mt-1">
                <Badge tone={user.role === 'admin' ? 'indigo' : 'gray'}>{ROLE_LABEL[user.role]}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</dt>
              <dd className="mt-1">
                <Badge tone={user.status === 'active' ? 'green' : 'red'}>{STATUS_LABEL[user.status]}</Badge>
              </dd>
            </div>
            <InfoRow label="Terdaftar" value={formatDate(user.created_at)} testid="account-info-created" />
          </dl>

          <p className="mt-4 text-xs text-gray-500" data-testid="account-email-note">
            Email hanya dapat diubah oleh administrator.
          </p>
        </section>

        <section className={surfaceClass('mt-5 p-5')} data-testid="account-profile">
          <h2 className="text-sm font-semibold text-gray-900">Profil</h2>
          <p className="text-xs text-gray-500">Nama ini ditampilkan di seluruh aplikasi.</p>

          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveProfile();
            }}
          >
            <Input
              label="Nama"
              data-testid="account-profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />

            {profileNotice && <Notice tone={profileNotice.tone}>{profileNotice.text}</Notice>}
            {profileError && <Notice tone="error">{profileError}</Notice>}

            <div className="flex justify-end">
              <Button
                type="submit"
                data-testid="account-profile-submit"
                disabled={savingProfile || !profileChanged || name.trim() === ''}
              >
                {savingProfile ? 'Menyimpan…' : 'Simpan Nama'}
              </Button>
            </div>
          </form>
        </section>

        <section className={surfaceClass('mt-5 p-5')} data-testid="account-security">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Keamanan</h2>
              <p className="text-xs text-gray-500">
                Ubah kata sandi Anda. Sesi di perangkat lain akan dikeluarkan.
              </p>
            </div>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void savePassword();
            }}
          >
            <Input
              label="Kata Sandi Saat Ini"
              type="password"
              autoComplete="current-password"
              data-testid="account-security-current"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
            <Input
              label="Kata Sandi Baru"
              type="password"
              autoComplete="new-password"
              data-testid="account-security-new"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <Input
              label="Konfirmasi Kata Sandi Baru"
              type="password"
              autoComplete="new-password"
              data-testid="account-security-confirm"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />

            {passwordNotice && <Notice tone={passwordNotice.tone}>{passwordNotice.text}</Notice>}
            {passwordError && <Notice tone="error">{passwordError}</Notice>}

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="secondary"
                data-testid="account-security-submit"
                disabled={savingPassword}
              >
                {savingPassword ? 'Menyimpan…' : 'Ubah Password'}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}

function InfoRow({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 truncate text-sm text-gray-900" data-testid={testid}>
        {value}
      </dd>
    </div>
  );
}

function extractError(err: unknown, fallback: string): string {
  const apiErr = err as { message?: string; errors?: Record<string, string[]> };
  if (apiErr?.errors) {
    const first = Object.values(apiErr.errors)[0]?.[0];
    if (first) return first;
  }
  if (apiErr?.message) return apiErr.message;
  return fallback;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

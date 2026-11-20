'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, FileQuestion, Globe, Image as ImageIcon, Settings2, Users } from 'lucide-react';
import { AppShell } from '@/components/layout';
import { adminPanel } from '@/lib/api';
import type { AdminDashboardStats } from '@/lib/api';
import { Card, Notice, Spinner } from '@/components/ui';
import { usePageTitle } from '@/hooks/use-page-title';
import { AdminAccessLoading, AdminForbiddenState, readStoredUser } from '@/components/admin/admin-access';
import { AdminNav } from '@/components/admin/admin-nav';

type Access = 'checking' | 'ok' | 'forbidden';

export default function AdminDashboardPage() {
  usePageTitle('Panel Admin — Quiz Builder');
  const router = useRouter();
  const [access, setAccess] = useState<Access>('checking');
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!localStorage.getItem('token')) {
        router.replace('/login');
        return;
      }

      const user = readStoredUser();
      if (!user) {
        router.replace('/login');
        return;
      }

      if (user.role !== 'admin') {
        if (active) setAccess('forbidden');
        return;
      }

      if (active) setAccess('ok');
      try {
        const res = await adminPanel.dashboard();
        if (active) setStats(res.data);
      } catch (err: unknown) {
        const apiErr = err as { message?: string };
        if (active) setError(apiErr.message || 'Gagal memuat ringkasan admin.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [router]);

  if (access === 'checking') {
    return (
      <AppShell>
        <AdminAccessLoading />
      </AppShell>
    );
  }

  if (access === 'forbidden') {
    return (
      <AppShell>
        <AdminForbiddenState />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Panel Admin Sekolah</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ringkasan penggunaan aplikasi, identitas sekolah untuk naskah soal, dan manajemen guru.
          </p>
        </div>

        <AdminNav />

        {error && (
          <div className="mb-5">
            <Notice tone="error">{error}</Notice>
          </div>
        )}

        {loading ? (
          <div className="py-16 flex justify-center">
            <Spinner label="Memuat statistik…" />
          </div>
        ) : stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Users className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-gray-500">Guru &amp; Pengguna</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.users.total}</p>
                    <p className="text-xs text-gray-500">
                      {stats.users.active} aktif · {stats.users.moodle_linked} terhubung Moodle
                    </p>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <BookOpen className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-gray-500">Total Kuis</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.quizzes.total}</p>
                    <p className="text-xs text-gray-500">{stats.quizzes.published} diterbitkan</p>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <FileQuestion className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-gray-500">Bank Soal</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.questions.total}</p>
                    <p className="text-xs text-gray-500">Butir soal tersimpan</p>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <ImageIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-gray-500">Media Gambar</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.media.total}</p>
                    <p className="text-xs text-gray-500">File gambar terunggah</p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
                    <Settings2 className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="space-y-1.5">
                    <h2 className="text-base font-semibold text-gray-900">
                      Pengaturan Sekolah &amp; Kop Naskah
                    </h2>
                    <p className="text-sm text-gray-600">
                      Atur nama sekolah, alamat, tahun ajaran, semester aktif, dan nama Kepala Sekolah/Wakakur untuk ekspor MS Word &amp; PDF.
                    </p>
                    <Link
                      href="/admin/settings"
                      className="inline-block text-sm font-medium text-blue-600 hover:underline pt-1"
                    >
                      Kelola Pengaturan Sekolah →
                    </Link>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
                    <Globe className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="space-y-1.5">
                    <h2 className="text-base font-semibold text-gray-900">
                      Integrasi e-Learning Moodle
                    </h2>
                    <p className="text-sm text-gray-600">
                      Server terhubung: <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{stats.moodle.url}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      Service Web Service: <span className="font-mono">{stats.moodle.service}</span>
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

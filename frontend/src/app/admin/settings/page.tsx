'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { AppShell } from '@/components/layout';
import { adminPanel } from '@/lib/api';
import type { SchoolSettings } from '@/lib/api';
import { Button, Card, Input, Notice, Select, Spinner } from '@/components/ui';
import { usePageTitle } from '@/hooks/use-page-title';
import { AdminAccessLoading, AdminForbiddenState, readStoredUser } from '@/components/admin/admin-access';
import { AdminNav } from '@/components/admin/admin-nav';

type Access = 'checking' | 'ok' | 'forbidden';

const EMPTY_SETTINGS: SchoolSettings = {
  school_name: '',
  school_subtitle: '',
  school_address: '',
  academic_year: '2026/2027',
  semester: 'Ganjil',
  default_exam_title: '',
  principal_name: '',
  principal_nip: '',
};

export default function AdminSettingsPage() {
  usePageTitle('Pengaturan Sekolah — Admin Quiz Builder');
  const router = useRouter();
  const [access, setAccess] = useState<Access>('checking');
  const [form, setForm] = useState<SchoolSettings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        const res = await adminPanel.getSettings();
        if (active) setForm(res.data);
      } catch (err: unknown) {
        const apiErr = err as { message?: string };
        if (active) setError(apiErr.message || 'Gagal memuat pengaturan sekolah.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await adminPanel.updateSettings(form);
      setForm(res.data);
      setNotice('Pengaturan sekolah & naskah ujian berhasil disimpan.');
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  }

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
      <div className="max-w-4xl mx-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Pengaturan Sekolah &amp; Naskah Ujian</h1>
          <p className="text-sm text-gray-500 mt-1">
            Identitas ini otomatis dipakai sebagai Kop Naskah dan blok pengesahan saat guru mengekspor Word (.docx) atau mencetak PDF.
          </p>
        </div>

        <AdminNav />

        {error && (
          <div className="mb-4">
            <Notice tone="error" onDismiss={() => setError(null)}>
              {error}
            </Notice>
          </div>
        )}
        {notice && (
          <div className="mb-4">
            <Notice tone="success" onDismiss={() => setNotice(null)}>
              {notice}
            </Notice>
          </div>
        )}

        {loading ? (
          <div className="py-16 flex justify-center">
            <Spinner label="Memuat pengaturan…" />
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    id="school_name"
                    label="Nama Sekolah"
                    value={form.school_name}
                    onChange={(e) => setForm((p) => ({ ...p, school_name: e.target.value }))}
                    required
                    placeholder="SMK Bina Rahayu"
                  />
                  <Input
                    id="school_subtitle"
                    label="Subjudul / Yayasan"
                    value={form.school_subtitle}
                    onChange={(e) => setForm((p) => ({ ...p, school_subtitle: e.target.value }))}
                    placeholder="Yayasan Pendidikan ..."
                  />
                </div>

                <Input
                  id="school_address"
                  label="Alamat & Kontak Sekolah"
                  value={form.school_address}
                  onChange={(e) => setForm((p) => ({ ...p, school_address: e.target.value }))}
                  placeholder="Jl. Raya Pendidikan No. 1, Depok"
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    id="academic_year"
                    label="Tahun Ajaran Aktif"
                    value={form.academic_year}
                    onChange={(e) => setForm((p) => ({ ...p, academic_year: e.target.value }))}
                    required
                    placeholder="2026/2027"
                  />
                  <div>
                    <label htmlFor="semester" className="block text-sm font-medium text-gray-700 mb-1">
                      Semester
                    </label>
                    <Select
                      id="semester"
                      value={form.semester}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, semester: e.target.value as 'Ganjil' | 'Genap' }))
                      }
                    >
                      <option value="Ganjil">Ganjil</option>
                      <option value="Genap">Genap</option>
                    </Select>
                  </div>
                  <Input
                    id="default_exam_title"
                    label="Judul Penilaian Default"
                    value={form.default_exam_title}
                    onChange={(e) => setForm((p) => ({ ...p, default_exam_title: e.target.value }))}
                    placeholder="Penilaian Sumatif Akhir Semester"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    id="principal_name"
                    label="Nama Kepala Sekolah / Wakakur"
                    value={form.principal_name}
                    onChange={(e) => setForm((p) => ({ ...p, principal_name: e.target.value }))}
                    placeholder="Drs. Ahmad Fauzi, M.Pd"
                  />
                  <Input
                    id="principal_nip"
                    label="NIP / NUPTK (Opsional)"
                    value={form.principal_nip}
                    onChange={(e) => setForm((p) => ({ ...p, principal_nip: e.target.value }))}
                    placeholder="197001012000011001"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={saving}>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {saving ? 'Menyimpan…' : 'Simpan Pengaturan'}
                  </Button>
                </div>
              </form>
            </Card>

            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                Pratinjau Kop Naskah Ujian
              </p>
              <div className="rounded-lg border border-gray-300 bg-white p-5 text-center">
                {form.school_subtitle && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    {form.school_subtitle}
                  </p>
                )}
                <p className="text-lg font-bold uppercase text-gray-900">
                  {form.school_name || 'Nama Sekolah'}
                </p>
                {form.school_address && (
                  <p className="text-xs text-gray-500 mt-0.5">{form.school_address}</p>
                )}
                <div className="mt-3 border-t-2 border-gray-900 pt-2 text-xs font-semibold uppercase text-gray-800">
                  {form.default_exam_title || 'Naskah Soal Ujian'} — Tahun Ajaran {form.academic_year || '2026/2027'} (Semester {form.semester})
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}

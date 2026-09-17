'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileQuestion,
  FileText,
  Image as ImageIcon,
  KeyRound,
  ShieldOff,
  UserCog,
} from 'lucide-react';
import { AppShell } from '@/components/layout';
import { adminUsers } from '@/lib/api';
import type { AdminUserDetail, QuizQuestionType, UserRole, UserStatus } from '@/lib/api';
import {
  Badge,
  Button,
  ConfirmDialog,
  DialogSurface,
  Input,
  Notice,
  Select,
  Spinner,
  surfaceClass,
} from '@/components/ui';
import type { NoticeTone } from '@/components/ui';
import { AdminAccessLoading, AdminForbiddenState, readStoredUser } from './admin-access';

const ROLE_LABEL: Record<UserRole, string> = { user: 'Pengguna', admin: 'Admin' };
const STATUS_LABEL: Record<UserStatus, string> = { active: 'Aktif', suspended: 'Ditangguhkan' };
const QUESTION_LABEL: Record<QuizQuestionType, string> = {
  multiple_choice: 'Pilihan Ganda',
  true_false: 'Benar/Salah',
  short_answer: 'Jawaban Singkat',
  essay: 'Esai',
};
const QUIZ_STATUS_LABEL: Record<AdminUserDetail['recent_quizzes'][number]['status'], string> = {
  draft: 'Draf',
  published: 'Terbit',
  archived: 'Arsip',
};

type Access = 'checking' | 'ok' | 'forbidden';
type UpdatePayload = Partial<{ name: string; email: string; role: UserRole; status: UserStatus }>;

export default function AdminUserDetailView({ userId }: { userId: number }) {
  const router = useRouter();
  const [access, setAccess] = useState<Access>('checking');
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [status, setStatus] = useState<UserStatus>('active');
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<UpdatePayload | null>(null);

  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.replace('/login');
      return;
    }

    const stored = readStoredUser();
    queueMicrotask(() => {
      if (!stored || stored.role !== 'admin') {
        setAccess('forbidden');
        return;
      }

      setCurrentUserId(stored.id);
      setAccess('ok');
    });
  }, [router]);

  const applyUser = useCallback((next: AdminUserDetail) => {
    setUser(next);
    setName(next.name);
    setEmail(next.email);
    setRole(next.role);
    setStatus(next.status);
  }, []);

  useEffect(() => {
    if (access !== 'ok') return;

    let active = true;

    adminUsers
      .get(userId)
      .then((response) => {
        if (!active) return;
        applyUser(response.data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const apiErr = err as { status?: number };
        if (apiErr.status === 401) {
          localStorage.removeItem('token');
          router.replace('/login');
        } else if (apiErr.status === 403) {
          setAccess('forbidden');
        } else if (apiErr.status === 404) {
          setError('Pengguna tidak ditemukan.');
        } else {
          setError(extractError(err, 'Gagal memuat detail pengguna.'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [access, userId, applyUser, router]);

  const isSelf = currentUserId !== null && user !== null && user.id === currentUserId;

  function handleSaveClick() {
    if (!user) return;

    const changes: UpdatePayload = {};
    if (name.trim() !== user.name) changes.name = name.trim();
    if (email.trim() !== user.email) changes.email = email.trim();
    if (role !== user.role) changes.role = role;
    if (status !== user.status) changes.status = status;

    if (Object.keys(changes).length === 0) {
      setNotice({ tone: 'info', text: 'Tidak ada perubahan untuk disimpan.' });
      return;
    }

    if (changes.role === 'user' || changes.status === 'suspended') {
      setPendingChanges(changes);
      return;
    }

    void save(changes);
  }

  async function save(changes: UpdatePayload) {
    if (!user) return;

    setSaving(true);
    setNotice(null);

    try {
      const response = await adminUsers.update(user.id, changes);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              ...response.data,
              recent_quizzes: prev.recent_quizzes,
              recent_questions: prev.recent_questions,
            }
          : prev
      );
      setName(response.data.name);
      setEmail(response.data.email);
      setRole(response.data.role);
      setStatus(response.data.status);
      setPendingChanges(null);
      setError(null);
      setNotice({
        tone: 'success',
        text:
          changes.status === 'suspended'
            ? 'Pengguna ditangguhkan dan semua sesinya dicabut.'
            : 'Perubahan pengguna berhasil disimpan.',
      });
    } catch (err) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 401) {
        localStorage.removeItem('token');
        router.replace('/login');
        return;
      }
      setError(extractError(err, 'Gagal menyimpan perubahan.'));
      setPendingChanges(null);
    } finally {
      setSaving(false);
    }
  }

  async function submitReset() {
    if (!user) return;

    if (newPassword.length < 8) {
      setResetError('Kata sandi minimal 8 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setResetting(true);
    setResetError(null);

    try {
      await adminUsers.resetPassword(user.id, newPassword, confirmPassword);
      setResetOpen(false);
      setNewPassword('');
      setConfirmPassword('');
      setNotice({ tone: 'success', text: 'Kata sandi pengguna berhasil diubah.' });
    } catch (err) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 401) {
        localStorage.removeItem('token');
        router.replace('/login');
        return;
      }
      setResetError(extractError(err, 'Gagal mengubah kata sandi.'));
    } finally {
      setResetting(false);
    }
  }

  async function submitRevoke() {
    if (!user || revoking) return;

    setRevoking(true);
    setNotice(null);

    try {
      const response = await adminUsers.revokeTokens(user.id);
      setRevokeOpen(false);
      setNotice({
        tone: 'success',
        text:
          response.data.revoked_count > 0
            ? `${response.data.revoked_count} sesi pengguna dicabut.`
            : 'Tidak ada sesi aktif yang perlu dicabut.',
      });
    } catch (err) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 401) {
        localStorage.removeItem('token');
        router.replace('/login');
        return;
      }
      setRevokeOpen(false);
      setError(extractError(err, 'Gagal mencabut sesi pengguna.'));
    } finally {
      setRevoking(false);
    }
  }

  if (access === 'checking') return <AdminAccessLoading />;
  if (access === 'forbidden') return <AdminForbiddenState />;

  return (
    <AppShell>
      <div className="animate-fade-in">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Kembali ke Manajemen Akun
        </Link>

        {loading && !user ? (
          <div className="flex justify-center py-24">
            <Spinner label="Memuat detail pengguna…" />
          </div>
        ) : error && !user ? (
          <div className="mt-6">
            <Notice tone="error">{error}</Notice>
          </div>
        ) : user ? (
          <>
            <header className="mt-4 mb-6 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-gray-900">{user.name}</h1>
                  {isSelf && <Badge tone="blue">Anda</Badge>}
                </div>
                <p className="mt-1 text-sm text-gray-500">{user.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={user.role === 'admin' ? 'indigo' : 'gray'}>{ROLE_LABEL[user.role]}</Badge>
                <Badge tone={user.status === 'active' ? 'green' : 'red'}>{STATUS_LABEL[user.status]}</Badge>
              </div>
            </header>

            {notice && (
              <div className="mb-5">
                <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
                  {notice.text}
                </Notice>
              </div>
            )}
            {error && (
              <div className="mb-5" data-testid="admin-user-error">
                <Notice tone="error" onDismiss={() => setError(null)}>
                  {error}
                </Notice>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard icon={<FileText className="h-5 w-5" />} label="Kuis" value={user.quizzes_count} />
              <StatCard icon={<FileQuestion className="h-5 w-5" />} label="Soal" value={user.questions_count} />
              <StatCard icon={<ImageIcon className="h-5 w-5" />} label="Media" value={user.media_count} />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className={surfaceClass('p-5')} data-testid="admin-user-profile">
                <div className="mb-4 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <UserCog className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">Profil &amp; Akses</h2>
                    <p className="text-xs text-gray-500">Perbarui identitas, peran, dan status akun.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <Input
                    label="Nama"
                    data-testid="admin-user-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <Input
                    label="Email"
                    type="email"
                    data-testid="admin-user-email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  <div>
                    <Select
                      label="Peran"
                      data-testid="admin-user-role"
                      value={role}
                      disabled={isSelf}
                      onChange={(event) => setRole(event.target.value as UserRole)}
                    >
                      <option value="user">Pengguna</option>
                      <option value="admin">Admin</option>
                    </Select>
                    {isSelf && (
                      <p className="mt-1 text-xs text-gray-500">Anda tidak dapat mengubah peran akun sendiri.</p>
                    )}
                  </div>
                  <div>
                    <Select
                      label="Status"
                      data-testid="admin-user-status"
                      value={status}
                      disabled={isSelf}
                      onChange={(event) => setStatus(event.target.value as UserStatus)}
                    >
                      <option value="active">Aktif</option>
                      <option value="suspended" disabled={isSelf}>
                        Ditangguhkan
                      </option>
                    </Select>
                    {isSelf && (
                      <p className="mt-1 text-xs text-gray-500">Anda tidak dapat menangguhkan akun sendiri.</p>
                    )}
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button
                      data-testid="admin-user-save"
                      onClick={handleSaveClick}
                      disabled={saving || (isSelf && (role !== user.role || status !== user.status))}
                    >
                      {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
                    </Button>
                  </div>
                </div>
              </section>

              <section className={surfaceClass('p-5')}>
                <h2 className="text-sm font-semibold text-gray-900">Aktivitas Terbaru</h2>
                <p className="text-xs text-gray-500">Kuis dan soal yang terakhir diperbarui.</p>

                <div className="mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Kuis</h3>
                  {user.recent_quizzes.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-400">Belum ada kuis.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-gray-100">
                      {user.recent_quizzes.map((quiz) => (
                        <li key={quiz.id} className="flex items-center justify-between gap-3 py-2">
                          <span className="min-w-0 truncate text-sm text-gray-800">{quiz.title}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-gray-400">{formatDate(quiz.updated_at)}</span>
                            <Badge
                              tone={
                                quiz.status === 'published'
                                  ? 'green'
                                  : quiz.status === 'archived'
                                    ? 'gray'
                                    : 'amber'
                              }
                            >
                              {QUIZ_STATUS_LABEL[quiz.status]}
                            </Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-5 border-t pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Soal</h3>
                  {user.recent_questions.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-400">Belum ada soal.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-gray-100">
                      {user.recent_questions.map((question) => (
                        <li key={question.id} className="py-2">
                          <p className="truncate text-sm text-gray-800">{question.excerpt}</p>
                          <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                            <span>{QUESTION_LABEL[question.type]}</span>
                            <span>·</span>
                            <span>{question.status === 'complete' ? 'Lengkap' : 'Draf'}</span>
                            <span>·</span>
                            <span>{formatDate(question.updated_at)}</span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>

            <section className={surfaceClass('mt-6 border-red-200 p-5')}>
              <h2 className="text-sm font-semibold text-gray-900">Keamanan Akun</h2>
              <p className="text-xs text-gray-500">
                Tindakan di bawah berlaku langsung dan tidak dapat dibatalkan.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="secondary" data-testid="admin-user-reset-password" onClick={() => setResetOpen(true)}>
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                  Reset Kata Sandi
                </Button>
                <Button variant="danger" data-testid="admin-user-revoke-tokens" onClick={() => setRevokeOpen(true)}>
                  <ShieldOff className="h-4 w-4" aria-hidden="true" />
                  Cabut Semua Sesi
                </Button>
              </div>
              {isSelf && (
                <p className="mt-3 text-xs text-gray-500">
                  Karena ini akun Anda sendiri, mencabut sesi tidak akan mengeluarkan sesi yang sedang aktif.
                </p>
              )}
            </section>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={pendingChanges !== null}
        title={pendingChanges?.status === 'suspended' ? 'Tangguhkan pengguna?' : 'Ubah peran pengguna?'}
        message={
          pendingChanges?.status === 'suspended'
            ? `${user?.name ?? 'Pengguna ini'} akan ditangguhkan dan semua sesinya langsung dicabut.`
            : `${user?.name ?? 'Pengguna ini'} akan diturunkan menjadi pengguna biasa dan kehilangan akses admin.`
        }
        confirmLabel={pendingChanges?.status === 'suspended' ? 'Tangguhkan' : 'Turunkan peran'}
        onConfirm={() => {
          if (pendingChanges) void save(pendingChanges);
        }}
        onCancel={() => setPendingChanges(null)}
      />

      <ConfirmDialog
        open={revokeOpen}
        title="Cabut semua sesi?"
        message={`Semua perangkat yang masuk sebagai ${user?.name ?? 'pengguna ini'} akan dikeluarkan.${
          isSelf ? ' Sesi Anda saat ini tetap aktif.' : ''
        }`}
        confirmLabel="Cabut Sesi"
        onConfirm={submitRevoke}
        onCancel={() => setRevokeOpen(false)}
      />

      {resetOpen && (
        <DialogSurface
          ariaLabel="Reset kata sandi"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          panelClassName="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          dataTestid="admin-reset-password-dialog"
          onClose={() => setResetOpen(false)}
        >
          <h2 className="text-lg font-semibold text-gray-900">Reset Kata Sandi</h2>
          <p className="mt-1 text-sm text-gray-500">
            Tetapkan kata sandi baru untuk <span className="font-medium text-gray-700">{user?.name}</span>.
          </p>

          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitReset();
            }}
          >
            <Input
              label="Kata Sandi Baru"
              type="password"
              autoComplete="new-password"
              data-testid="admin-reset-password-new"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <Input
              label="Konfirmasi Kata Sandi"
              type="password"
              autoComplete="new-password"
              data-testid="admin-reset-password-confirm"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            {resetError && <Notice tone="error">{resetError}</Notice>}
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="secondary" onClick={() => setResetOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={resetting} data-testid="admin-reset-password-submit">
                {resetting ? 'Menyimpan…' : 'Simpan Kata Sandi'}
              </Button>
            </div>
          </form>
        </DialogSurface>
      )}
    </AppShell>
  );
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className={surfaceClass('flex items-center gap-3 p-4')}>
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        {icon}
      </span>
      <div>
        <p className="text-2xl font-semibold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
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
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

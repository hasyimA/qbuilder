'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy } from 'lucide-react';
import { adminUsers } from '@/lib/api';
import type { UserRole, UserStatus } from '@/lib/api';
import { Button, DialogSurface, Input, Notice, Select } from '@/components/ui';

interface CreateUserDialogProps {
  onClose: () => void;
  onCreated: () => void;
}

interface CreateResult {
  name: string;
  email: string;
  temporaryPassword: string | null;
}

export function CreateUserDialog({ onClose, onCreated }: CreateUserDialogProps) {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [status, setStatus] = useState<UserStatus>('active');
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    if (submitting) return;

    if (name.trim() === '') {
      setError('Nama wajib diisi.');
      return;
    }
    if (email.trim() === '') {
      setError('Email wajib diisi.');
      return;
    }
    if (!autoGenerate) {
      if (password.length < 8) {
        setError('Kata sandi minimal 8 karakter.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Konfirmasi kata sandi tidak cocok.');
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await adminUsers.create({
        name: name.trim(),
        email: email.trim(),
        role,
        status,
        ...(autoGenerate ? {} : { password, password_confirmation: confirmPassword }),
      });

      setResult({
        name: response.data.name,
        email: response.data.email,
        temporaryPassword: response.temporary_password ?? null,
      });
      onCreated();
    } catch (err) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 401) {
        localStorage.removeItem('token');
        router.replace('/login');
        return;
      }
      setError(extractError(err, 'Gagal membuat akun.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPassword() {
    if (!result?.temporaryPassword) return;

    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <DialogSurface
      ariaLabel="Tambah akun pengguna"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      panelClassName="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      dataTestid="admin-create-user-dialog"
      onClose={onClose}
    >
      {result ? (
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Akun berhasil dibuat</h2>
          <p className="mt-1 text-sm text-gray-500">
            <span className="font-medium text-gray-700">{result.name}</span> ({result.email}) kini dapat masuk.
          </p>

          {result.temporaryPassword ? (
            <div className="mt-4 space-y-3">
              <Notice tone="warning" title="Catat kata sandi sementara ini">
                Kata sandi hanya ditampilkan sekali. Salin sekarang dan minta pengguna segera menggantinya.
              </Notice>
              <div className="flex items-center gap-2">
                <code
                  data-testid="admin-create-user-temporary-password"
                  className="flex-1 select-all rounded-md border border-gray-200 bg-slate-50 px-3 py-2 font-mono text-sm text-gray-900"
                >
                  {result.temporaryPassword}
                </code>
                <Button variant="secondary" onClick={() => void copyPassword()}>
                  {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  {copied ? 'Tersalin' : 'Salin'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <Notice tone="success">Kata sandi dibuat sesuai yang Anda isi.</Notice>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Button onClick={onClose} data-testid="admin-create-user-done">
              Selesai
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <h2 className="text-lg font-semibold text-gray-900">Tambah Akun</h2>
          <p className="mt-1 text-sm text-gray-500">Buat akun baru untuk pengguna atau admin lain.</p>

          <div className="mt-4 space-y-4">
            <Input
              label="Nama"
              data-testid="admin-create-user-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              label="Email"
              type="email"
              autoComplete="off"
              data-testid="admin-create-user-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                label="Peran"
                data-testid="admin-create-user-role"
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
              >
                <option value="user">Pengguna</option>
                <option value="admin">Admin</option>
              </Select>
              <Select
                label="Status"
                data-testid="admin-create-user-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as UserStatus)}
              >
                <option value="active">Aktif</option>
                <option value="suspended">Ditangguhkan</option>
              </Select>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                data-testid="admin-create-user-generate"
                checked={autoGenerate}
                onChange={(event) => setAutoGenerate(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Buat kata sandi otomatis
            </label>

            {!autoGenerate && (
              <div className="space-y-4">
                <Input
                  label="Kata Sandi"
                  type="password"
                  autoComplete="new-password"
                  data-testid="admin-create-user-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <Input
                  label="Konfirmasi Kata Sandi"
                  type="password"
                  autoComplete="new-password"
                  data-testid="admin-create-user-password-confirm"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
            )}

            {error && <Notice tone="error">{error}</Notice>}
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting} data-testid="admin-create-user-submit">
              {submitting ? 'Membuat…' : 'Buat Akun'}
            </Button>
          </div>
        </form>
      )}
    </DialogSurface>
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

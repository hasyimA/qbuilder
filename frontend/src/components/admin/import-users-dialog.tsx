'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Download, Upload } from 'lucide-react';
import { adminUsers } from '@/lib/api';
import type { AdminUserImportSummary } from '@/lib/api';
import { Button, DialogSurface, Notice, surfaceClass } from '@/components/ui';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const ROLE_LABEL: Record<string, string> = { user: 'Pengguna', admin: 'Admin' };
const STATUS_LABEL: Record<string, string> = { active: 'Aktif', suspended: 'Ditangguhkan' };

interface ImportUsersDialogProps {
  onClose: () => void;
  onImported: () => void;
}

export function ImportUsersDialog({ onClose, onImported }: ImportUsersDialogProps) {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<AdminUserImportSummary | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  function selectFile(next: File | null) {
    setFile(next);
    setSummary(null);
    setError(null);
    setDone(false);
    setCopied(false);

    if (next && !next.name.toLowerCase().endsWith('.csv')) {
      setError('Berkas harus berformat CSV.');
    } else if (next && next.size > MAX_IMPORT_BYTES) {
      setError('Berkas CSV maksimal 2 MB.');
    }
  }

  async function validate() {
    if (!file || validating) return;

    setValidating(true);
    setError(null);

    try {
      const response = await adminUsers.importCsv(file, true);
      setSummary(response.data);
    } catch (err) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 401) {
        localStorage.removeItem('token');
        router.replace('/login');
        return;
      }
      setError(extractError(err, 'Gagal memvalidasi berkas.'));
    } finally {
      setValidating(false);
    }
  }

  async function commit() {
    if (!file || !summary || summary.error_rows > 0 || importing) return;

    setImporting(true);
    setError(null);

    try {
      const response = await adminUsers.importCsv(file, false);
      setSummary(response.data);
      setDone(true);
      onImported();
    } catch (err) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 401) {
        localStorage.removeItem('token');
        router.replace('/login');
        return;
      }
      setError(extractError(err, 'Gagal mengimpor akun.'));
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setFile(null);
    setSummary(null);
    setError(null);
    setDone(false);
    setCopied(false);
  }

  async function copyCredentials() {
    if (!summary) return;

    const lines = summary.created
      .filter((user) => user.temporary_password)
      .map((user) => `${user.email},${user.temporary_password}`);

    if (lines.length === 0) return;

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const canImport = summary !== null && summary.error_rows === 0 && summary.total_rows > 0;

  return (
    <DialogSurface
      ariaLabel="Import akun dari CSV"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      panelClassName="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      dataTestid="admin-import-users-dialog"
      onClose={onClose}
    >
      <h2 className="text-lg font-semibold text-gray-900">Import Akun dari CSV</h2>
      <p className="mt-1 text-sm text-gray-500">
        Unggah berkas CSV, validasi terlebih dahulu, lalu impor. Berkas yang tidak valid tidak akan membuat akun apa pun.
      </p>

      {done && summary ? (
        <div className="mt-4 space-y-4">
          <Notice tone="success" title={`${summary.created.length} akun berhasil dibuat`}>
            Akun baru sudah dapat digunakan untuk masuk.
          </Notice>

          {summary.created.some((user) => user.temporary_password) && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-700">Kata sandi sementara</p>
                <Button variant="secondary" size="sm" onClick={() => void copyCredentials()}>
                  {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                  {copied ? 'Tersalin' : 'Salin email & kata sandi'}
                </Button>
              </div>
              <p className="mb-2 text-xs text-amber-700">
                Kata sandi sementara hanya ditampilkan sekali. Salin sekarang dan minta pengguna segera menggantinya.
              </p>
              <div className={surfaceClass('overflow-hidden')}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                      <th className="px-3 py-2 font-semibold">Email</th>
                      <th className="px-3 py-2 font-semibold">Kata Sandi Sementara</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {summary.created.map((user) => (
                      <tr key={user.id} data-testid={`admin-import-created-${user.id}`}>
                        <td className="px-3 py-2 text-gray-700">{user.email}</td>
                        <td className="px-3 py-2 font-mono text-gray-900">
                          {user.temporary_password ?? <span className="text-gray-400">Sesuai berkas</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : summary ? (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="Total baris" value={summary.total_rows} />
            <SummaryCard label="Valid" value={summary.valid_rows} tone="green" />
            <SummaryCard label="Bermasalah" value={summary.error_rows} tone={summary.error_rows > 0 ? 'red' : 'gray'} />
          </div>

          {summary.error_rows > 0 && (
            <Notice tone="error" title="Perbaiki baris berikut sebelum mengimpor">
              Tidak ada akun yang dibuat pada tahap validasi. Impor hanya berjalan bila semua baris valid.
            </Notice>
          )}

          <div className={surfaceClass('overflow-hidden')}>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                    <th className="px-3 py-2 font-semibold">Baris</th>
                    <th className="px-3 py-2 font-semibold">Nama</th>
                    <th className="px-3 py-2 font-semibold">Email</th>
                    <th className="px-3 py-2 font-semibold">Peran</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {summary.rows.map((row) => (
                    <tr key={row.row} data-testid={`admin-import-row-${row.row}`} className={row.valid ? '' : 'bg-red-50/50'}>
                      <td className="px-3 py-2 text-gray-500">{row.row}</td>
                      <td className="px-3 py-2 text-gray-800">{row.name || '—'}</td>
                      <td className="px-3 py-2 text-gray-800">{row.email || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{row.role ? ROLE_LABEL[row.role] : '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{row.status ? STATUS_LABEL[row.status] : '—'}</td>
                      <td className="px-3 py-2 text-xs text-red-600">
                        {row.valid ? <span className="text-emerald-600">Valid</span> : row.errors.join(' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="admin-import-file">
              Berkas CSV
            </label>
            <input
              id="admin-import-file"
              type="file"
              accept=".csv,text/csv"
              data-testid="admin-import-file"
              onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
              className="block w-full cursor-pointer rounded-md border border-gray-300 bg-white text-sm text-gray-700 file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-slate-200"
            />
          </div>

          <div className={surfaceClass('bg-slate-50 p-4 text-sm text-gray-600')}>
            <p className="font-medium text-gray-700">Format kolom</p>
            <p className="mt-1">
              <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-gray-800">
                name,email,password,role,status
              </code>
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
              <li><span className="font-medium">name</span> dan <span className="font-medium">email</span> wajib diisi.</li>
              <li><span className="font-medium">password</span> opsional; bila kosong, sistem membuat kata sandi sementara.</li>
              <li><span className="font-medium">role</span> bila kosong dianggap <em>user</em>.</li>
              <li><span className="font-medium">status</span> bila kosong dianggap <em>active</em>.</li>
              <li>Maksimal 500 baris dan 2 MB per berkas.</li>
            </ul>
            <Button variant="ghost" size="sm" className="mt-2" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Unduh template CSV
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4" data-testid="admin-import-error">
          <Notice tone="error" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-3">
        {done ? (
          <>
            <Button variant="secondary" onClick={reset}>
              Impor Berkas Lain
            </Button>
            <Button onClick={onClose} data-testid="admin-import-done">
              Selesai
            </Button>
          </>
        ) : summary ? (
          <>
            <Button variant="secondary" onClick={reset} disabled={importing}>
              Ganti Berkas
            </Button>
            <Button
              onClick={() => void commit()}
              disabled={!canImport || importing}
              data-testid="admin-import-submit"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {importing ? 'Mengimpor…' : `Impor ${summary.valid_rows} Akun`}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button
              onClick={() => void validate()}
              disabled={!file || validating || error !== null}
              data-testid="admin-import-validate"
            >
              {validating ? 'Memvalidasi…' : 'Validasi File'}
            </Button>
          </>
        )}
      </div>
    </DialogSurface>
  );
}

function SummaryCard({ label, value, tone = 'gray' }: { label: string; value: number; tone?: 'gray' | 'green' | 'red' }) {
  const toneClass =
    tone === 'green' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : 'text-gray-900';

  return (
    <div className={surfaceClass('p-3 text-center')}>
      <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function downloadTemplate() {
  const content =
    'name,email,password,role,status\n' +
    'Budi Santoso,budi@example.com,,user,active\n' +
    'Siti Aminah,siti@example.com,Rahasia123,admin,active\n';

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'template-import-pengguna.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

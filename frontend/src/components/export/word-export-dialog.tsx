'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { schoolSettings } from '@/lib/api';
import type { SchoolSettings } from '@/lib/api';
import { exportQuizDocx } from '@/lib/export/export-quiz';
import type { DocxExportMode } from '@/lib/export/docx/docx-exporter';
import { Button, Input, Notice, Spinner, useFocusTrap } from '@/components/ui';

export interface WordExportDialogProps {
  quiz: { id: number; title: string };
  onClose: () => void;
  onSuccess?: (quizTitle: string, mode: DocxExportMode) => void;
}

export default function WordExportDialog({ quiz, onClose, onSuccess }: WordExportDialogProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(sheetRef);

  const [loadingSchool, setLoadingSchool] = useState(true);
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [mode, setMode] = useState<DocxExportMode>('complete');
  const [duration, setDuration] = useState('90 Menit');
  const [examDate, setExamDate] = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !exporting) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exporting, onClose]);

  useEffect(() => {
    let active = true;
    schoolSettings
      .get()
      .then((res) => {
        if (active) setSchool(res.data);
      })
      .catch(() => {
        // Fallback handled in exporter
      })
      .finally(() => {
        if (active) setLoadingSchool(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleExport(e: React.FormEvent) {
    e.preventDefault();
    setExporting(true);
    setError(null);

    try {
      const title = await exportQuizDocx(quiz.id, {
        mode,
        school: school ?? undefined,
        duration,
        examDate,
      });
      onSuccess?.(title, mode);
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal mengekspor dokumen MS Word.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="word-export-title"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => (exporting ? null : onClose())}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl animate-slide-in-right"
      >
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 id="word-export-title" className="truncate text-lg font-semibold leading-6 text-gray-900">
              Ekspor MS Word (.docx)
            </h2>
            <p className="truncate text-sm text-gray-500">
              Kuis: <span className="font-medium text-gray-700">{quiz.title}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => (exporting ? null : onClose())}
            disabled={exporting}
            aria-label="Tutup dialog"
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 space-y-5">
          {loadingSchool ? (
            <div className="py-12 flex justify-center">
              <Spinner label="Memuat identitas sekolah…" />
            </div>
          ) : (
            <form id="word-export-form" onSubmit={handleExport} className="space-y-5">
              {error && <Notice tone="error">{error}</Notice>}

              {school && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3.5 text-xs text-gray-700 space-y-0.5">
                  <p className="font-semibold text-gray-900 uppercase">{school.school_name}</p>
                  <p>
                    {school.default_exam_title} · TA {school.academic_year} (Semester {school.semester})
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Pilih Bentuk Dokumen</p>
                <div className="space-y-2" role="radiogroup" aria-label="Bentuk dokumen Word">
                  <label
                    className={`flex items-start gap-3 rounded-lg border p-3.5 cursor-pointer transition-colors ${
                      mode === 'complete'
                        ? 'border-blue-500 bg-blue-50/70'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="word-mode"
                      value="complete"
                      checked={mode === 'complete'}
                      onChange={() => setMode('complete')}
                      className="mt-1 h-4 w-4 text-blue-600"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        Administrasi Lengkap (Soal + Kunci &amp; Pedoman)
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Kop naskah, seluruh soal bergambar/tabel, diikuti halaman khusus Kunci Jawaban, bobot (+/-), pedoman penskoran, dan blok tanda tangan.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 rounded-lg border p-3.5 cursor-pointer transition-colors ${
                      mode === 'student'
                        ? 'border-blue-500 bg-blue-50/70'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="word-mode"
                      value="student"
                      checked={mode === 'student'}
                      onChange={() => setMode('student')}
                      className="mt-1 h-4 w-4 text-blue-600"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        Naskah Soal Saja (Versi Siswa)
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Kop naskah dan daftar soal siap cetak untuk siswa tanpa kunci jawaban.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="word-duration"
                  label="Alokasi Waktu (Opsional)"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="90 Menit"
                />
                <Input
                  id="word-date"
                  label="Tanggal Ujian (Opsional)"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  placeholder="Senin, 1 Desember 2026"
                />
              </div>
            </form>
          )}
        </div>

        <footer className="border-t border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-end gap-2.5">
            <Button type="button" variant="secondary" onClick={onClose} disabled={exporting}>
              Batal
            </Button>
            <Button
              type="submit"
              form="word-export-form"
              variant="primary"
              disabled={exporting || loadingSchool}
              data-testid="word-export-submit"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              {exporting ? 'Menyusun .docx…' : 'Unduh MS Word (.docx)'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

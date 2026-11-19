'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, Search, UploadCloud, X } from 'lucide-react';
import { moodle } from '@/lib/api';
import type { MoodleCourse, MoodleImportResult } from '@/lib/api';
import { ExportValidationErrorList, formatExportErrors } from '@/lib/export';
import { buildQuizMoodleXml } from '@/lib/export/export-quiz';
import { Button, Input, Notice, Spinner, useFocusTrap } from '@/components/ui';

export interface MoodleImportDialogProps {
  quiz: { id: number; title: string };
  onClose: () => void;
  onSuccess?: (result: MoodleImportResult) => void;
}

export default function MoodleImportDialog({ quiz, onClose, onSuccess }: MoodleImportDialogProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(sheetRef);

  const [preparing, setPreparing] = useState(true);
  const [courses, setCourses] = useState<MoodleCourse[]>([]);
  const [xml, setXml] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [prepareError, setPrepareError] = useState<string | null>(null);

  const [courseSearch, setCourseSearch] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [quizName, setQuizName] = useState(quiz.title);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<MoodleImportResult | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !importing) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [importing, onClose]);

  useEffect(() => {
    let active = true;

    async function prepare() {
      setPreparing(true);
      setPrepareError(null);

      try {
        const [coursesRes, built] = await Promise.all([
          moodle.getCourses(),
          buildQuizMoodleXml(quiz.id),
        ]);

        if (!active) return;

        setCourses(coursesRes.data);
        setXml(built.xml);
        setQuestionCount(built.questionCount);
        setQuizName(built.title);
        if (coursesRes.data.length > 0) {
          setSelectedCourseId(coursesRes.data[0].id);
        }
      } catch (err: unknown) {
        if (!active) return;

        if (err instanceof ExportValidationErrorList) {
          setPrepareError(formatExportErrors(err.errors));
        } else {
          const apiErr = err as { message?: string };
          setPrepareError(apiErr.message || 'Gagal menyiapkan data import ke e-Learning Moodle.');
        }
      } finally {
        if (active) setPreparing(false);
      }
    }

    prepare();

    return () => {
      active = false;
    };
  }, [quiz.id]);

  const filteredCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        c.fullname.toLowerCase().includes(q) ||
        c.shortname.toLowerCase().includes(q) ||
        c.displayname.toLowerCase().includes(q)
    );
  }, [courses, courseSearch]);

  async function handleImport(e?: React.FormEvent) {
    e?.preventDefault();
    if (!selectedCourseId || !xml) return;

    setImporting(true);
    setImportError(null);

    try {
      const response = await moodle.importQuiz(quiz.id, {
        course_id: selectedCourseId,
        xml,
        quiz_name: quizName.trim() || quiz.title,
      });
      setResult(response.data);
      onSuccess?.(response.data);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setImportError(apiErr.message || 'Gagal mengimpor kuis ke e-Learning Moodle.');
    } finally {
      setImporting(false);
    }
  }

  const canImport = !preparing && !prepareError && !result && courses.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="moodle-import-title"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => (importing ? null : onClose())}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl animate-slide-in-right"
      >
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 id="moodle-import-title" className="truncate text-lg font-semibold leading-6 text-gray-900">
                Import ke e-Learning Moodle
              </h2>
              {questionCount > 0 && (
                <span className="inline-flex flex-none items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700">
                  {questionCount} soal
                </span>
              )}
            </div>
            <p className="truncate text-sm text-gray-500">
              Kuis: <span className="font-medium text-gray-700">{quiz.title}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => (importing ? null : onClose())}
            disabled={importing}
            aria-label="Tutup dialog"
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 space-y-5">
          {preparing ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-sm text-gray-600">
              <Spinner />
              <span>Memvalidasi soal dan memuat daftar course yang Anda ampu…</span>
            </div>
          ) : prepareError ? (
            <Notice tone="error">{prepareError}</Notice>
          ) : result ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1.5">
                  <p className="font-semibold">
                    Berhasil mengimpor {result.imported_count} soal ke e-Learning!
                  </p>
                  <p className="text-emerald-800">
                    Aktivitas Quiz telah dibuat otomatis dan soal masuk ke kategori{' '}
                    <span className="font-medium">{result.category_name}</span>.
                  </p>
                </div>
              </div>
            </div>
          ) : courses.length === 0 ? (
            <Notice tone="warning">
              Anda belum tercatat sebagai pengajar pada course mana pun di e-Learning Moodle.
            </Notice>
          ) : (
            <form id="moodle-import-form" onSubmit={handleImport} className="space-y-5">
              {importError && <Notice tone="error">{importError}</Notice>}

              <div className="rounded-md bg-blue-50/70 border border-blue-100 px-3.5 py-2.5 text-xs text-blue-800">
                <span className="font-semibold">{questionCount} soal</span> siap ditransfer ke Question Bank dan dibuatkan aktivitas Quiz di course pilihan Anda.
              </div>

              <Input
                id="moodle-quiz-name"
                label="Nama Aktivitas Quiz di Moodle"
                type="text"
                value={quizName}
                onChange={(e) => setQuizName(e.target.value)}
                required
                disabled={importing}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="moodle-course-search"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Pilih Course yang Anda Ampu
                  </label>
                  <span className="text-xs text-gray-500">
                    {filteredCourses.length} dari {courses.length} course
                  </span>
                </div>

                {courses.length > 3 && (
                  <div className="relative">
                    <Search
                      className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      id="moodle-course-search"
                      type="search"
                      value={courseSearch}
                      onChange={(e) => setCourseSearch(e.target.value)}
                      placeholder="Cari nama mata pelajaran / kode course…"
                      className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}

                <div
                  role="radiogroup"
                  aria-label="Daftar course yang diampu"
                  className="rounded-lg border border-gray-200 divide-y divide-gray-100"
                >
                  {filteredCourses.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500 text-center">
                      Course tidak ditemukan.
                    </p>
                  ) : (
                    filteredCourses.map((course) => {
                      const checked = selectedCourseId === course.id;
                      return (
                        <label
                          key={course.id}
                          className={`flex items-start gap-3 p-3.5 cursor-pointer transition-colors ${
                            checked ? 'bg-blue-50/80' : 'hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="moodle-course"
                            value={course.id}
                            checked={checked}
                            onChange={() => setSelectedCourseId(course.id)}
                            disabled={importing}
                            className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 break-words">
                              {course.displayname || course.fullname}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {course.shortname}
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </form>
          )}
        </div>

        <footer className="border-t border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            {result ? (
              <>
                <Button variant="secondary" onClick={onClose}>
                  Selesai
                </Button>
                {result.quiz_url && (
                  <a
                    href={result.quiz_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    Buka Quiz di Moodle
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                )}
              </>
            ) : canImport ? (
              <>
                <Button type="button" variant="secondary" onClick={onClose} disabled={importing}>
                  Batal
                </Button>
                <Button
                  type="submit"
                  form="moodle-import-form"
                  variant="primary"
                  disabled={importing || !selectedCourseId}
                  data-testid="moodle-import-submit"
                >
                  <UploadCloud className="h-4 w-4" aria-hidden="true" />
                  {importing ? 'Mengimpor ke Moodle…' : 'Import ke Moodle'}
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={onClose} disabled={preparing}>
                Tutup
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

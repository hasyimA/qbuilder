'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Search, UploadCloud } from 'lucide-react';
import { moodle } from '@/lib/api';
import type { MoodleCourse, MoodleImportResult } from '@/lib/api';
import { ExportValidationErrorList, formatExportErrors } from '@/lib/export';
import { buildQuizMoodleXml } from '@/lib/export/export-quiz';
import { Button, DialogSurface, Input, Notice, Spinner } from '@/components/ui';

export interface MoodleImportDialogProps {
  quiz: { id: number; title: string };
  onClose: () => void;
  onSuccess?: (result: MoodleImportResult) => void;
}

export default function MoodleImportDialog({ quiz, onClose, onSuccess }: MoodleImportDialogProps) {
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

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
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

  return (
    <DialogSurface
      onClose={importing ? () => {} : onClose}
      titleId="moodle-import-title"
      className="max-w-lg"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 id="moodle-import-title" className="text-lg font-semibold text-gray-900">
              Import ke e-Learning Moodle
            </h2>
            <p className="text-sm text-gray-600 mt-0.5">
              Kuis: <span className="font-medium text-gray-900">{quiz.title}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            aria-label="Tutup dialog"
            className="text-gray-400 hover:text-gray-600 text-sm font-medium disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {preparing ? (
          <div className="py-10 flex flex-col items-center justify-center gap-3 text-sm text-gray-600">
            <Spinner />
            <span>Memvalidasi soal dan memuat daftar course yang Anda ampu…</span>
          </div>
        ) : prepareError ? (
          <div className="space-y-4">
            <Notice tone="error">{prepareError}</Notice>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>
                Tutup
              </Button>
            </div>
          </div>
        ) : result ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
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

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
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
            </div>
          </div>
        ) : courses.length === 0 ? (
          <div className="space-y-4">
            <Notice tone="warning">
              Anda belum tercatat sebagai pengajar pada course mana pun di e-Learning Moodle.
            </Notice>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>
                Tutup
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleImport} className="space-y-4">
            {importError && <Notice tone="error">{importError}</Notice>}

            <div className="rounded-md bg-blue-50/70 border border-blue-100 px-3 py-2 text-xs text-blue-800">
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

            <div>
              <label
                htmlFor="moodle-course-search"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Pilih Course yang Anda Ampu ({courses.length})
              </label>

              {courses.length > 5 && (
                <div className="relative mb-2">
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
                    className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}

              <div
                role="radiogroup"
                aria-label="Daftar course yang diampu"
                className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100"
              >
                {filteredCourses.length === 0 ? (
                  <p className="p-3 text-sm text-gray-500 text-center">
                    Course tidak ditemukan.
                  </p>
                ) : (
                  filteredCourses.map((course) => {
                    const checked = selectedCourseId === course.id;
                    return (
                      <label
                        key={course.id}
                        className={`flex items-start gap-3 p-3 cursor-pointer transition-colors ${
                          checked ? 'bg-blue-50/70' : 'hover:bg-gray-50'
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
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {course.displayname || course.fullname}
                          </div>
                          <div className="text-xs text-gray-500">
                            {course.shortname}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose} disabled={importing}>
                Batal
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={importing || !selectedCourseId}
                data-testid="moodle-import-submit"
              >
                <UploadCloud className="h-4 w-4" aria-hidden="true" />
                {importing ? 'Mengimpor ke Moodle…' : 'Import ke Moodle'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </DialogSurface>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { quizzes, questions } from '@/lib/api';
import type { Question, QuestionPayload, QuestionType, Quiz } from '@/lib/types';
import { QUESTION_TYPE_LABELS } from '@/lib/types';
import { docToPlainText } from '@/lib/content';
import { moodleXmlExporter, ExportValidationErrorList } from '@/lib/export';
import type { ExportValidationError } from '@/lib/export';
import { resolveMediaFromApi } from '@/lib/export';
import dynamic from 'next/dynamic';
import { downloadStringFile } from '@/lib/export/download';
import { Button, ConfirmDialog, Notice, Spinner } from '@/components/ui';
import { usePageTitle } from '@/hooks/use-page-title';
const QuestionEditor = dynamic(
  () => import('@/components/question-editor').then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50">
        <Spinner label="Memuat editor…" />
      </div>
    ),
  }
);
import BankPickerDialog from '@/components/question-bank/bank-picker-dialog';

interface QuizBuilderProps {
  quizId: number;
}

export default function QuizBuilderPage() {
  const params = useParams();
  const quizId = Number(params.id);

  return <QuizBuilderInner key={quizId} quizId={quizId} />;
}

function QuizBuilderInner({ quizId }: QuizBuilderProps) {
  const router = useRouter();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questionsList, setQuestionsList] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [defaultType, setDefaultType] = useState<QuestionType | null>(null);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const lastOrderRef = useRef<number[]>([]);

  const [exporting, setExporting] = useState(false);
  const [exportErrors, setExportErrors] = useState<ExportValidationError[] | null>(null);

  usePageTitle(quiz ? `${quiz.title} — Builder Kuis` : 'Builder Kuis — Quiz Builder');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    let active = true;
    (async () => {
      try {
        const quizResponse = await quizzes.get(quizId);
        if (!active) return;
        setQuiz(quizResponse.data);
        const questionResponse = await questions.list(quizId);
        if (!active) return;
        setQuestionsList(questionResponse.data);
        lastOrderRef.current = questionResponse.data.map((q) => q.id);
      } catch (err: unknown) {
        const apiErr = err as { status?: number };
        if (apiErr.status === 401) {
          localStorage.removeItem('token');
          router.push('/login');
        } else if (active) {
          setError('Gagal memuat kuis.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [quizId, router]);

  function openCreate(type: QuestionType = 'multiple_choice') {
    setDefaultType(type);
    setEditingQuestion(null);
    setEditorOpen(true);
  }

  function openEdit(question: Question) {
    setEditingQuestion(question);
    setEditorOpen(true);
  }

  async function handleExport() {
    if (!quiz || sortedQuestions.length === 0) return;
    setExporting(true);
    setExportErrors(null);
    try {
      const result = await moodleXmlExporter.export({
        quiz,
        questions: sortedQuestions,
        resolveMedia: resolveMediaFromApi,
      });
      downloadStringFile(moodleXmlExporter.filename(quiz.title), result.xml);
    } catch (err) {
      if (err instanceof ExportValidationErrorList) {
        setExportErrors(err.errors);
      } else {
        const reason = err instanceof Error ? err.message : 'Terjadi kesalahan saat ekspor.';
        setError(`Ekspor gagal: ${reason}`);
      }
    } finally {
      setExporting(false);
    }
  }

  async function handleSave(data: QuestionPayload, addAnother: boolean) {
    try {
      if (editingQuestion) {
        const res = await questions.update(editingQuestion.id, data);
        setQuestionsList((prev) =>
          prev.map((q) => (q.id === res.data.id ? res.data : q))
        );
        if (!addAnother) {
          setEditorOpen(false);
          setEditingQuestion(null);
        }
        return res.data;
      }

      const res = await questions.create(quizId, data);
      setQuestionsList((prev) => [...prev, res.data]);
      lastOrderRef.current = [...lastOrderRef.current, res.data.id];
      if (!addAnother) {
        setEditorOpen(false);
        setEditingQuestion(null);
      }
      return res.data;
    } catch (err: unknown) {
      const apiErr = err as { message?: string; errors?: Record<string, unknown> };
      throw new Error(apiErr.message || 'Gagal menyimpan soal.');
    }
  }

  async function handleDelete(question: Question) {
    setDeleteConfirmId(null);
    setDeletingId(question.id);
    try {
      await questions.detach(quizId, question.id);
      setQuestionsList((prev) => prev.filter((q) => q.id !== question.id));
      lastOrderRef.current = lastOrderRef.current.filter((id) => id !== question.id);
      if (editingQuestion?.id === question.id) {
        setEditorOpen(false);
        setEditingQuestion(null);
      }
    } catch {
      setError('Gagal menghapus soal dari kuis.');
    } finally {
      setDeletingId(null);
    }
  }

  function handlePicked(question: Question) {
    setPickerOpen(false);
    setQuestionsList((prev) =>
      prev.some((q) => q.id === question.id) ? prev : [...prev, question]
    );
    lastOrderRef.current = lastOrderRef.current.includes(question.id)
      ? lastOrderRef.current
      : [...lastOrderRef.current, question.id];
  }

  async function handleDuplicate(question: Question) {
    setDuplicatingId(question.id);
    try {
      const res = await questions.duplicate(quizId, question.id);
      setQuestionsList((prev) => [...prev, res.data]);
      lastOrderRef.current = [...lastOrderRef.current, res.data.id];
    } catch {
      setError('Gagal menduplikasi soal.');
    } finally {
      setDuplicatingId(null);
    }
  }

  async function persistOrder(activeQuestions: Question[]) {
    const order = activeQuestions.map((q) => q.id);
    lastOrderRef.current = order;
    setReorderSaving(true);
    try {
      await questions.reorder(quizId, order);
    } catch {
      setError('Gagal menyimpan urutan. Perubahan dikembalikan.');
      setQuestionsList((prev) =>
        prev
          .slice()
          .sort((a, b) => lastOrderRef.current.indexOf(a.id) - lastOrderRef.current.indexOf(b.id))
      );
    } finally {
      setReorderSaving(false);
      setDragIndex(null);
      setDragOverIndex(null);
    }
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...questionsList];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    const reordered = next.map((q, index) =>
      q.sort_order === index ? q : { ...q, sort_order: index }
    );
    setQuestionsList(reordered);
    void persistOrder(reordered);
  }

  const dragging = dragIndex !== null;

  const sortedQuestions = [...questionsList].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  const deleteTarget =
    deleteConfirmId === null
      ? null
      : (sortedQuestions.find((q) => q.id === deleteConfirmId) ?? null);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner label="Memuat kuis…" />
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500">Kuis tidak ditemukan</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/" className="text-gray-500 hover:text-gray-800 flex-none">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{quiz.title}</h1>
              <p className="text-xs text-gray-500">
                {sortedQuestions.length} soal{reorderSaving && ' · menyimpan urutan…'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => void handleExport()}
              disabled={exporting || sortedQuestions.length === 0}
              title="Ekspor kuis sebagai file Moodle XML"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {exporting ? 'Mengekspor…' : 'Ekspor'}
            </Button>
            <Button onClick={() => openCreate('multiple_choice')}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Tambah Soal
            </Button>
            <Button variant="secondary" onClick={() => setPickerOpen(true)} title="Ambil soal dari bank soal">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Dari Bank
            </Button>
            <Link
              href={`/quizzes/${quizId}`}
              className="inline-flex items-center rounded-md border border-gray-300 px-3.5 py-2 text-sm font-medium whitespace-nowrap text-gray-700 hover:bg-gray-50"
            >
              Pengaturan
            </Link>
          </div>
        </div>
      </header>

      {error && (
        <div className="max-w-7xl mx-auto w-full px-4 pt-4">
          <Notice tone="error" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        </div>
      )}

      {exportErrors && exportErrors.length > 0 && (
        <div className="max-w-7xl mx-auto w-full px-4 pt-4">
          <div
            role="alert"
            className="rounded-md bg-amber-50 border border-amber-300 px-4 py-3 text-sm text-amber-900"
          >
            <p className="font-semibold mb-1">
              Tidak dapat mengekspor — perbaiki soal berikut dulu:
            </p>
            <ul className="list-disc list-inside space-y-1">
              {exportErrors.map((err) => (
                <li key={`${err.code}-${err.questionIndex ?? 'global'}-${err.message}`}>
                  {err.message}
                </li>
              ))}
            </ul>
            <button
              onClick={() => setExportErrors(null)}
              className="mt-2 underline"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <div className="flex gap-6">
          <aside className="hidden md:block w-48 flex-none">
            <nav aria-label="Navigasi soal">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
                Daftar Soal
              </p>
              {sortedQuestions.length === 0 ? (
                <p className="text-sm text-gray-400">Belum ada soal</p>
              ) : (
                <ul className="space-y-1">
                  {sortedQuestions.map((q, index) => (
                    <li key={q.id}>
                      <button
                        onClick={() => openEdit(q)}
                        className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-white hover:shadow-sm border border-transparent"
                        aria-label={`Edit soal ${index + 1}`}
                      >
                        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-700">
                          {index + 1}
                        </span>
                        <span className="truncate text-gray-600">
                          {docToPlainText(q.content) || QUESTION_TYPE_LABELS[q.type]}
                        </span>
                        <span
                          className={`ml-auto h-2 w-2 flex-none rounded-full ${
                            q.status === 'complete' ? 'bg-green-500' : 'bg-amber-400'
                          }`}
                          title={q.status}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                onClick={() => openCreate('multiple_choice')}
                className="mt-3 flex w-full items-center gap-2 rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:border-gray-400 hover:bg-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Tambah Soal
              </button>
            </nav>
          </aside>

          <section className="flex-1 min-w-0" aria-label="Daftar soal">
            {sortedQuestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white px-6 py-16 text-center">
                <svg
                  className="h-14 w-14 text-gray-300 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h2 className="text-lg font-semibold mb-1">Belum ada soal</h2>
                <p className="text-sm text-gray-500 mb-6 max-w-sm">
                  Tambahkan soal pertama Anda. Anda dapat membuat soal Pilihan Ganda, Benar/Salah,
                  Jawaban Singkat, dan Esai.
                </p>
                <Button onClick={() => openCreate('multiple_choice')}>
                  Tambah Soal
                </Button>
                <div className="mt-8 hidden sm:flex gap-6 text-xs text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    <kbd className="rounded border border-gray-300 px-1">Ctrl</kbd>+
                    <kbd className="rounded border border-gray-300 px-1">S</kbd> simpan
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <kbd className="rounded border border-gray-300 px-1">Ctrl</kbd>+
                    <kbd className="rounded border border-gray-300 px-1">Enter</kbd> simpan & lanjut
                  </span>
                </div>
              </div>
            ) : (
              <ul
                className="space-y-3"
                onDragOver={(e) => {
                  if (dragging) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragOverIndex !== null) {
                    handleDrop(dragOverIndex);
                  } else if (dragIndex !== null) {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }
                }}
              >
                {sortedQuestions.map((q, index) => {
                  const preview = docToPlainText(q.content);
                  const isDeleting = deletingId === q.id;
                  const isDuplicating = duplicatingId === q.id;
                  return (
                    <li
                      key={q.id}
                      draggable
                      onDragStart={(e) => {
                        setDragIndex(index);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(q.id));
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setDragOverIndex(null);
                      }}
                      onDragOver={(e) => {
                        if (dragIndex === null) return;
                        e.preventDefault();
                        if (dragOverIndex !== index) setDragOverIndex(index);
                      }}
                      onDragLeave={() => {
                        if (dragOverIndex === index) setDragOverIndex(null);
                      }}
                      className={`group relative flex items-start gap-3 rounded-lg border bg-white p-4 transition-shadow ${
                        dragIndex === index
                          ? 'opacity-50 border-blue-400'
                          : dragOverIndex === index
                            ? 'border-blue-400 ring-2 ring-blue-100'
                            : 'hover:shadow-md'
                      } ${dragging && dragIndex !== index ? 'cursor-grabbing' : ''}`}
                    >
                      <button
                        className="flex-none mt-0.5 cursor-grab text-gray-300 hover:text-gray-500"
                        aria-label={`Seret untuk mengurutkan soal ${index + 1}`}
                      >
                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M7 2a2 2 0 11-4 0 2 2 0 014 0zM7 18a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0zM17 2a2 2 0 11-4 0 2 2 0 014 0zM17 18a2 2 0 11-4 0 2 2 0 014 0zM17 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </button>

                      <button
                        onClick={() => openEdit(q)}
                        className="flex-1 min-w-0 text-left"
                        aria-label={`Edit soal ${index + 1}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                            {index + 1}
                          </span>
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            {QUESTION_TYPE_LABELS[q.type]}
                          </span>
                          {q.status === 'complete' && (
                            <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                              Lengkap
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-800 line-clamp-2">
                          {preview || <span className="italic text-gray-400">Soal tanpa judul</span>}
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                          Bobot: {q.default_mark}
                          {typeof q.sort_order === 'number' && (
                            <span className="ml-2">· {q.options?.length ?? 0} pilihan</span>
                          )}
                        </p>
                      </button>

                      <div className="flex flex-none items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(q)}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          aria-label={`Edit soal ${index + 1}`}
                          title="Edit"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => void handleDuplicate(q)}
                          disabled={isDuplicating}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                          aria-label={`Duplikat soal ${index + 1}`}
                          title="Duplikat"
                        >
                          {isDuplicating ? (
                            <span className="text-xs text-gray-500">Menduplikasi…</span>
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(q.id)}
                          disabled={isDeleting}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          aria-label={`Hapus soal ${index + 1}`}
                          title="Hapus"
                        >
                          {isDeleting ? (
                            <span className="text-xs text-gray-500">Menghapus…</span>
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {sortedQuestions.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => openCreate('multiple_choice')}
                className="mt-4 flex w-full items-center justify-center gap-2 border-dashed px-4 py-3 text-gray-600 hover:border-gray-400 hover:bg-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Tambah Soal
              </Button>
            )}
          </section>
        </div>
      </main>

      {editorOpen && (
        <QuestionEditor
          quizId={quizId}
          question={editingQuestion}
          defaultType={defaultType}
          onClose={() => {
            setEditorOpen(false);
            setEditingQuestion(null);
          }}
          onSave={handleSave}
          onAutoSaved={(autosaved) =>
            setQuestionsList((prev) =>
              prev.map((q) => (q.id === autosaved.id ? autosaved : q))
            )
          }
        />
      )}

      {pickerOpen && (
        <BankPickerDialog
          quizId={quizId}
          existingIds={sortedQuestions.map((q) => q.id)}
          onCancel={() => setPickerOpen(false)}
          onAttached={handlePicked}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title="Hapus soal dari kuis?"
          message={<p>Soal tetap tersimpan di Bank Soal dan hanya dilepas dari kuis ini.</p>}
          confirmLabel="Hapus"
          onConfirm={() => void handleDelete(deleteTarget)}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  );
}
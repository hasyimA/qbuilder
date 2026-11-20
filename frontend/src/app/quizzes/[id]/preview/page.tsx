'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { quizzes, questions, media, resolveApiUrl, schoolSettings } from '@/lib/api';
import type { Quiz, SchoolSettings } from '@/lib/api';
import type { Question } from '@/lib/types';
import { docToPlainText } from '@/lib/content';
import QuestionPreview from '@/components/question-editor/question-preview';
import type { PreviewOption } from '@/components/question-editor/question-preview';
import { ExportValidationErrorList, formatExportErrors } from '@/lib/export';
import { exportQuizMoodle } from '@/lib/export/export-quiz';
import { Badge, Button, Card, Notice, Spinner, buttonClassNames, surfaceClass } from '@/components/ui';
import { AppShell } from '@/components/layout';
import MoodleImportDialog from '@/components/moodle/moodle-import-dialog';
import WordExportDialog from '@/components/export/word-export-dialog';
import { usePageTitle } from '@/hooks/use-page-title';
import { ArrowLeft, Download, FileText, Pencil, Printer, UploadCloud } from 'lucide-react';

const TYPE_SHORT: Record<Question['type'], string> = {
  multiple_choice: 'Pilihan Ganda',
  true_false: 'Benar / Salah',
  short_answer: 'Isian Singkat',
  essay: 'Esai',
  matching: 'Menjodohkan',
};

function summarizeKey(q: Question): string {
  if (q.type === 'multiple_choice') {
    const correctIndices: number[] = [];
    q.options.forEach((o, i) => {
      if (o.is_correct) correctIndices.push(i);
    });
    const letters = correctIndices.map((i) => String.fromCharCode(65 + i)).join(', ');
    if (correctIndices.length > 1) {
      const wrongCount = q.options.length - correctIndices.length;
      const pos = Number((100 / correctIndices.length).toFixed(2));
      const neg = wrongCount > 0 ? Number((100 / wrongCount).toFixed(2)) : 0;
      return wrongCount > 0 ? `${letters} (+${pos}% / -${neg}%)` : `${letters} (+${pos}%)`;
    }
    return letters || '-';
  }
  if (q.type === 'true_false') {
    const trueOpt = q.options.find((o) => docToPlainText(o.content).trim().toLowerCase() === 'true');
    return trueOpt?.is_correct ? 'Benar' : 'Salah';
  }
  if (q.type === 'short_answer') {
    return q.options.map((o) => docToPlainText(o.content).trim()).filter(Boolean).join(' / ') || '-';
  }
  if (q.type === 'matching') {
    return q.options.map((o, i) => `${i + 1} → ${o.match_answer || '-'}`).join('; ');
  }
  return 'Lihat Pedoman';
}

export default function QuizPreviewPage() {
  usePageTitle('Pratinjau Kuis — Quiz Builder');
  const params = useParams();
  const router = useRouter();
  const quizId = Number(params.id);

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questionList, setQuestionList] = useState<Question[] | null>(null);
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [printMode, setPrintMode] = useState<'student' | 'teacher'>('teacher');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [wordOpen, setWordOpen] = useState(false);
  const [ownedQuiz, setOwnedQuiz] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    let active = true;
    Promise.all([
      quizzes.get(quizId),
      questions.list(quizId),
      schoolSettings.get().catch(() => ({ data: null })),
    ])
      .then(([quizResponse, questionResponse, schoolResponse]) => {
        if (!active) return;

        let userId: number | null = null;
        try {
          const raw = localStorage.getItem('user');
          if (raw) userId = (JSON.parse(raw) as { id?: number }).id ?? null;
        } catch {
          userId = null;
        }

        setQuiz(quizResponse.data);
        setQuestionList(questionResponse.data);
        if (schoolResponse.data) setSchool(schoolResponse.data);
        setOwnedQuiz(
          quizResponse.data.owner?.id != null && quizResponse.data.owner.id === userId
        );
      })
      .catch((err: unknown) => {
        if (!active) return;
        const apiErr = err as { status?: number };
        if (apiErr.status === 401) {
          localStorage.removeItem('token');
          router.push('/login');
        } else if (apiErr.status === 403) {
          setError('Anda tidak memiliki akses ke kuis ini.');
        } else {
          setError('Gagal memuat kuis.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [quizId, router]);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await exportQuizMoodle(quizId);
    } catch (err) {
      if (err instanceof ExportValidationErrorList) {
        setExportError(formatExportErrors(err.errors));
      } else {
        const reason = err instanceof Error ? err.message : 'Terjadi kesalahan saat ekspor.';
        setExportError(`Ekspor gagal: ${reason}`);
      }
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex justify-center py-24">
          <Spinner label="Memuat pratinjau…" />
        </div>
      </AppShell>
    );
  }

  if (error || !quiz || !questionList) {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto py-16 space-y-4">
          <Notice tone="error">{error ?? 'Kuis tidak ditemukan.'}</Notice>
          <Link href="/" className={buttonClassNames('secondary', 'sm')}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Kembali ke Perpustakaan Kuis
          </Link>
        </div>
      </AppShell>
    );
  }

  const totalMark = questionList.reduce(
    (sum, question) => sum + (Number(question.default_mark) || 0),
    0
  );

  return (
    <AppShell>
      <header className={`${surfaceClass('px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3 mb-6')} print:hidden`}>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Kembali ke Perpustakaan Kuis
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 text-xs" role="group" aria-label="Mode Pratinjau">
            <button
              type="button"
              onClick={() => setPrintMode('teacher')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                printMode === 'teacher' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Administrasi + Kunci
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('student')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                printMode === 'student' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Versi Siswa
            </button>
          </div>
          {ownedQuiz && (
            <Link
              href={`/quizzes/${quizId}/builder`}
              data-testid="preview-edit-quiz"
              className={buttonClassNames('secondary', 'sm')}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit Soal
            </Link>
          )}
          <Button
            data-testid="preview-print-pdf"
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Cetak / PDF
          </Button>
          <Button
            data-testid="preview-word-export"
            variant="secondary"
            size="sm"
            onClick={() => setWordOpen(true)}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Word (.docx)
          </Button>
          <Button
            data-testid="preview-export"
            variant="secondary"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {exporting ? 'Mengekspor…' : 'Moodle XML'}
          </Button>
          <Button
            data-testid="preview-moodle-import"
            variant="primary"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <UploadCloud className="h-4 w-4" aria-hidden="true" />
            Import ke Moodle
          </Button>
        </div>
      </header>

      <div className="space-y-6">
        {school && (
          <div className="rounded-lg border border-gray-300 bg-white p-5 text-center print:border-0 print:p-0 print:mb-4">
            {school.school_subtitle && (
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                {school.school_subtitle}
              </p>
            )}
            <p className="text-lg font-bold uppercase text-gray-900">{school.school_name}</p>
            {school.school_address && (
              <p className="text-xs text-gray-500">{school.school_address}</p>
            )}
            <div className="mt-2 border-t-2 border-gray-900 pt-2 text-xs font-semibold uppercase text-gray-800">
              {school.default_exam_title || quiz.title} — TA {school.academic_year} (Semester {school.semester})
            </div>
          </div>
        )}

        <Card data-testid="preview-header" className="print:shadow-none print:border-gray-300">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{quiz.title}</h1>
              {quiz.description && (
                <p className="text-gray-600 mt-2">{quiz.description}</p>
              )}
            </div>
            <div className="text-right text-sm text-gray-500">
              <p>{questionList.length} soal</p>
              <p>Total nilai {formatMark(totalMark)}</p>
              {quiz.owner && <p>Oleh {quiz.owner.name}</p>}
            </div>
          </div>
          {(quiz.subject || quiz.grade_level || quiz.category) && (
            <div className="flex flex-wrap gap-2 mt-4">
              {quiz.subject && <Badge tone="gray">{quiz.subject}</Badge>}
              {quiz.grade_level && <Badge tone="gray">Kelas {quiz.grade_level}</Badge>}
              {quiz.category && <Badge tone="gray">{quiz.category}</Badge>}
            </div>
          )}
        </Card>

        {exportError && (
          <div className="print:hidden">
            <Notice tone="error" onDismiss={() => setExportError(null)}>
              <span className="whitespace-pre-line">{exportError}</span>
            </Notice>
          </div>
        )}

        <ol className="space-y-6">
          {questionList.map((question, index) => (
            <li
              key={question.id}
              data-testid={`preview-question-${index + 1}`}
              className={`${surfaceClass('p-6')} print-avoid-break print:shadow-none print:border-gray-300 print:p-4`}
            >
              <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                <span className="font-semibold text-gray-900">
                  Soal {index + 1} · {TYPE_SHORT[question.type]}
                </span>
                <span>{formatMark(Number(question.default_mark) || 0)} poin</span>
              </div>
              <QuestionPreview
                type={question.type}
                questionContent={question.content}
                defaultMark={String(question.default_mark ?? '1')}
                options={toPreviewOptions(question)}
                mode={printMode}
                resolveMediaUrl={resolveMediaUrl}
              />
            </li>
          ))}
        </ol>

        {printMode === 'teacher' && (
          <section className="print-page-break rounded-lg border border-gray-300 bg-white p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 text-center uppercase">
              Kunci Jawaban &amp; Pedoman Penskoran
            </h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="border border-gray-300 px-3 py-2 w-12">No</th>
                  <th className="border border-gray-300 px-3 py-2 w-36">Tipe</th>
                  <th className="border border-gray-300 px-3 py-2">Kunci Jawaban</th>
                  <th className="border border-gray-300 px-3 py-2 w-20">Bobot</th>
                </tr>
              </thead>
              <tbody>
                {questionList.map((q, idx) => (
                  <tr key={q.id}>
                    <td className="border border-gray-300 px-3 py-1.5">{idx + 1}</td>
                    <td className="border border-gray-300 px-3 py-1.5">
                      {q.type === 'multiple_choice' && q.options.filter((o) => o.is_correct).length > 1
                        ? 'PG Kompleks'
                        : TYPE_SHORT[q.type]}
                    </td>
                    <td className="border border-gray-300 px-3 py-1.5">{summarizeKey(q)}</td>
                    <td className="border border-gray-300 px-3 py-1.5">{formatMark(Number(q.default_mark) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {school && (
              <div className="grid grid-cols-2 gap-8 pt-8 text-center text-sm">
                <div>
                  <p>Mengetahui,</p>
                  <p>Kepala Sekolah / Wakakur</p>
                  <div className="h-16" />
                  <p className="font-semibold underline">{school.principal_name || '_________________________'}</p>
                  {school.principal_nip && <p className="text-xs text-gray-600">NIP. {school.principal_nip}</p>}
                </div>
                <div>
                  <p>&nbsp;</p>
                  <p>Guru Mata Pelajaran</p>
                  <div className="h-16" />
                  <p className="font-semibold underline">{quiz.owner?.name || '_________________________'}</p>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {importOpen && (
        <MoodleImportDialog
          quiz={{ id: quiz.id, title: quiz.title }}
          onClose={() => setImportOpen(false)}
        />
      )}

      {wordOpen && (
        <WordExportDialog
          quiz={{ id: quiz.id, title: quiz.title }}
          onClose={() => setWordOpen(false)}
        />
      )}
    </AppShell>
  );
}

async function resolveMediaUrl(mediaId: number): Promise<string> {
  const response = await media.get(mediaId);
  return resolveApiUrl(response.data.url);
}

function toPreviewOptions(question: Question): PreviewOption[] {
  return question.options.map((option, index) => ({
    key: String.fromCharCode(65 + index),
    text: docToPlainText(option.content),
    is_correct: option.is_correct,
  }));
}

function formatMark(mark: number): string {
  const rounded = Math.round(mark * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

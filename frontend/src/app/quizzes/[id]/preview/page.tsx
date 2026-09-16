'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { quizzes, questions, media, resolveApiUrl } from '@/lib/api';
import type { Quiz } from '@/lib/api';
import type { Question } from '@/lib/types';
import { docToPlainText } from '@/lib/content';
import QuestionPreview from '@/components/question-editor/question-preview';
import type { PreviewOption } from '@/components/question-editor/question-preview';
import { ExportValidationErrorList, formatExportErrors } from '@/lib/export';
import { exportQuizMoodle } from '@/lib/export/export-quiz';
import { Badge, Button, Card, Notice, Spinner, buttonClassNames } from '@/components/ui';
import { usePageTitle } from '@/hooks/use-page-title';

const TYPE_SHORT: Record<Question['type'], string> = {
  multiple_choice: 'Pilihan Ganda',
  true_false: 'Benar / Salah',
  short_answer: 'Isian Singkat',
  essay: 'Esai',
};

export default function QuizPreviewPage() {
  usePageTitle('Pratinjau Kuis — Quiz Builder');
  const params = useParams();
  const router = useRouter();
  const quizId = Number(params.id);

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questionList, setQuestionList] = useState<Question[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [ownedQuiz, setOwnedQuiz] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    let active = true;
    Promise.all([quizzes.get(quizId), questions.list(quizId)])
      .then(([quizResponse, questionResponse]) => {
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner label="Memuat…" />
      </div>
    );
  }

  if (error || !quiz || !questionList) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">{error ?? 'Kuis tidak ditemukan.'}</p>
          <Link href="/" className="text-blue-600 hover:text-blue-800">
            Kembali ke perpustakaan
          </Link>
        </div>
      </div>
    );
  }

  const totalMark = questionList.reduce(
    (sum, question) => sum + (Number(question.default_mark) || 0),
    0
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
            ← Kembali ke Perpustakaan Kuis
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {ownedQuiz && (
              <Link
                href={`/quizzes/${quizId}/builder`}
                data-testid="preview-edit-quiz"
                className={buttonClassNames('secondary', 'sm')}
              >
                Edit Soal
              </Link>
            )}
            <Button
              data-testid="preview-export"
              variant="primary"
              size="sm"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? 'Mengekspor…' : 'Ekspor Moodle XML'}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <Card data-testid="preview-header">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{quiz.title}</h1>
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
          <div data-testid="preview-export-error">
            <Notice tone="error">{exportError}</Notice>
          </div>
        )}

        <ol data-testid="preview-questions" className="space-y-6">
          {questionList.map((question, index) => (
            <li key={question.id} className="bg-white rounded-lg border p-6">
              <div className="mb-3 flex items-center justify-between text-sm text-gray-500">
                <span className="font-medium text-gray-700">Soal {index + 1}</span>
                <span>{TYPE_SHORT[question.type]}</span>
              </div>
              <QuestionPreview
                type={question.type}
                questionContent={question.content}
                defaultMark={String(question.default_mark)}
                options={toPreviewOptions(question)}
                mode="student"
                resolveMediaUrl={resolveMediaUrl}
              />
            </li>
          ))}
        </ol>
      </main>
    </div>
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
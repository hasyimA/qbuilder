'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { questions } from '@/lib/api';
import type { Question, QuestionPayload } from '@/lib/types';
import { docToPlainText } from '@/lib/content';
import QuestionEditor from '@/components/question-editor';
import BankMetadataPanel from '@/components/question-bank/bank-metadata-panel';
import { Notice, Spinner, surfaceClass } from '@/components/ui';
import { AppShell } from '@/components/layout';
import { usePageTitle } from '@/hooks/use-page-title';
import { ArrowLeft, FilePlus2 } from 'lucide-react';

export default function EditBankQuestionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const questionId = Number(params.id);

  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [status, setStatus] = useState<'draft' | 'complete'>('draft');

  const [saveError, setSaveError] = useState<string | null>(null);

  usePageTitle('Edit Soal — Quiz Builder');

  useEffect(() => {
    let active = true;

    (async () => {
      if (!localStorage.getItem('token')) {
        router.replace('/login');
        return;
      }
      if (!questionId) return;
      try {
        const response = await questions.get(questionId);
        if (!active) return;
        setQuestion(response.data);
        setCategory(response.data.category ?? '');
        setDifficulty(response.data.difficulty ?? '');
        setTagsText((response.data.tags ?? []).map((tag) => tag.name).join(', '));
        setStatus(response.data.status);
      } catch (err: unknown) {
        const apiErr = err as { status?: number };
        if (apiErr.status === 401) {
          localStorage.removeItem('token');
          router.replace('/login');
        } else if (apiErr.status === 404) {
          setNotFound(true);
        } else if (apiErr.status === 403) {
          setForbidden(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [questionId, router]);

  function handleAutoSaved(updated: Question) {
    setQuestion(updated);
  }

  async function handleSave(data: QuestionPayload, addAnother: boolean) {
    setSaveError(null);
    try {
      const payload: QuestionPayload = {
        ...data,
        status,
        category: category.trim() || null,
        difficulty: difficulty || null,
        tags: parseTags(tagsText),
      };
      const result = await questions.update(questionId, payload);
      if (!addAnother) {
        router.push('/bank');
      }
      return result.data;
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      throw new Error(apiErr.message || 'Gagal menyimpan perubahan.');
    }
  }

  if (notFound) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <p className="text-gray-600">Soal tidak ditemukan.</p>
          <Link href="/bank" className="text-blue-600 hover:text-blue-800">
            Kembali ke Bank Soal
          </Link>
        </div>
      </AppShell>
    );
  }

  if (forbidden) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <p className="text-gray-600">Anda tidak memiliki akses ke soal ini.</p>
          <Link href="/bank" className="text-blue-600 hover:text-blue-800">
            Kembali ke Bank Soal
          </Link>
        </div>
      </AppShell>
    );
  }

  if (loading || !question) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24">
          <Spinner label="Memuat soal…" />
        </div>
      </AppShell>
    );
  }

  const usedInCount = question.used_in_count ?? 0;

  return (
    <AppShell>
      <header className={surfaceClass('px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-3 mb-5')}>
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/bank" className="text-gray-400 hover:text-gray-700 flex-none transition-colors" aria-label="Kembali ke bank soal">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900">Edit Soal</h1>
            <p className="text-xs text-gray-500 truncate">{docToPlainText(question.content)}</p>
          </div>
        </div>
        {usedInCount > 0 && (
          <span
            data-testid={`bank-edit-used-${question.id}`}
            className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-200 shrink-0"
          >
            Dipakai di {usedInCount} kuis
          </span>
        )}
      </header>

      <div>
        {saveError && (
          <div data-testid="bank-editor-error" className="mb-5">
            <Notice tone="error" onDismiss={() => setSaveError(null)}>{saveError}</Notice>
          </div>
        )}
        <div className="lg:grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <QuestionEditor
              quizId={0}
              question={question}
              defaultType={question.type}
              onClose={() => router.push('/bank')}
              onSave={handleSave}
              onAutoSaved={handleAutoSaved}
            />
          </div>
          <aside className="mt-6 lg:mt-0">
            <div className={surfaceClass('p-4')}>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <FilePlus2 className="h-4 w-4 text-gray-400" aria-hidden="true" />
                Properti Soal
              </h2>
              <BankMetadataPanel
                category={category}
                onCategoryChange={setCategory}
                difficulty={difficulty}
                onDifficultyChange={setDifficulty}
                tagsText={tagsText}
                onTagsTextChange={setTagsText}
                status={status}
                onStatusChange={setStatus}
              />
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function parseTags(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}
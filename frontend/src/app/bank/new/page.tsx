'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { questions } from '@/lib/api';
import type { Question, QuestionPayload, QuestionType } from '@/lib/types';
import QuestionEditor from '@/components/question-editor';
import QuestionTypeDialog from '@/components/question-editor/question-type-dialog';
import BankMetadataPanel from '@/components/question-bank/bank-metadata-panel';
import { Button, Notice, Spinner } from '@/components/ui';
import { usePageTitle } from '@/hooks/use-page-title';

export default function NewBankQuestionPage() {
  const router = useRouter();

  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [status, setStatus] = useState<'draft' | 'complete'>('draft');

  const [type, setType] = useState<QuestionType | null>(null);
  const [typeDialogOpen, setTypeDialogOpen] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  usePageTitle('Buat Soal Baru — Quiz Builder');

  useEffect(() => {
    (async () => {
      if (!localStorage.getItem('token')) {
        router.replace('/login');
        return;
      }
      await Promise.resolve();
      setAuthChecked(true);
    })();
  }, [router]);

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
      const result = await questions.bank.create(payload);
      if (!addAnother) {
        router.push('/bank');
      }
      return result.data as Question;
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      throw new Error(apiErr.message || 'Gagal menyimpan soal.');
    }
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner label="Memuat…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/bank" className="text-gray-500 hover:text-gray-800">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-lg font-bold">Buat Soal Baru</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {saveError && (
          <div data-testid="bank-editor-error" className="mb-5">
            <Notice tone="error" onDismiss={() => setSaveError(null)}>{saveError}</Notice>
          </div>
        )}
        <div className="lg:grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {type ? (
              <QuestionEditor
                quizId={0}
                question={null}
                defaultType={type}
                onClose={() => router.push('/bank')}
                onSave={handleSave}
              />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white px-6 py-16 text-center">
                <h2 className="text-lg font-semibold mb-1">Pilih Jenis Soal</h2>
                <p className="text-sm text-gray-500 mb-6 max-w-sm">
                  Pilih jenis soal terlebih dahulu agar editor menyesuaikan.
                </p>
                <Button
                  data-testid="bank-choose-type"
                  onClick={() => setTypeDialogOpen(true)}
                >
                  Pilih Jenis Soal
                </Button>
              </div>
            )}
          </div>
          <aside className="mt-6 lg:mt-0">
            <div className="rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Properti Soal</h2>
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
      </main>

      {typeDialogOpen && (
        <QuestionTypeDialog
          onCancel={() => setTypeDialogOpen(false)}
          onSelect={(selected) => {
            setType(selected);
            setTypeDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}

function parseTags(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}
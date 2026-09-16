'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { questions } from '@/lib/api';
import type { Question, QuestionPayload, QuestionType } from '@/lib/types';
import QuestionEditor from '@/components/question-editor';
import QuestionTypeDialog from '@/components/question-editor/question-type-dialog';
import BankMetadataPanel from '@/components/question-bank/bank-metadata-panel';
import { Button, Notice, Spinner, surfaceClass } from '@/components/ui';
import { AppShell } from '@/components/layout';
import { usePageTitle } from '@/hooks/use-page-title';
import { ArrowLeft, FilePlus2 } from 'lucide-react';

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
      <AppShell>
        <div className="flex items-center justify-center py-24">
          <Spinner label="Memuat…" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className={surfaceClass('px-4 sm:px-5 py-4 flex flex-wrap items-center gap-3 mb-5')}>
        <Link href="/bank" className="text-gray-400 hover:text-gray-700 flex-none transition-colors" aria-label="Kembali ke bank soal">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-gray-900">Buat Soal Baru</h1>
      </header>

      <div>
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

      {typeDialogOpen && (
        <QuestionTypeDialog
          onCancel={() => setTypeDialogOpen(false)}
          onSelect={(selected) => {
            setType(selected);
            setTypeDialogOpen(false);
          }}
        />
      )}
    </AppShell>
  );
}

function parseTags(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}
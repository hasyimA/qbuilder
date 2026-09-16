'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { quizzes } from '@/lib/api';
import { Button, Card, Input, Notice, Spinner, Textarea, buttonClassNames, surfaceClass } from '@/components/ui';
import { AppShell } from '@/components/layout';
import { usePageTitle } from '@/hooks/use-page-title';
import { ArrowLeft, Save } from 'lucide-react';

interface Quiz {
  id: number;
  title: string;
  description: string | null;
  subject: string | null;
  grade_level: string | null;
  category: string | null;
  status: string;
  visibility: string;
  questions_count: number;
}

export default function EditQuizPage() {
  usePageTitle('Pengaturan Kuis — Quiz Builder');
  const router = useRouter();
  const params = useParams();
  const quizId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    let active = true;
    quizzes
      .get(quizId)
      .then((response) => {
        if (!active) return;
        const q = response.data;
        setQuiz(q);
        setTitle(q.title);
        setDescription(q.description || '');
        setSubject(q.subject || '');
        setGradeLevel(q.grade_level || '');
        setCategory(q.category || '');
      })
      .catch((err: unknown) => {
        const apiErr = err as { status?: number };
        if (apiErr.status === 401) {
          localStorage.removeItem('token');
          router.push('/login');
        } else if (active) {
          setError('Gagal memuat kuis');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [router, quizId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      await quizzes.update(quizId, {
        title,
        description: description || undefined,
        subject: subject || undefined,
        grade_level: gradeLevel || undefined,
        category: category || undefined,
      });
      router.push('/');
    } catch (err: unknown) {
      const apiErr = err as { errors?: Record<string, string[]>; message?: string };
      if (apiErr.errors) {
        const firstError = Object.values(apiErr.errors)[0];
        setError(firstError?.[0] || 'Validasi gagal');
      } else {
        setError(apiErr.message || 'Gagal memperbarui kuis');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24">
          <Spinner label="Memuat…" />
        </div>
      </AppShell>
    );
  }

  if (!quiz) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24">
          <p className="text-red-500">Kuis tidak ditemukan</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell size="narrow">
      <header className={surfaceClass('px-4 sm:px-5 py-4 flex flex-wrap items-center gap-4 mb-6')}>
        <Link
          href={`/quizzes/${quizId}/builder`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Kembali ke Builder
        </Link>
        <h1 className="text-lg font-bold text-gray-900">Pengaturan Kuis</h1>
      </header>

        {error && (
        <div className="mb-6">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <Card>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            id="title"
            label="Judul *"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <Textarea
            id="description"
            label="Deskripsi"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              id="subject"
              label="Mata Pelajaran"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />

            <Input
              id="gradeLevel"
              label="Tingkat Kelas"
              type="text"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
            />

            <Input
              id="category"
              label="Kategori"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>

          <div className="flex gap-4 pt-4">
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
            </Button>
            <Link href={`/quizzes/${quizId}/builder`} className={buttonClassNames('secondary')}>
              Batal
            </Link>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { quizzes } from '@/lib/api';
import { Button, Card, Input, Notice, Spinner, Textarea, buttonClassNames } from '@/components/ui';
import { usePageTitle } from '@/hooks/use-page-title';

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
      <div className="min-h-screen flex items-center justify-center">
        <Spinner label="Memuat…" />
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Kuis tidak ditemukan</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/" className="text-gray-600 hover:text-gray-800">
            ← Kembali
          </Link>
          <h1 className="text-xl font-bold">Pengaturan Kuis</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
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
                {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
              </Button>
              <Link href="/" className={buttonClassNames('secondary')}>
                Batal
              </Link>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
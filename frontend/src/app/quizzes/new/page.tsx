'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { quizzes } from '@/lib/api';
import { Button, Card, Input, Notice, Textarea, buttonClassNames } from '@/components/ui';
import { usePageTitle } from '@/hooks/use-page-title';

export default function NewQuizPage() {
  usePageTitle('Buat Kuis Baru — Quiz Builder');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await quizzes.create({
        title,
        description: description || undefined,
        subject: subject || undefined,
        grade_level: gradeLevel || undefined,
        category: category || undefined,
      });
      router.push(`/quizzes/${response.data.id}/builder`);
    } catch (err: unknown) {
      const apiErr = err as { errors?: Record<string, string[]>; message?: string };
      if (apiErr.errors) {
        const firstError = Object.values(apiErr.errors)[0];
        setError(firstError?.[0] || 'Validasi gagal');
      } else {
        setError(apiErr.message || 'Gagal membuat kuis');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/" className="text-gray-600 hover:text-gray-800">
            ← Kembali
          </Link>
          <h1 className="text-xl font-bold">Buat Kuis Baru</h1>
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
              placeholder="mis., Ujian Tengah Semester - Dasar Jaringan"
            />

            <Textarea
              id="description"
              label="Deskripsi"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Deskripsi opsional untuk kuis ini"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                id="subject"
                label="Mata Pelajaran"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="mis., Sistem Jaringan"
              />

              <Input
                id="gradeLevel"
                label="Tingkat Kelas"
                type="text"
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                placeholder="mis., X"
              />

              <Input
                id="category"
                label="Kategori"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="mis., UTS"
              />
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Membuat…' : 'Buat Kuis'}
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
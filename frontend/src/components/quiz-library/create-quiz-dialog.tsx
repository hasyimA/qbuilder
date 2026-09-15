'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { quizzes } from '@/lib/api';
import { Button, DialogSurface, Input, Notice, Textarea } from '@/components/ui';

interface CreateQuizDialogProps {
  onClose: () => void;
}

export default function CreateQuizDialog({ onClose }: CreateQuizDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [category, setCategory] = useState('');

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
    <DialogSurface
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      panelClassName="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] min-h-0 overflow-y-auto"
      ariaLabel="Buat Kuis Baru"
      dataTestid="create-quiz-dialog"
      onClose={onClose}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Buat Kuis Baru</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Beri judul dan metadata dasar — soal ditambahkan setelahnya.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        {error && (
          <Notice tone="error">{error}</Notice>
        )}

        <Input
          id="create-quiz-title"
          label="Judul *"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="mis., Ujian Tengah Semester - Dasar Jaringan"
        />

        <Textarea
          id="create-quiz-description"
          label="Deskripsi"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Deskripsi opsional untuk kuis ini"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            id="create-quiz-subject"
            label="Mata Pelajaran"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="mis., Sistem Jaringan"
          />

          <Input
            id="create-quiz-grade"
            label="Tingkat Kelas"
            type="text"
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            placeholder="mis., X"
          />

          <Input
            id="create-quiz-category"
            label="Kategori"
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="mis., UTS"
          />
        </div>

        <div className="flex gap-4 pt-2">
          <Button type="submit" disabled={loading} data-testid="create-quiz-submit">
            {loading ? 'Membuat…' : 'Buat Kuis'}
          </Button>
          <Button variant="secondary" type="button" onClick={onClose} disabled={loading}>
            Batal
          </Button>
        </div>
      </form>
    </DialogSurface>
  );
}
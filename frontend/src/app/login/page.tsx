'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/api';
import { Button, Input, Notice } from '@/components/ui';
import { AuthShell } from '@/components/layout';
import { usePageTitle } from '@/hooks/use-page-title';

export default function LoginPage() {
  usePageTitle('Masuk — Quiz Builder');
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await auth.moodleLogin(username.trim(), password);
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      router.push('/');
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string; errors?: Record<string, string[]> };
      if (apiErr.errors) {
        const firstError = Object.values(apiErr.errors)[0];
        setError(firstError?.[0] || 'Gagal masuk. Periksa kembali kredensial Anda.');
      } else {
        setError(apiErr.message || 'Gagal masuk. Periksa kembali kredensial Anda.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Masuk ke Quiz Builder"
      subtitle="Gunakan akun guru e-Learning Moodle Anda untuk membuat dan mengimpor kuis."
    >
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="mb-4 rounded-md border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-800">
        Masuk menggunakan username dan kata sandi akun <span className="font-semibold">guru</span> di{' '}
        <span className="font-semibold">e-learning.smkbinarahayu.sch.id</span>.
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="moodle-username"
          label="Username e-Learning"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoComplete="username"
          placeholder="Username guru di e-learning"
        />

        <Input
          id="password"
          label="Kata Sandi"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="••••••••"
        />

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Memverifikasi akun guru…' : 'Masuk dengan e-Learning'}
        </Button>
      </form>
    </AuthShell>
  );
}

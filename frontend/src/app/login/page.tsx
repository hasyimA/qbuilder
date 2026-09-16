'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/api';
import { Button, Input, Notice } from '@/components/ui';
import { AuthShell } from '@/components/layout';
import { usePageTitle } from '@/hooks/use-page-title';

export default function LoginPage() {
  usePageTitle('Masuk — Quiz Builder');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await auth.login(email, password);
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      router.push('/');
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string; errors?: Record<string, string[]> };
      if (apiErr.errors) {
        const firstError = Object.values(apiErr.errors)[0];
        setError(firstError?.[0] || 'Gagal masuk. Periksa email dan kata sandi Anda.');
      } else {
        setError(apiErr.message || 'Gagal masuk. Periksa email dan kata sandi Anda.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Masuk ke Quiz Builder" subtitle="Lanjutkan mengelola perpustakaan kuis dan bank soal Anda.">
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
        />

        <Input
          id="password"
          label="Kata Sandi"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="••••••••"
        />

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Masuk…' : 'Masuk'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-600">
        Belum punya akun?{' '}
        <Link href="/register" className="text-blue-600 hover:underline">
          Daftar
        </Link>
      </p>
    </AuthShell>
  );
}
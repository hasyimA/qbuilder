'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/api';
import { Button, Card, Input, Notice } from '@/components/ui';
import { usePageTitle } from '@/hooks/use-page-title';

export default function RegisterPage() {
  usePageTitle('Daftar — Quiz Builder');
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await auth.register(name, email, password, passwordConfirmation);
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      router.push('/');
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string; errors?: Record<string, string[]> };
      if (apiErr.errors) {
        const firstError = Object.values(apiErr.errors)[0];
        setError(firstError?.[0] || 'Pendaftaran gagal. Periksa kembali data Anda.');
      } else {
        setError(apiErr.message || 'Pendaftaran gagal. Periksa kembali data Anda.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card padding="none" className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-center mb-6">Daftar Akun Baru</h1>

        {error && (
          <div className="mb-4">
            <Notice tone="error">{error}</Notice>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="name"
            label="Nama"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Nama Anda"
          />

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
            minLength={8}
            placeholder="••••••••"
          />

          <Input
            id="password_confirmation"
            label="Konfirmasi Kata Sandi"
            type="password"
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
            required
            minLength={8}
            placeholder="••••••••"
          />

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Mendaftar…' : 'Daftar Akun Baru'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Sudah punya akun?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">
            Masuk
          </Link>
        </p>
      </Card>
    </div>
  );
}
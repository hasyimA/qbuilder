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
  const [method, setMethod] = useState<'moodle' | 'local'>('moodle');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response =
        method === 'moodle'
          ? await auth.moodleLogin(username.trim(), password)
          : await auth.login(email.trim(), password);

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
      subtitle="Kelola kuis dan bank soal yang terhubung dengan e-Learning."
    >
      <div className="mb-4 flex rounded-lg bg-gray-100 p-1" role="tablist" aria-label="Metode Masuk">
        <button
          type="button"
          role="tab"
          aria-selected={method === 'moodle'}
          onClick={() => {
            setMethod('moodle');
            setError('');
          }}
          className={`flex-1 rounded-md py-1.5 text-xs sm:text-sm font-medium transition-all ${
            method === 'moodle'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          e-Learning SMK
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === 'local'}
          onClick={() => {
            setMethod('local');
            setError('');
          }}
          className={`flex-1 rounded-md py-1.5 text-xs sm:text-sm font-medium transition-all ${
            method === 'local'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Email & Kata Sandi
        </button>
      </div>

      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {method === 'moodle' && (
        <div className="mb-4 rounded-md border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-800">
          Gunakan username dan kata sandi akun guru Anda di{' '}
          <span className="font-semibold">e-learning.smkbinarahayu.sch.id</span>.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {method === 'moodle' ? (
          <Input
            id="moodle-username"
            label="Username e-Learning"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            placeholder="Username di e-learning"
          />
        ) : (
          <Input
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        )}

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
          {loading
            ? 'Memverifikasi…'
            : method === 'moodle'
            ? 'Masuk dengan e-Learning'
            : 'Masuk'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-600">
        Belum punya akun mandiri?{' '}
        <Link href="/register" className="text-blue-600 hover:underline">
          Daftar
        </Link>
      </p>
    </AuthShell>
  );
}
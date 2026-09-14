'use client';

import { useEffect } from 'react';
import { Button, Notice } from '@/components/ui';

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-4">
        <Notice tone="error" title="Terjadi kesalahan">
          <p>Maaf, terjadi kesalahan tak terduga saat memuat halaman.</p>
        </Notice>
        <div className="flex justify-center">
          <Button onClick={retry}>Coba Lagi</Button>
        </div>
      </div>
    </div>
  );
}
import Link from 'next/link';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <p className="text-5xl font-bold text-gray-300">404</p>
      <h1 className="mt-4 text-xl font-semibold text-gray-900">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-sm text-gray-500">
        Halaman yang Anda cari mungkin telah dipindah atau dihapus.
      </p>
      <Link href="/">
        <Button className="mt-6">Kembali ke Beranda</Button>
      </Link>
    </div>
  );
}
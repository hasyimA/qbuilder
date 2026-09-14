'use client';

import { useState } from 'react';
import { parseOptions } from '@/lib/clipboard';

interface OptionBulkPasteProps {
  onApply: (options: string[]) => void;
  allowPlainLines?: boolean;
  disabled?: boolean;
}

export default function OptionBulkPaste({
  onApply,
  allowPlainLines = false,
  disabled = false,
}: OptionBulkPasteProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function split() {
    const parsed = parseOptions(value);
    if (parsed !== null) {
      onApply(parsed);
      setValue('');
      setOpen(false);
      setError(null);
      return;
    }

    const lines = value
      .split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (allowPlainLines && lines.length >= 2) {
      onApply(lines);
      setValue('');
      setOpen(false);
      setError(null);
      return;
    }

    setError(
      'Pola pilihan tidak terdeteksi. Gunakan baris seperti "A. Router", "B) Switch", atau "1. Hub".'
    );
  }

  return (
    <div className="mt-2">
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setError(null);
          }}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 14h6M9 18h4" />
          </svg>
          Tempel pilihan dari clipboard
        </button>
      ) : (
        <div className="space-y-2 rounded-md border border-gray-300 bg-gray-50 p-3">
          <label htmlFor="option-bulk-paste" className="block text-xs font-medium text-gray-600">
            Tempel pilihan — satu pilihan per baris, misalnya <code className="text-gray-500">A. Router</code>,{' '}
            <code className="text-gray-500">B) Switch</code>, <code className="text-gray-500">1. Hub</code>
          </label>
          <textarea
            id="option-bulk-paste"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            rows={5}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder={'A. Router\nB. Switch\nC. Hub\nD. Access Point'}
            aria-label="Tempel pilihan"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setValue('');
                setError(null);
              }}
              className="rounded-md px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={split}
              disabled={!value.trim()}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Pisahkan menjadi pilihan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
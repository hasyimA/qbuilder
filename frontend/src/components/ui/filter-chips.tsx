'use client';

import { X } from 'lucide-react';

export interface FilterChipItem {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
}

interface FilterChipsProps {
  items: FilterChipItem[];
  testidBase?: string;
}

export function FilterChips({ items, testidBase }: FilterChipsProps) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-gray-500">Filter aktif:</span>
      {items.map((item) => (
        <span
          key={item.key}
          data-testid={testidBase ? `${testidBase}-chip-${item.key}` : undefined}
          className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 py-1 pl-2.5 pr-1 text-xs text-blue-700"
        >
          <span className="font-medium">{item.label}:</span>
          <span className="truncate max-w-40">{item.value}</span>
          <button
            type="button"
            onClick={item.onRemove}
            aria-label={`Hapus filter ${item.label}`}
            className="flex h-4 w-4 flex-none items-center justify-center rounded-full text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}
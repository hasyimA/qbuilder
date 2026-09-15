'use client';

import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';

const SIZES = {
  sm: 'px-2.5 py-1.5 pr-9 text-sm',
  md: 'px-3 py-2 pr-9 text-sm',
} as const;

export const SELECT_CLASS = [
  'w-full appearance-none rounded-lg border border-gray-200 bg-white text-gray-900',
  'shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition',
  'hover:border-gray-300',
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ');

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'md';
  label?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ size = 'md', label, className, id, children, ...props }, ref) => {
    const controlId = id ?? (label ? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined);
    return (
      <div>
        {label && (
          <label htmlFor={controlId} className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            {...(controlId ? { id: controlId } : {})}
            className={`${SELECT_CLASS} ${SIZES[size]} ${className ?? ''}`}
            {...props}
          >
            {children}
          </select>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
    );
  }
);
Select.displayName = 'Select';
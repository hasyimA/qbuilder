'use client';

import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  titleAction?: ReactNode;
  padding?: 'none' | 'md';
}

export function Card({ title, titleAction, padding = 'md', className, children, ...props }: CardProps) {
  return (
    <section
      className={[
        'bg-white rounded-lg shadow-sm border border-gray-200',
        padding === 'md' ? 'p-6' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {title && (
        <div className="flex items-center justify-between gap-4 mb-5">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {titleAction}
        </div>
      )}
      {children}
    </section>
  );
}
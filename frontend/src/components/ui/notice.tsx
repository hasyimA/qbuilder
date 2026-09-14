'use client';

import { useEffect, useState, type ReactNode } from 'react';

export type NoticeTone = 'success' | 'error' | 'warning' | 'info';

const TONES: Record<NoticeTone, { box: string; icon: string }> = {
  success: {
    box: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: 'bg-emerald-500',
  },
  error: {
    box: 'bg-red-50 text-red-700 border-red-200',
    icon: 'bg-red-500',
  },
  warning: {
    box: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: 'bg-amber-500',
  },
  info: {
    box: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: 'bg-blue-500',
  },
};

const ICON_PATHS: Record<NoticeTone, string> = {
  success: 'M5 13l4 4L19 7',
  error: 'M6 6l12 12M18 6L6 18',
  warning: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  info: 'M12 8h.01M12 11v5',
};

export interface NoticeProps {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  /** Auto-dismiss after this many ms. 0 (default) keeps the notice visible. */
  autoDismissMs?: number;
  onDismiss?: () => void;
  'data-testid'?: string;
}

/**
 * Notice banner with optional auto-dismiss. Announces content to assistive
 * technology: errors via role="alert", otherwise role="status".
 */
export function Notice({
  tone = 'info',
  title,
  children,
  autoDismissMs = 0,
  onDismiss,
  'data-testid': dataTestid,
}: NoticeProps) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (autoDismissMs <= 0) return;
    const timer = setTimeout(() => {
      setHidden(true);
      onDismiss?.();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss]);

  if (hidden) return null;

  const t = TONES[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      data-testid={dataTestid}
      className={`flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm ${t.box}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 h-4 w-4 shrink-0"
      >
        <path d={ICON_PATHS[tone]} />
      </svg>
      <div className="flex-1 min-w-0">
        {title && <p className="font-medium">{title}</p>}
        <div className="min-w-0">{children}</div>
      </div>
      {(onDismiss || autoDismissMs > 0) && (
        <button
          type="button"
          onClick={() => {
            setHidden(true);
            onDismiss?.();
          }}
          aria-label="Tutup"
          className="shrink-0 rounded p-0.5 text-current opacity-60 hover:opacity-100"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
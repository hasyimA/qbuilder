'use client';

import type { ReactNode } from 'react';
import { DialogSurface } from './dialog';
import { Button } from './button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible confirmation dialog replacing native window.confirm().
 * Focus is trapped, body scroll is locked, Escape/background click cancel.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Batal',
  tone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <DialogSurface
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      panelClassName="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      ariaLabel={title}
      onClose={onCancel}
    >
      <div className="text-center">
        <div
          className={
            tone === 'danger'
              ? 'mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50'
              : 'mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50'
          }
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={
              tone === 'danger' ? 'h-6 w-6 text-red-600' : 'h-6 w-6 text-blue-600'
            }
          >
            {tone === 'danger' ? (
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            ) : (
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            )}
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">{title}</h2>
        <div className="mt-2 text-sm text-gray-600">{message}</div>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="secondary" onClick={onCancel} autoFocus>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} data-testid="confirm-dialog-confirm">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </DialogSurface>
  );
}
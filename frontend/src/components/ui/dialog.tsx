'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusables(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

interface FocusTrapOptions {
  /** Focus the first focusable element on open. Default true. */
  autofocus?: boolean;
  /** Restore focus to the previously focused element on unmount. Default true. */
  restore?: boolean;
}

/**
 * Traps Tab navigation inside `containerRef`, optionally moving initial
 * focus inside and restoring it to the trigger on unmount. Escape is NOT
 * handled here (each dialog decides its own close behavior).
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, options: FocusTrapOptions = {}) {
  const { autofocus = true, restore = true } = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (autofocus) {
      const first = getFocusables(container)[0];
      (first ?? container).focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusables = getFocusables(container);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (restore) previouslyFocused?.focus?.();
    };
  }, [containerRef, autofocus, restore]);
}

interface DialogSurfaceProps {
  titleId?: string;
  ariaLabel?: string;
  role?: 'dialog' | 'alertdialog';
  onClose?: () => void;
  /** Focus the first focusable element inside the dialog on open. Default true. */
  autofocus?: boolean;
  className?: string;
  panelClassName?: string;
  dataTestid?: string;
  children: ReactNode;
}

/**
 * Accessible modal shell: keyboard focus is trapped inside the dialog,
 * Escape closes it (when `onClose` is provided), the first focusable element
 * receives initial focus, and focus returns to the trigger on unmount.
 */
export function DialogSurface({
  titleId,
  ariaLabel,
  role = 'dialog',
  onClose,
  autofocus = true,
  className,
  panelClassName,
  dataTestid,
  children,
}: DialogSurfaceProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(panelRef, { autofocus });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!onClose) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className={className}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-label={ariaLabel}
      data-testid={dataTestid}
    >
      <div ref={panelRef} className={panelClassName}>
        {children}
      </div>
    </div>
  );
}
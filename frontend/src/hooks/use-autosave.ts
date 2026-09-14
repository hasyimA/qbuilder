import { useCallback, useEffect, useRef, useState } from 'react';

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'failed' | 'conflict';

export type AutosaveErrorKind = 'conflict' | 'soft' | 'hard';

export interface UseAutosaveOptions<T> {
  enabled: boolean;
  isDirty: boolean;
  save: () => Promise<T>;
  onSaved?: (value: T) => void;
  classifyError?: (err: unknown) => AutosaveErrorKind;
  debounceMs?: number;
  retryDelayMs?: number;
  maxRetries?: number;
}

export interface UseAutosaveResult<T> {
  status: AutosaveStatus;
  failureMessage: string | null;
  conflict: T | null;
  saveNow: () => void;
  clearFailure: () => void;
  clearConflict: () => void;
  reset: () => void;
}

function defaultClassify(err: unknown): AutosaveErrorKind {
  const status = (err as { status?: number })?.status;
  if (status === 409) return 'conflict';
  return 'hard';
}

export const AUTOSAVE_DEBOUNCE_MS = 1200;
export const AUTOSAVE_RETRY_MS = 5000;
export const AUTOSAVE_MAX_RETRIES = 5;

/**
 * Debounced background saver.
 *
 * Scheduling is driven by dirty-entry transitions, not by status changes:
 * - entering a dirty state arms the debounce timer exactly once,
 * - timer-fired runs only save while still dirty,
 * - a successful run re-arms a trailing debounce if the form stayed dirty,
 * - hard/soft failures arm a retry (`retryDelayMs`, hard up to `maxRetries`),
 * - a 409 conflict stops all retries until the caller resolves it.
 * Status changes (e.g. the `pending` pill) never re-arm the timer.
 */
export function useAutosave<T>({
  enabled,
  isDirty,
  save,
  onSaved,
  classifyError = defaultClassify,
  debounceMs = AUTOSAVE_DEBOUNCE_MS,
  retryDelayMs = AUTOSAVE_RETRY_MS,
  maxRetries = AUTOSAVE_MAX_RETRIES,
}: UseAutosaveOptions<T>): UseAutosaveResult<T> {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState<T | null>(null);

  const retryCountRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDirtyRef = useRef(isDirty);

  const latest = useRef({
    enabled,
    isDirty,
    save,
    onSaved,
    classifyError,
    debounceMs,
    retryDelayMs,
    maxRetries,
  });
  latest.current = { enabled, isDirty, save, onSaved, classifyError, debounceMs, retryDelayMs, maxRetries };

  function cancelDebounce(): void {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }

  function cancelRetry(): void {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  function armDebounce(): void {
    if (debounceTimerRef.current || latest.current.debounceMs <= 0) return;
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void doSave();
    }, latest.current.debounceMs);
  }

  function armRetry(counted: boolean): void {
    if (counted && retryCountRef.current > latest.current.maxRetries) return;
    if (latest.current.retryDelayMs <= 0) return;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void run(true);
    }, latest.current.retryDelayMs);
  }

  async function run(fromTimer: boolean): Promise<void> {
    if (!latest.current.enabled) return;
    if (fromTimer && !latest.current.isDirty) return;

    cancelDebounce();
    cancelRetry();
    setFailureMessage(null);
    setStatus('saving');
    try {
      const value = await latest.current.save();
      retryCountRef.current = 0;
      setStatus('saved');
      latest.current.onSaved?.(value);
      if (latest.current.isDirty) armDebounce();
    } catch (err) {
      const kind = latest.current.classifyError(err);
      if (kind === 'conflict') {
        setStatus('conflict');
        setConflict(err as T);
        return;
      }
      if (kind === 'soft') {
        setStatus('pending');
        setFailureMessage(null);
        armRetry(false);
        return;
      }
      retryCountRef.current += 1;
      setStatus('failed');
      setFailureMessage(err instanceof Error ? err.message : 'Save failed.');
      armRetry(true);
    }
  }

  // `run` reads fresh options through `latest.current`, so capturing it once
  // keeps `doSave` (and therefore the scheduling effect) stable.
  const doSave = useCallback(() => {
    void run(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) return;

    if (!isDirty) {
      cancelDebounce();
      cancelRetry();
      retryCountRef.current = 0;
      if (status !== 'idle' && status !== 'saved' && status !== 'conflict') {
        queueMicrotask(() => {
          setStatus((current) => (current === 'saving' ? current : 'idle'));
          setFailureMessage(null);
        });
      }
      prevDirtyRef.current = false;
      return;
    }

    if (status === 'saving' || status === 'conflict' || status === 'failed') {
      prevDirtyRef.current = true;
      return;
    }

    if (!prevDirtyRef.current) {
      prevDirtyRef.current = true;
      if (status !== 'pending') {
        queueMicrotask(() => {
          setStatus((current) =>
            current === 'saving' || current === 'conflict' || current === 'failed'
              ? current
              : 'pending'
          );
        });
      }
    }

    if (retryTimerRef.current) return;
    armDebounce();
    // `armDebounce` reads option refs, so a per-render identity change is safe.
  }, [enabled, isDirty, status, debounceMs, doSave]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      debounceTimerRef.current = null;
      retryTimerRef.current = null;
    };
  }, []);

  const saveNow = useCallback(() => {
    void run(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clearFailure = useCallback(() => {
    setFailureMessage(null);
    setStatus(latest.current.enabled ? 'pending' : 'idle');
  }, []);

  const clearConflict = useCallback(() => {
    setConflict(null);
    if (status === 'conflict') {
      setStatus(isDirty ? 'pending' : 'idle');
    }
  }, [isDirty, status]);

  const reset = useCallback(() => {
    cancelDebounce();
    cancelRetry();
    retryCountRef.current = 0;
    setConflict(null);
    setFailureMessage(null);
    setStatus('idle');
  }, []);

  return { status, failureMessage, conflict, saveNow, clearFailure, clearConflict, reset };
}
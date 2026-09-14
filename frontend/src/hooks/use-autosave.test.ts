import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutosave, type UseAutosaveOptions } from '@/hooks/use-autosave';

type AutosaveOptionOverrides = Pick<
  UseAutosaveOptions<string>,
  'classifyError' | 'debounceMs' | 'retryDelayMs' | 'maxRetries'
>;

interface AutosaveTestProps {
  enabled: boolean;
  isDirty: boolean;
  save: ReturnType<typeof vi.fn<() => Promise<string>>>;
  onSaved: ReturnType<typeof vi.fn<(value: string) => void>>;
  classifyError: (err: unknown) => 'conflict' | 'soft' | 'hard';
  debounceMs?: number;
  retryDelayMs?: number;
  maxRetries?: number;
}

function makeProps(overrides: Partial<AutosaveOptionOverrides> = {}): AutosaveTestProps {
  return {
    enabled: true,
    isDirty: false,
    save: vi.fn<() => Promise<string>>().mockResolvedValue('saved-value'),
    onSaved: vi.fn<(value: string) => void>(),
    classifyError: (err: unknown) => {
      const status = (err as { status?: number })?.status;
      if (status === 409) return 'conflict';
      if (status === 422) return 'soft';
      return 'hard';
    },
    debounceMs: 1200,
    retryDelayMs: 5000,
    maxRetries: 5,
    ...overrides,
  };
}

function renderAutosave(overrides: Partial<AutosaveOptionOverrides> = {}) {
  const props = makeProps(overrides);
  const utils = renderHook(() => useAutosave(props));
  return { ...utils, props };
}

const tick = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

describe('useAutosave', () => {
  it('stays idle while the form is clean', async () => {
    const { result, props } = renderAutosave();
    expect(result.current.status).toBe('idle');
    await tick(5000);
    expect(props.save).not.toHaveBeenCalled();
  });

  it('debounces rapid edits into a single background save', async () => {
    const { result, props, rerender } = renderAutosave();
    props.save.mockImplementation(() =>
      Promise.resolve('saved-value').then((v) => {
        props.isDirty = false;
        return v;
      })
    );

    props.isDirty = true;
    rerender();
    for (let i = 0; i < 3; i += 1) {
      await tick(200);
      rerender();
      expect(props.save).not.toHaveBeenCalled();
    }

    await tick(1200);
    expect(props.save).toHaveBeenCalledTimes(1);
    await flush();
    expect(result.current.status).toBe('saved');
    expect(props.onSaved).toHaveBeenCalledWith('saved-value');
  });

  it('does not fire again while the save is still running', async () => {
    const { result, props, rerender } = renderAutosave();
    let release!: () => void;
    props.save.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          release = () => {
            props.isDirty = false;
            resolve('saved-value');
          };
        })
    );
    props.isDirty = true;
    rerender();

    await tick(1200);
    expect(props.save).toHaveBeenCalledTimes(1);

    await tick(1200);
    expect(props.save).toHaveBeenCalledTimes(1);

    act(() => release());
    await flush();
    expect(result.current.status).toBe('saved');
    expect(props.save).toHaveBeenCalledTimes(1);
  });

  it('surfaces a hard failure and auto-retries until success', async () => {
    const { result, props, rerender } = renderAutosave({ retryDelayMs: 900 });
    props.save
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(() =>
        Promise.resolve('recovered').then((v) => {
          props.isDirty = false;
          return v;
        })
      );
    props.isDirty = true;
    rerender();

    await tick(1200);
    expect(result.current.status).toBe('failed');
    expect(result.current.failureMessage).toBe('offline');

    await tick(899);
    expect(props.save).toHaveBeenCalledTimes(1);

    await tick(1);
    expect(props.save).toHaveBeenCalledTimes(2);
    await flush();
    expect(result.current.status).toBe('saved');
    expect(props.onSaved).toHaveBeenCalledWith('recovered');
  });

  it('stops auto-retrying after maxRetries and allows a manual retry', async () => {
    const { result, props, rerender } = renderAutosave({
      retryDelayMs: 50,
      maxRetries: 2,
    });
    props.save.mockRejectedValue(new Error('down'));
    props.isDirty = true;
    rerender();

    await tick(1200); // initial attempt (retry 1)
    await tick(50); // retry 2
    await tick(50); // retry 3 -> exceeds max, stops
    expect(props.save).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe('failed');

    props.save.mockImplementation(() =>
      Promise.resolve('mine').then((v) => {
        props.isDirty = false;
        return v;
      })
    );
    act(() => result.current.saveNow());
    await flush();
    expect(result.current.status).toBe('saved');
    expect(props.save).toHaveBeenCalledTimes(4);
    expect(props.onSaved).toHaveBeenCalledWith('mine');
  });

  it('flags a 409 conflict and does not auto-retry it', async () => {
    const { result, props, rerender } = renderAutosave();
    props.save
      .mockRejectedValueOnce({ status: 409, data: { id: 7 } })
      .mockImplementation(() =>
        Promise.resolve('mine-wins').then((v) => {
          props.isDirty = false;
          return v;
        })
      );
    props.isDirty = true;
    rerender();

    await tick(1200);
    expect(result.current.status).toBe('conflict');
    expect((result.current.conflict as unknown as { data: { id: number } }).data.id).toBe(7);

    await tick(6000);
    expect(props.save).toHaveBeenCalledTimes(1);

    act(() => result.current.clearConflict());
    act(() => result.current.saveNow());
    await flush();
    expect(result.current.status).toBe('saved');
    expect(props.save).toHaveBeenCalledTimes(2);
  });

  it('keeps pending (unsaved) without a failure banner for soft errors', async () => {
    const { result, props, rerender } = renderAutosave();
    props.save.mockRejectedValue({ status: 422, errors: {} });
    props.isDirty = true;
    rerender();

    await tick(1200);
    expect(result.current.status).toBe('pending');
    expect(result.current.failureMessage).toBeNull();
    expect(result.current.conflict).toBeNull();
  });

  it('re-arms a trailing save while the form stays dirty after success', async () => {
    const { props, rerender } = renderAutosave();
    props.isDirty = true;
    rerender();

    await tick(1200);
    expect(props.save).toHaveBeenCalledTimes(1);

    await tick(1200);
    expect(props.save).toHaveBeenCalledTimes(2);
  });

  it('clears a failed state automatically when the caller returns to clean', async () => {
    const { result, props, rerender } = renderAutosave();
    props.save.mockRejectedValue(new Error('boom'));
    props.isDirty = true;
    rerender();
    await tick(1200);
    expect(result.current.status).toBe('failed');

    props.isDirty = false;
    rerender();
    await flush();
    expect(result.current.status).toBe('idle');
    expect(result.current.failureMessage).toBeNull();

    await tick(5000);
    expect(props.save).toHaveBeenCalledTimes(1);
  });

  it('reset() returns to idle, drops a conflict, and stops the editor from re-saving', async () => {
    const { result, props, rerender } = renderAutosave();
    props.save.mockRejectedValue({ status: 409 });
    props.isDirty = true;
    rerender();
    await tick(1200);
    expect(result.current.status).toBe('conflict');

    props.isDirty = false;
    rerender();
    act(() => result.current.reset());
    await flush();
    expect(result.current.status).toBe('idle');
    expect(result.current.conflict).toBeNull();

    await tick(5000);
    expect(props.save).toHaveBeenCalledTimes(1);
  });
});
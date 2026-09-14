import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuestionEditor from '@/components/question-editor';
import type { Question, QuestionPayload } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  questions: {
    update: vi.fn(),
    create: vi.fn(),
  },
}));

import { questions } from '@/lib/api';

const mockedUpdate = vi.mocked(questions.update);

const DEBOUNCE = 1500;

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 1,
    type: 'multiple_choice',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sample?' }] }],
    },
    default_mark: '1',
    status: 'complete',
    sort_order: 0,
    options: [
      {
        id: 11,
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Right' }] }] },
        is_correct: true,
        fraction: 100,
        sort_order: 0,
      },
      {
        id: 12,
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Wrong' }] }] },
        is_correct: false,
        fraction: 0,
        sort_order: 1,
      },
    ],
    created_at: '2026-01-01T00:00:00.000000Z',
    updated_at: '2026-01-01T00:00:00.000000Z',
    ...overrides,
  };
}

function markInput(): HTMLInputElement {
  return screen.getByLabelText('Bobot Skor') as HTMLInputElement;
}

beforeEach(() => {
  localStorage.clear();
  mockedUpdate.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('QuestionEditor autosave', () => {
  it('debounces edits into a single PATCH with a base timestamp, then shows Saved', async () => {
    const question = makeQuestion();
    mockedUpdate.mockResolvedValue({
      data: { ...question, default_mark: '2.5', updated_at: '2026-01-01T01:00:00.000000Z' },
      message: 'ok',
    });
    const onAutoSaved = vi.fn();
    const onSave = vi.fn().mockResolvedValue(question);

    render(
      <QuestionEditor
        quizId={1}
        question={question}
        defaultType={null}
        onClose={vi.fn()}
        onSave={onSave}
        onAutoSaved={onAutoSaved}
        autosaveDebounceMs={5_000}
        autosaveRetryMs={DEBOUNCE}
      />
    );

    fireEvent.change(markInput(), { target: { value: '2.5' } });
    await waitFor(() =>
      expect(screen.getByText('Perubahan belum disimpan')).toBeInTheDocument(),
      { timeout: 15000, interval: 100 }
    );

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1), { timeout: 15000 });

    const payload = mockedUpdate.mock.calls[0][1] as QuestionPayload;
    expect(payload.default_mark).toBe(2.5);
    expect(payload.base_updated_at).toBe('2026-01-01T00:00:00.000000Z');
    expect(payload.status).toBe('complete');

    await waitFor(() => expect(screen.getByText('Tersimpan')).toBeInTheDocument());
    expect(onAutoSaved).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('quiz-builder:draft:question:1')).toBeNull();
  });

  it('shows Save failed on network errors, keeps a local draft, and saves on Retry', async () => {
    const question = makeQuestion();
    mockedUpdate.mockRejectedValueOnce(new Error('Network request failed'));
    mockedUpdate.mockResolvedValueOnce({
      data: { ...question, default_mark: '3', updated_at: '2026-01-01T02:00:00.000000Z' },
      message: 'ok',
    });

    render(
      <QuestionEditor
        quizId={1}
        question={question}
        defaultType={null}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(question)}
        autosaveDebounceMs={DEBOUNCE}
        autosaveRetryMs={60_000}
      />
    );

    fireEvent.change(markInput(), { target: { value: '3' } });
    await waitFor(() => expect(screen.getByText('Gagal menyimpan')).toBeInTheDocument(), { timeout: 15000, interval: 200 });
    expect(localStorage.getItem('quiz-builder:draft:question:1')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Coba Lagi' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(2), { timeout: 15000, interval: 100 });
    await waitFor(() => expect(screen.getByText('Tersimpan')).toBeInTheDocument());
    expect(localStorage.getItem('quiz-builder:draft:question:1')).toBeNull();
  });

  it('surfaces a 409 conflict and lets the teacher keep their version', async () => {
    const question = makeQuestion();
    const serverQuestion = { ...question, default_mark: '7' };
    mockedUpdate
      .mockRejectedValueOnce({ status: 409, data: serverQuestion })
      .mockResolvedValueOnce({
        data: { ...question, default_mark: '4', updated_at: '2026-01-01T03:00:00.000000Z' },
        message: 'ok',
      });

    render(
      <QuestionEditor
        quizId={1}
        question={question}
        defaultType={null}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(question)}
        autosaveDebounceMs={DEBOUNCE}
      />
    );

    fireEvent.change(markInput(), { target: { value: '4' } });
    await waitFor(() =>
      expect(screen.getByText(/telah diubah di sisi server/i)).toBeInTheDocument(),
      { timeout: 15000, interval: 100 }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pertahankan versi saya' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(2), { timeout: 15000, interval: 100 });

    const second = mockedUpdate.mock.calls[1][1] as QuestionPayload;
    expect(second.base_updated_at).toBeUndefined();
    await waitFor(() => expect(screen.getByText('Tersimpan')).toBeInTheDocument());
  });

  it('lets the teacher reload the server version on conflict', async () => {
    const question = makeQuestion();
    const serverQuestion = { ...question, default_mark: '7' };
    mockedUpdate.mockRejectedValue({ status: 409, data: serverQuestion });

    render(
      <QuestionEditor
        quizId={1}
        question={question}
        defaultType={null}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(question)}
        autosaveDebounceMs={DEBOUNCE}
      />
    );

    fireEvent.change(markInput(), { target: { value: '4' } });
    await waitFor(() =>
      expect(screen.getByText(/telah diubah di sisi server/i)).toBeInTheDocument(),
      { timeout: 15000, interval: 100 }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Muat versi server' }));
    await waitFor(() => expect((markInput() as HTMLInputElement).value).toBe('7'));
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Belum ada perubahan')).toBeInTheDocument();
    expect(localStorage.getItem('quiz-builder:draft:question:1')).toBeNull();

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1), { timeout: 15000, interval: 100 });
  });

  it('recovers a closed-before-debounce draft on reopen and discards it on demand', async () => {
    const { unmount } = render(
      <QuestionEditor
        quizId={1}
        question={null}
        defaultType="multiple_choice"
        onClose={vi.fn()}
        onSave={vi.fn()}
        autosaveDebounceMs={5_000}
      />
    );

    fireEvent.change(markInput(), { target: { value: '2' } });
    await waitFor(() =>
      expect(screen.getByText('Perubahan belum disimpan')).toBeInTheDocument(),
      { timeout: 15000, interval: 200 }
    );
    unmount();

    render(
      <QuestionEditor
        quizId={1}
        question={null}
        defaultType="multiple_choice"
        onClose={vi.fn()}
        onSave={vi.fn()}
        autosaveDebounceMs={5_000}
      />
    );

    await waitFor(() =>
      expect(screen.getByText('Draft lokal ditemukan. Pulihkan?')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abaikan' }));
    expect(screen.queryByText('Draft lokal ditemukan. Pulihkan?')).not.toBeInTheDocument();
    expect(localStorage.getItem('quiz-builder:draft:quiz:1:new')).toBeNull();
    expect((markInput() as HTMLInputElement).value).toBe('1');
  });

  it('restores a recovered draft back into the form', async () => {
    const { unmount } = render(
      <QuestionEditor
        quizId={1}
        question={null}
        defaultType="multiple_choice"
        onClose={vi.fn()}
        onSave={vi.fn()}
        autosaveDebounceMs={5_000}
      />
    );

    fireEvent.change(markInput(), { target: { value: '2' } });
    await waitFor(() =>
      expect(screen.getByText('Perubahan belum disimpan')).toBeInTheDocument(),
      { timeout: 15000, interval: 200 }
    );
    unmount();

    render(
      <QuestionEditor
        quizId={1}
        question={null}
        defaultType="multiple_choice"
        onClose={vi.fn()}
        onSave={vi.fn()}
        autosaveDebounceMs={5_000}
      />
    );

    await waitFor(() =>
      expect(screen.getByText('Draft lokal ditemukan. Pulihkan?')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pulihkan' }));
    await waitFor(() => expect((markInput() as HTMLInputElement).value).toBe('2'));
  });

  it('does not prompt for recovery after a successful autosave and reopen', async () => {
    const question = makeQuestion();
    mockedUpdate.mockResolvedValue({
      data: { ...question, default_mark: '5', updated_at: '2026-01-01T04:00:00.000000Z' },
      message: 'ok',
    });

    const { unmount } = render(
      <QuestionEditor
        quizId={1}
        question={question}
        defaultType={null}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(question)}
        autosaveDebounceMs={DEBOUNCE}
      />
    );

    fireEvent.change(markInput(), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByText('Tersimpan')).toBeInTheDocument());
    unmount();

    render(
      <QuestionEditor
        quizId={1}
        question={makeQuestion({ default_mark: '5' })}
        defaultType={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
        autosaveDebounceMs={DEBOUNCE}
      />
    );

    expect(screen.queryByText('Draft lokal ditemukan. Pulihkan?')).not.toBeInTheDocument();
  });
});
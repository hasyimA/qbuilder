import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import InsertIntoQuizDialog from '@/components/question-bank/insert-into-quiz-dialog';
import { paragraphDoc } from '@/lib/content';
import type { Question } from '@/lib/types';

const apiMocks = vi.hoisted(() => ({
  quizList: vi.fn(),
  attach: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  auth: { logout: vi.fn() },
  questions: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    attach: apiMocks.attach,
    detach: vi.fn(),
    reorder: vi.fn(),
    bank: { list: vi.fn(), create: vi.fn(), duplicate: vi.fn(), filtersMeta: vi.fn() },
  },
  quizzes: {
    list: apiMocks.quizList,
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    filtersMeta: vi.fn(),
  },
  media: { get: vi.fn(), upload: vi.fn(), delete: vi.fn() },
  resolveApiUrl: (url: string) => url,
}));

const question: Question = {
  id: 7,
  type: 'essay',
  content: paragraphDoc('Jelaskan fungsi firewall.'),
  default_mark: 5,
  category: 'Jaringan',
  difficulty: 'medium',
  status: 'complete',
  used_in_count: 1,
  tags: [],
  options: [],
  created_at: '2026-01-01T00:00:00.000000Z',
  updated_at: '2026-09-01T00:00:00.000000Z',
};

const quizA = {
  id: 10,
  title: 'UTS Jaringan Dasar',
  status: 'draft',
  questions_count: 3,
};

beforeEach(() => {
  apiMocks.quizList.mockResolvedValue({
    data: [quizA], meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  apiMocks.quizList.mockReset();
  apiMocks.attach.mockReset();
});

describe('InsertIntoQuizDialog', () => {
  it('attaches the question to the selected quiz', async () => {
    apiMocks.attach.mockResolvedValue({ data: question, message: 'attached' });
    const onAttached = vi.fn();

    render(<InsertIntoQuizDialog question={question} onCancel={vi.fn()} onAttached={onAttached} />);

    const option = await screen.findByTestId('bank-insert-option-10');
    fireEvent.click(option);

    fireEvent.click(screen.getByTestId('bank-insert-confirm'));

    await waitFor(() => expect(apiMocks.attach).toHaveBeenCalledWith(10, 7));
    await waitFor(() => expect(onAttached).toHaveBeenCalledWith(question, quizA));
  });

  it('shows the API error message when attach fails', async () => {
    apiMocks.attach.mockRejectedValue({ status: 422, message: 'Question already in this quiz.' });
    const onAttached = vi.fn();

    render(<InsertIntoQuizDialog question={question} onCancel={vi.fn()} onAttached={onAttached} />);

    fireEvent.click(await screen.findByTestId('bank-insert-option-10'));
    fireEvent.click(screen.getByTestId('bank-insert-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('bank-insert-error')).toHaveTextContent(
        'Question already in this quiz.'
      )
    );
    expect(onAttached).not.toHaveBeenCalled();
  });

  it('disables confirm until a quiz is selected', async () => {
    render(<InsertIntoQuizDialog question={question} onCancel={vi.fn()} onAttached={vi.fn()} />);

    expect(screen.getByTestId('bank-insert-confirm')).toBeDisabled();

    fireEvent.click(await screen.findByTestId('bank-insert-option-10'));

    expect(screen.getByTestId('bank-insert-confirm')).toBeEnabled();
  });

  it('shows an empty state when no quizzes match', async () => {
    apiMocks.quizList.mockResolvedValue({
      data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    });

    render(<InsertIntoQuizDialog question={question} onCancel={vi.fn()} onAttached={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText('Tidak ada kuis ditemukan.')).toBeInTheDocument()
    );
  });

  it('refetches quizzes when the search changes', async () => {
    render(<InsertIntoQuizDialog question={question} onCancel={vi.fn()} onAttached={vi.fn()} />);

    await screen.findByTestId('bank-insert-option-10');

    fireEvent.change(screen.getByTestId('bank-insert-search'), { target: { value: 'kimia' } });

    await waitFor(
      () => expect(apiMocks.quizList).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'kimia' })),
      { timeout: 1000 }
    );
  });
});
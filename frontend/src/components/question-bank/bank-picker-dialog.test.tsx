import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import BankPickerDialog from '@/components/question-bank/bank-picker-dialog';
import { paragraphDoc } from '@/lib/content';
import type { Question } from '@/lib/types';

const apiMocks = vi.hoisted(() => ({
  bankList: vi.fn(),
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
    bank: { list: apiMocks.bankList, create: vi.fn(), duplicate: vi.fn(), filtersMeta: vi.fn() },
  },
  quizzes: {
    list: vi.fn(),
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

function makeQuestion(id: number, text: string): Question {
  return {
    id,
    type: 'multiple_choice',
    content: paragraphDoc(text),
    default_mark: 1,
    category: 'Fisika',
    difficulty: 'easy',
    status: 'complete',
    used_in_count: 0,
    tags: [],
    options: [
      { id: 1, content: paragraphDoc('A'), is_correct: true, fraction: 100, sort_order: 0 },
      { id: 2, content: paragraphDoc('B'), is_correct: false, fraction: 0, sort_order: 1 },
    ],
    created_at: '2026-01-01T00:00:00.000000Z',
    updated_at: '2026-09-01T00:00:00.000000Z',
  };
}

const bank1 = makeQuestion(11, 'Besaran pokok');
const bank2 = makeQuestion(12, 'Hukum Ohm');

beforeEach(() => {
  apiMocks.bankList.mockResolvedValue({
    data: [bank1, bank2], meta: { current_page: 1, last_page: 1, per_page: 25, total: 2 },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  apiMocks.bankList.mockReset();
  apiMocks.attach.mockReset();
});

describe('BankPickerDialog', () => {
  it('lists bank questions and attaches the selected one', async () => {
    apiMocks.attach.mockResolvedValue({ data: bank1, message: 'attached' });
    const onAttached = vi.fn();

    render(
      <BankPickerDialog quizId={5} existingIds={[]} onCancel={vi.fn()} onAttached={onAttached} />
    );

    await screen.findByTestId('bank-picker-add-11');
    fireEvent.click(screen.getByTestId('bank-picker-add-11'));

    await waitFor(() => expect(apiMocks.attach).toHaveBeenCalledWith(5, 11));
    await waitFor(() => expect(onAttached).toHaveBeenCalledWith(bank1));
  });

  it('disables the add button for questions already in the quiz', async () => {
    render(
      <BankPickerDialog quizId={5} existingIds={[11]} onCancel={vi.fn()} onAttached={vi.fn()} />
    );

    const alreadyButton = await screen.findByTestId('bank-picker-add-11');
    expect(alreadyButton).toBeDisabled();
    expect(alreadyButton).toHaveTextContent('Sudah ada');
  });

  it('shows the API error message when attach fails', async () => {
    apiMocks.attach.mockRejectedValue({ status: 422, message: 'Question already in this quiz.' });

    render(
      <BankPickerDialog quizId={5} existingIds={[]} onCancel={vi.fn()} onAttached={vi.fn()} />
    );

    fireEvent.click(await screen.findByTestId('bank-picker-add-11'));

    await waitFor(() =>
      expect(screen.getByTestId('bank-picker-error')).toHaveTextContent(
        'Question already in this quiz.'
      )
    );
  });

  it('refetches the bank list when the search changes', async () => {
    render(
      <BankPickerDialog quizId={5} existingIds={[]} onCancel={vi.fn()} onAttached={vi.fn()} />
    );

    await screen.findByTestId('bank-picker-add-11');

    fireEvent.change(screen.getByTestId('bank-picker-search'), { target: { value: 'ohm' } });

    await waitFor(
      () => expect(apiMocks.bankList).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'ohm' })),
      { timeout: 1000 }
    );
  });

  it('shows an empty state when the bank has no questions', async () => {
    apiMocks.bankList.mockResolvedValue({
      data: [], meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 },
    });

    render(
      <BankPickerDialog quizId={5} existingIds={[]} onCancel={vi.fn()} onAttached={vi.fn()} />
    );

    await waitFor(() =>
      expect(screen.getByText('Tidak ada soal ditemukan.')).toBeInTheDocument()
    );
  });
});
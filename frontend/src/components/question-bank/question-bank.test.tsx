import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import QuestionBank from '@/components/question-bank/question-bank';
import { paragraphDoc } from '@/lib/content';
import type { Question } from '@/lib/types';

const apiMocks = vi.hoisted(() => ({
  bankList: vi.fn(),
  filtersMeta: vi.fn(),
  delete: vi.fn(),
  bankDuplicate: vi.fn(),
  attach: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  auth: { logout: vi.fn().mockResolvedValue({ message: 'ok' }) },
  questions: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    get: vi.fn(),
    delete: apiMocks.delete,
    duplicate: vi.fn(),
    attach: apiMocks.attach,
    detach: vi.fn(),
    reorder: vi.fn(),
    bank: {
      list: apiMocks.bankList,
      create: vi.fn(),
      duplicate: apiMocks.bankDuplicate,
      filtersMeta: apiMocks.filtersMeta,
    },
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

vi.mock('@/components/question-editor/question-preview', () => ({
  __esModule: true,
  default: ({
    type,
    mode,
    defaultMark,
  }: {
    type: string;
    mode: string;
    defaultMark: string;
  }) => (
    <div data-testid="question-preview">
      <span data-testid="preview-type">{type}</span>
      <span data-testid="preview-mode">{mode}</span>
      <span data-testid="preview-mark">{defaultMark}</span>
    </div>
  ),
}));

vi.mock('@/components/question-bank/insert-into-quiz-dialog', () => ({
  __esModule: true,
  default: ({
    question,
    onAttached,
    onCancel,
  }: {
    question: Question;
    onAttached: (question: Question, quiz: { id: number; title: string }) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="insert-dialog-stub">
      <button
        onClick={() => {
          apiMocks.attach.mockResolvedValue({ data: question, message: 'attached' });
          void apiMocks.attach(1, question.id).then(() =>
            onAttached(question, { id: 1, title: 'UTS Jaringan Dasar' })
          );
        }}
      >
        confirm-insert
      </button>
      <button onClick={onCancel}>cancel-insert</button>
    </div>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 1,
    type: 'multiple_choice',
    content: paragraphDoc('Apa ibukota Indonesia?'),
    default_mark: 1,
    category: 'IPS',
    difficulty: 'easy',
    status: 'complete',
    used_in_count: 0,
    tags: [{ id: 1, name: 'Ujian', slug: 'ujian' }],
    options: [
      { id: 1, content: paragraphDoc('Jakarta'), is_correct: true, fraction: 100, sort_order: 0 },
      { id: 2, content: paragraphDoc('Bandung'), is_correct: false, fraction: 0, sort_order: 1 },
    ],
    created_at: '2026-01-01T00:00:00.000000Z',
    updated_at: '2026-09-01T00:00:00.000000Z',
    ...overrides,
  };
}

const unusedQuestion = makeQuestion({ id: 1, used_in_count: 0 });
const usedQuestion = makeQuestion({ id: 2, used_in_count: 3 });

function meta() {
  return {
    data: {
      categories: ['IPS', 'Kimia'],
      difficulties: ['easy', 'medium', 'hard'],
      tags: [{ id: 1, name: 'Ujian', slug: 'ujian' }],
      statuses: [
        { value: 'draft', label: 'Draft' },
        { value: 'complete', label: 'Lengkap' },
      ],
      types: [
        { value: 'multiple_choice', label: 'Multiple Choice' },
        { value: 'essay', label: 'Essay' },
      ],
    },
  };
}

beforeEach(() => {
  apiMocks.filtersMeta.mockResolvedValue(meta());
  apiMocks.bankList.mockResolvedValue({
    data: [unusedQuestion, usedQuestion],
    meta: { current_page: 1, last_page: 1, per_page: 20, total: 2 },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  apiMocks.bankList.mockReset();
  apiMocks.filtersMeta.mockReset();
  apiMocks.delete.mockReset();
  apiMocks.bankDuplicate.mockReset();
  apiMocks.attach.mockReset();
});

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByTestId('bank-loading')).toBeNull());
}

describe('QuestionBank', () => {
  it('renders bank questions in both table and card layouts with details', async () => {
    render(<QuestionBank />);

    await waitForLoaded();

    expect(screen.getAllByTestId(/^bank-row-/).length).toBe(4);
    expect(screen.getAllByText(/Apa ibukota Indonesia\?/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('IPS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mudah').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lengkap').length).toBeGreaterThan(0);
  });

  it('shows usage count and disables delete for used questions', async () => {
    render(<QuestionBank />);

    await waitForLoaded();

    expect(screen.getByTestId('bank-used-1')).toHaveTextContent('—');
    expect(screen.getByTestId('bank-used-2')).toHaveTextContent('3 kuis');

    const deleteUsed = screen.getAllByTestId('bank-action-2-delete');
    expect(deleteUsed.length).toBeGreaterThan(0);
    deleteUsed.forEach((button) => expect(button).toBeDisabled());
  });

  it('deletes an unused question after confirmation', async () => {
    apiMocks.delete.mockResolvedValue({ message: 'deleted' });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<QuestionBank />);

    await waitForLoaded();

    fireEvent.click(screen.getAllByTestId('bank-action-1-delete')[0]);

    await waitFor(() => expect(apiMocks.delete).toHaveBeenCalledWith(1));
    expect(confirmSpy).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('does not delete when confirmation is rejected', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<QuestionBank />);

    await waitForLoaded();

    fireEvent.click(screen.getAllByTestId('bank-action-1-delete')[0]);

    expect(apiMocks.delete).not.toHaveBeenCalled();
  });

  it('refreshes the list after deleting a question', async () => {
    apiMocks.delete.mockResolvedValue({ message: 'deleted' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<QuestionBank />);

    await waitForLoaded();

    const callsBeforeDelete = apiMocks.bankList.mock.calls.length;

    fireEvent.click(screen.getAllByTestId('bank-action-1-delete')[0]);

    await waitFor(() =>
      expect(apiMocks.bankList.mock.calls.length).toBeGreaterThan(callsBeforeDelete)
    );
  });

  it('opens the preview dialog in teacher mode and closes it', async () => {
    render(<QuestionBank />);

    await waitForLoaded();

    fireEvent.click(screen.getAllByTestId('bank-action-1-preview')[0]);

    expect(screen.getByTestId('bank-preview-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('preview-type')).toHaveTextContent('multiple_choice');
    expect(screen.getByTestId('preview-mode')).toHaveTextContent('teacher');

    fireEvent.click(screen.getByTestId('bank-preview-close'));

    expect(screen.queryByTestId('bank-preview-dialog')).toBeNull();
  });

  it('opens the insert dialog and attach adds the question to the quiz', async () => {
    apiMocks.attach.mockResolvedValue({ data: unusedQuestion, message: 'attached' });

    render(<QuestionBank />);

    await waitForLoaded();

    fireEvent.click(screen.getAllByTestId('bank-action-1-insert')[0]);

    expect(screen.getByTestId('insert-dialog-stub')).toBeInTheDocument();

    fireEvent.click(screen.getByText('confirm-insert'));

    await waitFor(() => expect(apiMocks.attach).toHaveBeenCalledWith(1, 1));
    await waitFor(() =>
      expect(screen.getByTestId('bank-notice')).toHaveTextContent(
        'disimpan ke kuis "UTS Jaringan Dasar"'
      )
    );
  });

  it('duplicates a question through the bank endpoint', async () => {
    apiMocks.bankDuplicate.mockResolvedValue({ data: unusedQuestion, message: 'duplicated' });

    render(<QuestionBank />);

    await waitForLoaded();

    fireEvent.click(screen.getAllByTestId('bank-action-1-duplicate')[0]);

    await waitFor(() => expect(apiMocks.bankDuplicate).toHaveBeenCalledWith(1));
    expect(screen.getByTestId('bank-notice')).toHaveTextContent('Soal berhasil digandakan ke bank.');
  });

  it('debounces the search input before refetching', async () => {
    render(<QuestionBank />);

    await waitForLoaded();

    fireEvent.change(screen.getByTestId('bank-search'), { target: { value: '  kimia ' } });

    await waitFor(
      () => {
        expect(apiMocks.bankList).toHaveBeenLastCalledWith(
          expect.objectContaining({ search: 'kimia', page: 1 })
        );
      },
      { timeout: 1500 }
    );
  });

  it('refetches with page 1 and applied filters when a filter changes', async () => {
    render(<QuestionBank />);

    await waitForLoaded();

    fireEvent.change(screen.getByTestId('bank-filter-type'), {
      target: { value: 'essay' },
    });

    await waitFor(() =>
      expect(apiMocks.bankList).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'essay', page: 1 })
      )
    );
  });

  it('shows an empty state when there are no questions', async () => {
    apiMocks.bankList.mockResolvedValue({
      data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    });

    render(<QuestionBank />);

    await waitForLoaded();

    expect(screen.getByTestId('bank-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('bank-pagination')).toBeNull();
  });

  it('shows pagination info when there are questions', async () => {
    render(<QuestionBank />);

    await waitForLoaded();

    expect(screen.getByTestId('bank-total')).toHaveTextContent('Menampilkan 1–2 dari 2 soal');
  });
});
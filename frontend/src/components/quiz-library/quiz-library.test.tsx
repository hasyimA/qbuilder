import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import QuizLibrary from '@/components/quiz-library/quiz-library';
import type { Quiz } from '@/lib/api';

const apiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  delete: vi.fn(),
  duplicate: vi.fn(),
  filtersMeta: vi.fn(),
  exportQuizMoodle: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  auth: { logout: vi.fn().mockResolvedValue({ message: 'ok' }) },
  quizzes: {
    list: apiMocks.list,
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: apiMocks.delete,
    duplicate: apiMocks.duplicate,
    filtersMeta: apiMocks.filtersMeta,
  },
  media: { get: vi.fn(), upload: vi.fn(), delete: vi.fn() },
  questions: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), duplicate: vi.fn(), reorder: vi.fn() },
  resolveApiUrl: (url: string) => url,
}));

vi.mock('@/lib/export', () => {
  return { ExportValidationErrorList: class ExportValidationErrorList {} };
});

vi.mock('@/lib/export/export-quiz', () => ({
  exportQuizMoodle: apiMocks.exportQuizMoodle,
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

const mineQuiz: Quiz = {
  id: 1,
  title: 'UTS Jaringan Dasar',
  description: 'Soal pilihan ganda jaringan komputer.',
  subject: 'Informatika',
  grade_level: 'X',
  category: 'UTS',
  status: 'published',
  visibility: 'private',
  questions_count: 3,
  question_types: ['multiple_choice', 'essay'],
  owner: { id: 1, name: 'Saya Sendiri' },
  tags: [{ id: 1, name: 'Ujian', slug: 'ujian' }],
  created_at: '2026-01-01T00:00:00.000000Z',
  updated_at: '2026-09-01T00:00:00.000000Z',
};

const sharedQuiz: Quiz = {
  id: 2,
  title: 'Kuis Kolaborasi',
  description: 'Dibagikan oleh rekan guru.',
  subject: 'Informatika',
  grade_level: 'XI',
  category: 'UAS',
  status: 'draft',
  visibility: 'public',
  questions_count: 5,
  question_types: ['true_false'],
  owner: { id: 2, name: 'Guru Lain' },
  tags: [],
  created_at: '2026-01-01T00:00:00.000000Z',
  updated_at: '2026-09-02T00:00:00.000000Z',
};

const mineMeta = {
  current_page: 1,
  last_page: 2,
  per_page: 20,
  total: 25,
};

beforeEach(() => {
  apiMocks.filtersMeta.mockResolvedValue({
    data: {
      categories: ['UTS', 'UAS'],
      tags: [{ id: 1, name: 'Ujian', slug: 'ujian' }],
      types: ['multiple_choice', 'true_false', 'short_answer', 'essay'],
    },
  });
  apiMocks.list.mockImplementation(async (params: { tab?: string; page?: number }) => {
    if (params.tab === 'shared') {
      return {
        data: [sharedQuiz],
        meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
      };
    }
    return {
      data: [mineQuiz],
      meta: params.page === 1 ? mineMeta : { ...mineMeta, current_page: params.page ?? 1 },
    };
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  apiMocks.list.mockReset();
  apiMocks.filtersMeta.mockReset();
  apiMocks.exportQuizMoodle.mockReset();
});

describe('QuizLibrary', () => {
  it('renders my quizzes with details and owner actions', async () => {
    render(<QuizLibrary />);

    expect(await screen.findByTestId('quiz-total')).toHaveTextContent('Menampilkan 1–20 dari 25');
    expect(screen.getAllByText('UTS Jaringan Dasar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Saya Sendiri').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#Ujian').length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(apiMocks.list).toHaveBeenCalledWith(expect.objectContaining({ tab: 'mine' }));
    });

    expect(screen.getAllByTestId('quiz-action-1-edit').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('quiz-action-1-delete').length).toBeGreaterThan(0);
  });

  it('debounces the search box into the list query', async () => {
    render(<QuizLibrary />);

    await screen.findByTestId('quiz-total');
    fireEvent.change(screen.getByTestId('quiz-search'), { target: { value: 'komputer' } });

    await waitFor(
      () => {
        expect(apiMocks.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'komputer' }));
      },
      { timeout: 2000 }
    );
  });

  it('switches to the shared tab and treats quizzes as read-only', async () => {
    render(<QuizLibrary />);

    await screen.findByTestId('quiz-total');
    fireEvent.click(screen.getByTestId('quiz-tab-shared'));

    await waitFor(() => {
      expect(apiMocks.list).toHaveBeenCalledWith(expect.objectContaining({ tab: 'shared' }));
    });

    await waitFor(() => {
      expect(screen.getAllByText('Kuis Kolaborasi').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('Guru Lain').length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('quiz-action-2-edit')).toHaveLength(0);
    expect(screen.getAllByTestId('quiz-action-2-duplicate')[0]).toHaveTextContent('Salin ke Saya');
  });

  it('duplicates a shared quiz into My Quizzes', async () => {
    render(<QuizLibrary />);

    await screen.findByTestId('quiz-total');
    fireEvent.click(screen.getByTestId('quiz-tab-shared'));

    const duplicateButtons = await screen.findAllByTestId('quiz-action-2-duplicate');
    fireEvent.click(duplicateButtons[0]);

    await waitFor(() => {
      expect(apiMocks.duplicate).toHaveBeenCalledWith(2);
    });
    expect(await screen.findByTestId('quiz-notice')).toHaveTextContent('Kuis Kolaborasi');
  });

  it('deletes a quiz after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<QuizLibrary />);

    await screen.findByTestId('quiz-total');
    fireEvent.click(screen.getAllByTestId('quiz-action-1-delete')[0]);

    await waitFor(() => {
      expect(apiMocks.delete).toHaveBeenCalledWith(1);
    });
    expect(window.confirm).toHaveBeenCalled();
  });

  it('does not delete without confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<QuizLibrary />);

    await screen.findByTestId('quiz-total');
    fireEvent.click(screen.getAllByTestId('quiz-action-1-delete')[0]);

    expect(apiMocks.delete).not.toHaveBeenCalled();
  });

  it('exports a quiz to Moodle XML', async () => {
    apiMocks.exportQuizMoodle.mockResolvedValue('UTS Jaringan Dasar');
    render(<QuizLibrary />);

    await screen.findByTestId('quiz-total');
    fireEvent.click(screen.getAllByTestId('quiz-action-1-export')[0]);

    await waitFor(() => {
      expect(apiMocks.exportQuizMoodle).toHaveBeenCalledWith(1);
    });
    expect(await screen.findByTestId('quiz-notice')).toHaveTextContent('Moodle XML');
  });

  it('paginates to the next page', async () => {
    render(<QuizLibrary />);

    await screen.findByTestId('quiz-total');
    fireEvent.click(screen.getByTestId('quiz-pagination-next'));

    await waitFor(() => {
      expect(apiMocks.list).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    });
  });

  it('filters by a category via the filter controls', async () => {
    render(<QuizLibrary />);

    await screen.findByTestId('quiz-total');
    fireEvent.change(screen.getByTestId('quiz-filter-category'), { target: { value: 'UAS' } });

    await waitFor(() => {
      expect(apiMocks.list).toHaveBeenCalledWith(expect.objectContaining({ category: 'UAS' }));
    });
  });

  it('shows an empty state when there are no quizzes', async () => {
    apiMocks.list.mockResolvedValue({
      data: [],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    });

    render(<QuizLibrary />);

    expect(await screen.findByTestId('quiz-empty')).toBeInTheDocument();
    expect(screen.getByText(/Belum ada kuis/)).toBeInTheDocument();
  });
});
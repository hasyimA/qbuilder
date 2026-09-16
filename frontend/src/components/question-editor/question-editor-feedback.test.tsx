import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuestionEditor from '@/components/question-editor';
import type { DocContent, Question } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  questions: {
    update: vi.fn(),
    create: vi.fn(),
  },
}));

import { questions } from '@/lib/api';

const mockedUpdate = vi.mocked(questions.update);

function textDoc(text: string): DocContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 1,
    type: 'multiple_choice',
    content: textDoc('Manakah perangkat yang meneruskan paket?'),
    default_mark: '1',
    status: 'complete',
    sort_order: 0,
    options: [
      {
        id: 11,
        content: textDoc('Router'),
        is_correct: true,
        fraction: 100,
        sort_order: 0,
      },
      {
        id: 12,
        content: textDoc('Switch'),
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

function makeEssay(overrides: Partial<Question> = {}): Question {
  return makeQuestion({
    type: 'essay',
    options: [],
    ...overrides,
  });
}

/** RichTextEditor: the contenteditable node that carries the aria-label. */
function rteByLabel(label: string): HTMLElement {
  const candidates = screen.getAllByLabelText(label);
  const content = candidates.find((el) => el.tagName === 'DIV' && el.getAttribute('contenteditable') !== null);
  if (!content) throw new Error(`No RichTextEditor content with label "${label}"`);
  return content;
}

beforeEach(() => {
  localStorage.clear();
  mockedUpdate.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('QuestionEditor feedback fields', () => {
  it('renders correct/incorrect feedback editors for MC but hides grader info', () => {
    render(
      <QuestionEditor
        quizId={1}
        question={makeQuestion()}
        defaultType={null}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(makeQuestion())}
        autosaveDebounceMs={5000}
      />
    );

    fireEvent.click(screen.getByTestId('feedback-section-toggle'));
    expect(screen.getByTestId('feedback-section')).toBeInTheDocument();
    expect(rteByLabel('Umpan balik umum')).toBeInTheDocument();
    expect(rteByLabel('Umpan balik jawaban benar')).toBeInTheDocument();
    expect(rteByLabel('Umpan balik jawaban salah')).toBeInTheDocument();
    expect(screen.queryByTestId('grader-info-section')).not.toBeInTheDocument();
  });

  it('renders grader info editor for essays and hides correct/incorrect feedback', () => {
    render(
      <QuestionEditor
        quizId={1}
        question={makeEssay()}
        defaultType={null}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(makeEssay())}
        autosaveDebounceMs={5000}
      />
    );

    expect(screen.getByTestId('grader-info-section')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('grader-info-section-toggle'));
    expect(rteByLabel('Informasi penilai')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-section')).toBeInTheDocument();
    expect(screen.queryByLabelText('Umpan balik jawaban benar')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Umpan balik jawaban salah')).not.toBeInTheDocument();
  });

  it('shows per-option feedback textarea after toggling an option', () => {
    render(
      <QuestionEditor
        quizId={1}
        question={makeQuestion()}
        defaultType={null}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(makeQuestion())}
        autosaveDebounceMs={5000}
      />
    );

    expect(screen.queryByPlaceholderText('Umpan balik untuk pilihan ini (opsional)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('option-feedback-toggle-0'));
    const textarea = screen.getByPlaceholderText('Umpan balik untuk pilihan ini (opsional)');
    expect(textarea).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'Karena router meneruskan paket.' } });
    expect(textarea).toHaveValue('Karena router meneruskan paket.');
  });

  it('loads feedback from the question and persists it in the save payload', async () => {
    const question = makeQuestion({
      feedback_general: textDoc('Router meneruskan paket antar jaringan.'),
      feedback_correct: textDoc('Benar sekali!'),
      feedback_incorrect: textDoc('Coba perhatikan lapisan jaringan.'),
    });
    const saved = { ...question };
    mockedUpdate.mockResolvedValue({ data: saved, message: 'ok' });
    const onSave = vi.fn().mockResolvedValue(saved);

    render(
      <QuestionEditor
        quizId={1}
        question={question}
        defaultType={null}
        onClose={vi.fn()}
        onSave={onSave}
        autosaveDebounceMs={5000}
      />
    );

    expect(rteByLabel('Umpan balik umum').textContent).toContain('Router meneruskan paket antar jaringan.');
    expect(rteByLabel('Umpan balik jawaban benar').textContent).toContain('Benar sekali!');
    expect(rteByLabel('Umpan balik jawaban salah').textContent).toContain('lapisan jaringan');

    fireEvent.click(screen.getByRole('button', { name: /^Simpan$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const payload = onSave.mock.calls[0][0];
    expect(payload).toMatchObject({
      type: 'multiple_choice',
      feedback_general: { type: 'doc' },
      feedback_correct: { type: 'doc' },
      feedback_incorrect: { type: 'doc' },
    });
    expect(payload.grader_info).toBeNull();
  });

  it('persists grader info for essays and keeps correct/incorrect null', async () => {
    const essay = makeEssay({
      default_mark: '2',
      content: textDoc('Jelaskan cara kerja router!'),
      feedback_general: textDoc('Pembahasan esai.'),
      grader_info: textDoc('Kunci: tabel routing menentukan jalur paket.'),
    });
    const saved = { ...essay };
    mockedUpdate.mockResolvedValue({ data: saved, message: 'ok' });
    const onSave = vi.fn().mockResolvedValue(saved);

    render(
      <QuestionEditor
        quizId={1}
        question={essay}
        defaultType={null}
        onClose={vi.fn()}
        onSave={onSave}
        autosaveDebounceMs={5000}
      />
    );

    expect(rteByLabel('Informasi penilai').textContent).toContain(
      'Kunci: tabel routing menentukan jalur paket.'
    );

    fireEvent.click(screen.getByRole('button', { name: /^Simpan$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const payload = onSave.mock.calls[0][0];
    expect(payload.grader_info).toMatchObject({ type: 'doc' });
    expect(payload.feedback_correct).toBeNull();
    expect(payload.feedback_incorrect).toBeNull();
  });
});
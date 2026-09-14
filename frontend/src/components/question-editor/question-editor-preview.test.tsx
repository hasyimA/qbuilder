import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuestionEditor from '@/components/question-editor';
import type { Question } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  questions: {
    update: vi.fn(),
    create: vi.fn(),
  },
}));

import { questions } from '@/lib/api';

const mockedUpdate = vi.mocked(questions.update);

function makeQuestion(): Question {
  return {
    id: 1,
    type: 'multiple_choice',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Which device routes between networks?' }],
        },
      ],
    },
    default_mark: '1',
    status: 'complete',
    sort_order: 0,
    options: [
      {
        id: 11,
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Router' }] }] },
        is_correct: true,
        fraction: 100,
        sort_order: 0,
      },
      {
        id: 12,
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Switch' }] }] },
        is_correct: false,
        fraction: 0,
        sort_order: 1,
      },
    ],
    created_at: '2026-01-01T00:00:00.000000Z',
    updated_at: '2026-01-01T00:00:00.000000Z',
  };
}

beforeEach(() => {
  localStorage.clear();
  mockedUpdate.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('QuestionEditor preview toggle', () => {
  it('switches between Edit, Teacher and Student preview without leaving the workflow', async () => {
    const question = makeQuestion();
    mockedUpdate.mockResolvedValue({ data: question, message: 'ok' });

    render(
      <QuestionEditor
        quizId={1}
        question={question}
        defaultType={null}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(question)}
        autosaveDebounceMs={5000}
      />
    );

    expect(screen.getByText('Question Text')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Teacher' }));
    const preview = await screen.findByTestId('question-preview');
    expect(preview).toBeInTheDocument();
    expect(screen.queryByText('Question Text')).not.toBeInTheDocument();
    expect(preview.textContent).toContain('Which device routes between networks?');
    expect(preview.textContent).toContain('Router');
    expect(screen.getByTestId('correct-badge')).toHaveTextContent('Correct answer');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Student' }));
    await waitFor(() => {
      expect(screen.queryByTestId('correct-badge')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('preview-mode')).toHaveTextContent('Student preview');
    expect(screen.getByTestId('option-B')).toHaveTextContent('Switch');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => {
      expect(screen.getByText('Question Text')).toBeInTheDocument();
    });
    const editorContent = screen.getByTestId('rte-content');
    expect(editorContent.textContent).toContain('Which device routes between networks?');
  });

  it('reflects the latest unsaved edits in the teacher preview', async () => {
    const question = makeQuestion();
    mockedUpdate.mockResolvedValue({ data: question, message: 'ok' });

    render(
      <QuestionEditor
        quizId={1}
        question={question}
        defaultType={null}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(question)}
        autosaveDebounceMs={5000}
      />
    );

    fireEvent.change(screen.getByLabelText('Default Mark'), { target: { value: '2.5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Teacher' }));
    const preview = await screen.findByTestId('question-preview');
    expect(preview.textContent).toContain('Mark 2.5');
  });
});
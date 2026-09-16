import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import QuestionTypeDialog from '@/components/question-editor/question-type-dialog';

afterEach(() => {
  cleanup();
});

describe('QuestionTypeDialog', () => {
  it('menampilkan keempat jenis soal', () => {
    render(<QuestionTypeDialog onCancel={vi.fn()} onSelect={vi.fn()} />);

    expect(screen.getByTestId('question-type-option-multiple_choice')).toHaveTextContent(
      'Multiple Choice'
    );
    expect(screen.getByTestId('question-type-option-true_false')).toHaveTextContent('True / False');
    expect(screen.getByTestId('question-type-option-short_answer')).toHaveTextContent('Short Answer');
    expect(screen.getByTestId('question-type-option-essay')).toHaveTextContent('Essay');
  });

  it('memanggil onSelect dengan jenis yang dipilih', () => {
    const onSelect = vi.fn();
    render(<QuestionTypeDialog onCancel={vi.fn()} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId('question-type-option-short_answer'));

    expect(onSelect).toHaveBeenCalledWith('short_answer');
  });

  it('menutup via tombol Batal dan tombol Escape', () => {
    const onCancel = vi.fn();
    render(<QuestionTypeDialog onCancel={onCancel} onSelect={vi.fn()} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('question-type-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
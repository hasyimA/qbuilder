import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import QuestionEditor from '@/components/question-editor';

vi.mock('@/lib/api', () => ({
  questions: {
    update: vi.fn(),
    create: vi.fn(),
  },
}));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

function renderEditor() {
  const onClose = vi.fn();
  const onSave = vi.fn();
  render(
    <QuestionEditor
      quizId={1}
      question={null}
      defaultType="multiple_choice"
      onClose={onClose}
      onSave={onSave}
    />
  );
  return { onClose, onSave };
}

function openTypePicker() {
  fireEvent.click(screen.getByTestId('question-type-switch'));
}

describe('QuestionEditor — ganti jenis soal', () => {
  it('grid jenis tersembunyi di balik tombol "Ganti Jenis"', () => {
    renderEditor();

    expect(screen.queryByTestId('question-type-picker')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-question-type')).toHaveTextContent('Multiple Choice');

    openTypePicker();
    expect(screen.getByTestId('question-type-picker')).toBeInTheDocument();
  });

  it('beralih ke true/false otomatis menulis opsi True dan False', () => {
    renderEditor();
    openTypePicker();

    fireEvent.click(screen.getByTestId('question-type-option-true_false'));

    expect(screen.getByTestId('current-question-type')).toHaveTextContent('True / False');
    expect(screen.getByLabelText('Pilihan A')).toHaveValue('True');
    expect(screen.getByLabelText('Pilihan B')).toHaveValue('False');
    expect(screen.queryByLabelText('Pilihan C')).not.toBeInTheDocument();
  });

  it('beralih tanpa opsi berarti tidak meminta konfirmasi', () => {
    renderEditor();
    openTypePicker();

    fireEvent.click(screen.getByTestId('question-type-option-essay'));

    expect(screen.queryByTestId('question-type-confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-question-type')).toHaveTextContent('Essay');
  });

  it('opsi default true/false yang belum disentuh tetap beralih tanpa konfirmasi', () => {
    renderEditor();
    openTypePicker();

    fireEvent.click(screen.getByTestId('question-type-option-true_false'));
    openTypePicker();
    fireEvent.click(screen.getByTestId('question-type-option-short_answer'));

    expect(screen.queryByTestId('question-type-confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-question-type')).toHaveTextContent('Short Answer');
    expect(screen.getByLabelText('Pilihan A')).toHaveValue('');
  });

  it('meminta konfirmasi saat opsi lama sudah terisi, dan Batal membatalkan', () => {
    renderEditor();
    openTypePicker();
    fireEvent.click(screen.getByTestId('question-type-option-short_answer'));
    fireEvent.change(screen.getByLabelText('Pilihan A'), { target: { value: 'Router' } });
    openTypePicker();

    fireEvent.click(screen.getByTestId('question-type-option-true_false'));

    const confirm = screen.getByTestId('question-type-confirm');
    expect(confirm).toBeInTheDocument();

    fireEvent.click(within(confirm).getByText('Batal'));

    expect(screen.queryByTestId('question-type-confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-question-type')).toHaveTextContent('Short Answer');
    expect(screen.getByLabelText('Pilihan A')).toHaveValue('Router');
  });

  it('setelah konfirmasi, opsi dibangun ulang sesuai jenis baru', () => {
    renderEditor();
    openTypePicker();
    fireEvent.click(screen.getByTestId('question-type-option-short_answer'));
    fireEvent.change(screen.getByLabelText('Pilihan A'), { target: { value: 'Router' } });
    openTypePicker();

    fireEvent.click(screen.getByTestId('question-type-option-true_false'));
    fireEvent.click(screen.getByTestId('question-type-confirm-accept'));

    expect(screen.queryByTestId('question-type-confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-question-type')).toHaveTextContent('True / False');
    expect(screen.getByLabelText('Pilihan A')).toHaveValue('True');
    expect(screen.getByLabelText('Pilihan B')).toHaveValue('False');
  });
});
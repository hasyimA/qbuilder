import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OptionBulkPaste from '@/components/question-editor/option-bulk-paste';

afterEach(() => {
  cleanup();
});

describe('OptionBulkPaste', () => {
  it('splits pasted lettered options into entries', () => {
    const onApply = vi.fn();
    render(<OptionBulkPaste onApply={onApply} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tempel pilihan dari clipboard' }));
    fireEvent.change(screen.getByLabelText('Tempel pilihan'), {
      target: { value: 'A. Router\nB. Switch\nC. Hub\nD. Access Point' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pisahkan menjadi pilihan' }));

    expect(onApply).toHaveBeenCalledWith(['Router', 'Switch', 'Hub', 'Access Point']);
  });

  it('splits numbered lists', () => {
    const onApply = vi.fn();
    render(<OptionBulkPaste onApply={onApply} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tempel pilihan dari clipboard' }));
    fireEvent.change(screen.getByLabelText('Tempel pilihan'), {
      target: { value: '1. apples\n2. oranges' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pisahkan menjadi pilihan' }));

    expect(onApply).toHaveBeenCalledWith(['apples', 'oranges']);
  });

  it('shows a clear error when the pasted text is not option-like', () => {
    const onApply = vi.fn();
    render(<OptionBulkPaste onApply={onApply} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tempel pilihan dari clipboard' }));
    fireEvent.change(screen.getByLabelText('Tempel pilihan'), {
      target: { value: 'This is a plain sentence.\nAnother sentence follows.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pisahkan menjadi pilihan' }));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText(/Pola pilihan tidak terdeteksi/)).toBeInTheDocument();
  });

  it('treats plain lines as options only when allowed', () => {
    const onApply = vi.fn();
    const { rerender } = render(<OptionBulkPaste onApply={onApply} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tempel pilihan dari clipboard' }));
    fireEvent.change(screen.getByLabelText('Tempel pilihan'), {
      target: { value: 'router\nswitch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pisahkan menjadi pilihan' }));
    expect(onApply).not.toHaveBeenCalled();

    rerender(<OptionBulkPaste onApply={onApply} allowPlainLines />);
    fireEvent.change(screen.getByLabelText('Tempel pilihan'), {
      target: { value: 'router\nswitch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pisahkan menjadi pilihan' }));
    expect(onApply).toHaveBeenCalled();
  });

  it('remains hidden until opened', () => {
    render(<OptionBulkPaste onApply={vi.fn()} />);
    expect(screen.queryByLabelText('Tempel pilihan')).not.toBeInTheDocument();
  });
});
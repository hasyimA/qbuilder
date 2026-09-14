import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SaveStatus from '@/components/question-editor/save-status';

afterEach(() => {
  cleanup();
});

describe('SaveStatus', () => {
  it.each([
    ['idle', 'Belum ada perubahan'],
    ['pending', 'Perubahan belum disimpan'],
    ['saving', 'Menyimpan…'],
    ['saved', 'Tersimpan'],
    ['failed', 'Gagal menyimpan'],
    ['conflict', 'Perlu ditinjau'],
  ] as const)('shows "%s" label for status %s', (status, label) => {
    render(<SaveStatus status={status} />);
    const statusEl = screen.getByRole('status');
    expect(statusEl).toHaveAttribute('data-status', status);
    expect(statusEl).toHaveTextContent(label);
  });

  it('shows the autosave hint only while unsaved changes are pending', () => {
    const { rerender } = render(<SaveStatus status="pending" showHint />);
    expect(screen.getByText(/Tersimpan otomatis/)).toBeInTheDocument();

    rerender(<SaveStatus status="pending" showHint={false} />);
    expect(screen.queryByText(/Tersimpan otomatis/)).not.toBeInTheDocument();
  });

  it('hides the hint for non-pending statuses', () => {
    render(<SaveStatus status="saved" showHint />);
    expect(screen.queryByText(/Tersimpan otomatis/)).not.toBeInTheDocument();
  });
});
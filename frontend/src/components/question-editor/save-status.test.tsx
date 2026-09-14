import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SaveStatus from '@/components/question-editor/save-status';

afterEach(() => {
  cleanup();
});

describe('SaveStatus', () => {
  it.each([
    ['idle', 'No changes'],
    ['pending', 'Unsaved changes'],
    ['saving', 'Saving…'],
    ['saved', 'Saved ✓'],
    ['failed', 'Save failed'],
    ['conflict', 'Needs review'],
  ] as const)('shows "%s" label for status %s', (status, label) => {
    render(<SaveStatus status={status} />);
    const statusEl = screen.getByRole('status');
    expect(statusEl).toHaveAttribute('data-status', status);
    expect(statusEl).toHaveTextContent(label);
  });

  it('shows the autosave hint only while unsaved changes are pending', () => {
    const { rerender } = render(<SaveStatus status="pending" showHint />);
    expect(screen.getByText(/Autosaved/)).toBeInTheDocument();

    rerender(<SaveStatus status="pending" showHint={false} />);
    expect(screen.queryByText(/Autosaved/)).not.toBeInTheDocument();
  });

  it('hides the hint for non-pending statuses', () => {
    render(<SaveStatus status="saved" showHint />);
    expect(screen.queryByText(/Autosaved/)).not.toBeInTheDocument();
  });
});
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogSurface } from '@/components/ui/dialog';

afterEach(cleanup);

function renderDialog(onClose = vi.fn()) {
  const utils = render(
    <DialogSurface
      titleId="dlg-title"
      onClose={onClose}
      className="fixed"
      panelClassName="panel"
      dataTestid="test-dialog"
    >
      <h2 id="dlg-title">Judul</h2>
      <input aria-label="Pertama" />
      <button type="button">Tutup</button>
    </DialogSurface>
  );
  return { onClose, ...utils };
}

describe('DialogSurface', () => {
  it('is labelled, modal and wired to its heading', () => {
    renderDialog();
    const dialog = screen.getByTestId('test-dialog');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('dlg-title');
    expect(dialog.querySelector('h2')?.id).toBe('dlg-title');
  });

  it('moves initial focus to the first focusable element', () => {
    renderDialog();
    expect(document.activeElement).toBe(screen.getByLabelText('Pertama'));
  });

  it('closes on Escape', () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('wraps Tab navigation between first and last focusable', () => {
    renderDialog();
    const first = screen.getByLabelText('Pertama') as HTMLInputElement;
    const last = screen.getByRole('button', { name: 'Tutup' }) as HTMLButtonElement;

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
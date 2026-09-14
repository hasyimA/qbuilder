import { describe, expect, it, vi } from 'vitest';
import { media } from '@/lib/api';

describe('media.upload size guard', () => {
  it('rejects files larger than the server maximum without contacting the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', {
      type: 'image/png',
    });

    await expect(media.upload(oversized)).rejects.toThrow('melebihi 5 MB');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('passes files within the server maximum through to the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 1 }, message: 'ok' }),
    } as Response);
    const ok = new File([new Uint8Array(1024)], 'small.png', { type: 'image/png' });

    await media.upload(ok);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });
});
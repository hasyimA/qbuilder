import { media } from '@/lib/api';
import type { MediaResolution } from '../types';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.slice(result.indexOf(',') + 1);
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas media.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Resolves a media record to a Moodle-embeddable payload by fetching the file
 * bytes through the API (which carries CORS + auth headers) and inlining them
 * as base64 (used in the `<file>` manifest). The raw `/storage` URL bypasses
 * Laravel and is not readable cross-origin, so it is not used here.
 */
export async function resolveMediaFromApi(mediaId: number): Promise<MediaResolution> {
  const { data } = await media.get(mediaId);
  const blob = await media.download(mediaId);
  const base64 = await blobToBase64(blob);
  return {
    filename: data.filename,
    mimeType: data.mime_type,
    base64,
    width: data.width ?? undefined,
    height: data.height ?? undefined,
  };
}
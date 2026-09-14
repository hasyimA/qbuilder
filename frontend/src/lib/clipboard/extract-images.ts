import type { UploadedImage } from '@/components/rich-text/editor-context';

// Image extraction from clipboard HTML. Embedded images (data: URIs) and
// http(s) images are uploaded through the media API and replaced with
// `<img data-media-id="…">` references (the only form the document model
// stores). Anything that cannot be uploaded becomes a visible marker so no
// data is silently lost.

const IMAGE_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

function dataUriToFile(src: string): File | null {
  const match = /^data:image\/(png|jpe?g|gif|webp)(;base64)?,([\s\S]*)$/i.exec(src);
  if (!match) return null;

  const mime = `image/${match[1] === 'jpg' ? 'jpeg' : match[1].toLowerCase()}`;
  const ext = IMAGE_MIME_EXT[mime];
  if (!ext) return null;

  let binary = '';
  if (match[2]) {
    try {
      binary = atob(match[3]);
    } catch {
      return null;
    }
  } else {
    try {
      binary = decodeURIComponent(match[3]);
    } catch {
      return null;
    }
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new File([bytes], `pasted-image.${ext}`, { type: mime });
}

async function remoteUrlToFile(src: string): Promise<File | null> {
  if (!/^https?:\/\//i.test(src)) return null;
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    const ext = IMAGE_MIME_EXT[blob.type] ?? 'png';
    return new File([blob], `pasted-image.${ext}`, { type: blob.type });
  } catch {
    return null;
  }
}

async function imageFromSource(src: string): Promise<File | null> {
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:image/')) return dataUriToFile(trimmed);
  return remoteUrlToFile(trimmed);
}

interface ImageReplacement {
  img: HTMLImageElement;
  uploaded?: { id: number; width?: number | null; height?: number | null };
  marker: string;
}

/**
 * Uploads every usable image found in the HTML fragment and rewrites those
 * `<img>` tags to carry `data-media-id`. Failed images become a visible
 * `[image: alt]` note.
 */
export async function processImagesInHtml(
  html: string,
  uploadImage?: (file: File) => Promise<UploadedImage>
): Promise<string> {
  if (!html) return '';

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const images = Array.from(doc.querySelectorAll('img'));
  if (images.length === 0) return html;

  const replacements = await Promise.all(
    images.map(async (img): Promise<ImageReplacement> => {
      const src = img.getAttribute('src') ?? '';
      const alt = img.getAttribute('alt') ?? '';
      const marker = alt ? `[image: ${alt}]` : '[image]';

      const file = await imageFromSource(src);
      if (!file) return { img, marker };

      if (!uploadImage) return { img, marker };

      try {
        const uploaded = await uploadImage(file);
        return { img, uploaded: uploaded as ImageReplacement['uploaded'], marker };
      } catch {
        return { img, marker };
      }
    })
  );

  for (const replacement of replacements) {
    if (!replacement.uploaded) {
      replacement.img.replaceWith(doc.createTextNode(replacement.marker));
      continue;
    }

    const img = replacement.img;
    img.removeAttribute('src');
    img.setAttribute('data-media-id', String(replacement.uploaded.id));
    if (replacement.uploaded.width) {
      img.setAttribute('data-width', String(replacement.uploaded.width));
    }
    if (replacement.uploaded.height) {
      img.setAttribute('data-height', String(replacement.uploaded.height));
    }
    const alt = img.getAttribute('alt') ?? '';
    if (alt) img.setAttribute('alt', alt);
  }

  return doc.body.innerHTML;
}
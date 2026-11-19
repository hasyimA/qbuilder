'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { useEditorDeps } from './editor-context';

interface ImageAttrs {
  mediaId: number | null;
  alt: string | null;
  width: number | null;
  height: number | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageNode: {
      setImage: (attrs: Partial<ImageAttrs>) => ReturnType;
    };
  }
}

const ImageNode = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes(): Record<string, unknown> {
    return {
      mediaId: { default: null },
      alt: { default: null },
      width: { default: null },
      height: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-media-id]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          const mediaId = parseInt(el.getAttribute('data-media-id') ?? '', 10);
          const width = parseInt(el.getAttribute('data-width') ?? '', 10);
          const height = parseInt(el.getAttribute('data-height') ?? '', 10);
          return {
            mediaId: Number.isFinite(mediaId) && mediaId > 0 ? mediaId : null,
            alt: el.getAttribute('alt') ?? null,
            width: Number.isFinite(width) && width > 0 ? width : null,
            height: Number.isFinite(height) && height > 0 ? height : null,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const htmlAttributes: Record<string, unknown> = {
      'data-media-id': node.attrs.mediaId,
      alt: node.attrs.alt ?? '',
    };
    if (node.attrs.width) htmlAttributes.width = node.attrs.width;
    if (node.attrs.height) htmlAttributes.height = node.attrs.height;
    return ['img', mergeAttributes(HTMLAttributes, htmlAttributes)];
  },

  addCommands() {
    return {
      setImage:
        (attrs: Partial<ImageAttrs>) =>
        ({ commands }) =>
          commands.insertContent({ type: 'image', attrs }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageComponent);
  },
});

export default ImageNode;

const SIZE_PRESETS = [
  { label: 'Kecil', width: 220 },
  { label: 'Sedang', width: 380 },
  { label: 'Besar', width: 560 },
] as const;

const MIN_IMAGE_WIDTH = 80;
const MAX_IMAGE_WIDTH = 1200;

function clampWidth(w: number): number {
  return Math.max(MIN_IMAGE_WIDTH, Math.min(MAX_IMAGE_WIDTH, Math.round(w)));
}

function ImageComponent(props: NodeViewProps) {
  const { node, updateAttributes, selected, editor } = props;
  const { resolveMediaUrl } = useEditorDeps();
  const [loaded, setLoaded] = useState<{ id: number; url: string } | null>(null);
  const [failedId, setFailedId] = useState<number | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const editable = editor.isEditable;
  const mediaId = node.attrs.mediaId as number | null;
  const alt = (node.attrs.alt as string | null) ?? '';
  const storedWidth =
    typeof node.attrs.width === 'number' && node.attrs.width > 0 ? node.attrs.width : null;
  const storedHeight =
    typeof node.attrs.height === 'number' && node.attrs.height > 0 ? node.attrs.height : null;

  useEffect(() => {
    if (!mediaId) return;
    let cancelled = false;
    resolveMediaUrl(mediaId)
      .then((resolved) => {
        if (!cancelled && resolved) setLoaded({ id: mediaId, url: resolved });
      })
      .catch(() => {
        if (!cancelled) setFailedId(mediaId);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId, resolveMediaUrl]);

  const url = loaded && loaded.id === mediaId ? loaded.url : null;
  const failed = failedId === mediaId;
  const displayWidth = dragWidth ?? storedWidth;

  function computeProportionalHeight(nextWidth: number): number | null {
    if (naturalSize && naturalSize.width > 0 && naturalSize.height > 0) {
      return Math.max(1, Math.round((nextWidth * naturalSize.height) / naturalSize.width));
    }
    if (storedWidth && storedHeight && storedWidth > 0) {
      return Math.max(1, Math.round((nextWidth * storedHeight) / storedWidth));
    }
    return null;
  }

  function applyWidth(nextWidth: number | null) {
    if (nextWidth === null) {
      updateAttributes({
        width: naturalSize?.width ?? null,
        height: naturalSize?.height ?? null,
      });
      return;
    }
    const clamped = clampWidth(nextWidth);
    updateAttributes({
      width: clamped,
      height: computeProportionalHeight(clamped),
    });
  }

  function startResizeDrag(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const initialWidth =
      imgRef.current?.getBoundingClientRect().width ||
      displayWidth ||
      naturalSize?.width ||
      320;
    let latestWidth = clampWidth(initialWidth);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      latestWidth = clampWidth(initialWidth + deltaX);
      setDragWidth(latestWidth);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setDragWidth(null);
      applyWidth(latestWidth);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  return (
    <NodeViewWrapper className="my-2" data-drag-handle="">
      <div contentEditable={false}>
        {url ? (
          <figure className={editable && selected ? 'rounded-md outline-2 outline-blue-500 p-1' : ''}>
            <div className="relative inline-block max-w-full group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={url}
                alt={alt}
                style={displayWidth ? { width: `${displayWidth}px`, height: 'auto' } : undefined}
                onLoad={(e) => {
                  const el = e.currentTarget;
                  if (el.naturalWidth > 0 && el.naturalHeight > 0) {
                    setNaturalSize({ width: el.naturalWidth, height: el.naturalHeight });
                  }
                }}
                className="max-w-full h-auto rounded-md border border-gray-200 bg-white block"
              />

              {editable && (
                <button
                  type="button"
                  onMouseDown={startResizeDrag}
                  aria-label="Tarik untuk mengubah ukuran gambar"
                  title="Tarik ke kiri/kanan untuk mengubah ukuran gambar"
                  data-testid="image-resize-handle"
                  className="absolute bottom-1.5 right-1.5 flex h-6 w-6 cursor-ew-resize items-center justify-center rounded bg-blue-600/90 text-white shadow-sm opacity-85 hover:opacity-100 focus:opacity-100"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M14 6V14H6M14 10L10 14"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>

            {editable && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <div
                  role="group"
                  aria-label="Ukuran gambar"
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs"
                >
                  {SIZE_PRESETS.map((preset) => {
                    const active = displayWidth !== null && Math.abs(displayWidth - preset.width) <= 15;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => applyWidth(preset.width)}
                        className={`rounded px-2 py-0.5 font-medium transition-colors ${
                          active
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 hover:bg-gray-200/70 hover:text-gray-900'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => applyWidth(null)}
                    className="rounded px-2 py-0.5 font-medium text-gray-600 hover:bg-gray-200/70 hover:text-gray-900"
                  >
                    Asli
                  </button>
                  {displayWidth && (
                    <span className="px-1.5 text-[11px] text-gray-500 tabular-nums">
                      {displayWidth}px
                    </span>
                  )}
                </div>

                <input
                  className="min-w-[180px] flex-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={alt}
                  onChange={(event) => updateAttributes({ alt: event.target.value })}
                  placeholder="Teks alternatif (opsional)"
                  aria-label="Teks alternatif gambar"
                />
              </div>
            )}
          </figure>
        ) : failed ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Gambar gagal dimuat.
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-400">
            <span className="h-4 w-4 animate-pulse rounded-full bg-gray-300" aria-hidden="true" />
            Memuat gambar…
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

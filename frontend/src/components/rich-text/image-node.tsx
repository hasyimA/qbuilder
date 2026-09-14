'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
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

function ImageComponent(props: NodeViewProps) {
  const { node, updateAttributes, selected, editor } = props;
  const { resolveMediaUrl } = useEditorDeps();
  const [loaded, setLoaded] = useState<{ id: number; url: string } | null>(null);
  const [failedId, setFailedId] = useState<number | null>(null);

  const editable = editor.isEditable;
  const mediaId = node.attrs.mediaId as number | null;
  const alt = (node.attrs.alt as string | null) ?? '';

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

  return (
    <NodeViewWrapper className="my-2" data-drag-handle="">
      <div contentEditable={false}>
        {url ? (
          <figure className={editable && selected ? 'rounded-md outline-2 outline-blue-500' : ''}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={alt}
              className="max-w-full rounded-md border border-gray-200 bg-white"
            />
            {editable && (
              <input
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={alt}
                onChange={(event) => updateAttributes({ alt: event.target.value })}
                placeholder="Alt text (optional)"
                aria-label="Image alt text"
              />
            )}
          </figure>
        ) : failed ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Image couldn&apos;t be loaded.
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-400">
            <span className="h-4 w-4 animate-pulse rounded-full bg-gray-300" aria-hidden="true" />
            Loading image…
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './rich-text.css';
import { canonicalizeDoc, toEditorContent } from '@/lib/document';
import { sanitizeHtml } from '@/lib/sanitizer';
import { detectFormat, parseHTML as parseClipboardHtml } from '@/lib/clipboard';
import type { DocContent } from '@/lib/types';
import { EditorDepsContext } from './editor-context';
import type { UploadedImage } from './editor-context';
import EquationNode from './equation-node';
import ImageNode from './image-node';

interface RichTextEditorProps {
  value: DocContent | null | undefined;
  onChange?: (doc: DocContent) => void;
  placeholder?: string;
  ariaLabel?: string;
  readOnly?: boolean;
  resolveMediaUrl?: (mediaId: number) => Promise<string>;
  uploadImage?: (file: File) => Promise<UploadedImage>;
  onEditorReady?: (editor: Editor) => void;
  className?: string;
}

interface ToolbarButtonProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

function ToolbarButton({ label, onClick, active, disabled, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md border border-transparent px-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? 'bg-blue-100 text-blue-700' : ''
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-6 w-px bg-gray-200" aria-hidden="true" />;
}

function defaultResolveMediaUrl(mediaId: number): Promise<string> {
  // Lazy import prevents bundling the API client when the editor is used
  // only for display.
  return import('@/lib/api').then(({ media, resolveApiUrl }) =>
    media.get(mediaId).then((res) => resolveApiUrl(res.data.url))
  );
}

async function defaultUploadImage(file: File): Promise<UploadedImage> {
  const { media, resolveApiUrl } = await import('@/lib/api');
  const res = await media.upload(file);
  return {
    id: res.data.id,
    url: resolveApiUrl(res.data.url),
    width: res.data.width,
    height: res.data.height,
  };
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  readOnly = false,
  resolveMediaUrl,
  uploadImage,
  onEditorReady,
  className,
}: RichTextEditorProps) {
  const [, setRevision] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [tableOpen, setTableOpen] = useState(false);
  const [equationOpen, setEquationOpen] = useState(false);
  const [equationDraft, setEquationDraft] = useState('');
  const [imagesBusy, setImagesBusy] = useState(false);

  const depsValue = useMemo(
    () => ({
      resolveMediaUrl: resolveMediaUrl ?? defaultResolveMediaUrl,
      uploadImage: uploadImage ?? defaultUploadImage,
    }),
    [resolveMediaUrl, uploadImage]
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    content: toEditorContent(value),
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Superscript,
      Subscript,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder ?? 'Ketik pertanyaan…' }),
      ImageNode,
      EquationNode,
    ],
    editorProps: {
      attributes: {
        'aria-label': ariaLabel ?? 'Editor teks kaya',
        'data-testid': 'rte-content',
        class: 'rte-content',
      },
    },
    onUpdate: ({ editor: instance }) => {
      const doc = canonicalizeDoc(instance.getJSON());
      if (doc) onChange?.(doc);
      setRevision((r) => r + 1);
    },
    onSelectionUpdate: () => setRevision((r) => r + 1),
    onCreate: ({ editor: instance }) => {
      onEditorReady?.(instance);
    },
  });

  const handleImageFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((file) => file.type.startsWith('image/'));
      if (images.length === 0 || !editor) return;
      setImagesBusy(true);
      try {
        for (const file of images) {
          try {
            const uploaded = await depsValue.uploadImage(file);
            editor
              .chain()
              .focus()
              .setImage({
                mediaId: uploaded.id,
                alt: '',
                width: uploaded.width ?? null,
                height: uploaded.height ?? null,
              })
              .run();
          } catch (error) {
            if (error instanceof Error) {
              window.alert(error.message);
            }
          }
        }
      } finally {
        setImagesBusy(false);
      }
    },
    [editor, depsValue]
  );

  const insertPastedHtml = useCallback(
    async (html: string) => {
      if (!editor) return;
      setImagesBusy(true);
      try {
        const ready = await parseClipboardHtml(html, {
          uploadImage: depsValue.uploadImage,
        });
        if (ready) {
          editor.chain().focus().insertContent(ready).run();
        }
      } catch {
        const clean = sanitizeHtml(html);
        if (clean) editor.chain().focus().insertContent(clean).run();
      } finally {
        setImagesBusy(false);
      }
    },
    [editor, depsValue]
  );

  useEffect(() => {
    if (!editor) return;

    const dom = editor.view.dom;

    const onPaste = (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const files = Array.from(clipboardData.files ?? []);
      if (files.some((file) => file.type.startsWith('image/'))) {
        event.preventDefault();
        void handleImageFiles(files);
        return;
      }

      const format = detectFormat(clipboardData);
      if (format === 'html') {
        event.preventDefault();
        const html = clipboardData.getData('text/html');
        if (html) void insertPastedHtml(html);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const { from, to } = editor.state.selection;
        const selectedHref = from !== to ? editor.getAttributes('link').href : '';
        setLinkHref(typeof selectedHref === 'string' ? selectedHref : '');
        setLinkOpen(true);
      }
    };

    dom.addEventListener('paste', onPaste);
    dom.addEventListener('keydown', onKeyDown);
    return () => {
      dom.removeEventListener('paste', onPaste);
      dom.removeEventListener('keydown', onKeyDown);
    };
  }, [editor, handleImageFiles, insertPastedHtml]);

  useEffect(() => {
    if (!editor || !readOnly) return;
    const current = JSON.stringify(canonicalizeDoc(editor.getJSON()));
    const next = JSON.stringify(canonicalizeDoc(value));
    if (current === next) return;
    if (next === 'null') {
      if (current === JSON.stringify({ type: 'doc', content: [] })) return;
      editor.commands.setContent({ type: 'doc', content: [] }, { emitUpdate: false });
      return;
    }
    editor.commands.setContent(toEditorContent(value), { emitUpdate: false });
  }, [editor, value, readOnly]);

  if (!editor) {
    return (
      <div className="rounded-md border border-gray-200 px-3 py-4 text-sm text-gray-400">
        Memuat editor…
      </div>
    );
  }

  const applyLink = () => {
    const href = linkHref.trim();
    if (href) {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    }
    setLinkOpen(false);
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    setTableOpen(false);
  };

  const inTable = editor.isActive('table');
  const canUpload = imagesBusy === false;

  return (
    <EditorDepsContext.Provider value={depsValue}>
      <div className={`overflow-hidden rounded-md border border-gray-300 ${className ?? ''}`}>
        {!readOnly && (
          <div
            className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1"
            role="toolbar"
            aria-label={ariaLabel ?? 'Bilah format'}
          >
            <ToolbarButton label="Urungkan" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h12a4 4 0 010 8H3m0-8l4-4m-4 4l4 4" />
              </svg>
            </ToolbarButton>
            <ToolbarButton label="Ulangi" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 9h-12a4 4 0 000 8h12m0-8l-4-4m4 4l-4 4" />
              </svg>
            </ToolbarButton>

            <Divider />

            <ToolbarButton label="Tebal (Ctrl+B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
              <span className="font-bold">B</span>
            </ToolbarButton>
            <ToolbarButton label="Miring (Ctrl+I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
              <span className="italic">I</span>
            </ToolbarButton>
            <ToolbarButton label="Garis bawah (Ctrl+U)" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
              <span className="underline">U</span>
            </ToolbarButton>
            <ToolbarButton label="Coret" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
              <span className="line-through">S</span>
            </ToolbarButton>
            <ToolbarButton label="Superskrip" active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()}>
              <span className="text-xs">x²</span>
            </ToolbarButton>
            <ToolbarButton label="Subskrip" active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()}>
              <span className="text-xs">x₂</span>
            </ToolbarButton>
            <ToolbarButton label="Kode sebaris" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
              <span className="font-mono">&lt;/&gt;</span>
            </ToolbarButton>
            <ToolbarButton
              label="Hapus format"
              onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
            >
              <span className="text-xs">Tx</span>
            </ToolbarButton>

            <Divider />

            <ToolbarButton label="Judul 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
              <span className="text-sm font-bold">H1</span>
            </ToolbarButton>
            <ToolbarButton label="Judul 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <span className="text-sm font-bold">H2</span>
            </ToolbarButton>
            <ToolbarButton label="Judul 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
              <span className="text-sm font-bold">H3</span>
            </ToolbarButton>
            <ToolbarButton
              label="Paragraf"
              active={editor.isActive('paragraph')}
              onClick={() => editor.chain().focus().setParagraph().run()}
            >
              <span className="text-sm">¶</span>
            </ToolbarButton>

            <Divider />

            <ToolbarButton label="Daftar poin" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <span className="text-sm">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </span>
            </ToolbarButton>
            <ToolbarButton label="Daftar bernomor" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <span className="text-sm">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01" />
                </svg>
              </span>
            </ToolbarButton>
            <ToolbarButton label="Kutipan" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <span className="text-sm text-gray-700">“</span>
            </ToolbarButton>
            <ToolbarButton label="Garis horizontal" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
              <span className="text-sm">—</span>
            </ToolbarButton>

            <Divider />

            <ToolbarButton label="Rata kiri" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h14" />
              </svg>
            </ToolbarButton>
            <ToolbarButton label="Rata tengah" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M5 18h14" />
              </svg>
            </ToolbarButton>
            <ToolbarButton label="Rata kanan" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M10 12h10M6 18h14" />
              </svg>
            </ToolbarButton>
            <ToolbarButton label="Rata penuh" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </ToolbarButton>

            <Divider />

            <div className="relative">
              <ToolbarButton label="Tautan (Ctrl+K)" active={editor.isActive('link')} onClick={() => { setLinkHref(String(editor.getAttributes('link').href ?? '')); setLinkTitle(String(editor.getAttributes('link').title ?? '')); setLinkOpen((o) => !o); }}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5L21 3m-5 0h5v5m0 0l-6 6M3 3h5m0 0l6 6m-4 4l-6 6m0-5v5h5" />
                </svg>
              </ToolbarButton>
              {linkOpen && (
                <div className="absolute left-0 top-9 z-20 w-72 space-y-2 rounded-md border border-gray-200 bg-white p-3 shadow-lg">
                  <label className="block text-xs font-medium text-gray-600">URL</label>
                  <input
                    type="text"
                    value={linkHref}
                    onChange={(e) => setLinkHref(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    aria-label="URL tautan"
                  />
                  <label className="block text-xs font-medium text-gray-600">Judul (opsional)</label>
                  <input
                    type="text"
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    aria-label="Judul tautan"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setLinkOpen(false); }}
                      className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Hapus tautan
                    </button>
                    <button
                      type="button"
                      onClick={applyLink}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Terapkan
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <ToolbarButton label="Sisipkan gambar" disabled={!canUpload} onClick={() => fileInputRef.current?.click()}>
                {imagesBusy ? (
                  <span className="h-4 w-4 animate-pulse rounded-full bg-gray-300" aria-hidden="true" />
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4zM8.5 9a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM4 17l4-4 3 3 3-4 6 5" />
                  </svg>
                )}
              </ToolbarButton>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  const selected = Array.from(e.target.files ?? []);
                  void handleImageFiles(selected);
                  e.target.value = '';
                }}
                aria-label="Unggah gambar"
              />
            </div>

            <div className="relative">
              <ToolbarButton label="Sisipkan rumus" onClick={() => { setEquationDraft(''); setEquationOpen((o) => !o); }}>
                <span className="text-sm">Σ</span>
              </ToolbarButton>
              {equationOpen && (
                <div className="absolute right-0 top-9 z-20 w-80 space-y-2 rounded-md border border-gray-200 bg-white p-3 shadow-lg">
                  <label className="block text-xs font-medium text-gray-600">Rumus LaTeX</label>
                  <textarea
                    value={equationDraft}
                    onChange={(e) => setEquationDraft(e.target.value)}
                    rows={2}
                    className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="Contoh: \sqrt{x^2 + y^2}"
                    aria-label="Rumus LaTeX"
                  />
                  <div
                    className="max-h-16 overflow-auto rounded bg-gray-50 px-2 py-1 text-center text-sm"
                    dangerouslySetInnerHTML={{
                      __html: equationDraft
                        ? katex.renderToString(equationDraft, { throwOnError: false, displayMode: true })
                        : '',
                    }}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEquationOpen(false)}
                      className="rounded-md px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (equationDraft.trim()) {
                          editor.chain().focus().setEquation(equationDraft.trim()).run();
                        }
                        setEquationOpen(false);
                      }}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Sisipkan
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <ToolbarButton label="Sisipkan tabel" active={inTable} onClick={() => (inTable ? setTableOpen((o) => !o) : insertTable())}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="4" y="4" width="16" height="16" rx="1" />
                  <path strokeLinecap="round" d="M4 9h16M4 15h16M9 4v16M15 4v16" />
                </svg>
              </ToolbarButton>
              {tableOpen && (
                <div className="absolute right-0 top-9 z-20 grid w-56 grid-cols-2 gap-1 rounded-md border border-gray-200 bg-white p-2 shadow-lg">
                  {!inTable && (
                    <button
                      type="button"
                      onClick={insertTable}
                      className="col-span-2 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      Sisipkan tabel 3×3
                    </button>
                  )}
                  {inTable && (
                    <>
                      <button type="button" onClick={() => { editor.chain().focus().addRowAfter().run(); setTableOpen(false); }} className="rounded-md p-1.5 text-xs text-gray-600 hover:bg-gray-100" aria-label="Tambahkan baris di bawah">Baris +</button>
                      <button type="button" onClick={() => { editor.chain().focus().addColumnAfter().run(); setTableOpen(false); }} className="rounded-md p-1.5 text-xs text-gray-600 hover:bg-gray-100" aria-label="Tambahkan kolom di kanan">Kolom +</button>
                      <button type="button" onClick={() => { editor.chain().focus().deleteRow().run(); setTableOpen(false); }} className="rounded-md p-1.5 text-xs text-gray-600 hover:bg-gray-100" aria-label="Hapus baris">Baris −</button>
                      <button type="button" onClick={() => { editor.chain().focus().deleteColumn().run(); setTableOpen(false); }} className="rounded-md p-1.5 text-xs text-gray-600 hover:bg-gray-100" aria-label="Hapus kolom">Kolom −</button>
                      <button type="button" onClick={() => { editor.chain().focus().toggleHeaderRow().run(); setTableOpen(false); }} className="col-span-2 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50" aria-label="Alihkan baris header">Alihkan baris header</button>
                      <button type="button" onClick={() => { editor.chain().focus().mergeCells().run(); setTableOpen(false); }} className="col-span-2 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50" aria-label="Gabungkan sel">Gabungkan sel</button>
                      <button type="button" onClick={() => { editor.chain().focus().deleteTable().run(); setTableOpen(false); }} className="col-span-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-600 hover:bg-red-100" aria-label="Hapus tabel">Hapus tabel</button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-white px-3 py-2">
          <EditorContent editor={editor} />
        </div>
      </div>
    </EditorDepsContext.Provider>
  );
}
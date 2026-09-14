import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RichTextEditor from '@/components/rich-text/rich-text-editor';
import type { DocContent } from '@/lib/types';

interface EditorMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface EditorJson {
  type?: string;
  text?: string;
  marks?: EditorMark[];
  attrs?: Record<string, unknown>;
  content?: EditorJson[];
}

function editableJson(editor: Editor): EditorJson {
  return editor.getJSON() as unknown as EditorJson;
}

function collectText(node: EditorJson | undefined, out: string[] = []): string[] {
  if (!node) return out;
  if (node.type === 'text' && node.text) out.push(node.text);
  if (Array.isArray(node.content)) {
    for (const child of node.content) collectText(child, out);
  }
  return out;
}

function findFirstText(node: EditorJson | undefined): EditorJson | undefined {
  return findTextBy(node, true) ?? findTextBy(node, false);
}

function findTextBy(node: EditorJson | undefined, preferMarks: boolean): EditorJson | undefined {
  if (!node) return undefined;
  if (node.type === 'text') {
    const hasMarks = Array.isArray(node.marks) && node.marks.length > 0;
    if (hasMarks === preferMarks) return node;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      const found = findTextBy(child, preferMarks);
      if (found) return found;
    }
  }
  return undefined;
}

let editorRef: Editor | undefined;

function mountEditor(options?: {
  value?: DocContent | null;
  resolveMediaUrl?: () => Promise<string>;
  uploadImage?: () => Promise<{ id: number; url: string; width: number; height: number }>;
  onChange?: (doc: DocContent) => void;
}) {
  editorRef = undefined;
  const resolveMediaUrl = options?.resolveMediaUrl ?? vi.fn().mockResolvedValue('/media/1.png');
  const uploadImage = options?.uploadImage ?? vi.fn().mockResolvedValue({ id: 1, url: '/media/u.png', width: 10, height: 10 });
  const onChange = options?.onChange ?? vi.fn();

  render(
    <RichTextEditor
      value={options?.value ?? null}
      onChange={onChange}
      resolveMediaUrl={resolveMediaUrl}
      uploadImage={uploadImage}
      onEditorReady={(editor) => {
        editorRef = editor;
      }}
    />
  );

  return { getEditor: () => editorRef, onChange, resolveMediaUrl, uploadImage };
}

async function awaitEditor() {
  await waitFor(() => {
    expect(editorRef).toBeDefined();
    expect(editorRef!.isDestroyed).not.toBe(true);
  }, { timeout: 10000 });
  return editorRef!;
}

afterEach(() => {
  cleanup();
  editorRef = undefined;
});

describe('RichTextEditor', () => {
  it('renders stored content on mount (strikethrough maps to strike)', async () => {
    const value: DocContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'bad', marks: [{ type: 'strikethrough' }] },
          ],
        },
      ],
    };

    mountEditor({ value });
    const editor = await awaitEditor();

    const json = editableJson(editor);
    expect(collectText(json).join('')).toBe('Hello bad');
    expect(findFirstText(json)?.marks).toEqual([{ type: 'strike' }]);
  });

  it('creates an empty document when no value is given', async () => {
    mountEditor();
    const editor = await awaitEditor();
    expect(editableJson(editor)).toEqual({ type: 'doc' });
  });

  it('reports every change through onChange', async () => {
    const { onChange } = mountEditor();
    const editor = await awaitEditor();

    editor.commands.insertContent('First draft');
    await waitFor(() => expect(onChange).toHaveBeenCalled());

    const last = (onChange as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as DocContent;
    expect(collectText(last).join(' ')).toContain('First draft');
  });

  it('applies bold via the toolbar', async () => {
    const { getEditor } = mountEditor();
    const editor = await awaitEditor();

    editor.chain().focus().insertContent('Bold me').run();
    editor.commands.selectAll();
    fireEvent.click(screen.getByRole('button', { name: 'Bold (Ctrl+B)' }));

    await waitFor(() => {
      expect(findFirstText(editableJson(getEditor()!))?.marks).toEqual([{ type: 'bold' }]);
    });
  });

  it('toggles a bullet list via the toolbar', async () => {
    const { getEditor } = mountEditor();
    const editor = await awaitEditor();

    editor.chain().focus().insertContent('Item one').run();
    editor.commands.selectAll();
    fireEvent.click(screen.getByRole('button', { name: 'Bullet list' }));

    await waitFor(() => {
      const json = editableJson(getEditor()!);
      expect(json.content?.[0]?.type).toBe('bulletList');
      expect(json.content?.[0]?.content?.[0]?.type).toBe('listItem');
    });
  });

  it('inserts a table with a header row', async () => {
    const { getEditor } = mountEditor();
    const editor = await awaitEditor();

    editor.commands.focus();
    fireEvent.click(screen.getByRole('button', { name: 'Insert table' }));

    await waitFor(() => {
      const json = editableJson(getEditor()!);
      const table = json.content?.find((n) => n.type === 'table');
      expect(table).toBeDefined();
      expect(table?.content?.[0]?.type).toBe('tableRow');
      expect(table?.content?.[0]?.content?.[0]?.type).toBe('tableHeader');
    });
  });

  it('undoes then redoes typing steps', async () => {
    const { getEditor } = mountEditor();
    const editor = await awaitEditor();

    editor.chain().focus().insertContent('A').run();
    editor.chain().focus().insertContent('B').run();

    await waitFor(() => expect(editor.can().undo()).toBe(true));

    editor.chain().focus().undo().run();
    await waitFor(() => {
      expect(collectText(editableJson(getEditor()!)).join('')).not.toContain('B');
    });

    editor.chain().focus().redo().run();
    await waitFor(() => {
      expect(collectText(editableJson(getEditor()!)).join('')).toContain('B');
    });
  });

  it('sanitizes pasted HTML before inserting', async () => {
    const { getEditor } = mountEditor();
    const editor = await awaitEditor();

    const malicious = `
      <p>Safe <b>text</b></p>
      <script>alert(1)</script>
      <a href="javascript:alert(2)">bad link</a>
      <p><a href="https://ok.example/x">good link</a></p>
      <img src="data:image/png;base64,AAAA" alt="stripped">
    `;

    fireEvent.paste(editor.view.dom, {
      clipboardData: {
        types: ['text/html'],
        getData: (type: string) => (type === 'text/html' ? malicious : ''),
        files: [],
      },
    });

    await waitFor(() => {
      const json = editableJson(getEditor()!);
      const text = collectText(json).join(' ');
      expect(text).toContain('Safe');
      expect(text).not.toContain('alert(1)');
      expect(json.content?.some((n) => n.type === 'script')).toBe(false);
    });

    const html = getEditor()!.getHTML();
    expect(html).not.toContain('javascript:alert');
    expect(html).not.toContain('data:image');
    expect(html).toContain('href="https://ok.example/x"');
  });

  it('toggles bold with Ctrl+B keyboard shortcut', async () => {
    const { getEditor } = mountEditor();
    const editor = await awaitEditor();

    editor.chain().focus().insertContent('Hotkey').run();
    editor.commands.selectAll();
    fireEvent.keyDown(editor.view.dom, { key: 'b', ctrlKey: true, bubbles: true });

    await waitFor(() => {
      expect(findFirstText(editableJson(getEditor()!))?.marks).toEqual([{ type: 'bold' }]);
    });
  });

  it('opens the link dialog with Ctrl+K', async () => {
    mountEditor();
    const editor = await awaitEditor();

    editor.commands.focus();
    fireEvent.keyDown(editor.view.dom, { key: 'k', ctrlKey: true, bubbles: true });

    expect(screen.getByLabelText('Link URL')).toBeInTheDocument();
  });

  it('builds an image node from a pasted image file', async () => {
    const uploadImage = vi.fn().mockResolvedValue({ id: 42, url: '/media/x.png', width: 12, height: 34 });
    mountEditor({ uploadImage });
    const editor = await awaitEditor();

    const file = new File(['fakepng'], 'diagram.png', { type: 'image/png' });
    fireEvent.paste(editor.view.dom, {
      clipboardData: {
        types: ['Files'],
        getData: () => '',
        files: [file],
      },
    });

    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(file));

    const json = editableJson(await awaitEditor());
    const image = json.content?.find((n) => n.type === 'image');
    expect(image?.attrs).toMatchObject({ mediaId: 42, width: 12, height: 34 });
  });

  it('resolves a media URL for stored image content', async () => {
    const resolveMediaUrl = vi.fn().mockResolvedValue('/media/pic.png');
    const value: DocContent = { type: 'doc', content: [{ type: 'image', attrs: { mediaId: 9, alt: 'Picture' } }] };

    mountEditor({ value, resolveMediaUrl });
    await awaitEditor();

    await waitFor(() => expect(resolveMediaUrl).toHaveBeenCalledWith(9));
  });
});
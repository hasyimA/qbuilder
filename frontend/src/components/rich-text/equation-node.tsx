'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import katex from 'katex';
import { useState } from 'react';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    equationNode: {
      setEquation: (value: string) => ReturnType;
    };
  }
}

const EquationNode = Node.create({
  name: 'equation',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes(): Record<string, unknown> {
    return {
      format: { default: 'latex' },
      value: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-equation]',
        getAttrs: (dom) => ({
          value: (dom as HTMLElement).getAttribute('data-equation') ?? '',
          format: 'latex',
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-equation': node.attrs.value ?? '',
      }),
    ];
  },

  addCommands() {
    return {
      setEquation:
        (value: string) =>
        ({ commands }) =>
          commands.insertContent({ type: 'equation', attrs: { format: 'latex', value } }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(EquationComponent);
  },
});

export default EquationNode;

function renderLatex(latex: string): string {
  if (!latex.trim()) return '';
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode: true });
  } catch {
    return '';
  }
}

function EquationComponent(props: NodeViewProps) {
  const { node, updateAttributes, selected, deleteNode, editor } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(node.attrs.value ?? ''));

  const editable = editor.isEditable;
  const latex = String(node.attrs.value ?? '');
  const rendered = renderLatex(latex);

  function commit() {
    updateAttributes({ value: draft });
    setEditing(false);
  }

  return (
    <NodeViewWrapper className="my-2" data-drag-handle="">
      <div contentEditable={false}>
        {editable && editing ? (
          <div className="space-y-2 rounded-md border border-gray-300 bg-white p-3">
            <label className="block text-xs font-medium text-gray-500" htmlFor="equation-latex">
              LaTeX
            </label>
            <textarea
              id="equation-latex"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="\frac{-b \pm \sqrt{b^2-4ac}}{2a}"
            />
            <div className="flex items-center justify-between gap-2">
              <div
                className="min-h-8 flex-1 overflow-x-auto rounded bg-gray-50 px-2 py-1 text-center"
                dangerouslySetInnerHTML={{ __html: renderLatex(draft) }}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={commit}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(latex);
                    setEditing(false);
                  }}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={
              editable && selected
                ? 'rounded-md outline-2 outline-blue-500'
                : 'rounded-md border border-transparent'
            }
          >
            {editable && (
              <div className="mb-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(latex);
                    setEditing(true);
                  }}
                  className="rounded-md border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                  aria-label="Edit equation"
                >
                  Σ Edit equation
                </button>
                <button
                  type="button"
                  onClick={deleteNode}
                  className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-red-50 hover:text-red-600"
                  aria-label="Delete equation"
                >
                  Remove
                </button>
              </div>
            )}
            {rendered ? (
              <div
                className="overflow-x-auto rounded-md border border-gray-200 bg-white px-4 py-2 text-center"
                dangerouslySetInnerHTML={{ __html: rendered }}
              />
            ) : (
              <code className="block rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                {'\\'}
                {latex}
              </code>
            )}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
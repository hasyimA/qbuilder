import {
  AlignmentType,
  BorderStyle,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx';
import type { DocContent } from '@/lib/types';
import type { MediaResolution } from '../types';

export type DocxBlock = Paragraph | Table;

export interface DocxInlineContext {
  mediaMap: Map<number, MediaResolution>;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function imageTypeFromMime(mime: string): 'png' | 'jpg' | 'gif' | 'bmp' {
  const lower = mime.toLowerCase();
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg';
  if (lower.includes('gif')) return 'gif';
  if (lower.includes('bmp')) return 'bmp';
  return 'png';
}

function alignmentFromAttr(align: unknown): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  switch (align) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    case 'justify':
      return AlignmentType.JUSTIFIED;
    case 'left':
      return AlignmentType.LEFT;
    default:
      return undefined;
  }
}

interface TextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

function buildInlineRuns(nodes: DocContent[] | undefined): Array<TextRun | ExternalHyperlink> {
  if (!nodes || nodes.length === 0) return [];
  const runs: Array<TextRun | ExternalHyperlink> = [];

  for (const node of nodes) {
    if (node.type === 'text') {
      const text = typeof node.text === 'string' ? node.text : '';
      const marks = Array.isArray(node.marks) ? (node.marks as TextMark[]) : [];
      let bold = false;
      let italics = false;
      let underline = false;
      let strike = false;
      let subScript = false;
      let superScript = false;
      let code = false;
      let href: string | null = null;

      for (const mark of marks) {
        if (mark.type === 'bold') bold = true;
        else if (mark.type === 'italic') italics = true;
        else if (mark.type === 'underline') underline = true;
        else if (mark.type === 'strike') strike = true;
        else if (mark.type === 'subscript') subScript = true;
        else if (mark.type === 'superscript') superScript = true;
        else if (mark.type === 'code') code = true;
        else if (mark.type === 'link' && typeof mark.attrs?.href === 'string') {
          href = mark.attrs.href;
        }
      }

      const run = new TextRun({
        text,
        bold,
        italics,
        strike,
        subScript,
        superScript,
        font: code ? 'Consolas' : undefined,
        underline: underline ? { type: UnderlineType.SINGLE } : undefined,
        color: href ? '2563EB' : undefined,
      });

      if (href) {
        runs.push(
          new ExternalHyperlink({
            link: href,
            children: [run],
          })
        );
      } else {
        runs.push(run);
      }
    } else if (node.type === 'hardBreak') {
      runs.push(new TextRun({ break: 1 }));
    } else if (node.type === 'equation') {
      const latex = typeof node.attrs?.latex === 'string' ? node.attrs.latex : '';
      if (latex) {
        runs.push(
          new TextRun({
            text: latex,
            italics: true,
            font: 'Cambria Math',
          })
        );
      }
    }
  }

  return runs;
}

function buildImageParagraph(
  node: DocContent,
  ctx: DocxInlineContext,
  indentLeft?: number
): Paragraph {
  const mediaId = typeof node.attrs?.mediaId === 'number' ? node.attrs.mediaId : null;
  const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
  const resolved = mediaId ? ctx.mediaMap.get(mediaId) : undefined;

  if (!resolved) {
    return new Paragraph({
      indent: indentLeft ? { left: indentLeft } : undefined,
      spacing: { after: 80 },
      children: [new TextRun({ text: alt ? `[Gambar: ${alt}]` : '[Gambar]', italics: true, color: '6B7280' })],
    });
  }

  const rawWidth =
    (typeof node.attrs?.width === 'number' && node.attrs.width > 0 ? node.attrs.width : null) ??
    resolved.width ??
    360;
  const rawHeight =
    (typeof node.attrs?.height === 'number' && node.attrs.height > 0 ? node.attrs.height : null) ??
    resolved.height ??
    240;

  const maxWidth = 480;
  const scale = rawWidth > maxWidth ? maxWidth / rawWidth : 1;
  const width = Math.max(40, Math.round(rawWidth * scale));
  const height = Math.max(30, Math.round(rawHeight * scale));

  return new Paragraph({
    indent: indentLeft ? { left: indentLeft } : undefined,
    spacing: { before: 60, after: 80 },
    children: [
      new ImageRun({
        type: imageTypeFromMime(resolved.mimeType),
        data: base64ToUint8Array(resolved.base64),
        transformation: { width, height },
      }),
    ],
  });
}

function buildTableBlock(node: DocContent, ctx: DocxInlineContext): Table {
  const rows = (node.content ?? []).filter((r) => r.type === 'tableRow');
  const tableRows = rows.map((row) => {
    const cells = (row.content ?? []).filter(
      (c) => c.type === 'tableCell' || c.type === 'tableHeader'
    );

    return new TableRow({
      children: cells.map((cell) => {
        const isHeader = cell.type === 'tableHeader';
        const children = docToDocxBlocks(cell, ctx, { spacingAfter: 40 });
        return new TableCell({
          shading: isHeader
            ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F4F6' }
            : undefined,
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: children.length > 0 ? children : [new Paragraph('')],
        });
      }),
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows,
  });
}

const HEADING_MAP: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

export function docToDocxBlocks(
  doc: DocContent | null | undefined,
  ctx: DocxInlineContext,
  options: {
    prefix?: string;
    prefixBold?: boolean;
    indentLeft?: number;
    spacingAfter?: number;
  } = {}
): DocxBlock[] {
  if (!doc || !Array.isArray(doc.content)) {
    return options.prefix
      ? [
          new Paragraph({
            indent: options.indentLeft ? { left: options.indentLeft } : undefined,
            spacing: { after: options.spacingAfter ?? 80 },
            children: [new TextRun({ text: options.prefix, bold: options.prefixBold })],
          }),
        ]
      : [];
  }

  const blocks: DocxBlock[] = [];
  let prefixUsed = !options.prefix;

  const consumePrefix = (): TextRun[] => {
    if (prefixUsed || !options.prefix) return [];
    prefixUsed = true;
    return [new TextRun({ text: options.prefix, bold: options.prefixBold ?? true })];
  };

  for (const node of doc.content) {
    if (node.type === 'paragraph') {
      blocks.push(
        new Paragraph({
          alignment: alignmentFromAttr(node.attrs?.textAlign),
          indent: options.indentLeft ? { left: options.indentLeft } : undefined,
          spacing: { after: options.spacingAfter ?? 80 },
          children: [...consumePrefix(), ...buildInlineRuns(node.content)],
        })
      );
    } else if (node.type === 'heading') {
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 3;
      blocks.push(
        new Paragraph({
          heading: HEADING_MAP[level] ?? HeadingLevel.HEADING_3,
          alignment: alignmentFromAttr(node.attrs?.textAlign),
          indent: options.indentLeft ? { left: options.indentLeft } : undefined,
          spacing: { before: 100, after: 80 },
          children: [...consumePrefix(), ...buildInlineRuns(node.content)],
        })
      );
    } else if (node.type === 'image') {
      if (!prefixUsed && options.prefix) {
        blocks.push(
          new Paragraph({
            indent: options.indentLeft ? { left: options.indentLeft } : undefined,
            spacing: { after: 40 },
            children: consumePrefix(),
          })
        );
      }
      blocks.push(buildImageParagraph(node, ctx, options.indentLeft));
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      const items = (node.content ?? []).filter((item) => item.type === 'listItem');
      items.forEach((item, idx) => {
        const marker = node.type === 'orderedList' ? `${idx + 1}. ` : '• ';
        const inner = docToDocxBlocks(item, ctx, {
          prefix: marker,
          prefixBold: false,
          indentLeft: (options.indentLeft ?? 0) + 360,
          spacingAfter: 40,
        });
        blocks.push(...inner);
      });
    } else if (node.type === 'blockquote') {
      const inner = docToDocxBlocks(node, ctx, {
        indentLeft: (options.indentLeft ?? 0) + 360,
        spacingAfter: 80,
      });
      blocks.push(...inner);
    } else if (node.type === 'codeBlock') {
      const text = (node.content ?? []).map((c) => c.text ?? '').join('');
      blocks.push(
        new Paragraph({
          indent: options.indentLeft ? { left: options.indentLeft } : undefined,
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F4F6' },
          spacing: { after: 80 },
          children: [new TextRun({ text, font: 'Consolas', size: 20 })],
        })
      );
    } else if (node.type === 'horizontalRule') {
      blocks.push(
        new Paragraph({
          border: {
            bottom: { color: 'D1D5DB', size: 6, style: BorderStyle.SINGLE, space: 1 },
          },
          spacing: { after: 100 },
        })
      );
    } else if (node.type === 'table') {
      if (!prefixUsed && options.prefix) {
        blocks.push(
          new Paragraph({
            indent: options.indentLeft ? { left: options.indentLeft } : undefined,
            spacing: { after: 40 },
            children: consumePrefix(),
          })
        );
      }
      blocks.push(buildTableBlock(node, ctx));
    }
  }

  return blocks;
}

export function collectMediaIdsFromDoc(doc: DocContent | null | undefined, out: Set<number>): void {
  if (!doc) return;
  if (doc.type === 'image' && typeof doc.attrs?.mediaId === 'number' && doc.attrs.mediaId > 0) {
    out.add(doc.attrs.mediaId);
  }
  if (Array.isArray(doc.content)) {
    for (const child of doc.content) {
      collectMediaIdsFromDoc(child, out);
    }
  }
}

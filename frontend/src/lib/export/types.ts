import type { Question, Quiz } from '@/lib/types';

/** A teacher-facing validation problem. Never exported silently. */
export interface ExportValidationError {
  /** Machine-readable code, e.g. `question-empty`, `no-correct-option`. */
  code: string;
  /** Indonesian message a teacher can act on, e.g. "Soal 3: ..." */
  message: string;
  /** 1-based position of the offending question, when applicable. */
  questionIndex?: number;
}

/** Media resolution result an exporter needs to inline images into the XML. */
export interface MediaResolution {
  filename: string;
  mimeType: string;
  /** Base64-encoded file content for the Moodle `<file>` manifest. */
  base64: string;
  width?: number;
  height?: number;
}

/** Resolves a media record id to data that can be embedded in a Moodle XML file. */
export type ResolveMedia = (mediaId: number) => Promise<MediaResolution>;

export interface ExportContext {
  quiz: Quiz;
  /** Questions in export order (caller sorts by sort_order). */
  questions: Question[];
  /** Required when any question references an image. */
  resolveMedia?: ResolveMedia;
}

export interface ExportResult {
  /** The complete Moodle XML document string. */
  xml: string;
  /** mediaId → resolved manifest entry, useful for UIs/logging. */
  mediaManifest: Map<number, MediaResolution>;
}

/** Thrown when pre-export validation fails. Never emits XML. */
export class ExportValidationErrorList extends Error {
  readonly errors: ExportValidationError[];

  constructor(errors: ExportValidationError[]) {
    super(errors.map((e) => e.message).join('\n'));
    this.name = 'ExportValidationErrorList';
    this.errors = errors;
  }
}
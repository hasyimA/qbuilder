import type { ExportContext, ExportResult, ExportValidationError } from './types';
import { exportMoodleXml, moodleExportFilename } from './moodle/moodle-xml-exporter';

/**
 * The Question Exporter abstraction. The internal question model is mapped to a
 * target format by a format-specific exporter; the editor never serializes XML
 * itself.
 */
export interface QuestionExporter {
  readonly format: 'moodle-xml';
  export(context: ExportContext): Promise<ExportResult>;
  filename(quizTitle: string): string;
}

/** Moodle XML exporter — the supported target for Phase 9. */
export const moodleXmlExporter: QuestionExporter = {
  format: 'moodle-xml',
  export: exportMoodleXml,
  filename: moodleExportFilename,
};

export { ExportValidationErrorList } from './types';
export type { ExportValidationError, ExportContext, ExportResult, MediaResolution, ResolveMedia } from './types';
export { validateQuizForExport } from './moodle/validation';
export { docToHtml, collectContentIssues, collectMediaIds } from './moodle/doc-to-html';
export type { DocToHtmlResult, ImageRef } from './moodle/doc-to-html';
export { resolveMediaFromApi } from './moodle/media';

export function formatExportErrors(errors: ExportValidationError[]): string {
  const count = errors.length;
  const summary = `Ekspor gagal: ${count} masalah ditemukan pada soal.`;
  const details = errors.map((e) => e.message).join(' ');
  return details ? `${summary} ${details}` : summary;
}
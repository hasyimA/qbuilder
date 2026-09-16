import type { DocContent, QuestionType } from './types';
import { docToPlainText } from './content';

export interface DraftOption {
  key: string;
  id?: number;
  text: string;
  is_correct: boolean;
  feedback: string;
}

export interface QuestionDraftData {
  type: QuestionType;
  questionContent: DocContent;
  defaultMark: string;
  feedbackGeneral?: DocContent;
  feedbackCorrect?: DocContent;
  feedbackIncorrect?: DocContent;
  graderInfo?: DocContent;
  options: DraftOption[];
}

export interface StoredQuestionDraft extends QuestionDraftData {
  version: 1;
  mode: 'edit' | 'new';
  quizId: number;
  questionId: number | null;
  savedAt: string;
}

const PREFIX = 'quiz-builder:draft';

export function draftKey(
  mode: 'edit' | 'new',
  quizId: number,
  questionId: number | null
): string {
  if (mode === 'edit' && questionId !== null) {
    return `${PREFIX}:question:${questionId}`;
  }
  return `${PREFIX}:quiz:${quizId}:new`;
}

function storage(): Storage {
  return typeof window !== 'undefined' ? window.localStorage : (null as unknown as Storage);
}

export function readStoredDraft(key: string): StoredQuestionDraft | null {
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredQuestionDraft;
    if (parsed.version !== 1 || !parsed.type || !parsed.savedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredDraft(key: string, draft: StoredQuestionDraft): boolean {
  try {
    storage()?.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredDraft(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // ignore
  }
}

export function hasMeaningfulContent(draft: StoredQuestionDraft): boolean {
  if (docToPlainText(draft.questionContent).trim().length > 0) return true;
  if (draft.defaultMark.trim() !== '' && draft.defaultMark.trim() !== '1') return true;
  for (const doc of [
    draft.feedbackGeneral,
    draft.feedbackCorrect,
    draft.feedbackIncorrect,
    draft.graderInfo,
  ]) {
    if (doc && docToPlainText(doc).trim().length > 0) return true;
  }
  return draft.options.some(
    (opt) => opt.text.trim().length > 0 || opt.feedback.trim().length > 0 || opt.is_correct
  );
}
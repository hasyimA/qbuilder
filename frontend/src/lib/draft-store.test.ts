import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearStoredDraft,
  draftKey,
  hasMeaningfulContent,
  readStoredDraft,
  writeStoredDraft,
  type StoredQuestionDraft,
} from '@/lib/draft-store';

import type { DocContent } from '@/lib/types';

const EMPTY_PAGE: DocContent = { type: 'doc', content: [{ type: 'paragraph' }] };

function makeDraft(mode: 'edit' | 'new', quizId: number, questionId: number | null): StoredQuestionDraft {
  return {
    version: 1,
    mode,
    quizId,
    questionId,
    savedAt: '2026-01-01T00:00:00.000Z',
    type: 'multiple_choice',
    questionContent: EMPTY_PAGE,
    defaultMark: '1',
    options: [{ key: 'k1', text: 'A', is_correct: true, feedback: '' }],
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('draft-store', () => {
  it('scopes edit and new-question drafts separately', () => {
    expect(draftKey('edit', 1, 5)).toBe('quiz-builder:draft:question:5');
    expect(draftKey('edit', 1, null)).toBe('quiz-builder:draft:quiz:1:new');
    expect(draftKey('new', 1, null)).toBe('quiz-builder:draft:quiz:1:new');
    expect(draftKey('new', 2, null)).toBe('quiz-builder:draft:quiz:2:new');
  });

  it('round-trips a stored draft', () => {
    const key = draftKey('edit', 1, 5);
    writeStoredDraft(key, makeDraft('edit', 1, 5));

    const draft = readStoredDraft(key);
    expect(draft).not.toBeNull();
    expect(draft?.savedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(draft?.options[0].text).toBe('A');
  });

  it('returns null when nothing is stored', () => {
    expect(readStoredDraft('quiz-builder:draft:question:999')).toBeNull();
  });

  it('ignores corrupt or unknown-version payloads', () => {
    localStorage.setItem('quiz-builder:draft:question:1', 'not json');
    expect(readStoredDraft('quiz-builder:draft:question:1')).toBeNull();

    localStorage.setItem(
      'quiz-builder:draft:question:2',
      JSON.stringify({ version: 99, savedAt: 'x', type: 'essay' })
    );
    expect(readStoredDraft('quiz-builder:draft:question:2')).toBeNull();
  });

  it('clears a stored draft', () => {
    const key = draftKey('edit', 1, 5);
    writeStoredDraft(key, makeDraft('edit', 1, 5));
    clearStoredDraft(key);
    expect(readStoredDraft(key)).toBeNull();
  });

  describe('hasMeaningfulContent', () => {
    function emptyDraft(overrides: Partial<StoredQuestionDraft> = {}): StoredQuestionDraft {
      return {
        version: 1,
        mode: 'new',
        quizId: 1,
        questionId: null,
        savedAt: '2026-01-01T00:00:00.000Z',
        type: 'multiple_choice',
        questionContent: EMPTY_PAGE,
        defaultMark: '1',
        options: [
          { key: 'k1', text: '', is_correct: false, feedback: '' },
          { key: 'k2', text: '', is_correct: false, feedback: '' },
        ],
        ...overrides,
      };
    }

    it('is false for a pristine empty draft', () => {
      expect(hasMeaningfulContent(emptyDraft())).toBe(false);
    });

    it('is true when question text exists', () => {
      const draft = emptyDraft({
        questionContent: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Apa itu router?' }] }],
        },
      });
      expect(hasMeaningfulContent(draft)).toBe(true);
    });

    it('is true when an option has text', () => {
      const draft = emptyDraft({
        options: [
          { key: 'k1', text: 'Router', is_correct: true, feedback: '' },
          { key: 'k2', text: '', is_correct: false, feedback: '' },
        ],
      });
      expect(hasMeaningfulContent(draft)).toBe(true);
    });

    it('is true when default mark differs from default', () => {
      expect(hasMeaningfulContent(emptyDraft({ defaultMark: '20' }))).toBe(true);
    });

    it('is true when option feedback exists', () => {
      const draft = emptyDraft({
        options: [{ key: 'k1', text: '', is_correct: false, feedback: 'Jelaskan!' }],
      });
      expect(hasMeaningfulContent(draft)).toBe(true);
    });
  });
});
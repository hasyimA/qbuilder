import { describe, expect, it } from 'vitest';
import { buildQuizQuery, buildQuestionQuery } from '@/lib/api';
import type { QuizListParams, QuestionListParams } from '@/lib/api';

function toRecord(query: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(query).entries());
}

describe('buildQuizQuery', () => {
  it('returns an empty string for default params', () => {
    expect(buildQuizQuery({})).toBe('');
  });

  it('omits default page and per_page values', () => {
    expect(toRecord(buildQuizQuery({ page: 1, perPage: 20 }))).toEqual({});
  });

  it('includes non-default page and per_page', () => {
    expect(toRecord(buildQuizQuery({ page: 3, perPage: 50 }))).toEqual({
      page: '3',
      per_page: '50',
    });
  });

  it('includes tab when it differs from mine', () => {
    expect(toRecord(buildQuizQuery({ tab: 'shared' }))).toEqual({ tab: 'shared' });
    expect(buildQuizQuery({ tab: 'mine' })).toBe('');
  });

  it('includes a trimmed search term only when non-empty', () => {
    expect(toRecord(buildQuizQuery({ search: '  jaringan  ' }))).toEqual({ search: 'jaringan' });
    expect(buildQuizQuery({ search: '   ' })).toBe('');
  });

  it('passes through filter values when set', () => {
    expect(
      toRecord(
        buildQuizQuery({
          status: 'published',
          category: 'UTS',
          tag: 'ujian',
          type: 'essay',
        })
      )
    ).toEqual({
      status: 'published',
      category: 'UTS',
      tag: 'ujian',
      type: 'essay',
    });
  });

  it('includes min_questions only when positive', () => {
    expect(toRecord(buildQuizQuery({ minQuestions: 5 }))).toEqual({ min_questions: '5' });
    expect(buildQuizQuery({ minQuestions: 0 })).toBe('');
  });

  it('converts updatedWithin to an updated_from date', () => {
    const expected7d = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const expected30d = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    expect(toRecord(buildQuizQuery({ updatedWithin: '7' }))).toEqual({ updated_from: expected7d });
    expect(toRecord(buildQuizQuery({ updatedWithin: '30' }))).toEqual({ updated_from: expected30d });
    expect(buildQuizQuery({ updatedWithin: null })).toBe('');
  });

  it('includes sort and sort_dir only when non-default', () => {
    expect(toRecord(buildQuizQuery({ sort: 'title', sortDir: 'asc' }))).toEqual({
      sort: 'title',
      sort_dir: 'asc',
    });
    expect(buildQuizQuery({ sortDir: 'desc' })).toBe('');
  });

  it('builds a full combined query correctly', () => {
    const record = toRecord(
      buildQuizQuery({
        page: 2,
        perPage: 50,
        tab: 'shared',
        search: 'komputer',
        status: 'published',
        type: 'essay',
        minQuestions: 5,
        sort: 'title',
        sortDir: 'asc',
      } satisfies QuizListParams)
    );

    expect(record).toMatchObject({
      page: '2',
      per_page: '50',
      tab: 'shared',
      search: 'komputer',
      status: 'published',
      type: 'essay',
      min_questions: '5',
      sort: 'title',
      sort_dir: 'asc',
    });
  });
});

describe('buildQuestionQuery', () => {
  it('returns an empty string for default params', () => {
    expect(buildQuestionQuery({})).toBe('');
  });

  it('omits default page and per_page values', () => {
    expect(toRecord(buildQuestionQuery({ page: 1, perPage: 20 }))).toEqual({});
    expect(toRecord(buildQuestionQuery({ page: 3, perPage: 50 }))).toEqual({
      page: '3',
      per_page: '50',
    });
  });

  it('includes a trimmed search term only when non-empty', () => {
    expect(toRecord(buildQuestionQuery({ search: '  kimia  ' }))).toEqual({ search: 'kimia' });
    expect(buildQuestionQuery({ search: '   ' })).toBe('');
  });

  it('passes through filters when set and omits empty strings', () => {
    expect(
      toRecord(
        buildQuestionQuery({
          status: 'complete',
          type: 'essay',
          category: 'Biologi',
          difficulty: 'hard',
          tag: 'ujian-semester',
        })
      )
    ).toEqual({
      status: 'complete',
      type: 'essay',
      category: 'Biologi',
      difficulty: 'hard',
      tag: 'ujian-semester',
    });

    const params: QuestionListParams = { status: '', type: '' };
    expect(buildQuestionQuery(params)).toBe('');
  });

  it('converts updatedWithin to an updated_from date', () => {
    const expected7d = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    expect(toRecord(buildQuestionQuery({ updatedWithin: '7' }))).toEqual({ updated_from: expected7d });
    expect(buildQuestionQuery({ updatedWithin: null })).toBe('');
  });

  it('includes sort and sort_dir only when non-default', () => {
    expect(toRecord(buildQuestionQuery({ sort: 'created_at', sortDir: 'asc' }))).toEqual({
      sort: 'created_at',
      sort_dir: 'asc',
    });
    expect(buildQuestionQuery({ sortDir: 'desc' })).toBe('');
  });

  it('builds a full combined query correctly', () => {
    const record = toRecord(
      buildQuestionQuery({
        page: 2,
        perPage: 10,
        search: 'osmosis',
        status: 'draft',
        type: 'short_answer',
        tag: 'bab-3',
        sort: 'created_at',
        sortDir: 'asc',
      } satisfies QuestionListParams)
    );

    expect(record).toMatchObject({
      page: '2',
      per_page: '10',
      search: 'osmosis',
      status: 'draft',
      type: 'short_answer',
      tag: 'bab-3',
      sort: 'created_at',
      sort_dir: 'asc',
    });
  });
});
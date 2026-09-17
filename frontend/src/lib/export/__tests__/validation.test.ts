import { describe, expect, it } from 'vitest';
import { validateQuizForExport } from '../moodle/validation';
import { makeQuestion, makeQuiz, option, textDoc } from './_support';

describe('validateQuizForExport', () => {
  it('accepts a complete quiz with all types', () => {
    const questions = [
      makeQuestion(),
      makeQuestion({ id: 2, type: 'true_false', options: [option('True', true), option('False', false)] }),
      makeQuestion({
        id: 3,
        type: 'short_answer',
        content: textDoc('Apa kepanjangan LAN?'),
        options: [option('Local Area Network', true)],
      }),
      makeQuestion({ id: 4, type: 'essay', content: textDoc('Jelaskan cara kerja router!'), options: [] }),
      makeQuestion({
        id: 5,
        type: 'matching',
        content: textDoc('Jodohkan perangkat dengan fungsinya.'),
        options: [
          option('Router', true, 100, '', 'Meneruskan paket antar jaringan'),
          option('Switch', true, 100, '', 'Menghubungkan perangkat dalam LAN'),
        ],
      }),
    ];
    expect(validateQuizForExport(makeQuiz(), questions)).toEqual([]);
  });

  it('flags an empty question text', () => {
    const errors = validateQuizForExport(makeQuiz(), [
      makeQuestion({ content: { type: 'doc', content: [] } }),
    ]);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'question-empty',
          questionIndex: 1,
          message: expect.stringContaining('teks soal kosong'),
        }),
      ])
    );
  });

  it('flags an invalid mark', () => {
    const errors = validateQuizForExport(makeQuiz(), [makeQuestion({ default_mark: 0 })]);
    expect(errors.some((e) => e.code === 'question-invalid-mark')).toBe(true);
  });

  it('flags MCQ with too few options and with no correct answer', () => {
    const errors = validateQuizForExport(makeQuiz(), [
      makeQuestion({ options: [option('Hanya satu', true)] }),
      makeQuestion({ id: 2, options: [option('A', false), option('B', false)] }),
    ]);
    expect(errors.map((e) => e.code)).toContain('mcq-not-enough-options');
    expect(errors.map((e) => e.code)).toContain('mcq-no-correct');
  });

  it('flags an empty option text', () => {
    const errors = validateQuizForExport(makeQuiz(), [
      makeQuestion({ options: [option('A', false), option('', true)] }),
    ]);
    expect(errors.map((e) => e.code)).toContain('mcq-empty-option');
  });

  it('flags true/false missing the True/False pair or with wrong correct count', () => {
    const errors = validateQuizForExport(makeQuiz(), [
      makeQuestion({ id: 2, type: 'true_false', options: [option('True', true)] }),
      makeQuestion({
        id: 3,
        type: 'true_false',
        options: [option('True', true), option('False', true)],
      }),
    ]);
    expect(errors.map((e) => e.code)).toContain('tf-missing-options');
    expect(errors.map((e) => e.code)).toContain('tf-multiple-correct');
  });

  it('flags short answer with no accepted answer', () => {
    const errors = validateQuizForExport(makeQuiz(), [
      makeQuestion({ id: 4, type: 'short_answer', options: [] }),
    ]);
    expect(errors.map((e) => e.code)).toContain('short-answer-no-options');
  });

  it('flags unsupported content nodes', () => {
    const errors = validateQuizForExport(makeQuiz(), [
      makeQuestion({ content: { type: 'doc', content: [{ type: 'widget' }] } }),
    ]);
    expect(errors.map((e) => e.code)).toContain('unsupported-content');
  });

  it('flags matching with too few pairs or missing statement/answer', () => {
    const errors = validateQuizForExport(makeQuiz(), [
      makeQuestion({ id: 1, type: 'matching', options: [option('Router', true, 100, '', 'Jawaban')] }),
      makeQuestion({
        id: 2,
        type: 'matching',
        options: [option('Router', true, 100, '', 'Jawaban'), option('', true, 100, '', '')],
      }),
    ]);
    expect(errors.map((e) => e.code)).toContain('matching-not-enough-pairs');
    expect(errors.map((e) => e.code)).toContain('matching-empty-statement');
    expect(errors.map((e) => e.code)).toContain('matching-empty-answer');
  });

  it('flags an unknown question type', () => {
    const errors = validateQuizForExport(makeQuiz(), [
      makeQuestion({ type: 'ordering' as never, options: [] }),
    ]);
    expect(errors.map((e) => e.code)).toContain('question-unknown-type');
  });

  it('flags empty quiz and no questions', () => {
    expect(validateQuizForExport(makeQuiz({ title: '  ' }), []).map((e) => e.code)).toEqual([
      'quiz-empty-title',
      'quiz-no-questions',
    ]);
  });

  it('indexes questions in the message for teacher clarity', () => {
    const errors = validateQuizForExport(makeQuiz(), [
      makeQuestion(),
      makeQuestion({ id: 2, content: { type: 'doc', content: [] } }),
    ]);
    const q2 = errors.find((e) => e.questionIndex === 2);
    expect(q2?.message).toContain('Soal 2');
  });
});
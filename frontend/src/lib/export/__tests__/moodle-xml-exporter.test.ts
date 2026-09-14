import { describe, expect, it } from 'vitest';
import {
  exportMoodleXml,
  moodleExportFilename,
} from '../moodle/moodle-xml-exporter';
import { ExportValidationErrorList } from '../types';
import { makeQuestion, makeQuiz, option, textDoc, mediaStub, richDoc, PNG_1x1_BASE64 } from './_support';
import type { MediaResolution } from '../types';

async function exportQuiz(questions = [makeQuestion()], quiz = makeQuiz(), resolveMedia = mediaStub()) {
  return exportMoodleXml({ quiz, questions, resolveMedia });
}

function parse(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(`XML tidak valid: ${parserError.textContent}`);
  }
  return doc;
}

describe('moodle XML exporter', () => {
  it('produces an XML document Moodle can parse', async () => {
    const result = await exportQuiz();
    expect(result.xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    const doc = parse(result.xml);
    expect(doc.querySelector('quiz')).not.toBeNull();
    expect(doc.querySelectorAll('question').length).toBe(2); // category + 1 question
  });

  it('exports a multiple choice question with fractions and shuffle', async () => {
    const result = await exportQuiz();
    const doc = parse(result.xml);
    const q = doc.querySelector('question[type="multichoice"]')!;
    expect(q.querySelector('single')?.textContent).toBe('true');
    expect(q.querySelector('shuffleanswers')?.textContent).toBe('true');
    expect(q.querySelector('answernumbering')?.textContent).toBe('abc');
    const answers = [...q.querySelectorAll('answer')].map((a) => ({
      fraction: a.getAttribute('fraction'),
      text: a.textContent ?? '',
    }));
    expect(answers.find((a) => a.text.includes('Router'))?.fraction).toBe('100');
    expect(answers.filter((a) => a.fraction === '0').length).toBe(3);
  });

  it('uses partial credit for multiple-correct MCQ and single=false', async () => {
    const questions = [
      makeQuestion({
        options: [option('A', true), option('B', true), option('C', false), option('D', false)],
      }),
    ];
    const doc = parse((await exportQuiz(questions)).xml);
    const q = doc.querySelector('question[type="multichoice"]')!;
    expect(q.querySelector('single')?.textContent).toBe('false');
    const fractions = [...q.querySelectorAll('answer')].map((a) => a.getAttribute('fraction'));
    expect(fractions).toContain('50');
    expect(fractions).toContain('0');
  });

  it('exports true/false mapping the correct option to fraction 100', async () => {
    const questions = [
      makeQuestion({
        id: 2,
        type: 'true_false',
        content: textDoc('HTTP adalah protokol tanpa status.'),
        options: [option('True', true), option('False', false)],
      }),
    ];
    const doc = parse((await exportQuiz(questions)).xml);
    const q = doc.querySelector('question[type="truefalse"]')!;
    const answers = [...q.querySelectorAll('answer')].map((a) => ({
      fraction: a.getAttribute('fraction'),
      text: a.querySelector('text')?.textContent ?? '',
    }));
    expect(answers.find((a) => a.text === 'true')?.fraction).toBe('100');
    expect(answers.find((a) => a.text === 'false')?.fraction).toBe('0');
  });

  it('exports which answer is correct when false is the right option', async () => {
    const questions = [
      makeQuestion({
        id: 3,
        type: 'true_false',
        options: [option('True', false), option('False', true)],
      }),
    ];
    const doc = parse((await exportQuiz(questions)).xml);
    const q = doc.querySelector('question[type="truefalse"]')!;
    const answers = [...q.querySelectorAll('answer')].map((a) => ({
      fraction: a.getAttribute('fraction'),
      text: a.querySelector('text')?.textContent ?? '',
    }));
    expect(answers.find((a) => a.text === 'false')?.fraction).toBe('100');
    expect(answers.find((a) => a.text === 'true')?.fraction).toBe('0');
  });

  it('exports short answer accepted answers and usecase=0', async () => {
    const questions = [
      makeQuestion({
        id: 4,
        type: 'short_answer',
        default_mark: 2.5,
        content: textDoc('Apa kepanjangan LAN?'),
        options: [option('Local Area Network', true), option('Jaringan Area Lokal', true), option('LAN', false)],
      }),
    ];
    const doc = parse((await exportQuiz(questions)).xml);
    const q = doc.querySelector('question[type="shortanswer"]')!;
    expect(q.querySelector('usecase')?.textContent).toBe('0');
    expect(q.querySelector('defaultgrade')?.textContent).toBe('2.5');
    const texts = [...q.querySelectorAll('answer')].map((a) => a.querySelector('text')?.textContent ?? '');
    expect(texts).toContain('Local Area Network');
    expect(texts).toContain('Jaringan Area Lokal');
    expect(texts).not.toContain('LAN');
  });

  it('exports essay with the required essay fields', async () => {
    const questions = [
      makeQuestion({
        id: 5,
        type: 'essay',
        content: textDoc('Jelaskan cara kerja router!'),
        options: [],
      }),
    ];
    const doc = parse((await exportQuiz(questions)).xml);
    const q = doc.querySelector('question[type="essay"]')!;
    expect(q.querySelector('responseformat')?.textContent).toBe('editor');
    expect(q.querySelector('responserequired')?.textContent).toBe('1');
    expect(q.querySelector('graderinfo')).not.toBeNull();
  });

  it('escapes special and Indonesian characters through the whole document', async () => {
    const questions = [
      makeQuestion({
        content: textDoc('Tom & Jerry, 5 < 7, "kutipan", \'apostrof\', Ñ § π — apa hasilnya?'),
      }),
    ];
    const result = await exportQuiz(questions);
    const doc = parse(result.xml);
    // The payload sent to Moodle keeps HTML-escaped text (no double-encoding).
    const questionText = doc.querySelector('question[type="multichoice"] questiontext text')?.textContent ?? '';
    expect(questionText).toContain('Tom &amp; Jerry, 5 &lt; 7, &quot;kutipan&quot;');
    expect(questionText).not.toContain('&amp;amp;');
    // After <p> tags are stripped by the HTML filter, Moodle displays: "Tom & Jerry, 5 < 7...".
    expect(questionText.includes('Tom & Jerry')).toBe(false);
  });

  it('emits @@PLUGINFILE@@ references with a <file> manifest for images', async () => {
    const allImages: MediaResolution[] = [];
    const questions = [makeQuestion({ content: richDoc() })];
    const result = await exportQuiz(questions, makeQuiz(), async (id) => {
      const media = { filename: `diagram-${id}.png`, mimeType: 'image/png', base64: PNG_1x1_BASE64, width: 600, height: 400 };
      allImages.push(media);
      return media;
    });
    const doc = parse(result.xml);
    expect(allImages.length).toBe(1);
    const questiontext = doc.querySelector('question[type="multichoice"] questiontext')!;
    expect(questiontext.querySelector('text')?.textContent).toContain(
      '@@PLUGINFILE@@/diagram-5.png'
    );
    const file = questiontext.querySelector('file[name="diagram-5.png"]')!;
    expect(file).not.toBeNull();
    expect(file.getAttribute('path')).toBe('/');
    expect(file.getAttribute('encoding')).toBe('base64');
    expect(file.textContent).toBe(PNG_1x1_BASE64);
    expect(result.mediaManifest.get(5)?.filename).toBe('diagram-5.png');
  });

  it('deduplicates colliding media filenames', async () => {
    const questions = [
      makeQuestion({
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'image', attrs: { mediaId: 1 } },
                { type: 'image', attrs: { mediaId: 2 } },
              ],
            },
          ],
        },
        options: [option('A', true), option('B', false)],
      }),
    ];
    const result = await exportQuiz(questions, makeQuiz(), async (id) => ({
      filename: 'sama.png',
      mimeType: 'image/png',
      base64: `data${id}`,
    }));
    const doc = parse(result.xml);
    const files = [...doc.querySelectorAll('questiontext file')].map((f) => f.getAttribute('name'));
    expect(files).toContain('sama.png');
    expect(files).toContain('2-sama.png');
  });

  it('renders equations in <tex> tags', async () => {
    const questions = [
      makeQuestion({
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'equation', attrs: { format: 'latex', value: '\\frac{1}{2}m v^2' } }],
            },
          ],
        },
      }),
    ];
    const doc = parse((await exportQuiz(questions)).xml);
    const text = doc.querySelector('question[type="multichoice"] questiontext text')?.textContent ?? '';
    expect(text).toContain('<tex>\\frac{1}{2}m v^2</tex>');
  });

  it('exports all MVP types in one quiz with unique names', async () => {
    const questions = [
      makeQuestion(),
      makeQuestion({ id: 2, type: 'true_false', options: [option('True', true), option('False', false)] }),
      makeQuestion({ id: 3, type: 'short_answer', content: textDoc('LAN?'), options: [option('LAN', true)] }),
      makeQuestion({ id: 4, type: 'essay', content: textDoc('Jelaskan VLAN.'), options: [] }),
      makeQuestion({ id: 5, options: [option('A', true), option('B', false), option('C', false)] }),
    ];
    const doc = parse((await exportQuiz(questions)).xml);
    const names = [...doc.querySelectorAll('question > name > text')].map((n) => n.textContent ?? '');
    expect(names.length).toBe(5);
    expect(new Set(names).size).toBe(5); // uniqueness
    const types = [...doc.querySelectorAll('question[type]')].map((q) => q.getAttribute('type'));
    ['multichoice', 'truefalse', 'shortanswer', 'essay', 'multichoice'].forEach((t) =>
      expect(types).toContain(t)
    );
  });

  it('sorts questions by sort_order', async () => {
    const q1 = makeQuestion();
    const q2 = makeQuestion({ id: 2, default_mark: 5, sort_order: 5 });
    const doc = parse((await exportQuiz([q1, q2])).xml);
    const marks = [...doc.querySelectorAll('question[type="multichoice"] defaultgrade')].map(
      (n) => n.textContent
    );
    expect(marks).toEqual(['1', '5']);
  });

  it('throws a validation error list and never emits XML for broken quizzes', async () => {
    const questions = [makeQuestion({ options: [option('A', false), option('B', false)] })];
    await expect(exportQuiz(questions)).rejects.toBeInstanceOf(ExportValidationErrorList);
    const error = (await exportQuiz(questions).catch((e) => e)) as ExportValidationErrorList;
    expect(error.errors.map((err) => err.code)).toContain('mcq-no-correct');
    expect(error.errors.map((err) => err.message)).toEqual(
      expect.arrayContaining([expect.stringContaining('Soal 1')])
    );
    await expect(exportQuiz([], makeQuiz())).rejects.toBeInstanceOf(ExportValidationErrorList);
  });

  it('fails the export when a referenced media cannot be resolved', async () => {
    const questions = [
      makeQuestion({ content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { mediaId: 42 } }] }] } }),
    ];
    const resolveMedia = async () => {
      throw new Error('File not found');
    };
    const error = (await exportQuiz(questions, makeQuiz(), resolveMedia).catch(
      (e) => e
    )) as ExportValidationErrorList;
    expect(error.constructor.name).toBe('ExportValidationErrorList');
    expect(error.errors.map((err) => err.code)).toContain('media-unresolvable');
    expect(error.errors[0].message).toContain('#42');
  });

  it('fails when images exist but no resolver is provided', async () => {
    const questions = [
      makeQuestion({ content: richDoc() }),
    ];
    const error = (await exportMoodleXml({ quiz: makeQuiz(), questions }).catch(
      (e) => e
    )) as ExportValidationErrorList;
    expect(error.errors.map((err) => err.code)).toContain('media-no-resolver');
  });

  it('emits a question-name derived from the question text', async () => {
    const quiz = makeQuiz({ title: 'Aljabar & "Fungsi" 2026' });
    const doc = parse((await exportQuiz([makeQuestion()], quiz)).xml);
    const name = doc.querySelector('question[type="multichoice"] name text')?.textContent;
    expect(name).toBe('Manakah perangkat yang meneruskan paket?');
  });

  it('falls back to a quiz-slug name when the question text is empty', async () => {
    const quiz = makeQuiz({ title: 'Gambar dan Rumus' });
    const imageOnly = makeQuestion({
      content: {
        type: 'doc',
        content: [{ type: 'image', attrs: { mediaId: 7, alt: '', width: 600, height: 400 } }],
      },
    });
    const doc = parse((await exportQuiz([imageOnly], quiz)).xml);
    const name = doc.querySelector('question[type="multichoice"] name text')?.textContent;
    expect(name).toBe('gambar_dan_rumus_Q1');
  });

  it('always emits a category named after the quiz title', async () => {
    const quiz = makeQuiz({ category: null });
    const doc = parse((await exportQuiz([makeQuestion()], quiz)).xml);
    const title = doc.querySelector('question[type="category"] category text')?.textContent;
    expect(title).toBe('$course$/Jaringan Komputer 2026');
    expect(doc.querySelector('question[type="category"]')).not.toBeNull();
  });

  it('produces a safe download filename', () => {
    expect(moodleExportFilename('Jaringan Komputer 2026')).toBe('jaringan_komputer_2026-moodle.xml');
    expect(moodleExportFilename('  ')).toBe('quiz-moodle.xml');
  });

  it('short answer accepts percent and legacy 0..1 grade scales', async () => {
    const questions = [
      makeQuestion({
        id: 3,
        type: 'short_answer',
        content: textDoc('IP address kelas apa yang dimulai dari 192?'),
        options: [
          option('C', true, 100),
          option('B', true, 1),
          option('A', true, 0.5),
        ],
      }),
    ];
    const doc = parse((await exportQuiz(questions)).xml);
    const fractions = [...doc.querySelectorAll('question[type="shortanswer"] answer')].map(
      (a) => a.getAttribute('fraction')
    );
    expect(fractions).toContain('100');
    expect(fractions).toContain('50');
    expect(fractions).not.toContain('0.01');
  });

  it('only emits answer grades from the Moodle valid-grade list', async () => {
    const valid = new Set([
      '100', '90', '80', '75', '70', '66.666', '60', '50', '40', '33.333',
      '30', '25', '20', '16.666', '14.2857', '12.5', '11.111', '10', '5', '0',
    ]);
    const twelveCorrect = makeQuestion({
      options: Array.from({ length: 12 }, (_, i) => option(String.fromCharCode(65 + i), true)),
    });
    const doc = parse((await exportQuiz([twelveCorrect])).xml);
    const fractions = [...doc.querySelectorAll('answer')].map((a) => a.getAttribute('fraction'));
    for (const fraction of fractions) {
      expect(valid.has(fraction ?? '')).toBe(true);
    }
  });
});
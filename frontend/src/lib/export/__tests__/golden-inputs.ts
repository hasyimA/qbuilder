import type { Question, Quiz } from '@/lib/types';
import type { ExportContext } from '@/lib/export';
import { makeQuestion, makeQuiz, option, textDoc, richDoc, PNG_1x1_BASE64 } from './_support';

export function mcqContext(): ExportContext {
  const quiz: Quiz = makeQuiz({ category: 'UjianTengah' });
  return {
    quiz,
    questions: [
      makeQuestion({
        content: textDoc('Manakah perangkat yang meneruskan paket antar jaringan?'),
      }),
    ],
    resolveMedia: undefined,
  };
}

export function tfContext(): ExportContext {
  return {
    quiz: makeQuiz({ title: 'Fundamental Jaringan', category: null }),
    questions: [
      makeQuestion({
        id: 2,
        type: 'true_false',
        default_mark: 2,
        content: textDoc('HTTP merupakan protokol yang berjalan di atas TCP.'),
        options: [
          option('True', true, 100, 'Benar, HTTP memakai TCP.'),
          option('False', false),
        ],
      }),
    ],
    resolveMedia: undefined,
  };
}

export function saContext(): ExportContext {
  return {
    quiz: makeQuiz({ title: 'Fundamental Jaringan', category: null }),
    questions: [
      makeQuestion({
        id: 4,
        type: 'short_answer',
        default_mark: 2.5,
        content: textDoc('Apa kepanjangan dari LAN?'),
        options: [option('Local Area Network', true), option('Jaringan Area Lokal', true)],
      }),
    ],
    resolveMedia: undefined,
  };
}

export function essayContext(): ExportContext {
  return {
    quiz: makeQuiz({ title: 'Fundamental Jaringan', category: null }),
    questions: [
      makeQuestion({
        id: 5,
        type: 'essay',
        default_mark: 5,
        content: textDoc('Jelaskan perbedaan antara switch dan router beserta contoh penggunaannya!'),
        options: [],
      }),
    ],
    resolveMedia: undefined,
  };
}

export function multiContext(): ExportContext {
  const quiz: Quiz = makeQuiz({
    title: 'Ujian Tengah Semester "Jaringan" & Komputer 2026',
    category: 'PPLG/UjianTengah',
  });
  const questions: Question[] = [
    makeQuestion({
      content: textDoc('Berapa hasil dari 5 < 7 dan 3 > 1? (boleh memilih lebih dari satu)'),
      default_mark: 4,
      options: [
        option('Benar', false),
        option('Salah', false),
        option('5 < 7 bernilai benar', true, 100, 'Ya, 5 lebih kecil dari 7.'),
        option('3 > 1 bernilai benar', true, 100),
      ],
    }),
    makeQuestion({
      id: 2,
      type: 'true_false',
      content: textDoc('Simbol "&" digunakan untuk dan (AND) dalam logika?'),
      options: [
        option('True', true, 100, 'Benar, "&" adalah operator AND.'),
        option('False', false),
      ],
    }),
    makeQuestion({
      id: 3,
      type: 'short_answer',
      content: textDoc('Sebutkan satu alasan memakai DNS:'),
      options: [option('Menerjemahkan nama domain menjadi IP', true), option('Pencatatan DNS', false)],
    }),
    makeQuestion({
      id: 4,
      type: 'essay',
      content: textDoc('Tom & Jerry: jelaskan peran NAT pada jaringan sekolah. Kutipan: "Paket melintasi NAT".'),
      options: [],
    }),
  ];
  return { quiz, questions, resolveMedia: undefined };
}

export function richContext(): ExportContext {
  return {
    quiz: makeQuiz({ title: 'Gambar dan Rumus', category: null }),
    questions: [
      makeQuestion({
        content: richDoc(),
        default_mark: 3,
      }),
    ],
    resolveMedia: async (mediaId) => ({
      filename: `diagram-${mediaId}.png`,
      mimeType: 'image/png',
      base64: PNG_1x1_BASE64,
      width: 600,
      height: 400,
    }),
  };
}
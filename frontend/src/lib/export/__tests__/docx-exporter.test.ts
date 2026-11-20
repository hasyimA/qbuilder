import { describe, expect, it } from 'vitest';
import { Packer } from 'docx';
import { buildDocxDocument, docxFilename } from '../docx/docx-exporter';
import type { SchoolSettings } from '@/lib/api';
import { multiContext } from './golden-inputs';

const SAMPLE_SCHOOL: SchoolSettings = {
  school_name: 'SMK Bina Rahayu',
  school_subtitle: 'Yayasan Pendidikan Bina Rahayu',
  school_address: 'Jl. Raya Pendidikan No. 1',
  academic_year: '2026/2027',
  semester: 'Ganjil',
  default_exam_title: 'Penilaian Sumatif Akhir Semester',
  principal_name: 'Drs. Ahmad Fauzi, M.Pd',
  principal_nip: '197001012000011001',
};

describe('docx-exporter', () => {
  it('builds a valid OOXML .docx buffer for all 5 question types in complete admin mode', async () => {
    const ctx = multiContext();
    const doc = await buildDocxDocument({
      quiz: { ...ctx.quiz, owner: { id: 1, name: 'Hasyim Asyari' } },
      questions: ctx.questions,
      school: SAMPLE_SCHOOL,
      mode: 'complete',
      duration: '90 Menit',
      examDate: '1 Desember 2026',
    });

    const buffer = await Packer.toBuffer(doc);
    // OOXML .docx is a ZIP archive starting with 'PK' (0x50, 0x4B)
    expect(buffer.byteLength).toBeGreaterThan(2000);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('produces a smaller .docx in student mode (without answer key page)', async () => {
    const ctx = multiContext();
    const completeDoc = await buildDocxDocument({
      quiz: ctx.quiz,
      questions: ctx.questions,
      school: SAMPLE_SCHOOL,
      mode: 'complete',
    });
    const studentDoc = await buildDocxDocument({
      quiz: ctx.quiz,
      questions: ctx.questions,
      school: SAMPLE_SCHOOL,
      mode: 'student',
    });

    const completeBuf = await Packer.toBuffer(completeDoc);
    const studentBuf = await Packer.toBuffer(studentDoc);
    expect(completeBuf.byteLength).toBeGreaterThan(studentBuf.byteLength);
  });

  it('generates clean filenames for complete and student modes', () => {
    expect(docxFilename('PSAS PJOK Kelas X', 'complete')).toBe('psas_pjok_kelas_x_administrasi.docx');
    expect(docxFilename('PSAS PJOK Kelas X', 'student')).toBe('psas_pjok_kelas_x_naskah_siswa.docx');
  });
});

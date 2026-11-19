import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MoodleImportDialog from './moodle-import-dialog';

const mocks = vi.hoisted(() => ({
  getCourses: vi.fn(),
  importQuiz: vi.fn(),
  buildQuizMoodleXml: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  moodle: {
    getCourses: mocks.getCourses,
    importQuiz: mocks.importQuiz,
  },
}));

vi.mock('@/lib/export/export-quiz', () => ({
  buildQuizMoodleXml: mocks.buildQuizMoodleXml,
}));

describe('MoodleImportDialog', () => {
  beforeEach(() => {
    mocks.getCourses.mockReset();
    mocks.importQuiz.mockReset();
    mocks.buildQuizMoodleXml.mockReset();
  });

  it('loads teaching courses and imports selected course to Moodle', async () => {
    mocks.getCourses.mockResolvedValue({
      data: [
        { id: 3, shortname: 'PABP-X', fullname: 'Pendidikan Agama X', displayname: 'Pendidikan Agama X' },
        { id: 7, shortname: 'TJKT-XI', fullname: 'Administrasi Jaringan XI', displayname: 'Administrasi Jaringan XI' },
      ],
    });
    mocks.buildQuizMoodleXml.mockResolvedValue({
      title: 'UTS Jaringan',
      xml: '<quiz><question type="multichoice"></question></quiz>',
      questionCount: 10,
    });
    mocks.importQuiz.mockResolvedValue({
      data: {
        status: true,
        imported_count: 10,
        category_id: 21,
        category_name: 'UTS Jaringan [2026-11-19]',
        quiz_id: 12,
        quiz_cmid: 99,
        quiz_url: 'https://e-learning.smkbinarahayu.sch.id/mod/quiz/view.php?id=99',
      },
    });

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(<MoodleImportDialog quiz={{ id: 5, title: 'UTS Jaringan' }} onClose={onClose} onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByText('Administrasi Jaringan XI')).toBeInTheDocument();
    });

    const secondCourseRadio = screen.getByDisplayValue('7');
    fireEvent.click(secondCourseRadio);

    const submitBtn = screen.getByTestId('moodle-import-submit');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mocks.importQuiz).toHaveBeenCalledWith(5, {
        course_id: 7,
        xml: '<quiz><question type="multichoice"></question></quiz>',
        quiz_name: 'UTS Jaringan',
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Berhasil mengimpor 10 soal/)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /Buka Quiz di Moodle/ })).toHaveAttribute(
      'href',
      'https://e-learning.smkbinarahayu.sch.id/mod/quiz/view.php?id=99'
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows warning when teacher has no teaching courses', async () => {
    mocks.getCourses.mockResolvedValue({ data: [] });
    mocks.buildQuizMoodleXml.mockResolvedValue({
      title: 'UTS Jaringan',
      xml: '<quiz></quiz>',
      questionCount: 2,
    });

    render(<MoodleImportDialog quiz={{ id: 5, title: 'UTS Jaringan' }} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/belum tercatat sebagai pengajar/)).toBeInTheDocument();
    });
  });
});

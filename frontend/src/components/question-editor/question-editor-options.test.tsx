import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuestionEditor from '@/components/question-editor';
import type { DocContent, Question, QuestionPayload } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  questions: {
    update: vi.fn(),
    create: vi.fn(),
  },
}));

function textDoc(text: string): DocContent {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

const IMAGE_DOC: DocContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'image', attrs: { mediaId: 5, alt: 'Diagram', width: 600, height: 400 } }],
    },
  ],
};

function makeMcQuestion(): Question {
  return {
    id: 1,
    type: 'multiple_choice',
    content: textDoc('Perangkat mana yang meneruskan paket?'),
    default_mark: 1,
    status: 'complete',
    sort_order: 0,
    options: [
      { id: 11, content: IMAGE_DOC, is_correct: true, fraction: 100, sort_order: 0 },
      { id: 12, content: textDoc('Switch'), is_correct: false, fraction: 0, sort_order: 1 },
    ],
    created_at: '2026-01-01T00:00:00.000000Z',
    updated_at: '2026-01-01T00:00:00.000000Z',
  };
}

function makeMatchingQuestion(): Question {
  return {
    id: 2,
    type: 'matching',
    content: textDoc('Jodohkan perangkat dengan fungsinya.'),
    default_mark: 1,
    status: 'complete',
    sort_order: 0,
    options: [
      {
        id: 21,
        content: textDoc('Router'),
        match_answer: 'Meneruskan paket antar jaringan',
        is_correct: true,
        fraction: 100,
        sort_order: 0,
      },
      {
        id: 22,
        content: textDoc('Switch'),
        match_answer: 'Menghubungkan perangkat dalam LAN',
        is_correct: true,
        fraction: 100,
        sort_order: 1,
      },
    ],
    created_at: '2026-01-01T00:00:00.000000Z',
    updated_at: '2026-01-01T00:00:00.000000Z',
  };
}

function renderEditor(question: Question | null, defaultType: Question['type'] | null = null) {
  const onSave = vi.fn().mockResolvedValue(question ?? undefined);
  render(
    <QuestionEditor
      quizId={1}
      question={question}
      defaultType={defaultType}
      onClose={vi.fn()}
      onSave={onSave}
      autosaveDebounceMs={600_000}
    />
  );
  return { onSave };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('QuestionEditor — opsi bergambar & menjodohkan', () => {
  it('menyimpan opsi multiple choice yang hanya berisi gambar', async () => {
    const { onSave } = renderEditor(makeMcQuestion());

    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0] as QuestionPayload;
    const first = payload.options?.[0];
    expect(first?.content.content?.[0]?.content?.[0]?.type).toBe('image');
    expect(first?.content.content?.[0]?.content?.[0]?.attrs?.mediaId).toBe(5);
  });

  it('mengirim match_answer dan konten pernyataan untuk soal menjodohkan', async () => {
    const { onSave } = renderEditor(makeMatchingQuestion());

    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0] as QuestionPayload;
    expect(payload.type).toBe('matching');
    expect(payload.options).toHaveLength(2);
    expect(payload.options?.[0]?.match_answer).toBe('Meneruskan paket antar jaringan');
    expect(payload.options?.[1]?.match_answer).toBe('Menghubungkan perangkat dalam LAN');
    expect(payload.options?.[0]?.content.content?.[0]?.content?.[0]?.text).toBe('Router');
    expect(payload.options?.every((opt) => opt.is_correct)).toBe(true);
  });

  it('menolak soal menjodohkan yang pasangannya belum lengkap', async () => {
    const { onSave } = renderEditor(makeMatchingQuestion());

    fireEvent.change(screen.getByLabelText('Jawaban pasangan 1'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByText('Setiap pasangan harus memiliki jawaban.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('mengisi pilihan multiple choice dari tempel clipboard', () => {
    renderEditor(makeMcQuestion());

    fireEvent.click(screen.getByRole('button', { name: 'Tempel pilihan dari clipboard' }));
    fireEvent.change(screen.getByLabelText('Tempel pilihan'), {
      target: { value: 'A. Router\nB. Switch\nC. Hub\nD. Access Point' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pisahkan menjadi pilihan' }));

    expect(screen.getByTestId('option-content-A')).toHaveTextContent('Router');
    expect(screen.getByTestId('option-content-B')).toHaveTextContent('Switch');
    expect(screen.getByTestId('option-content-C')).toHaveTextContent('Hub');
    expect(screen.getByTestId('option-content-D')).toHaveTextContent('Access Point');
  });

  it('membuat tiga pasangan kosong secara default untuk soal menjodohkan', () => {
    renderEditor(null, 'matching');

    expect(screen.getByTestId('match-statement-0')).toBeInTheDocument();
    expect(screen.getByTestId('match-statement-1')).toBeInTheDocument();
    expect(screen.getByTestId('match-statement-2')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Jawaban pasangan/)).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Tambah Pasangan/ })).toBeInTheDocument();
  });
});

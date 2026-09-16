import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import QuestionPreview from '@/components/question-editor/question-preview';
import type { PreviewOption } from '@/components/question-editor/question-preview';
import type { DocContent } from '@/lib/types';

afterEach(() => {
  cleanup();
});

function richDoc(): DocContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Data transmission' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Which ' },
          { type: 'text', text: 'device', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' routes frames? ' },
          { type: 'text', text: 'x = 1', marks: [{ type: 'code' }] },
        ],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'first option' }] },
            ],
          },
        ],
      },
      { type: 'image', attrs: { mediaId: 3, alt: 'network diagram', width: 300, height: 200 } },
      { type: 'equation', attrs: { format: 'latex', value: '\\frac{a}{b}' } },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableHeader',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Layer' }] }],
              },
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }],
              },
            ],
          },
        ],
      },
    ],
  };
}

const MCOptions: PreviewOption[] = [
  { key: 'a', text: 'Router', is_correct: false },
  { key: 'b', text: 'Switch', is_correct: true },
  { key: 'c', text: 'Hub', is_correct: false },
];

const resolveMediaUrl = () => Promise.resolve('/media/3');

function feedbackDoc(text: string): DocContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

describe('QuestionPreview', () => {
  it('renders a teacher preview of a multiple choice question with correct answer highlighted', async () => {
    render(
      <QuestionPreview
        type="multiple_choice"
        questionContent={richDoc()}
        defaultMark="1"
        options={MCOptions}
        mode="teacher"
        resolveMediaUrl={resolveMediaUrl}
      />
    );

    expect(screen.getByTestId('preview-mode')).toHaveTextContent('Pratinjau Guru');
    expect(screen.getByText('Multiple Choice')).toBeInTheDocument();
    expect(screen.getByText('Bobot Skor 1')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('rte-content')).toHaveAttribute('contenteditable', 'false');
    });
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();

    expect(screen.getByTestId('option-A')).toHaveTextContent('Router');
    expect(screen.getByTestId('option-B')).toHaveTextContent('Switch');
    const correct = screen.getByTestId('option-B');
    expect(correct).toHaveAttribute('data-correct', 'true');
    expect(screen.getByTestId('correct-badge')).toHaveTextContent('Jawaban benar');
  });

  it('hides correct answers in student preview', () => {
    render(
      <QuestionPreview
        type="multiple_choice"
        questionContent={richDoc()}
        defaultMark="1"
        options={MCOptions}
        mode="student"
        resolveMediaUrl={resolveMediaUrl}
      />
    );

    expect(screen.getByTestId('preview-mode')).toHaveTextContent('Pratinjau Siswa');
    expect(screen.queryByTestId('correct-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('option-B')).not.toHaveAttribute('data-correct');
    expect(screen.getByTestId('option-B')).toHaveTextContent('Switch');
  });

  it('renders rich text, image, table and equation content', async () => {
    render(
      <QuestionPreview
        type="essay"
        questionContent={richDoc()}
        defaultMark="2"
        options={[]}
        mode="teacher"
        resolveMediaUrl={resolveMediaUrl}
      />
    );

    const content = await screen.findByTestId('rte-content');

    // Gate on the slowest async pieces: the image node view and KaTeX render.
    const img = await waitFor(() => content.querySelector('img'));
    expect(img?.getAttribute('src')).toBe('/media/3');
    await waitFor(() => expect(content.querySelector('.katex')).toBeTruthy());

    expect(content.textContent).toContain('Data transmission');
    expect(content.textContent).toContain('routes frames?');
    expect(content.querySelector('h2')).toBeTruthy();
    expect(content.querySelector('strong')).toBeTruthy();
    expect(content.querySelector('ul li')).toBeTruthy();
    expect(content.querySelector('.tableWrapper')).toBeTruthy();
  });

  it('shows the accepted answer only to teachers for short answer', () => {
    const options: PreviewOption[] = [{ key: 'a', text: 'OSI layer 3 forwarding', is_correct: true }];

    const { rerender } = render(
      <QuestionPreview
        type="short_answer"
        questionContent={richDoc()}
        defaultMark="1"
        options={options}
        mode="student"
      />
    );
    expect(screen.getByLabelText('Jawaban singkat')).toBeDisabled();
    expect(screen.queryByTestId('accepted-answer')).not.toBeInTheDocument();

    rerender(
      <QuestionPreview
        type="short_answer"
        questionContent={richDoc()}
        defaultMark="1"
        options={options}
        mode="teacher"
      />
    );
    expect(screen.getByTestId('accepted-answer')).toHaveTextContent('OSI layer 3 forwarding');
  });

  it('shows the manual-grading note for essay questions only to teachers', () => {
    const { rerender } = render(
      <QuestionPreview type="essay" questionContent={richDoc()} defaultMark="3" options={[]} mode="student" />
    );
    expect(screen.getByLabelText('Jawaban esai')).toBeDisabled();
    expect(screen.queryByText(/dinilai secara manual/i)).not.toBeInTheDocument();

    rerender(<QuestionPreview type="essay" questionContent={richDoc()} defaultMark="3" options={[]} mode="teacher" />);
    expect(screen.getByText(/dinilai secara manual/i)).toBeInTheDocument();
  });

  it('renders True/False with the correct statement flagged for teachers', () => {
    const options: PreviewOption[] = [
      { key: 't', text: 'True', is_correct: true },
      { key: 'f', text: 'False', is_correct: false },
    ];

    render(
      <QuestionPreview
        type="true_false"
        questionContent={richDoc()}
        defaultMark="1"
        options={options}
        mode="teacher"
      />
    );

    expect(screen.getByTestId('option-A')).toHaveTextContent('True');
    expect(screen.getByTestId('option-B')).toHaveTextContent('False');
    expect(screen.getByTestId('option-A')).toHaveAttribute('data-correct', 'true');
    expect(screen.getByTestId('option-B')).not.toHaveAttribute('data-correct');
  });

  it('shows general feedback to students and teachers', () => {
    render(
      <QuestionPreview
        type="multiple_choice"
        questionContent={richDoc()}
        defaultMark="1"
        options={MCOptions}
        mode="student"
        feedbackGeneral={feedbackDoc('Pembahasan: router meneruskan paket.')}
      />
    );

    const panel = screen.getByTestId('preview-feedback-general');
    expect(panel.textContent).toContain('Pembahasan: router meneruskan paket.');
    expect(screen.getByTestId('preview-feedback')).toBeInTheDocument();
  });

  it('hides correct/incorrect feedback from students but shows it to teachers', () => {
    const { rerender } = render(
      <QuestionPreview
        type="multiple_choice"
        questionContent={richDoc()}
        defaultMark="1"
        options={MCOptions}
        mode="student"
        feedbackCorrect={feedbackDoc('Benar!')}
        feedbackIncorrect={feedbackDoc('Salah.')}
      />
    );
    expect(screen.queryByTestId('preview-feedback-correct')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-feedback-incorrect')).not.toBeInTheDocument();

    rerender(
      <QuestionPreview
        type="multiple_choice"
        questionContent={richDoc()}
        defaultMark="1"
        options={MCOptions}
        mode="teacher"
        feedbackCorrect={feedbackDoc('Benar!')}
        feedbackIncorrect={feedbackDoc('Salah.')}
      />
    );
    expect(screen.getByTestId('preview-feedback-correct')).toHaveTextContent('Benar!');
    expect(screen.getByTestId('preview-feedback-incorrect')).toHaveTextContent('Salah.');
  });

  it('does not render correct/incorrect feedback sections for essay', () => {
    render(
      <QuestionPreview
        type="essay"
        questionContent={richDoc()}
        defaultMark="2"
        options={[]}
        mode="teacher"
        feedbackCorrect={feedbackDoc('Benar!')}
        feedbackIncorrect={feedbackDoc('Salah.')}
        graderInfo={feedbackDoc('Kunci: meneruskan paket.')}
      />
    );
    expect(screen.queryByTestId('preview-feedback-correct')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-feedback-incorrect')).not.toBeInTheDocument();
    expect(screen.getByTestId('preview-grader-info')).toHaveTextContent('Kunci: meneruskan paket.');
  });

  it('shows grader information only in teacher mode', () => {
    const { rerender } = render(
      <QuestionPreview
        type="essay"
        questionContent={richDoc()}
        defaultMark="2"
        options={[]}
        mode="student"
        graderInfo={feedbackDoc('Rubrik penilaian.')}
      />
    );
    expect(screen.queryByTestId('preview-grader-info')).not.toBeInTheDocument();

    rerender(
      <QuestionPreview
        type="essay"
        questionContent={richDoc()}
        defaultMark="2"
        options={[]}
        mode="teacher"
        graderInfo={feedbackDoc('Rubrik penilaian.')}
      />
    );
    expect(screen.getByTestId('preview-grader-info')).toHaveTextContent('Rubrik penilaian.');
    expect(screen.getByText('Informasi Penilai (Grader)')).toBeInTheDocument();
  });

  it('shows per-option feedback only in teacher mode', () => {
    const options: PreviewOption[] = [
      { key: 'a', text: 'Router', is_correct: false, feedback: 'Router meneruskan paket antar jaringan.' },
      { key: 'b', text: 'Switch', is_correct: true },
    ];

    const { rerender } = render(
      <QuestionPreview
        type="multiple_choice"
        questionContent={richDoc()}
        defaultMark="1"
        options={options}
        mode="student"
      />
    );
    expect(screen.queryByTestId('option-feedback-A')).not.toBeInTheDocument();

    rerender(
      <QuestionPreview
        type="multiple_choice"
        questionContent={richDoc()}
        defaultMark="1"
        options={options}
        mode="teacher"
      />
    );
    expect(screen.getByTestId('option-feedback-A')).toHaveTextContent('Router meneruskan paket antar jaringan.');
  });

  it.each([{ width: 1280, label: 'desktop' }, { width: 768, label: 'tablet' }, { width: 375, label: 'mobile' }])(
    'renders responsively on $label width ($width)',
    async ({ width }) => {
      const { baseElement } = render(
        <div style={{ width }}>
          <QuestionPreview
            type="multiple_choice"
            questionContent={richDoc()}
            defaultMark="1"
            options={MCOptions}
            mode="student"
            resolveMediaUrl={resolveMediaUrl}
          />
        </div>
      );

      const preview = screen.getByTestId('question-preview');
      expect(preview.className).toContain('w-full');
      expect(preview.className).toContain('max-w-2xl');
      expect(preview.className).toContain('min-w-0');

      const questionSection = baseElement.querySelector('[aria-label="Soal"]');
      expect(questionSection?.className).toContain('sm:text-base');

      const content = await screen.findByTestId('rte-content');
      await waitFor(() => expect(content.querySelector('table')).toBeTruthy());
      expect(content.querySelector('.tableWrapper')).toBeTruthy();

      expect(screen.getByTestId('option-A')).toHaveTextContent('Router');
      expect(screen.getByTestId('option-B')).toHaveTextContent('Switch');
      expect(screen.getByTestId('option-C')).toHaveTextContent('Hub');
    }
  );
});
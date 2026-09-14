<?php

namespace Tests\Unit\Services;

use App\Services\DocumentValidator;
use PHPUnit\Framework\TestCase;

class DocumentValidatorTest extends TestCase
{
    private DocumentValidator $validator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->validator = new DocumentValidator;
    }

    private function paragraph(string $text, array $marks = []): array
    {
        $textNode = ['type' => 'text', 'text' => $text];
        if ($marks !== []) {
            $textNode['marks'] = $marks;
        }

        return [
            'type' => 'doc',
            'content' => [
                ['type' => 'paragraph', 'content' => [$textNode]],
            ],
        ];
    }

    public function test_strips_unknown_top_level_nodes(): void
    {
        $doc = $this->paragraph('ok');
        $doc['content'][] = ['type' => 'script', 'content' => [['type' => 'text', 'text' => 'alert(1)']]];

        $result = $this->validator->canonicalize($doc);

        $this->assertNotNull($result);
        $this->assertCount(1, $result['content']);
    }

    public function test_rejects_non_doc_input(): void
    {
        $this->assertNull($this->validator->canonicalize('hello'));
        $this->assertNull($this->validator->canonicalize(42));
        $this->assertNull($this->validator->canonicalize(null));
        $this->assertNull($this->validator->canonicalize(['no' => 'type']));
    }

    public function test_rejects_javascript_hrefs_but_keeps_https(): void
    {
        $doc = $this->paragraph('x', [
            ['type' => 'link', 'attrs' => ['href' => 'javascript:alert(1)']],
        ]);

        $result = $this->validator->canonicalize($doc);

        $this->assertNull($result['content'][0]['content'][0]['marks'] ?? null);
    }

    public function test_keeps_safe_link_with_title(): void
    {
        $doc = $this->paragraph('x', [
            ['type' => 'link', 'attrs' => ['href' => 'https://example.com', 'title' => 'Site', 'target' => '_blank']],
        ]);

        $result = $this->validator->canonicalize($doc);

        $this->assertSame([
            ['type' => 'link', 'attrs' => ['href' => 'https://example.com', 'title' => 'Site']],
        ], $result['content'][0]['content'][0]['marks']);
    }

    public function test_strips_unknown_marks(): void
    {
        $doc = $this->paragraph('x', [['type' => 'marquee']]);

        $result = $this->validator->canonicalize($doc);

        $this->assertNull($result['content'][0]['content'][0]['marks'] ?? null);
    }

    public function test_normalizes_strike_to_strikethrough(): void
    {
        $doc = $this->paragraph('x', [['type' => 'strike']]);

        $result = $this->validator->canonicalize($doc);

        $this->assertSame(['type' => 'strikethrough'], $result['content'][0]['content'][0]['marks'][0]);
    }

    public function test_requires_image_media_id(): void
    {
        $missing = $this->paragraph('ok');
        $missing['content'][] = ['type' => 'image', 'attrs' => ['alt' => 'no id']];
        $this->assertCount(1, $this->validator->canonicalize($missing)['content']);

        $zero = $this->paragraph('ok');
        $zero['content'][] = ['type' => 'image', 'attrs' => ['mediaId' => 0]];
        $this->assertCount(1, $this->validator->canonicalize($zero)['content']);

        $valid = $this->paragraph('ok');
        $valid['content'][] = ['type' => 'image', 'attrs' => ['mediaId' => 7, 'alt' => 'Diagram', 'width' => '300']];
        $result = $this->validator->canonicalize($valid);
        $this->assertSame(
            ['mediaId' => 7, 'alt' => 'Diagram'],
            $result['content'][1]['attrs']
        );
    }

    public function test_equation_requires_latex_format_and_value(): void
    {
        $invalid = $this->paragraph('ok');
        $invalid['content'][] = ['type' => 'equation', 'attrs' => ['format' => 'html', 'value' => '<b>x</b>']];
        $this->assertCount(1, $this->validator->canonicalize($invalid)['content']);

        $valid = $this->paragraph('ok');
        $valid['content'][] = ['type' => 'equation', 'attrs' => ['format' => 'latex', 'value' => 'x^2']];
        $result = $this->validator->canonicalize($valid);
        $this->assertSame(['format' => 'latex', 'value' => 'x^2'], $result['content'][1]['attrs']);
    }

    public function test_preserves_table_structure_and_cell_spans(): void
    {
        $doc = [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'table',
                    'content' => [
                        [
                            'type' => 'tableRow',
                            'attrs' => [],
                            'content' => [
                                [
                                    'type' => 'tableCell',
                                    'attrs' => ['colspan' => 2, 'rowspan' => 1, 'onerror' => 'x'],
                                    'content' => [$this->paragraph('cell')['content'][0]],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ];

        $result = $this->validator->canonicalize($doc);

        $this->assertSame('table', $result['content'][0]['type']);
        $this->assertSame(['colspan' => 2, 'rowspan' => 1], $result['content'][0]['content'][0]['content'][0]['attrs']);
    }

    public function test_has_text_detects_inline_content(): void
    {
        $this->assertTrue($this->validator->hasText($this->paragraph('Hello')));
        $this->assertFalse($this->validator->hasText(['type' => 'doc', 'content' => []]));
        $this->assertFalse($this->validator->hasText(['type' => 'doc', 'content' => [['type' => 'horizontalRule']]]));
        $this->assertFalse($this->validator->hasText('not a doc'));
    }

    public function test_heading_levels_and_text_align_are_preserved(): void
    {
        $doc = [
            'type' => 'doc',
            'content' => [
                ['type' => 'heading', 'attrs' => ['level' => 3, 'textAlign' => 'center'], 'content' => [['type' => 'text', 'text' => 'Title']]],
                ['type' => 'paragraph', 'attrs' => ['textAlign' => 'justify'], 'content' => [['type' => 'text', 'text' => 'Body']]],
            ],
        ];

        $result = $this->validator->canonicalize($doc);

        $this->assertSame(['level' => 3, 'textAlign' => 'center'], $result['content'][0]['attrs']);
        $this->assertSame(['textAlign' => 'justify'], $result['content'][1]['attrs']);
    }
}

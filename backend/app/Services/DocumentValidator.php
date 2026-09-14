<?php

namespace App\Services;

/**
 * Server-side validator/canonicalizer for rich-text documents (ProseMirror/Tiptap JSON).
 *
 * Mirrors the allowlist defined in the frontend (frontend/src/lib/document.ts) so that
 * content is kept in a canonical shape regardless of where it was produced.
 */
final class DocumentValidator
{
    public const MAX_DEPTH = 20;

    public const MAX_TEXT_LENGTH = 20000;

    /** @var array<int, string> */
    private const NODES = [
        'doc',
        'paragraph',
        'heading',
        'text',
        'bulletList',
        'orderedList',
        'listItem',
        'blockquote',
        'codeBlock',
        'horizontalRule',
        'hardBreak',
        'image',
        'table',
        'tableRow',
        'tableCell',
        'tableHeader',
        'equation',
    ];

    /** @var array<int, string> */
    private const MARKS = ['bold', 'italic', 'underline', 'strikethrough', 'strike', 'code', 'link'];

    /** @var array<string, string> */
    private const MARK_ALIASES = ['strike' => 'strikethrough'];

    /** @var array<int, int> */
    private const HEADING_LEVELS = [1, 2, 3, 4, 5, 6];

    /** @var array<int, string> */
    private const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'];

    /** @var array<string, array<int, string>> */
    private const ATTR_ALLOWLIST = [
        'heading' => ['level', 'textAlign'],
        'paragraph' => ['textAlign'],
        'orderedList' => ['start', 'textAlign'],
        'image' => ['mediaId', 'alt', 'width', 'height'],
        'equation' => ['format', 'value'],
        'tableCell' => ['colspan', 'rowspan', 'textAlign'],
        'tableHeader' => ['colspan', 'rowspan', 'textAlign'],
    ];

    public function isSafeHref(mixed $href): bool
    {
        if (! is_string($href)) {
            return false;
        }

        $value = trim($href);
        if ($value === '') {
            return false;
        }

        if (preg_match('/^[a-z][a-z0-9+.-]*:/i', $value)) {
            return preg_match('/^(https?|mailto|tel):/i', $value) === 1;
        }

        return true;
    }

    /**
     * @return array<string, mixed>|null The canonical document, or null when the
     *                                   input is not a valid document tree.
     */
    public function canonicalize(mixed $doc): ?array
    {
        return $this->walk($doc, 0);
    }

    public function hasText(mixed $doc): bool
    {
        $canonical = $this->canonicalize($doc);

        return $canonical !== null && trim($this->plainText($canonical)) !== '';
    }

    public function plainText(?array $doc, int $depth = 0): string
    {
        if ($doc === null || $depth > 8) {
            return '';
        }

        if (($doc['type'] ?? null) === 'text' && is_string($doc['text'] ?? null)) {
            return $doc['text'];
        }

        $inline = ['paragraph', 'heading', 'listItem', 'tableCell', 'tableHeader'];
        $isInline = is_string($doc['type'] ?? null) && in_array($doc['type'], $inline, true);
        $separator = $isInline ? '' : "\n";

        $parts = [];
        foreach ($doc['content'] ?? [] as $child) {
            if (! is_array($child)) {
                continue;
            }
            $part = $this->plainText($child, $depth + 1);
            if ($part !== '') {
                $parts[] = $part;
            }
        }

        return implode($separator, $parts);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function walk(mixed $node, int $depth): ?array
    {
        if (! is_array($node) || $depth > self::MAX_DEPTH) {
            return null;
        }

        $type = $node['type'] ?? null;
        if (! is_string($type) || ! in_array($type, self::NODES, true)) {
            return null;
        }

        if ($type === 'text') {
            return $this->walkText($node);
        }

        $output = ['type' => $type];
        $attrs = $this->cleanAttrs($type, $node['attrs'] ?? null);
        if ($attrs !== []) {
            $output['attrs'] = $attrs;
        }

        if (in_array($type, ['image', 'equation'], true)) {
            return $attrs === [] ? null : $output;
        }

        $children = [];
        foreach ($node['content'] ?? [] as $child) {
            $normalized = $this->walk($child, $depth + 1);
            if ($normalized !== null) {
                $children[] = $normalized;
            }
        }

        if ($children !== []) {
            $output['content'] = $children;
        }

        return $output;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function walkText(array $node): ?array
    {
        $text = $node['text'] ?? null;
        if (! is_string($text) || $text === '' || mb_strlen($text) > self::MAX_TEXT_LENGTH) {
            return null;
        }

        $output = ['type' => 'text', 'text' => $text];
        $marks = $this->cleanMarks($node['marks'] ?? null);
        if ($marks !== []) {
            $output['marks'] = $marks;
        }

        return $output;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function cleanMarks(mixed $marks): array
    {
        if (! is_array($marks)) {
            return [];
        }

        $cleaned = [];
        foreach ($marks as $mark) {
            if (! is_array($mark)) {
                continue;
            }

            $type = $mark['type'] ?? null;
            if (! is_string($type)) {
                continue;
            }

            $canonical = self::MARK_ALIASES[$type] ?? $type;
            if (! in_array($canonical, self::MARKS, true)) {
                continue;
            }

            if ($canonical === 'link') {
                $attrs = $mark['attrs'] ?? null;
                if (! is_array($attrs)) {
                    continue;
                }
                $href = $attrs['href'] ?? null;
                if (! $this->isSafeHref($href)) {
                    continue;
                }
                $linkAttrs = ['href' => $href];
                $title = $attrs['title'] ?? null;
                if (is_string($title) && trim($title) !== '') {
                    $linkAttrs['title'] = mb_substr(trim($title), 0, 255);
                }
                $cleaned[] = ['type' => 'link', 'attrs' => $linkAttrs];

                continue;
            }

            $cleaned[] = ['type' => $canonical];
        }

        return $cleaned;
    }

    /**
     * @return array<string, mixed>
     */
    private function cleanAttrs(string $nodeType, mixed $attrs): array
    {
        if (! is_array($attrs)) {
            return [];
        }

        $allowlist = self::ATTR_ALLOWLIST[$nodeType] ?? [];
        $cleaned = [];

        if ($nodeType === 'heading') {
            $level = $attrs['level'] ?? null;
            if (is_int($level) && in_array($level, self::HEADING_LEVELS, true)) {
                $cleaned['level'] = $level;
            }
        }

        if ($nodeType === 'orderedList') {
            $start = $attrs['start'] ?? null;
            if (is_int($start) && $start >= 1) {
                $cleaned['start'] = $start;
            }
        }

        if ($nodeType === 'image') {
            $mediaId = $attrs['mediaId'] ?? null;
            if (! is_int($mediaId) || $mediaId <= 0) {
                return [];
            }
            $cleaned = ['mediaId' => $mediaId];

            $alt = $attrs['alt'] ?? null;
            if (is_string($alt)) {
                $cleaned['alt'] = mb_substr($alt, 0, 255);
            }
            foreach (['width', 'height'] as $dimension) {
                $size = $attrs[$dimension] ?? null;
                if (is_int($size) && $size > 0) {
                    $cleaned[$dimension] = $size;
                }
            }
        }

        if ($nodeType === 'equation') {
            if (($attrs['format'] ?? null) !== 'latex' || ! is_string($attrs['value'] ?? null)) {
                return [];
            }
            $cleaned = ['format' => 'latex', 'value' => mb_substr($attrs['value'], 0, 2000)];
        }

        if (in_array($nodeType, ['tableCell', 'tableHeader'], true)) {
            foreach (['colspan', 'rowspan'] as $span) {
                $value = $attrs[$span] ?? null;
                if (is_int($value) && $value >= 1) {
                    $cleaned[$span] = $value;
                }
            }
        }

        if (in_array('textAlign', $allowlist, true)) {
            $align = $attrs['textAlign'] ?? null;
            if (is_string($align) && in_array($align, self::TEXT_ALIGNMENTS, true)) {
                $cleaned['textAlign'] = $align;
            }
        }

        return $cleaned;
    }
}

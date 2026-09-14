function replaceAll(input: string, target: string, replacement: string): string {
  return input.split(target).join(replacement);
}

/** Escapes a single character for use inside XML text/attribute values. */
export function escapeXml(input: string): string {
  return replaceAll(
    replaceAll(
      replaceAll(replaceAll(replaceAll(input, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
      '"',
      '&quot;'
    ),
    "'",
    '&apos;'
  );
}

/**
 * Wraps content in a CDATA section. Mindful of the impossibility of nesting the
 * terminator `]]>` inside a CDATA section: any occurrence is split across two
 * sections (`]]]]><![CDATA[>`), which is byte-identical after parsing.
 */
export function cdata(content: string): string {
  return `<![CDATA[${content.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
}
import katex from 'katex';

// OMML (Office Math Markup Language) arrives inside Word's text/html. The
// internal representation for equations everywhere is a LaTeX string on an
// `equation` node (`span[data-equation]` in transferred HTML), so paste time
// converts OMML -> LaTeX where possible.
//
// The converter is deliberately conservative: it understands the common
// subset Word produces for school-level math (fractions, roots, scripts,
// delimiters, n-ary operators, accents, bars, group chars, arrays). Anything
// it does not recognize causes the WHOLE equation to be treated as
// unconvertible (the caller supplies a visible fallback) rather than emitting
// partially-corrupted LaTeX.

type Mm = Element;

function tag(el: Mm | null | undefined): string {
  return el ? el.tagName.toLowerCase() : '';
}

function isTag(el: Mm | null | undefined, suffix: string): boolean {
  return tag(el).endsWith(suffix);
}

function childByTag(el: Mm, suffix: string): Mm | null {
  for (const child of el.children) {
    if (tag(child).endsWith(suffix)) return child;
  }
  return null;
}

function childrenByTag(el: Mm, suffix: string): Mm[] {
  const out: Mm[] = [];
  for (const child of el.children) {
    if (tag(child).endsWith(suffix)) out.push(child);
  }
  return out;
}

function attr(el: Mm, name: string): string | null {
  return el.getAttribute(name);
}

const TEXIFY_CHARS: Record<string, string> = {
  '×': '\\times',
  '÷': '\\div',
  '±': '\\pm',
  '∓': '\\mp',
  '−': '-',
  '–': '-',
  '≤': '\\leq',
  '≥': '\\geq',
  '≠': '\\neq',
  '≈': '\\approx',
  '≡': '\\equiv',
  '∝': '\\propto',
  '∞': '\\infty',
  '∫': '\\int',
  '∑': '\\sum',
  '∏': '\\prod',
  '∮': '\\oint',
  '∂': '\\partial',
  '∇': '\\nabla',
  '√': '\\sqrt{}',
  '→': '\\to',
  '←': '\\leftarrow',
  '↔': '\\leftrightarrow',
  '⇒': '\\Rightarrow',
  '⇔': '\\Leftrightarrow',
  '·': '\\cdot',
  '…': '\\dots',
  '°': '^{\\circ}',
  'α': '\\alpha',
  'β': '\\beta',
  'γ': '\\gamma',
  'δ': '\\delta',
  'ε': '\\varepsilon',
  'θ': '\\theta',
  'λ': '\\lambda',
  'μ': '\\mu',
  'π': '\\pi',
  'σ': '\\sigma',
  'φ': '\\phi',
  'ω': '\\omega',
  'Γ': '\\Gamma',
  'Δ': '\\Delta',
  'Θ': '\\Theta',
  'Λ': '\\Lambda',
  'Π': '\\Pi',
  'Σ': '\\Sigma',
  'Φ': '\\Phi',
  'Ω': '\\Omega',
  '∘': '\\circ',
  '∠': '\\angle',
  '∈': '\\in',
  '∉': '\\notin',
  '⊂': '\\subset',
  '⊆': '\\subseteq',
  '∪': '\\cup',
  '∩': '\\cap',
  '∅': '\\emptyset',
  '∥': '\\parallel',
  '⊥': '\\perp',
  '≅': '\\cong',
};

// Maps an OMML `m:chr` symbol (a unicode character) to a LaTeX command.
const ACCENT_CMDS: Record<string, string> = {
  '\u0302': '\\hat',
  '\u0304': '\\bar',
  '\u0306': '\\breve',
  '\u0307': '\\dot',
  '\u0308': '\\ddot',
  '\u030a': '\\mathring',
  '\u20d7': '\\vec',
  '\u0303': '\\tilde',
};

const GROUP_CMDS: Record<string, [string, string]> = {
  '\u23de': ['\\overbrace', ''],
  '\u23df': ['', '\\underbrace'],
};

function texify(text: string): string {
  let out = '';
  for (const char of text) {
    out += TEXIFY_CHARS[char] ?? char;
  }
  return out;
}

function groupify(value: string): string {
  if (value === '') return '';
  return /^[0-9a-zA-Zα-ωΑ-ΩΔ-ΩΛ⟨⟩]+$/.test(value) ? value : `{${value}}`;
}

function mapDelimiter(char: string): [string, string] | null {
  const map: Record<string, [string, string]> = {
    '(': ['\\left(', '\\right)'],
    ')': ['\\left(', '\\right)'],
    '[': ['\\left[', '\\right]'],
    ']': ['\\left[', '\\right]'],
    '{': ['\\left\\{', '\\right\\}'],
    '}': ['\\left\\{', '\\right\\}'],
    '|': ['\\left|', '\\right|'],
    '‖': ['\\left\\|', '\\right\\|'],
  };
  return map[char] ?? null;
}

// Returns LaTeX for an element's meaningful children (inline nodes), or null
// when any child is unsupported.
function convertInline(el: Mm): string | null {
  let latex = '';

  for (const child of Array.from(el.children)) {
    const converted = convertInlineNode(child);
    if (converted === null) return null;
    latex += converted;
  }

  // Text that is not wrapped in <m:r> (e.g. inside <m:t> of control runs).
  return latex;
}

function convertInlineNode(el: Mm): string | null {
  const name = tag(el);

  if (name === 'm:t' || name.endsWith(':t')) {
    return texify(el.textContent ?? '');
  }

  if (name.endsWith(':r')) {
    const rPr = childByTag(el, ':rpr');
    let text = '';
    for (const child of Array.from(el.childNodes)) {
      if (child instanceof Element && child !== rPr) {
        if (isTag(child, ':t')) text += child.textContent ?? '';
      }
    }
    return texify(text);
  }

  if (name.endsWith(':f')) {
    const num = childByTag(el, ':num');
    const den = childByTag(el, ':den');
    const numLatex = num ? convertInline(num) : '';
    const denLatex = den ? convertInline(den) : '';
    if (numLatex === null || denLatex === null) return null;
    return `\\frac{${numLatex}}{${denLatex}}`;
  }

  if (name.endsWith(':ssup')) {
    const base = childByTag(el, ':e');
    const sup = childByTag(el, ':sup');
    if (!base || !sup) return null;
    const b = convertInline(base);
    const s = convertInline(sup);
    if (b === null || s === null) return null;
    return `${groupify(b)}^{${s}}`;
  }

  if (name.endsWith(':ssub')) {
    const base = childByTag(el, ':e');
    const sub = childByTag(el, ':sub');
    if (!base || !sub) return null;
    const b = convertInline(base);
    const s = convertInline(sub);
    if (b === null || s === null) return null;
    return `${groupify(b)}_{${s}}`;
  }

  if (name.endsWith(':ssubsup')) {
    const base = childByTag(el, ':e');
    const sup = childByTag(el, ':sup');
    const sub = childByTag(el, ':sub');
    if (!base) return null;
    const b = convertInline(base);
    if (b === null) return null;
    const s = sup ? convertInline(sup) : '';
    const d = sub ? convertInline(sub) : '';
    if (s === null || d === null) return null;
    return `${groupify(b)}_{${d}}^{${s}}`;
  }

  if (name.endsWith(':spre')) {
    const base = childByTag(el, ':e');
    const sup = childByTag(el, ':sup');
    const sub = childByTag(el, ':sub');
    if (!base) return null;
    const b = convertInline(base);
    const s = sup ? convertInline(sup) : '';
    const d = sub ? convertInline(sub) : '';
    if (b === null || s === null || d === null) return null;
    return `{}_{${d}}^{${s}}${groupify(b)}`;
  }

  if (name.endsWith(':rad')) {
    const degElement = childByTag(el, ':deg');
    const e = childByTag(el, ':e');
    if (!e) return null;
    const body = convertInline(e);
    if (body === null) return null;
    const degPr = childByTag(el, ':radpr');
    const hide = degPr && childByTag(degPr, ':deghide') !== null;
    if (!degElement || hide || !degElement.textContent?.trim()) {
      return `\\sqrt{${body}}`;
    }
    const index = convertInline(degElement);
    if (index === null) return null;
    return `\\sqrt[${index}]{${body}}`;
  }

  if (name.endsWith(':d')) {
    const pr = childByTag(el, ':dpr');
    const begChr = pr ? childByTag(pr, ':begchr') : null;
    const begin = begChr ? (attr(begChr, 'm:val') ?? '(') : '(';
    const delim = mapDelimiter(begin);
    if (!delim) return null;
    const eChildren = childrenByTag(el, ':e');
    const parts: string[] = [];
    for (const eChild of eChildren) {
      const converted = convertInline(eChild);
      if (converted === null) return null;
      parts.push(converted);
    }
    const joined = parts.join('\\,;\\,');
    return `${delim[0]}${joined}${delim[1]}`;
  }

  if (name.endsWith(':nary')) {
    const pr = childByTag(el, ':narypr');
    const chrElement = pr ? childByTag(pr, ':chr') : null;
    const chr = chrElement ? attr(chrElement, 'm:val') : null;
    const sub = childByTag(el, ':sub');
    const sup = childByTag(el, ':sup');
    const e = childByTag(el, ':e');
    const body = e ? convertInline(e) : '';
    if (body === null) return null;

    const opMap: Record<string, string> = {
      '∑': '\\sum',
      '∏': '\\prod',
      '⋂': '\\bigcap',
      '⋃': '\\bigcup',
      '∫': '\\int',
      '∮': '\\oint',
    };
    const op = chr ? (opMap[chr] ?? texify(chr)) : '\\sum';
    const low = sub ? convertInline(sub) : '';
    const up = sup ? convertInline(sup) : '';
    if (low === null || up === null) return null;
    const base = `${op}`;
    const lowPart = low !== '' ? `_${groupify(low)}` : '';
    const upPart = up !== '' ? `^${groupify(up)}` : '';
    const bodyPart = body === '' ? '' : ` ${groupify(body)}`;
    return `${base}${lowPart}${upPart}${bodyPart}`;
  }

  if (name.endsWith(':acc')) {
    const pr = childByTag(el, ':accpr');
    const chrElement = pr ? childByTag(pr, ':chr') : null;
    const chr = chrElement ? attr(chrElement, 'm:val') : null;
    const e = childByTag(el, ':e');
    const body = e ? convertInline(e) : '';
    if (body === null) return null;
    const cmd = chr ? ACCENT_CMDS[chr] : undefined;
    return cmd ? `${cmd}${groupify(body)}` : (chr ?? '') + body;
  }

  if (name.endsWith(':bar')) {
    const pr = childByTag(el, ':barpr');
    const posElement = pr ? childByTag(pr, ':pos') : null;
    const pos = posElement ? attr(posElement, 'm:val') : null;
    const e = childByTag(el, ':e');
    const body = e ? convertInline(e) : '';
    if (body === null) return null;
    return pos === 'bot' ? `\\underline{${body}}` : `\\overline{${body}}`;
  }

  if (name.endsWith(':groupchr')) {
    const pr = childByTag(el, ':groupchrpr');
    const chrElement = pr ? childByTag(pr, ':chr') : null;
    const chr = chrElement ? attr(chrElement, 'm:val') : null;
    const e = childByTag(el, ':e');
    const body = e ? convertInline(e) : '';
    if (body === null) return null;
    const pair = chr ? GROUP_CMDS[chr] : undefined;
    if (!pair) return texify(chr ?? '');
    return `${pair[0]}{${body}}${pair[1]}`;
  }

  if (name.endsWith(':phan')) {
    const e = childByTag(el, ':e');
    return e ? convertInline(e) : '';
  }

  if (name.endsWith(':box') || name.endsWith(':borderbox') || name.endsWith(':ssty')) {
    const e = childByTag(el, ':e');
    return e ? convertInline(e) : '';
  }

  if (name.endsWith(':limlow') || name.endsWith(':limupp')) {
    const e = childByTag(el, ':e');
    const lim = childByTag(el, ':lim');
    const body = e ? convertInline(e) : '';
    const limit = lim ? convertInline(lim) : '';
    if (body === null || limit === null) return null;
    return `${groupify(body)}_${groupify(limit)}`;
  }

  if (name.endsWith(':func')) {
    const fName = childByTag(el, ':fname') ? childByTag(el, ':fname')!.textContent ?? '' : '';
    const e = childByTag(el, ':e');
    const body = e ? convertInline(e) : '';
    if (body === null) return null;
    return `${texify(fName)}${groupify(body)}`;
  }

  if (name.endsWith(':eqarr')) {
    const rows: string[] = [];
    for (const row of Array.from(el.children)) {
      if (!isTag(row, ':e')) continue;
      const converted = convertInline(row);
      if (converted === null) return null;
      rows.push(converted);
    }
    if (rows.length === 0) return null;
    return `\\begin{aligned}${rows.join('\\\\ ')} \\end{aligned}`;
  }

  if (name.endsWith(':ctrlpr') || name.endsWith(':rpr')) {
    return '';
  }

  if (name === 'm:oMath' || name.endsWith(':omath')) {
    return convertInline(el);
  }

  if (name.endsWith(':omathpara')) {
    const math = childByTag(el, ':omath');
    return math ? convertInline(math) : null;
  }

  return null;
}

/**
 * Converts an OMML root element to LaTeX. Returns null when any construct is
 * not safely convertible.
 */
export function convertOmmlElement(el: Element): string | null {
  if (!el) return null;
  const name = tag(el);
  if (name === 'm:oMath' || name.endsWith(':omath') || name.endsWith(':omathpara')) {
    const latex = convertInlineNode(el);
    if (latex === null || latex.trim() === '') return null;
    return latex.trim();
  }
  return null;
}

/**
 * True when KaTeX can render the LaTeX without errors. Used to gate OMML
 * conversions so badly-formed results surface as a visible fallback instead
 * of a broken equation.
 */
export function isRenderableLatex(latex: string): boolean {
  if (!latex || !latex.trim()) return false;
  try {
    katex.renderToString(latex, { throwOnError: true, displayMode: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Renders LaTeX to KaTeX HTML (best-effort, never throws).
 */
export function renderLatexHtml(latex: string, displayMode = false): string {
  if (!latex || !latex.trim()) return '';
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode });
  } catch {
    return '';
  }
}
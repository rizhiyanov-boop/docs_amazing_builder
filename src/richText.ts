import hljs from 'highlight.js/lib/common';

export function escapeRichTextHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function sanitizeAnchorId(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[\s_]+/g, '-')
    .replaceAll(/[^a-z0-9-]/g, '')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

export type RichTextAnchor = {
  id: string;
  label: string;
};

const ANCHOR_RE = /\{anchor:([^|}]+)(?:\|([^}]+))?\}/g;
const COLOR_RE = /\{color:([^}]+)\}([\s\S]*?)\{color\}/g;
const HIGHLIGHT_RE = /\{highlight:([^}]+)\}([\s\S]*?)\{highlight\}/g;
const CODE_BLOCK_OPEN_RE = /^\{code(?::([^}\s]+))?\}$/i;
const CODE_BLOCK_CLOSE_RE = /^\{code\}$/i;

type RichTextRenderOptions = {
  editable?: boolean;
};

function sanitizeCssColor(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return '#fef08a';

  if (/^#[0-9a-f]{3,8}$/i.test(normalized)) return normalized;
  if (/^rgba?\([0-9\s.,%+-]+\)$/i.test(normalized)) return normalized;
  if (/^hsla?\([0-9\s.,%+-]+\)$/i.test(normalized)) return normalized;
  if (/^[a-z][a-z-]*$/i.test(normalized)) return normalized;

  return '#fef08a';
}

function normalizeCodeLanguage(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'auto') return 'auto';

  if (!/^[a-z0-9+#-]+$/i.test(normalized)) return 'auto';
  if (!hljs.getLanguage(normalized)) return 'auto';

  return normalized;
}

function renderInlineRichTextWithMacros(value: string): string {
  const escaped = escapeRichTextHtml(value);
  const withAnchors = escaped.replace(ANCHOR_RE, (_, rawId: string, rawLabel?: string) => {
    const id = sanitizeAnchorId((rawId || '').trim());
    const label = (rawLabel || '').trim();
    const title = label || id;
    if (!id) return '';
    return `<span class="doc-anchor-marker" data-anchor-id="${id}" id="${id}" contenteditable="false" title="Anchor: ${escapeRichTextHtml(title)}" aria-label="Anchor ${escapeRichTextHtml(title)}"></span>`;
  });

  const withColor = withAnchors.replace(COLOR_RE, (_, rawColor: string, body: string) => {
    const color = sanitizeCssColor(rawColor);
    return `<span class="doc-color" data-color="${escapeRichTextHtml(color)}" style="color:${escapeRichTextHtml(color)}">${renderInlineRichTextWithMacros(body)}</span>`;
  });

  const withHighlight = withColor.replace(HIGHLIGHT_RE, (_, rawColor: string, body: string) => {
    const color = sanitizeCssColor(rawColor);
    return `<mark class="doc-highlight" data-highlight="${escapeRichTextHtml(color)}" style="background-color:${escapeRichTextHtml(color)}">${renderInlineRichTextWithMacros(body)}</mark>`;
  });

  return withHighlight
    .replace(/\{\{([^}]+)\}\}/g, '<code>$1</code>')
    .replace(/\[([^\]|]+)\|([^\]]+)\]/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>');
}

function renderRichCodeBlock(code: string, languageHint: string, options?: RichTextRenderOptions): string {
  const normalizedLanguage = normalizeCodeLanguage(languageHint);
  const editable = Boolean(options?.editable);

  if (editable) {
    const languageAttr = ` data-code-language="${escapeRichTextHtml(normalizedLanguage)}"`;
    return [
      `<pre class="rich-code-block" data-rich-code-block="1"${languageAttr}>`,
      `<code>${escapeRichTextHtml(code)}</code>`,
      '</pre>'
    ].join('');
  }

  if (normalizedLanguage !== 'auto') {
    const highlighted = hljs.highlight(code, { language: normalizedLanguage, ignoreIllegals: true });
    return [
      `<pre class="rich-code-block" data-rich-code-block="1" data-code-language="${escapeRichTextHtml(normalizedLanguage)}">`,
      `<div class="rich-code-block-head"><span>code</span><span class="rich-code-block-lang">${escapeRichTextHtml(normalizedLanguage)}</span></div>`,
      `<code class="hljs language-${escapeRichTextHtml(normalizedLanguage)}">${highlighted.value}</code>`,
      '</pre>'
    ].join('');
  }

  const autoHighlighted = hljs.highlightAuto(code);
  const detectedLanguage = normalizeCodeLanguage(autoHighlighted.language ?? 'auto');
  const languageLabel = detectedLanguage === 'auto' ? 'auto' : `auto (${detectedLanguage})`;

  return [
    '<pre class="rich-code-block" data-rich-code-block="1" data-code-language="auto">',
    `<div class="rich-code-block-head"><span>code</span><span class="rich-code-block-lang">${escapeRichTextHtml(languageLabel)}</span></div>`,
    `<code class="hljs language-${escapeRichTextHtml(detectedLanguage)}">${autoHighlighted.value}</code>`,
    '</pre>'
  ].join('');
}

export function extractAnchorsFromText(value: string): RichTextAnchor[] {
  const anchors: RichTextAnchor[] = [];

  for (const match of value.matchAll(ANCHOR_RE)) {
    const id = sanitizeAnchorId((match[1] || '').trim());
    const label = (match[2] || '').trim() || id;
    if (!id) continue;
    anchors.push({ id, label });
  }

  return anchors;
}

export function renderInlineRichText(value: string): string {
  return renderInlineRichTextWithMacros(value);
}

type ListKind = 'ul' | 'ol';
type OrderedStyle = 'decimal' | 'lower-alpha' | 'lower-roman';
type ListToken = {
  depth: number;
  kind: ListKind;
  orderedStyle: OrderedStyle;
  content: string;
};

const LIST_LINE_RE = /^([ \t]*)(-|#|\d+[.)]|[A-Za-z][.)]|[IVXLCDMivxlcdm]+[.)])(?:\s+(.*))?$/;

function parseListToken(line: string): ListToken | null {
  const match = line.match(LIST_LINE_RE);
  if (!match) return null;

  const [, indent, marker, content = ''] = match;
  const normalizedMarker = marker.toLowerCase();
  const isAlphabetic = /^[a-z][.)]$/.test(normalizedMarker);
  const isRoman = /^[ivxlcdm]+[.)]$/.test(normalizedMarker);
  const depth = Math.floor(indent.replace(/\t/g, '  ').length / 2);

  return {
    depth,
    kind: normalizedMarker === '-' ? 'ul' : 'ol',
    orderedStyle: isRoman ? 'lower-roman' : isAlphabetic ? 'lower-alpha' : 'decimal',
    content
  };
}

function renderListTokens(tokens: ListToken[], startIndex: number, depth: number): [string, number] {
  let index = startIndex;
  let html = '';

  while (index < tokens.length) {
    const current = tokens[index];
    if (current.depth < depth) break;

    if (current.depth > depth) {
      const [nestedHtml, nextIndex] = renderListTokens(tokens, index, current.depth);
      html += nestedHtml;
      index = nextIndex;
      continue;
    }

    const tag = current.kind;
    const orderedStyle = current.orderedStyle;
    const items: string[] = [];

    while (index < tokens.length) {
      const token = tokens[index];
      if (token.depth !== depth || token.kind !== tag) break;
      if (tag === 'ol' && token.orderedStyle !== orderedStyle) break;

      index += 1;

      let nestedHtml = '';
      while (index < tokens.length && tokens[index].depth > depth) {
        const [childHtml, nextIndex] = renderListTokens(tokens, index, tokens[index].depth);
        nestedHtml += childHtml;
        index = nextIndex;
      }

      items.push(`<li>${renderInlineRichText(token.content)}${nestedHtml}</li>`);
    }

    const styleAttr = tag === 'ol' ? ` style="list-style-type: ${orderedStyle};"` : '';
    html += `<${tag}${styleAttr}>${items.join('')}</${tag}>`;
  }

  return [html, index];
}

function renderListBlock(lines: string[]): string {
  const tokens = lines.map(parseListToken).filter((token): token is ListToken => Boolean(token));
  if (tokens.length === 0) return '';

  const minDepth = Math.min(...tokens.map((token) => token.depth));
  return renderListTokens(tokens, 0, minDepth)[0];
}

export function richTextToHtml(value: string, options?: RichTextRenderOptions): string {
  const trimmed = value.trim();
  if (!trimmed) return '<p></p>';

  const lines = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${paragraph.map((line) => renderInlineRichText(line)).join('<br/>')}</p>`);
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    const codeBlockOpen = line.match(CODE_BLOCK_OPEN_RE);
    if (codeBlockOpen) {
      flushParagraph();
      const blockLines: string[] = [];
      const languageHint = codeBlockOpen[1] ?? 'auto';

      index += 1;
      while (index < lines.length && !CODE_BLOCK_CLOSE_RE.test(lines[index].trim())) {
        blockLines.push(lines[index]);
        index += 1;
      }

      blocks.push(renderRichCodeBlock(blockLines.join('\n'), languageHint, options));
      continue;
    }

    if (parseListToken(rawLine)) {
      flushParagraph();
      const listLines: string[] = [];

      while (index < lines.length) {
        const currentLine = lines[index];
        if (!currentLine.trim()) break;
        if (!parseListToken(currentLine)) break;
        listLines.push(currentLine);
        index += 1;
      }

      index -= 1;
      const listHtml = renderListBlock(listLines);
      if (listHtml) blocks.push(listHtml);
      continue;
    }

    const headingMatch = line.match(/^h([2-6])\.\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push(`<h${headingMatch[1]}>${renderInlineRichText(headingMatch[2])}</h${headingMatch[1]}>`);
      continue;
    }

    if (line.startsWith('bq. ')) {
      flushParagraph();
      blocks.push(`<blockquote>${renderInlineRichText(line.slice(4))}</blockquote>`);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();

  return blocks.join('') || '<p></p>';
}

function serializeInlineNode(node: Node, context: 'root' | 'inline' = 'root'): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.replace(/\u00a0/g, ' ') ?? '';
  }

  if (!(node instanceof HTMLElement)) return '';

  const tag = node.tagName.toLowerCase();
  const childText = () => Array.from(node.childNodes).map((child) => serializeInlineNode(child, 'inline')).join('');
  const childrenText = () => Array.from(node.childNodes).map((child) => serializeInlineNode(child, context)).join('');

  if (tag === 'pre' && node.dataset.richCodeBlock === '1') {
    const codeElement = node.querySelector('code');
    const codeText = (codeElement?.textContent ?? node.textContent ?? '').replace(/\u00a0/g, '');
    const rawLanguage = node.dataset.codeLanguage || codeElement?.getAttribute('data-code-language') || '';
    const language = normalizeCodeLanguage(rawLanguage);

    const header = language === 'auto' ? '{code}' : `{code:${language}}`;
    return `${header}\n${codeText}\n{code}`;
  }

  if (tag === 'br') return '\n';
  if (tag === 'strong' || tag === 'b') return `*${childText()}*`;
  if (tag === 'em' || tag === 'i') return `_${childText()}_`;
  if (tag === 'code') return `{{${childText()}}}`;
  if (tag === 'mark' && node.dataset.highlight) {
    const color = sanitizeCssColor(node.dataset.highlight);
    return `{highlight:${color}}${childText()}{highlight}`;
  }
  if (tag === 'span' && node.dataset.color) {
    const color = sanitizeCssColor(node.dataset.color);
    return `{color:${color}}${childText()}{color}`;
  }
  if (tag === 'font' && node.getAttribute('color')) {
    const color = sanitizeCssColor(node.getAttribute('color') ?? '');
    return `{color:${color}}${childText()}{color}`;
  }
  if (tag === 'span' && node.style.backgroundColor) {
    const color = sanitizeCssColor(node.style.backgroundColor);
    return `{highlight:${color}}${childText()}{highlight}`;
  }
  if (tag === 'span' && node.style.color) {
    const color = sanitizeCssColor(node.style.color);
    return `{color:${color}}${childText()}{color}`;
  }
  if (tag === 'a') return `[${childText() || 'ссылка'}|${node.getAttribute('href') || 'https://example.com'}]`;
  if (tag === 'span' && node.dataset.anchorId) return `{anchor:${sanitizeAnchorId(node.dataset.anchorId)}}`;
  if (tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return `${tag}. ${childText().trim()}`;
  if (tag === 'blockquote') return `bq. ${childText().trim()}`;
  if (tag === 'p' || tag === 'div') return Array.from(node.childNodes).map((child) => serializeInlineNode(child, 'inline')).join('').trim();

  const rendered = childrenText();
  return context === 'inline' ? rendered : rendered.trim();
}

function isListElement(node: Element): node is HTMLUListElement | HTMLOListElement {
  return node.tagName === 'UL' || node.tagName === 'OL';
}

function serializeListItemNode(node: Node, nestedLists: Array<HTMLUListElement | HTMLOListElement>): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.replace(/\u00a0/g, ' ') ?? '';
  }

  if (!(node instanceof HTMLElement)) return '';
  if (isListElement(node)) {
    nestedLists.push(node);
    return '';
  }

  const hasNestedList = Array.from(node.children).some(isListElement);
  if (!hasNestedList) return serializeInlineNode(node, 'inline');

  return Array.from(node.childNodes)
    .map((child) => serializeListItemNode(child, nestedLists))
    .join('');
}

function getOrderedListStyle(list: HTMLOListElement): OrderedStyle {
  const explicitType = (list.getAttribute('type') || '').toLowerCase();
  if (explicitType === 'a') return 'lower-alpha';
  if (explicitType === 'i') return 'lower-roman';
  if (explicitType === '1') return 'decimal';

  const inlineStyle = list.style.listStyleType.toLowerCase();
  if (inlineStyle.includes('alpha')) return 'lower-alpha';
  if (inlineStyle.includes('roman')) return 'lower-roman';

  const computedStyle = typeof window === 'undefined' ? '' : window.getComputedStyle(list).listStyleType.toLowerCase();
  if (computedStyle.includes('alpha')) return 'lower-alpha';
  if (computedStyle.includes('roman')) return 'lower-roman';

  return 'decimal';
}

function toAlphabeticIndex(index: number): string {
  let value = Math.max(1, index);
  let output = '';

  while (value > 0) {
    value -= 1;
    output = String.fromCharCode(97 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }

  return output;
}

function toRomanIndex(index: number): string {
  let value = Math.max(1, Math.min(3999, index));
  const parts: Array<[number, string]> = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i']
  ];

  let output = '';
  for (const [arabic, roman] of parts) {
    while (value >= arabic) {
      output += roman;
      value -= arabic;
    }
  }

  return output;
}

function formatOrderedMarker(style: OrderedStyle, index: number): string {
  if (style === 'lower-alpha') return `${toAlphabeticIndex(index)}.`;
  if (style === 'lower-roman') return `${toRomanIndex(index)}.`;
  return `${index}.`;
}

function serializeList(list: HTMLUListElement | HTMLOListElement, depth: number): string[] {
  const lines: string[] = [];
  let hasListItem = false;
  const orderedStyle = list instanceof HTMLOListElement ? getOrderedListStyle(list) : null;
  const parsedStart = list instanceof HTMLOListElement ? Number.parseInt(list.getAttribute('start') ?? '', 10) : Number.NaN;
  let orderedIndex = list instanceof HTMLOListElement ? (Number.isFinite(parsedStart) ? parsedStart : 1) : 1;

  for (const node of Array.from(list.childNodes)) {
    if (node instanceof HTMLUListElement || node instanceof HTMLOListElement) {
      const nestedDepth = hasListItem ? depth + 1 : depth;
      lines.push(...serializeList(node, nestedDepth));
      continue;
    }

    if (!(node instanceof HTMLLIElement)) continue;
    hasListItem = true;

    const nestedLists: Array<HTMLUListElement | HTMLOListElement> = [];
    const content = Array.from(node.childNodes)
      .map((child) => serializeListItemNode(child, nestedLists))
      .join('')
      .trim();
    const marker = orderedStyle ? `${formatOrderedMarker(orderedStyle, orderedIndex)} ` : '- ';
    lines.push(`${'\t'.repeat(depth)}${marker}${content}`);
    orderedIndex += 1;

    for (const nestedList of nestedLists) {
      lines.push(...serializeList(nestedList, depth + 1));
    }
  }

  return lines;
}

function hasListDescendant(node: HTMLElement): boolean {
  if (Array.from(node.childNodes).some((child) => child instanceof HTMLUListElement || child instanceof HTMLOListElement)) {
    return true;
  }

  return Array.from(node.children).some((child) => hasListDescendant(child as HTMLElement));
}

function serializeContainerWithLists(container: HTMLElement): string[] {
  const blocks: string[] = [];
  let inlineBuffer = '';

  const flushInlineBuffer = (): void => {
    const value = inlineBuffer.trim();
    if (value) blocks.push(value);
    inlineBuffer = '';
  };

  for (const child of Array.from(container.childNodes)) {
    if (child instanceof HTMLUListElement || child instanceof HTMLOListElement) {
      flushInlineBuffer();
      blocks.push(serializeList(child, 0).join('\n'));
      continue;
    }

    if (child instanceof HTMLElement && hasListDescendant(child)) {
      flushInlineBuffer();
      blocks.push(...serializeContainerWithLists(child));
      continue;
    }

    inlineBuffer += serializeInlineNode(child, 'inline');
  }

  flushInlineBuffer();
  return blocks;
}

export function editorElementToWikiText(root: HTMLElement): string {
  const blocks = Array.from(root.childNodes).flatMap((node) => {
    if (node instanceof HTMLUListElement || node instanceof HTMLOListElement) {
      return [serializeList(node, 0).join('\n')];
    }

    if (node instanceof HTMLElement && hasListDescendant(node)) {
      return serializeContainerWithLists(node);
    }

    const serialized = serializeInlineNode(node, 'root').trim();
    return serialized ? [serialized] : [];
  });

  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

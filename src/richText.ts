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
  return escapeRichTextHtml(value)
    .replace(ANCHOR_RE, (_, rawId: string, rawLabel?: string) => {
      const id = sanitizeAnchorId((rawId || '').trim());
      const label = (rawLabel || '').trim();
      const title = label || id;
      if (!id) return '';
      return `<span class="doc-anchor-marker" data-anchor-id="${id}" id="${id}" contenteditable="false" title="Anchor: ${escapeRichTextHtml(title)}" aria-label="Anchor ${escapeRichTextHtml(title)}"></span>`;
    })
    .replace(/\{\{([^}]+)\}\}/g, '<code>$1</code>')
    .replace(/\[([^\]|]+)\|([^\]]+)\]/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>');
}

type ListKind = 'ul' | 'ol';
type OrderedStyle = 'decimal' | 'lower-alpha';
type ListToken = {
  depth: number;
  kind: ListKind;
  orderedStyle: OrderedStyle;
  content: string;
};

const LIST_LINE_RE = /^(\t*)(-|#|\d+[.)]|[A-Za-z][.)])\s+(.+)$/;

function parseListToken(line: string): ListToken | null {
  const match = line.match(LIST_LINE_RE);
  if (!match) return null;

  const [, indent, marker, content] = match;
  const normalizedMarker = marker.toLowerCase();
  const isAlphabetic = /^[a-z][.)]$/.test(normalizedMarker);

  return {
    depth: indent.length,
    kind: normalizedMarker === '-' ? 'ul' : 'ol',
    orderedStyle: isAlphabetic ? 'lower-alpha' : 'decimal',
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

export function richTextToHtml(value: string): string {
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

  if (tag === 'br') return '\n';
  if (tag === 'strong' || tag === 'b') return `*${childText()}*`;
  if (tag === 'em' || tag === 'i') return `_${childText()}_`;
  if (tag === 'code') return `{{${childText()}}}`;
  if (tag === 'a') return `[${childText() || 'ссылка'}|${node.getAttribute('href') || 'https://example.com'}]`;
  if (tag === 'span' && node.dataset.anchorId) return `{anchor:${sanitizeAnchorId(node.dataset.anchorId)}}`;
  if (tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return `${tag}. ${childText().trim()}`;
  if (tag === 'blockquote') return `bq. ${childText().trim()}`;
  if (tag === 'p' || tag === 'div') return Array.from(node.childNodes).map((child) => serializeInlineNode(child, 'inline')).join('').trim();

  const rendered = Array.from(node.childNodes).map((child) => serializeInlineNode(child, context)).join('');
  return context === 'inline' ? rendered : rendered.trim();
}

function isListElement(node: Element): node is HTMLUListElement | HTMLOListElement {
  return node.tagName === 'UL' || node.tagName === 'OL';
}

function getOrderedListMarker(list: HTMLOListElement): string {
  const explicitType = (list.getAttribute('type') || '').toLowerCase();
  if (explicitType === 'a') return 'a.';
  if (explicitType === '1') return '1.';

  const inlineStyle = list.style.listStyleType.toLowerCase();
  if (inlineStyle.includes('alpha')) return 'a.';

  const computedStyle = typeof window === 'undefined' ? '' : window.getComputedStyle(list).listStyleType.toLowerCase();
  if (computedStyle.includes('alpha')) return 'a.';

  return '1.';
}

function serializeList(list: HTMLUListElement | HTMLOListElement, depth: number): string[] {
  const marker = list instanceof HTMLOListElement ? `${getOrderedListMarker(list)} ` : '- ';
  const lines: string[] = [];

  for (const item of Array.from(list.children)) {
    if (!(item instanceof HTMLLIElement)) continue;

    const nestedLists = Array.from(item.children).filter(isListElement);
    const inlineNodes = Array.from(item.childNodes).filter((child) => {
      if (!(child instanceof HTMLElement)) return true;
      return !isListElement(child);
    });

    const content = inlineNodes.map((child) => serializeInlineNode(child, 'inline')).join('').trim();
    lines.push(`${'\t'.repeat(depth)}${marker}${content}`);

    for (const nestedList of nestedLists) {
      lines.push(...serializeList(nestedList, depth + 1));
    }
  }

  return lines;
}

export function editorElementToWikiText(root: HTMLElement): string {
  const blocks = Array.from(root.childNodes)
    .map((node) => {
      if (node instanceof HTMLUListElement || node instanceof HTMLOListElement) {
        return serializeList(node, 0).join('\n');
      }

      return serializeInlineNode(node, 'root').trim();
    })
    .filter(Boolean);

  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

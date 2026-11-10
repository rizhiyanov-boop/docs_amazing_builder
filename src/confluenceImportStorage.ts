const AC = 'http://atlassian.com/content';
const RI = 'http://atlassian.com/resource';
const layoutTags = new Set(['layout', 'layout-section', 'layout-cell', 'rich-text-body']);
const inactiveTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link']);

export type StorageHeading = { id: number; title: string; level: number };
export type StorageBlock = { element: Element; path: StorageHeading[]; labels: string[]; order: number };
export type StorageCell = { element: Element; column: number; row: number; width: number; height: number };

export function macroName(element: Element): string {
  return element.namespaceURI === AC && ['structured-macro', 'macro'].includes(element.localName)
    ? element.getAttributeNS(AC, 'name') ?? '' : '';
}

export function macroParameter(element: Element, key: string): string {
  return Array.from(element.children).find(child => child.namespaceURI === AC && child.localName === 'parameter'
    && child.getAttributeNS(AC, 'name') === key)?.textContent?.trim() ?? '';
}

export function macroCode(element: Element): string {
  return Array.from(element.children).find(child => child.namespaceURI === AC && child.localName === 'plain-text-body')?.textContent ?? '';
}

export function storageText(element: Element): string {
  function read(node: Node): string {
    if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue ?? '';
    if (node.nodeType !== 1) return '';
    const child = node as Element;
    const tag = child.localName;
    if (inactiveTags.has(tag)) return '';
    if (tag === 'br') return '\n';
    if (child.namespaceURI === AC && tag === 'parameter') {
      return Array.from(child.children).filter(resource => resource.namespaceURI === RI).map(read).join(' ');
    }
    if (child.namespaceURI === RI) {
      return child.getAttributeNS(RI, 'filename') ?? child.getAttributeNS(RI, 'content-title')
        ?? child.getAttributeNS(RI, 'value') ?? child.getAttributeNS(RI, 'username') ?? '';
    }
    const macro = macroName(child);
    if (macro === 'jira') return macroParameter(child, 'key') || 'Jira';
    if (macro === 'code') return '\n' + macroCode(child) + '\n';
    if (macro === 'toc') return '';
    const title = macro === 'expand' ? macroParameter(child, 'title') : '';
    const content = Array.from(child.childNodes).map(read).join('');
    if (tag === 'a') {
      const href = child.getAttribute('href');
      if (href && /^(?:https?:\/\/|\/(?!\/)|#)/i.test(href) && content.trim() !== href) return content + ' (' + href + ')';
    }
    if (tag === 'li') return '- ' + content.trim() + '\n';
    if (/^(p|div|ul|ol|tr|blockquote|pre)$/u.test(tag)) return content + '\n';
    if (macro) return [title, content.trim() || (macro === 'status' ? macroParameter(child, 'title') : ''), macro === 'expand' ? '' : '[' + macro + ']'].filter(Boolean).join('\n');
    return content;
  }
  return read(element).trim();
}

export function readStorage(storage: string, parser: DOMParser) {
  const entities = new Map([['nbsp', '&#160;'], ['ndash', '&#8211;'], ['mdash', '&#8212;'],
    ['hellip', '&#8230;'], ['laquo', '&#171;'], ['raquo', '&#187;'], ['plusmn', '&#177;'], ['bull', '&#8226;']]);
  const source = storage.replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|&([a-z]+);/gu,
    (part, name: string | undefined) => (name && entities.get(name)) || part);
  const doc = parser.parseFromString('<docbuilder-root xmlns:ac="' + AC + '" xmlns:ri="' + RI + '">' + source + '</docbuilder-root>', 'application/xml');
  if (doc.documentElement.localName !== 'docbuilder-root' || doc.querySelector('parsererror')) {
    throw new Error('Не удалось разобрать исходную разметку страницы Confluence');
  }
  const path: StorageHeading[] = [];
  const headings: StorageHeading[] = [];
  const blocks: StorageBlock[] = [];
  function walk(parent: Element, labels: string[] = []) {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 3 && node.textContent?.trim()) {
        const paragraph = doc.createElement('p');
        paragraph.textContent = node.textContent;
        blocks.push({ element: paragraph, path: [...path], labels, order: blocks.length });
      }
      if (node.nodeType !== 1) continue;
      const element = node as Element;
      const tag = element.localName;
      const macro = macroName(element);
      if (inactiveTags.has(tag) || macro === 'toc') continue;
      if (element.namespaceURI === null && /^h[1-6]$/u.test(tag)) {
        const title = storageText(element);
        if (!title) continue;
        const level = Number(tag[1]);
        while (path.length && path.at(-1)!.level >= level) path.pop();
        const heading = { id: headings.length, title, level };
        headings.push(heading);
        path.push(heading);
      } else if (macro === 'expand') {
        const body = Array.from(element.children).find(child => child.namespaceURI === AC && child.localName === 'rich-text-body');
        if (body) walk(body, [...labels, macroParameter(element, 'title')].filter(Boolean));
        else blocks.push({ element, path: [...path], labels, order: blocks.length });
      } else if ((element.namespaceURI === AC && layoutTags.has(tag))
        || (element.namespaceURI === null && (['div', 'section'].includes(tag)
          || tag === 'p' && element.children.length > 0 && Array.from(element.childNodes)
            .every(child => child.nodeType === 1 ? Boolean(macroName(child as Element)) : !child.textContent?.trim())))) {
        walk(element, labels);
      } else {
        blocks.push({ element, path: [...path], labels, order: blocks.length });
      }
    }
  }
  walk(doc.documentElement);
  return { headings, blocks };
}

export function readStorageTable(table: Element) {
  const physical = Array.from(table.querySelectorAll('tr')).filter(row => row.closest('table') === table)
    .map(row => Array.from(row.children).filter(cell => ['th', 'td'].includes(cell.localName)));
  const grid: (StorageCell | undefined)[][] = physical.map(() => []);
  let usable = !table.querySelector('table');
  let slots = 0;
  physical.forEach((cells, row) => {
    let column = 0;
    for (const element of cells) {
      while (grid[row][column]) column++;
      const width = Number(element.getAttribute('colspan') ?? '1');
      const height = Number(element.getAttribute('rowspan') ?? '1');
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
        || column + width > 256 || row + height > grid.length) { usable = false; continue; }
      slots += width * height;
      if (slots > 250_000) { usable = false; continue; }
      const cell = { element, column, row, width, height };
      for (let y = row; y < row + height; y++) {
        for (let x = column; x < column + width; x++) {
          if (grid[y][x]) usable = false;
          grid[y][x] = cell;
        }
      }
      column += width;
    }
  });
  return { physical, grid, usable };
}

export function tableAsText(physical: Element[][]): string {
  return physical.map(row => row.map(cell => {
    const geometry = ['rowspan', 'colspan'].flatMap(name => cell.hasAttribute(name) ? [name + '=' + cell.getAttribute(name)] : []);
    return (geometry.length ? '[' + geometry.join(', ') + '] ' : '') + storageText(cell).replace(/\n/g, ' ⏎ ');
  }).join(' | ')).join('\n');
}

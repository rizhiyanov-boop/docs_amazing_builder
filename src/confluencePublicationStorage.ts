import { prepareConfluenceImport } from './confluenceImport';
import { macroName, macroParameter, parseStorageDocument, readStorage, storageText } from './confluenceImportStorage';
import type { ConfluencePage } from './confluenceTypes';
import type { MethodDocument, TextSection } from './types';

const plainTags = new Set('table thead tbody tfoot tr td th p div span strong b em i u s br ul ol li blockquote pre code a'.split(' '));
const confluenceMacros = new Set(['code', 'expand', 'jira', 'status', 'view-file']);
const confluenceTags = new Set(['parameter', 'plain-text-body', 'rich-text-body', 'link', 'link-body', 'plain-text-link-body', 'page', 'attachment', 'url', 'user']);
const XHTML = 'http://www.w3.org/1999/xhtml';
const AC = 'http://atlassian.com/content';
const RI = 'http://atlassian.com/resource';

function makeElement(doc: Document, name: string, value?: string) {
  const node = doc.createElement(name);
  if (value) node.textContent = value;
  return node;
}

export function importedPublicationSections(method: MethodDocument): TextSection[] {
  return method.sections.filter((section): section is TextSection => section.kind === 'text' && section.enabled !== false
    && section.id.startsWith('confluence-extra-') && Boolean(section.value.trim()));
}

/** Restore structured source blocks only when their editable Builder text is intact. */
export function restoreConfluencePublication(
  method: MethodDocument, storage: string, source: ConfluencePage, targetId?: string, parser = new DOMParser()
): string {
  const origin = method.confluenceImport?.baseUrl;
  if (!origin || method.confluenceImport?.pageId !== source.id || method.confluenceImport?.version !== source.version) {
    throw new Error('Исходная версия импорта недоступна. Подготовка публикации остановлена.');
  }
  const imported = prepareConfluenceImport(source, origin, parser);
  if (!imported.ok) throw new Error('Исходная версия больше не распознаётся. Проверьте документ в Confluence.');
  const baseline = imported.method;
  const originalBlocks = readStorage(source.storage!, parser).blocks;
  const doc = parseStorageDocument(storage, parser);
  const root = doc.documentElement;
  const directHeadings = () => Array.from(root.children).filter(element => /^h[1-6]$/u.test(element.localName));
  const title = (element: Element) => (element.textContent ?? '').trim();
  const range = (heading: Element, level = Number(heading.localName[1])) => {
    const elements: Element[] = [];
    for (let element = heading.nextElementSibling; element; element = element.nextElementSibling) {
      if (/^h[1-6]$/u.test(element.localName) && Number(element.localName[1]) <= level) break;
      elements.push(element);
    }
    return elements;
  };
  const heading = (name: string) => {
    const matches = directHeadings().filter(element => title(element) === name);
    return matches.length === 1 ? matches[0] : undefined;
  };

  function copy(node: Node): Node | undefined {
    if (node.nodeType === 3) return doc.createTextNode(node.nodeValue ?? '');
    if (node.nodeType === 4) return doc.createCDATASection(node.nodeValue ?? '');
    if (node.nodeType !== 1) return;
    const element = node as Element;
    const tag = element.localName;
    const ns = element.namespaceURI;
    const macro = macroName(element);
    if (ns === RI && tag === 'url') {
      try {
        const url = new URL(element.getAttributeNS(RI, 'value') ?? '');
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
      } catch { return; }
    }
    if (macro === 'view-file' && targetId !== source.id) {
      const attachment = element.getElementsByTagNameNS(RI, 'attachment')[0];
      const file = attachment?.getAttributeNS(RI, 'filename');
      if (file && !attachment.children.length) {
        const link = makeElement(doc, 'a', file);
        link.setAttribute('href', new URL('/download/attachments/' + source.id + '/' + encodeURIComponent(file), origin).href);
        return link;
      }
    }
    if (!((!ns || ns === XHTML) && plainTags.has(tag) || macro && confluenceMacros.has(macro)
      || (ns === AC || ns === RI) && confluenceTags.has(tag))) {
      const text = storageText(element);
      return text ? doc.createTextNode(text) : undefined;
    }
    const clone = ns && ns !== XHTML ? doc.createElementNS(ns, element.tagName) : makeElement(doc, tag);
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.namespaceURI === AC || attribute.namespaceURI === RI) {
        if (!['macro-id', 'local-id'].includes(attribute.localName)) clone.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
      } else if (['rowspan', 'colspan'].includes(attribute.name)) {
        clone.setAttribute(attribute.name, attribute.value);
      } else if (tag === 'a' && attribute.name === 'href') {
        try {
          const url = new URL(attribute.value, source.url || origin);
          if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) clone.setAttribute('href', url.href);
        } catch { /* Keep the label for an invalid URL. */ }
      }
    }
    for (const child of Array.from(node.childNodes)) {
      const rendered = copy(child);
      if (rendered) clone.appendChild(rendered);
    }
    return clone;
  }

  const tableRows = (table: Element) => Array.from(table.querySelectorAll('tr')).filter(row => row.closest('table') === table);
  const keyOf = (row: Element) => row.firstElementChild ? storageText(row.firstElementChild).trim().toLowerCase() : '';
  const generatedHeadings = { history: 'История изменений', task: 'Постановка задачи', info: 'Общая информация' };
  function mergeMetadata(kind: keyof typeof generatedHeadings, original: Element) {
    const canonical = heading(generatedHeadings[kind]);
    const table = canonical && range(canonical).find(element => element.localName === 'table');
    if (!table) return false;
    if (kind === 'history') {
      if (method.jiraTicket !== baseline.jiraTicket || method.responsible !== baseline.responsible) return false;
      const restored = copy(original);
      if (!restored) return false;
      table.replaceWith(restored);
      return true;
    }
    const rows = tableRows(original);
    const rowByKey = new Map(tableRows(table).map(row => [keyOf(row), row]));
    if (kind === 'info') return rows.every(row => row.children.length === 2 && rowByKey.has(keyOf(row)));
    if (rows.some(row => row.children.length !== 2)) return false;
    const goal = (document: MethodDocument) => document.sections.find((section): section is TextSection =>
      section.kind === 'text' && section.id === 'goal' && section.enabled !== false)?.value;
    const unchanged = new Map([
      ['epic', method.epic === baseline.epic],
      ['инициаторы', method.initiators === baseline.initiators],
      ['цель', goal(method) === goal(baseline)]
    ]);
    for (const row of rows) {
      const key = keyOf(row);
      const target = rowByKey.get(key);
      if (target) {
        if (!unchanged.get(key)) continue;
        const cell = copy(row.children[1]);
        if (cell) target.children[1].replaceWith(cell);
      } else {
        const content = copy(row);
        if (content) tableRows(table).at(-1)?.parentElement?.appendChild(content);
      }
    }
    return true;
  }

  function restoreResponseComments(original: Element, notes: string[]) {
    const response = heading('Response');
    const table = response && range(response).find(element => element.localName === 'table');
    if (!table) return notes;
    const [head, ...rows] = tableRows(original);
    const [targetHead, ...targetRows] = tableRows(table);
    if (!head || !targetHead || !rows.length || !targetRows.length
      || original.querySelector('[rowspan],[colspan]') || table.querySelector('[rowspan],[colspan]')) return notes;
    const columns = Array.from(head.children).map(storageText);
    const targetColumns = Array.from(targetHead.children).map(storageText);
    const comment = columns.findIndex(label => label.trim().toLowerCase() === 'комментарий');
    const server = columns.indexOf('Server Response');
    const client = columns.findIndex(label => /^Client Response\b/u.test(label));
    const targetServer = targetColumns.indexOf('Server Response');
    const targetClient = targetColumns.indexOf('Client Response');
    if (comment < 0 || server < 0 || targetServer < 0 || targetColumns.includes(columns[comment])) return notes;
    const valueAt = (row: Element, index: number) => row.children[index] ? storageText(row.children[index]) : '';
    const fieldAt = (row: Element, server: number, client: number) => {
      const field = valueAt(row, server);
      return field && field !== '-' ? field : valueAt(row, client);
    };
    const numbered = !columns[0] && rows.every((row, index) => valueAt(row, 0) === String(index + 1));
    const byField = new Map<string, Element[]>();
    for (const row of targetRows) {
      const key = fieldAt(row, targetServer, targetClient);
      byField.set(key, [...(byField.get(key) ?? []), row]);
    }
    const remaining = new Set(notes);
    const attached = new Map<Element, Node>();
    for (const row of rows) {
      const field = fieldAt(row, server, client);
      const text = valueAt(row, comment);
      const indexLine = numbered ? 'Колонка 1: ' + valueAt(row, 0) : '';
      const commentLine = text ? columns[comment] + ': ' + text : '';
      const matched = byField.get(field);
      const note = [field, indexLine, commentLine].filter(Boolean).join('\n');
      if (!remaining.has(note)) continue;
      if (text && matched?.length === 1 && !attached.has(matched[0])) {
        const cell = copy(row.children[comment]);
        if (!cell) continue;
        attached.set(matched[0], cell);
      } else if (text) continue;
      remaining.delete(note);
    }
    if (attached.size) {
      targetHead.append(makeElement(doc, 'th', columns[comment]));
      for (const row of targetRows) row.append(attached.get(row) ?? makeElement(doc, 'td', '-'));
    }
    return [...remaining];
  }

  const request = method.sections.find(section => section.kind === 'parsed' && section.id === 'request' && section.enabled !== false);
  if (request?.kind === 'parsed' && request.format === 'curl' && request.input.trim()) {
    for (const element of Array.from(root.getElementsByTagNameNS(AC, 'structured-macro'))) {
      if (macroName(element) === 'expand' && macroParameter(element, 'title') === 'Server cURL') element.remove();
    }
  }

  for (const section of importedPublicationSections(method)) {
    const pieces = imported.supplemental.filter(item => item.title === section.title);
    const output = heading(section.title);
    if (!pieces.length || !output || !pieces.every(piece => piece.publication)
      || pieces.map(piece => piece.text).join('\n\n') !== section.value) continue;
    const oldBody = range(output);
    const replacements: Node[] = [];
    let restore = true;
    let errorTable = false;
    for (const piece of pieces) {
      const block = originalBlocks[piece.order];
      const kind = piece.publication!;
      if (typeof kind === 'object') {
        const rows = section.title === 'Response: примечания к таблице'
          ? restoreResponseComments(block.element, kind.notes) : kind.notes;
        if (!rows.length) continue;
        const notes = makeElement(doc, 'table');
        const header = makeElement(doc, 'tr');
        header.append(makeElement(doc, 'th', 'Поле'), makeElement(doc, 'th', 'Примечания'));
        const body = makeElement(doc, 'tbody');
        body.append(header);
        for (const note of rows) {
          const end = note.indexOf('\n');
          const row = makeElement(doc, 'tr');
          const cell = makeElement(doc, 'td');
          for (const line of note.slice(end + 1).split('\n')) cell.append(makeElement(doc, 'p', line));
          row.append(makeElement(doc, 'td', note.slice(0, end) || '-'), cell);
          body.append(row);
        }
        notes.append(body);
        replacements.push(notes);
      } else if (kind === 'history' || kind === 'task' || kind === 'info') {
        restore = pieces.length === 1 && mergeMetadata(kind, block.element);
      } else {
        const element = copy(block.element);
        if (element) replacements.push(element);
        else restore = false;
        errorTable ||= kind === 'error-table';
      }
    }
    if (!restore) continue;
    for (const element of oldBody) element.remove();
    if (replacements.length) {
      output.after(...replacements);
      if (errorTable && !heading('Ошибки')) output.textContent = 'Ошибки';
      if (section.title === 'Документы по задаче' && replacements.every(node => (node as Element).localName === 'table')) {
        const info = heading(generatedHeadings.info);
        if (info) (range(info).at(-1) ?? info).after(output, ...replacements);
      }
      const relatedTitle = section.title === 'Response: примечания к таблице' ? 'Response'
        : section.title === 'Request: примечания к таблице' ? 'Request'
        : section.title === 'Диаграмма последовательности' ? 'Диаграмма процесса' : undefined;
      const related = relatedTitle ? heading(relatedTitle) : undefined;
      if (related) {
        const subheading = makeElement(doc, 'h3', relatedTitle === 'Диаграмма процесса' ? 'Описание последовательности' : 'Примечания к полям');
        (range(related).at(-1) ?? related).after(subheading, ...replacements);
        output.remove();
      }
    } else output.remove();
  }

  const info = heading(generatedHeadings.info);
  if (info) {
    const placeholder = range(info).filter(element => element.localName === 'table').find(table => {
      const rows = tableRows(table);
      return rows.length === 2 && rows[0].children.length === 2 && keyOf(rows[0]) === 'ссылка'
        && Array.from(rows[1].children).every(cell => /^[-—–]?$/u.test(storageText(cell)));
    });
    placeholder?.remove();
  }
  const serializer = new XMLSerializer();
  return Array.from(root.childNodes).map(node => serializer.serializeToString(node)).join('');
}

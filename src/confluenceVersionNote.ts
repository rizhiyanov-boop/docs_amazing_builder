import { macroName, readStorage, readStorageTable, storageText } from './confluenceImportStorage';

// DocBuilder limit for a short, single-line history entry.
export const CONFLUENCE_VERSION_NOTE_LIMIT = 255;

const sections = [
  ['постановка задачи', 'постановка задачи', 'цель'],
  ['общая информация', 'общая информация', 'внешние вызовы'],
  ['функциональные требования', 'функциональные требования'],
  ['нефункциональные требования', 'нефункциональные требования'],
  ['Request', 'request', 'запрос', 'входные параметры', 'параметры запроса', 'структура запроса'],
  ['Response', 'response', 'ответ', 'выходные параметры', 'параметры ответа', 'структура ответа'],
  ['ошибки', 'ошибки', 'errors', 'обработка ошибок', 'коды ошибок'],
  ['диаграммы', 'диаграмма процесса', 'диаграмма последовательности']
] as const;

function headingKey(value: string): string {
  return value.trim().toLowerCase().replace(/^\d+(?:\.\d+)*[.)]?\s+/u, '').replace(/\s+/gu, ' ').replace(/[.:]+$/u, '').trimEnd();
}

function textKey(value: string): string {
  return value.replace(/\r\n?/gu, '\n').trim();
}

function sectionContent(storage: string, parser: DOMParser): Map<string, string[]> {
  const { blocks } = readStorage(storage, parser);
  const groups = new Map<string, string[]>();
  for (const block of blocks) {
    const path = block.path.map(heading => headingKey(heading.title));
    const primary = path.map(key => sections.find(([, ...aliases]) => (aliases as readonly string[]).includes(key))?.[0])
      .filter(value => value !== undefined).at(-1);
    if (!primary && path.includes('история изменений')) continue;
    const label = primary ?? 'дополнительные материалы';
    const element = block.element;
    const entry = element.localName === 'table'
      ? JSON.stringify(readStorageTable(element).physical.map(row => row.map(cell => [
          textKey(storageText(cell)), cell.getAttribute('rowspan') ?? '1', cell.getAttribute('colspan') ?? '1'
        ])))
      : textKey(storageText(element));
    const macro = macroName(element);
    if (!entry && !macro) continue;
    const values = groups.get(label) ?? [];
    values.push(JSON.stringify([primary ? '' : path.at(-1), element.localName === 'table' ? 'table' : macro, entry]));
    groups.set(label, values);
  }
  return groups;
}

/** Suggest only section names. Source values and examples never enter the history comment. */
export function suggestConfluenceVersionNote(
  before: { title: string; storage?: string }, after: { title: string; storage: string }, migration: boolean,
  parser = new DOMParser()
): string {
  const sentences: string[] = [];
  if (migration) sentences.push('Переход на шаблон DocBuilder');
  if (before.title !== after.title) sentences.push('Изменён заголовок');
  if (before.storage) {
    try {
      const previous = sectionContent(before.storage, parser);
      const next = sectionContent(after.storage, parser);
      const changed = [...sections.map(([name]) => name), 'дополнительные материалы'].filter(name =>
        JSON.stringify(previous.get(name)) !== JSON.stringify(next.get(name)));
      if (changed.length) {
        const prefix = 'Изменены разделы: ';
        const names = [...changed];
        while (names.length > 0 && [...sentences, prefix + names.join(', ') + (names.length < changed.length ? ' и другие' : '')]
          .join('. ').length >= CONFLUENCE_VERSION_NOTE_LIMIT) names.pop();
        if (names.length) sentences.push(prefix + names.join(', ') + (names.length < changed.length ? ' и другие' : ''));
      }
    } catch { /* Invalid storage cannot supply a reliable summary. */ }
  }
  return sentences.join('. ') || 'Опубликовано из DocBuilder';
}

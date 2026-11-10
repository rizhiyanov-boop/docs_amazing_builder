import { confluenceStorageColumn, isConfluenceFieldName } from './confluenceImport';
import { macroName, readStorage, readStorageTable, storageText, type StorageBlock } from './confluenceImportStorage';
import {
  CONFLUENCE_VERSION_NOTE_LIMIT, confluenceVersionSections, type ConfluenceVersionFact,
  type ConfluenceVersionSection, type CountedConfluenceChange
} from './confluenceVersionFacts';

export { CONFLUENCE_VERSION_NOTE_LIMIT } from './confluenceVersionFacts';

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

type SectionContent = { entries: string[]; tables: { block: StorageBlock; signature: string }[] };

function sectionContent(storage: string, parser: DOMParser) {
  const { blocks } = readStorage(storage, parser);
  const groups = new Map<ConfluenceVersionSection, SectionContent>();
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
    const group = groups.get(label) ?? { entries: [], tables: [] };
    group.entries.push(JSON.stringify([primary ? '' : path.at(-1), element.localName === 'table' ? 'table' : macro, entry]));
    if (element.localName === 'table') group.tables.push({ block, signature: entry });
    groups.set(label, group);
  }
  return groups;
}

function tableMovements(previous: ReturnType<typeof sectionContent>, next: ReturnType<typeof sectionContent>) {
  function locations(groups: ReturnType<typeof sectionContent>) {
    const result = new Map<string, ConfluenceVersionSection | undefined>();
    for (const [section, { tables }] of groups) {
      for (const { signature } of tables) result.set(signature, result.has(signature) ? undefined : section);
    }
    return result;
  }
  const previousLocations = locations(previous);
  const moved = new Set<string>();
  const incoming = new Map<ConfluenceVersionSection, number>();
  const outgoing = new Map<ConfluenceVersionSection, number>();
  for (const [signature, target] of locations(next)) {
    const source = previousLocations.get(signature);
    if (!source || !target || source === target) continue;
    moved.add(signature);
    incoming.set(target, (incoming.get(target) ?? 0) + 1);
    outgoing.set(source, (outgoing.get(source) ?? 0) + 1);
  }
  return { moved, incoming, outgoing };
}

type Column = NonNullable<ReturnType<typeof confluenceStorageColumn>> | 'comment';
type FieldRow = Partial<Record<Column, string>>;
type FieldTable = { columns: Set<Column>; rows: Map<string, FieldRow> };

function tablePart(block: StorageBlock) {
  const headings = block.path.map(heading => headingKey(heading.title));
  if (headings.some(title => ['headers', 'заголовки', 'заголовки запроса', 'http headers'].includes(title))) return 'headers';
  if (headings.some(title => ['query', 'query parameters', 'параметры строки запроса'].includes(title))) return 'query';
  if (headings.some(title => ['path', 'path parameters', 'параметры пути'].includes(title))) return 'path';
  return 'body';
}

function readFieldTable(block: StorageBlock, section: 'Request' | 'Response' | 'ошибки'): FieldTable | undefined {
  const table = readStorageTable(block.element);
  const header = table.physical[0] ?? [];
  if (!table.usable || !header.length || header.some(cell => cell.localName !== 'th')) return;
  const columns = header.map((cell): Column | undefined => {
    const label = storageText(cell);
    return headingKey(label) === 'комментарий' ? 'comment' : confluenceStorageColumn(label);
  });
  const known = columns.filter(column => column !== undefined);
  if (new Set(known).size !== known.length) return;
  const keyColumns: Column[] = section === 'ошибки' ? ['internalCode']
    : section === 'Request' ? ['serverRequest', 'field'] : ['serverResponse', 'field'];
  const keyColumn = keyColumns.find(column => columns.includes(column));
  if (!keyColumn) return;
  const clientColumn = section === 'Request' ? 'clientRequest' : 'clientResponse';
  const headers = section === 'Request' && tablePart(block) === 'headers';
  if (section !== 'ошибки' && !headers && !known.includes('type')) return;
  const rows = new Map<string, FieldRow>();
  for (const cells of table.grid.slice(1)) {
    if (cells.length > columns.length || cells.some(cell => cell && (cell.width > 1 || cell.height > 1))) return;
    const values: FieldRow = {};
    let hasContent = false;
    cells.forEach((cell, index) => {
      if (!cell) return;
      const value = textKey(storageText(cell.element));
      hasContent ||= Boolean(value && value !== '-');
      const column = columns[index];
      if (column) values[column] = value;
    });
    if (!hasContent) continue;
    const server = values[keyColumn];
    const primary = server && server !== '-' ? server : '';
    const client = values[clientColumn];
    const field = primary || (section !== 'ошибки' && client && client !== '-' ? client : '');
    if (!field || (section !== 'ошибки' && !isConfluenceFieldName(field))) return;
    const key = (primary ? 'server:' : 'client:') + (headers ? field.toLowerCase() : field);
    if (rows.has(key)) return;
    rows.set(key, values);
  }
  return { columns: new Set(known), rows };
}

const properties: ReadonlyArray<[Column, CountedConfluenceChange]> = [
  ['type', 'types-changed'], ['required', 'required-changed'], ['validations', 'validations-changed'],
  ['mask', 'masking-changed'], ['description', 'descriptions-changed'], ['comment', 'comments-changed']
];

function comparableValue(value: string | undefined, column: Column) {
  const text = value === '-' ? '' : value ?? '';
  if (column === 'required' || column === 'mask') {
    const normalized = text.toLowerCase();
    if (['+', '***', 'да', 'true'].includes(normalized)) return '+';
    if (['нет', 'false'].includes(normalized)) return '';
    return normalized;
  }
  return column === 'type' ? text.toLowerCase() : text;
}

function countFieldChanges(
  section: 'Request' | 'Response' | 'ошибки', before: StorageBlock[], after: StorageBlock[],
  add: (kind: CountedConfluenceChange, count: number) => void
) {
  for (const part of ['headers', 'query', 'path', 'body']) {
    const matched = (blocks: StorageBlock[]) => blocks.filter(block => tablePart(block) === part)
      .flatMap(block => readFieldTable(block, section) ?? []);
    const oldTables = matched(before);
    const newTables = matched(after);
    if (oldTables.length !== 1 || newTables.length !== 1) continue;
    const [previous] = oldTables;
    const [next] = newTables;
    const keys = [...previous.rows.keys()].filter(key => next.rows.has(key));
    // Different table layouts can have different row identities. Require a common anchor before inferring row changes.
    if (!keys.length && previous.rows.size && next.rows.size) continue;
    if (section === 'ошибки') {
      const statusColumns = (['clientStatus', 'serverStatus'] as const).filter(column =>
        previous.columns.has(column) && next.columns.has(column));
      add('statuses-changed', keys.filter(key => statusColumns.some(column => {
        const oldStatus = comparableValue(previous.rows.get(key)?.[column], column);
        const newStatus = comparableValue(next.rows.get(key)?.[column], column);
        return oldStatus !== newStatus && [oldStatus, newStatus].every(value => !value || /^[1-5]\d\d$/u.test(value));
      })).length);
      continue;
    }
    add('fields-added', next.rows.size - keys.length);
    add('fields-removed', previous.rows.size - keys.length);
    const mapping = section === 'Request' ? 'clientRequest' : 'clientResponse';
    for (const [column, kind] of [...properties, [mapping, 'mappings-changed'] as const]) {
      if (column !== 'comment' && (!previous.columns.has(column) || !next.columns.has(column))) continue;
      add(kind, keys.filter(key => comparableValue(previous.rows.get(key)?.[column], column)
        !== comparableValue(next.rows.get(key)?.[column], column)).length);
    }
  }
}

export function collectConfluenceVersionFacts(
  before: { title: string; storage?: string }, after: { title: string; storage: string }, migration: boolean,
  parser = new DOMParser()
): ConfluenceVersionFact[] {
  const facts: ConfluenceVersionFact[] = [];
  if (migration) facts.push({ kind: 'migration' });
  if (before.title !== after.title) facts.push({ kind: 'title-changed' });
  if (!before.storage) return facts;
  try {
    const previous = sectionContent(before.storage, parser);
    const next = sectionContent(after.storage, parser);
    const { moved, incoming, outgoing } = tableMovements(previous, next);
    for (const section of confluenceVersionSections) {
      const oldGroup = previous.get(section);
      const newGroup = next.get(section);
      if (JSON.stringify(oldGroup?.entries) === JSON.stringify(newGroup?.entries)) continue;
      const counts = new Map<CountedConfluenceChange, number>();
      const add = (kind: CountedConfluenceChange, count: number) => {
        if (count > 0) counts.set(kind, (counts.get(kind) ?? 0) + count);
      };
      if (section === 'Request' || section === 'Response' || section === 'ошибки') {
        const stableTables = (group?: SectionContent) =>
          group?.tables.filter(({ signature }) => !moved.has(signature)).map(({ block }) => block) ?? [];
        countFieldChanges(section, stableTables(oldGroup), stableTables(newGroup), add);
      }
      const movedIn = incoming.get(section) ?? 0;
      const tableDifference = (newGroup?.tables.length ?? 0) - movedIn - (oldGroup?.tables.length ?? 0) + (outgoing.get(section) ?? 0);
      add('tables-added', tableDifference);
      add('tables-removed', -tableDifference);
      add('tables-moved', movedIn);
      const supported = [...counts].filter(([, count]) => count <= 10_000);
      if (supported.length) facts.push(...supported.map(([kind, count]) => ({ kind, section, count })));
      else facts.push({ kind: 'section-changed', section });
    }
  } catch { /* A malformed snapshot cannot supply reliable section facts. */ }
  return facts;
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
      const changed = confluenceVersionSections.filter(name =>
        JSON.stringify(previous.get(name)?.entries) !== JSON.stringify(next.get(name)?.entries));
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

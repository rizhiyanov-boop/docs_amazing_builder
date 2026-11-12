import { macroCode, macroName, readStorage, readStorageTable, storageText, tableAsText, type StorageBlock, type StorageCell } from './confluenceImportStorage';
import { createParsedSection } from './sectionFactories';
import { DEFAULT_REQUEST_HEADERS, getParsedRowKey } from './requestHeaders';
import { sanitizeSections } from './sectionTitles';
import { validateImportedSections, validateProjectImportPayload } from './projectImportValidation';
import { getMethodTemplate, isMethodTemplateId, methodTemplateConflict, methodTemplateSectionsForStorage, type MethodTemplateId } from './methodTemplates';
import { normalizeConfluenceImportSource } from './confluenceBinding';
import type { ConfluencePage } from './confluenceTypes';
import type { DocSection, ErrorRow, ErrorsSection, MethodDocument, ParsedRow, ParsedSection, ParseFormat, RequestMethod } from './types';

const verbs = 'GET|POST|PUT|PATCH|DELETE';
const sectionAliases = {
  history: ['история изменений'],
  task: ['постановка задачи'],
  info: ['общая информация'],
  request: ['request', 'запрос', 'входные параметры', 'параметры запроса', 'структура запроса'],
  response: ['response', 'ответ', 'выходные параметры', 'параметры ответа', 'структура ответа'],
  errors: ['ошибки', 'обработка ошибок', 'коды ошибок', 'errors'],
  functional: ['функциональные требования'],
  nonFunctional: ['нефункциональные требования'],
  goal: ['цель', 'цель задачи']
} as const;
const columnAliases = {
  version: ['версия'], author: ['исполнитель'], date: ['дата'], jira: ['jira'],
  index: ['№'], field: ['поле', 'параметр', 'field', 'parameter'],
  serverRequest: ['server request', 'request'], clientRequest: ['client request'],
  serverResponse: ['server response', 'response'], clientResponse: ['client response'],
  type: ['тип', 'тип данных', 'type'], required: ['обяз', 'обязательность', 'обизательность', 'required'],
  description: ['описание', 'description'], example: ['пример', 'example'],
  validations: ['валидация', 'валидации', 'валидация/ограничения', 'validation'],
  mask: ['маск', 'маскирование', 'маскирование в логах'],
  trigger: ['trigger (условия возникновения)', 'условия возникновения (trigger)', 'условия возникновения', 'trigger'],
  errorType: ['error type', 'тип ошибки'], internalCode: ['полный internalcode', 'internalcode'],
  clientStatus: ['client http status', 'client http code'], serverStatus: ['server http status'],
  message: ['сообщение', 'message']
} as const;

type SectionRole = keyof typeof sectionAliases;
type Column = keyof typeof columnAliases;
type ExampleGroup = 'server-request' | 'client-request' | 'server-response' | 'client-response';
type Example = { id: string; title: string; code: string; format: ParseFormat; group: ExampleGroup };
type ExternalCall = { id: string; label: string; url: string; method?: RequestMethod };
type Supplemental = {
  title: string; text: string; order: number;
  publication?: 'history' | 'task' | 'info' | 'raw' | 'error-table' | { notes: string[] };
};
type ImportChoices = { examples?: Partial<Record<ExampleGroup, string>>; externalCall?: string; templateId?: MethodTemplateId };
type ImportData = {
  method: MethodDocument;
  recommendedTemplateId: MethodTemplateId;
  examples: Example[];
  externalCalls: ExternalCall[];
  supplemental: Supplemental[];
  warnings: string[];
};
export type ConfluenceImportPreview = { ok: false; reasons: string[] } | ({ ok: true } & ImportData);

function normalized(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().toLowerCase().replaceAll('ё', 'е').replace(/[.:]+$/u, '').trimEnd();
}

function alias<K extends string>(value: string, aliases: Record<K, readonly string[]>): K | undefined {
  return (Object.keys(aliases) as K[]).find(key => aliases[key].includes(value));
}

function role(title: string): SectionRole | undefined {
  return alias(normalized(title).replace(/^\d+(?:\.\d+)*[.)]?\s+/u, ''), sectionAliases);
}

function column(title: string): Column | undefined {
  const key = normalized(title.split('\n')[0] ?? '');
  const qualified = key.match(/^((?:client|server) (?:request|response))\s*\([^()]+\)$/u)?.[1];
  return alias(qualified ?? key, columnAliases);
}

export { column as confluenceStorageColumn, fieldValue as isConfluenceFieldName };

function headingRole(block: StorageBlock, roles: SectionRole[]) {
  return [...block.path].reverse().find(heading => {
    const kind = role(heading.title);
    return kind !== undefined && roles.includes(kind);
  });
}

function fieldValue(value: string) {
  return /^[a-z_$][\w$-]*(?:\[(?:\d*)\])*(?:\.[a-z_$][\w$-]*(?:\[(?:\d*)\])*)*$/iu.test(value)
    || /^(?:\$|\$\[[0-9]*\](?:\.[\w$.[\]-]+)?)$/u.test(value);
}

function isEmptyContractField(value: string): boolean {
  return /^(?:[-–—])?$/u.test(value.trim());
}

function httpMethod(value: string): RequestMethod | undefined {
  return new RegExp('^(?:' + verbs + ')$', 'i').test(value) ? value.toUpperCase() as RequestMethod : undefined;
}

function publicEndpoint(value: string, title: string) {
  const match = value.trim().match(/^(\S+)\s+(\S+)$/u);
  const method = httpMethod(match?.[1] ?? '');
  if (!match || !method) return;
  let path = match[2];
  const pageTitle = title.trim().replace(/\s+/gu, ' ');
  const titleEndpoint = pageTitle.match(/^(\S+) (\/(?!\/)[^\\#<>\s]*)$/u);
  if (!path.startsWith('/')) {
    if (pageTitle !== method + ' /' + path) return;
    path = '/' + path;
  }
  if (!/^\/(?!\/)[^\\#<>\s]*$/u.test(path)) return;
  if (titleEndpoint && httpMethod(titleEndpoint[1]) && (httpMethod(titleEndpoint[1]) !== method || titleEndpoint[2] !== path)) return;
  return { method, path, repaired: path !== match[2] };
}

function externalCallsFrom(text: string): ExternalCall[] {
  return text.split('\n').flatMap((line, index) => {
    const value = line.trim();
    const parsed = value.match(/(?:^|\s)(?:(GET|POST|PUT|PATCH|DELETE)\s+)?(https?:\/\/[^\s()<>]+|\/(?!\/)[^\s()<>]+)\s*$/iu);
    if (!parsed) return [];
    const url = parsed[2];
    if (!parsed[1] && url.startsWith('/') && value !== url) return [];
    if (!url.startsWith('/')) {
      try { const address = new URL(url); if (address.username || address.password) return []; }
      catch { return []; }
    }
    return [{ id: 'call-' + index, label: value, url, method: httpMethod(parsed[1] ?? '') }];
  });
}

function actualFormat(code: string, parser: DOMParser): ParseFormat | undefined {
  const value = code.trim();
  if (!value) return;
  if (/^(?:\$\s+)?curl(?:\s|$)/iu.test(value)) return 'curl';
  try { JSON.parse(value); return 'json'; } catch { /* Try XML only for markup. */ }
  if (value.startsWith('<') && !/<!DOCTYPE/i.test(value)
    && !parser.parseFromString(value, 'application/xml').querySelector('parsererror')) return 'xml';
}

function choiceGroup(block: StorageBlock): ExampleGroup | undefined {
  const groups = new Set<ExampleGroup>();
  for (const text of [...block.path.map(item => item.title), ...block.labels]) {
    for (const match of text.matchAll(/\b(server|client)\s+(request|response)\b/giu)) {
      groups.add((match[1].toLowerCase() + '-' + match[2].toLowerCase()) as ExampleGroup);
    }
    const curl = text.match(/^\s*(server|client)\s+curl\s*$/iu);
    if (curl) groups.add((curl[1].toLowerCase() + '-request') as ExampleGroup);
  }
  const group = groups.size === 1 ? [...groups][0] : undefined;
  const context = headingRole(block, ['request', 'response', 'errors']);
  if (context && (role(context.title) === 'errors' || group && !group.endsWith(role(context.title) ?? ''))) return;
  return group;
}

function tableColumns(cells: Element[]) {
  return cells.every(cell => cell.localName === 'th') ? cells.map(cell => column(storageText(cell))) : [];
}

function valuesAt(cells: (StorageCell | undefined)[]) {
  return Array.from(cells, cell => cell ? storageText(cell.element) : '');
}

function valueFor(columns: (Column | undefined)[], values: string[], key: Column) {
  const index = columns.indexOf(key);
  return index < 0 ? '' : values[index] ?? '';
}

function describeRow(headers: string[], cells: string[]) {
  return cells.flatMap((text, index) => text.trim() ? [(headers[index] || 'Колонка ' + (index + 1)) + ': ' + text] : []).join('\n');
}

function toContractRows(
  section: ParsedSection, table: ReturnType<typeof readStorageTable>, headers: string[], columns: (Column | undefined)[],
  server: Column | undefined, client: Column, source: ParsedRow['source'], clientOnly: boolean
) {
  const notes: string[] = [];
  const extraKeys = new Set<Column>(['index', 'type', 'required', 'description', 'example', 'validations', 'mask', client]);
  if (server) extraKeys.add(server);
  const keyOf = (row: ParsedRow) => row.source === 'header' ? getParsedRowKey(row).toLowerCase() : getParsedRowKey(row);
  const serverRows = new Map(section.rows.map(row => [keyOf(row), row]));
  const clientRows = new Map((section.clientRows ?? []).map(row => [keyOf(row), row]));
  const request = section.sectionType === 'request';
  table.grid.slice(1).forEach((cells, index) => {
    const values = valuesAt(cells);
    if (!values.some(Boolean)) return;
    const serverField = server ? valueFor(columns, values, server) : '';
    const clientField = valueFor(columns, values, client) || (clientOnly && server ? serverField : '');
    const onlyClient = clientOnly || (isEmptyContractField(serverField) && fieldValue(clientField));
    const field = onlyClient ? clientField : serverField;
    const keyIndex = columns.indexOf(onlyClient && columns.includes(client) ? client : server ?? client);
    const keyCell = cells[keyIndex];
    const linkedField = !onlyClient && !isEmptyContractField(clientField) ? clientField : '';
    const rowNumber = index + 2;
    const fallback = () => notes.push('Строка ' + rowNumber + '\n' + describeRow(headers, values));
    const target = onlyClient ? clientRows : serverRows;
    if (isEmptyContractField(field) || field.includes('\n') || !keyCell || keyCell.row !== index + 1 || keyCell.width > 1 || cells.length > columns.length
      || cells.some(cell => cell && cell.width > 1 && storageText(cell.element))
      || target.has(source === 'header' ? field.toLowerCase() : field)) { fallback(); return; }
    const mask = valueFor(columns, values, 'mask');
    const row: ParsedRow = {
      field, sourceField: field, origin: 'manual', source,
      type: valueFor(columns, values, 'type'),
      required: valueFor(columns, values, 'required'),
      validations: valueFor(columns, values, 'validations'),
      description: valueFor(columns, values, 'description'),
      example: valueFor(columns, values, 'example'),
      maskInLogs: ['***', '+', 'да', 'true'].includes(normalized(mask))
    };
    target.set(keyOf(row), row);
    if (linkedField && source !== 'header' && fieldValue(linkedField)) {
      if (!clientRows.has(linkedField)) clientRows.set(linkedField, {
        field: linkedField, sourceField: linkedField, origin: 'manual', type: '', required: '', description: '', example: '', source
      });
      section.clientMappings = Object.fromEntries([...Object.entries(section.clientMappings ?? {}), [getParsedRowKey(row), linkedField]]);
    }
    const extras = values.flatMap((text, i) => {
      const key = columns[i];
      const unmapped = !key || !extraKeys.has(key) || (key === 'required' && !request)
        || (key === client && linkedField && (source === 'header' || !fieldValue(linkedField)))
        || (key === 'mask' && !['', '-', '***', '+', 'да', 'нет', 'true', 'false'].includes(normalized(mask)));
      return text && unmapped ? [(headers[i] || 'Колонка ' + (i + 1)) + ': ' + text] : [];
    });
    if (extras.length) notes.push(field + '\n' + extras.join('\n'));
  });
  section.rows = [...serverRows.values()];
  section.clientRows = [...clientRows.values()];
  return notes;
}

function readErrors(
  section: ErrorsSection, table: ReturnType<typeof readStorageTable>, headers: string[], columns: (Column | undefined)[]
) {
  const notes: string[] = [];
  const storedColumns: Column[] = ['index', 'clientStatus', 'serverStatus', 'trigger', 'errorType', 'internalCode', 'message', 'clientResponse', 'serverResponse'];
  table.grid.slice(1).forEach((cells, index) => {
    const values = valuesAt(cells);
    if (!values.some(Boolean)) return;
    const value = (key: Column) => valueFor(columns, values, key);
    const clientResponse = cells[columns.indexOf('clientResponse')]?.element;
    const serverResponse = cells[columns.indexOf('serverResponse')]?.element;
    const codes = (element?: Element) => element
      ? Array.from(element.querySelectorAll('*')).filter(item => macroName(item) === 'code').map(macroCode).filter(code => code.trim()) : [];
    const clientCodes = codes(clientResponse);
    const serverCodes = codes(serverResponse);
    const withoutCode = (text: string, code?: string) => code ? text.replace(code.trim(), '').trim() : text;
    const errorType = value('errorType') || '-';
    const row: ErrorRow = {
      clientHttpStatus: value('clientStatus'), serverHttpStatus: value('serverStatus'),
      clientResponse: withoutCode(value('clientResponse'), clientCodes[0]), clientResponseCode: clientCodes[0] ?? '',
      trigger: value('trigger'), errorType: errorType as ErrorRow['errorType'], internalCode: value('internalCode'),
      message: value('message') || withoutCode(value('serverResponse'), serverCodes[0]), responseCode: serverCodes[0] ?? ''
    };
    const problems: string[] = [];
    if (!['CommonException', 'BusinessException', 'AlertException', '-'].includes(errorType)) problems.push('Тип ошибки отличается от справочника');
    if (clientCodes.length > 1 || serverCodes.length > 1) problems.push('Несколько примеров ответа');
    if (cells.length > columns.length || cells.some(cell => cell && (cell.width > 1 || cell.height > 1))) problems.push('Объединённые ячейки');
    if ([row.clientHttpStatus, row.serverHttpStatus].some(status => status && status !== '-' && !/^[1-5]\d\d$/u.test(status))) problems.push('Неоднозначный HTTP-статус');
    const normalized = sanitizeSections([{ ...section, rows: [row] }])[0] as ErrorsSection;
    const result = normalized.rows[0];
    if (result.serverHttpStatus !== row.serverHttpStatus || result.message !== row.message || result.internalCode !== row.internalCode) {
      problems.push('Builder изменил бы статус, сообщение или код при нормализации');
    }
    if (!row.internalCode && values.some((text, i) => text && /^server http code$/iu.test(headers[i] ?? ''))) {
      problems.push('Server HTTP code неоднозначен');
    }
    if (problems.length) {
      notes.push('Строка ' + (index + 2) + ' (' + problems.join(', ') + ')\n' + describeRow(headers, values));
    } else {
      section.rows.push(row);
      const extra = values.flatMap((text, i) => text && (!columns[i] || !storedColumns.includes(columns[i]!))
        ? [(headers[i] || 'Колонка ' + (i + 1)) + ': ' + text] : []);
      if (extra.length) notes.push((row.internalCode || 'Строка ' + (index + 2)) + '\n' + extra.join('\n'));
    }
  });
  return notes;
}

export function prepareConfluenceImport(page: ConfluencePage, baseUrl: string, parser = new DOMParser()): ConfluenceImportPreview {
  const source = normalizeConfluenceImportSource({ baseUrl, pageId: page.id, version: page.version });
  if (!source || !page.storage?.trim()) return { ok: false, reasons: ['Страница не содержит доступной исходной разметки или версии'] };
  let document: ReturnType<typeof readStorage>;
  try { document = readStorage(page.storage, parser); }
  catch (error) { return { ok: false, reasons: [error instanceof Error ? error.message : 'Не удалось прочитать страницу'] }; }
  const { headings, blocks } = document;
  const tables = new Map(blocks.filter(block => block.element.localName === 'table').map(block => [block, readStorageTable(block.element)]));
  const reasons: string[] = [];
  const metadataTables = new Map<SectionRole, StorageBlock[]>();
  for (const [key, label] of [['history', 'История изменений'], ['task', 'Постановка задачи'], ['info', 'Общая информация']] as const) {
    const anchors = headings.filter(heading => role(heading.title) === key);
    const matches = anchors.length === 1 ? [...tables.keys()].filter(block => block.path.some(heading => heading.id === anchors[0].id)) : [];
    if (anchors.length !== 1 || !matches.length) reasons.push('Нужен один раздел «' + label + '» с таблицей');
    metadataTables.set(key, matches);
  }
  if (reasons.length) return { ok: false, reasons };
  const history = metadataTables.get('history')!.filter(block => {
    const columns = tableColumns(tables.get(block)!.physical[0] ?? []);
    return (['version', 'author', 'date'] as const).every(key => columns.filter(item => item === key).length === 1);
  });
  const pairs = (key: 'task' | 'info') => metadataTables.get(key)!.flatMap(block => tables.get(block)!.physical.flatMap(cells =>
    cells.length === 2 ? [{ key: normalized(storageText(cells[0])), value: storageText(cells[1]) }] : []));
  const task = pairs('task');
  const info = pairs('info');
  if (history.length !== 1) reasons.push('В истории изменений нужны однозначные колонки «Версия», «Исполнитель» и «Дата»');
  if (!['epic', 'цель', 'инициаторы'].every(key => task.filter(pair => pair.key === key).length === 1)) {
    reasons.push('В постановке задачи нужны строки Epic, Цель и Инициаторы');
  }
  const methods = info.filter(pair => pair.key === 'метод');
  const endpoint = methods.length === 1 ? publicEndpoint(methods[0].value, page.title) : undefined;
  if (!endpoint) reasons.push('В общей информации нужен один однозначный HTTP-метод с путём');
  if (!endpoint || reasons.length) return { ok: false, reasons };
  const warnings = new Set<string>();
  if (endpoint.repaired) warnings.add('Добавлен начальный слеш в путь метода. Путь совпадает с заголовком страницы');
  const supplemental: Supplemental[] = [];
  const examples: Example[] = [];
  const labelFor = (block: StorageBlock) => [...block.path.map(item => item.title), ...block.labels].join(' / ') || 'Материалы страницы';
  const titleFor = (block: StorageBlock) => {
    const label = block.path.at(-1)?.title ?? 'Материалы страницы';
    // These headings are generated by the exporter. Imported material cannot shadow them.
    return ['history', 'task', 'info'].some(key => key === role(label)) ? 'Из Confluence: ' + label : label;
  };
  const extra = (block: StorageBlock, text: string, title = titleFor(block), publication?: Supplemental['publication']) => {
    if (text.trim()) {
      const context = labelFor(block);
      supplemental.push({ title, text: context === title ? text : context + '\n\n' + text, order: block.order, publication });
    }
  };
  const request = createParsedSection('request', 'request');
  request.requestMethod = endpoint.method;
  request.requestUrl = endpoint.path;
  const response = createParsedSection('response', 'response');
  const errors: ErrorsSection = { id: 'errors', title: 'Ошибки', kind: 'errors', enabled: true, rows: [], validationRules: [] };
  const diagram: Extract<DocSection, { kind: 'diagram' }> = {
    id: 'process-diagram', title: 'Диаграмма процесса', kind: 'diagram', enabled: true, diagrams: []
  };
  const prose = new Map<SectionRole, string[]>();
  const taskValue = (key: string) => task.find(pair => pair.key === key)?.value;
  if (taskValue('цель')) prose.set('goal', [taskValue('цель')!]);
  const callsText = metadataTables.get('info')!.flatMap(block => {
    let external = false;
    return tables.get(block)!.physical.flatMap(cells => {
      if (cells.length >= 2) external = normalized(storageText(cells[0])) === 'внешний url';
      if (!external) return [];
      return (cells.length === 1 ? cells : cells.slice(1)).map(storageText).filter(Boolean);
    });
  }).join('\n');
  const externalCalls = externalCallsFrom(callsText);
  let hasClientData = Boolean(callsText.trim() && callsText.trim() !== '-');
  if (hasClientData) extra(metadataTables.get('info')![0], callsText, 'Внешние вызовы');
  if (hasClientData && !externalCalls.length) warnings.add('Внешний адрес сохранён как текст. Его не удалось определить однозначно');

  for (const block of blocks) {
    const table = tables.get(block);
    const macro = macroName(block.element);
    const context = headingRole(block, ['request', 'response', 'errors']);
    const kind = context && role(context.title);
    if (table) {
      const metadata = (['history', 'task', 'info'] as const).find(key => metadataTables.get(key)?.includes(block));
      const first = table.physical[0] ?? [];
      const headers = first.map(storageText);
      const columns = tableColumns(first);
      if (kind === 'request' || kind === 'response' || kind === 'errors') {
        hasClientData ||= headers.map(column).some((column, index) =>
          (column === 'clientRequest' || column === 'clientResponse' || column === 'clientStatus')
          && table.grid.slice(1).some(row => {
            const cell = row[index]?.element;
            const value = cell ? storageText(cell) : '';
            return Boolean(value && value !== '-');
          }));
        hasClientData ||= table.physical.length > 1 && block.path.some(item =>
          /^(?:внешние headers|client headers|внешние заголовки)$/u.test(normalized(item.title)));
      }
      const known = columns.filter(item => item !== undefined);
      const unambiguous = table.usable && first.every(cell => !cell.hasAttribute('rowspan') && !cell.hasAttribute('colspan'))
        && new Set(known).size === known.length;
      const value = () => tableAsText(table.physical);
      if (kind === 'errors' && unambiguous && columns.includes('trigger') && columns.includes('errorType')) {
        const before = errors.rows.length;
        const notes = readErrors(errors, table, headers, columns);
        if (notes.length) {
          extra(block, notes.join('\n\n'), 'Ошибки: исходные значения', before === errors.rows.length ? 'error-table' : undefined);
          warnings.add('Часть таблицы ошибок сохранена отдельным текстом');
        }
      } else if ((kind === 'request' || kind === 'response') && unambiguous) {
        const serverRole: Column = kind === 'request' ? 'serverRequest' : 'serverResponse';
        const clientRole: Column = kind === 'request' ? 'clientRequest' : 'clientResponse';
        const opposite = kind === 'request' ? ['serverResponse', 'clientResponse'] : ['serverRequest', 'clientRequest'];
        const subsection = block.path.slice(block.path.indexOf(context!) + 1).map(item => normalized(item.title));
        const isHeader = subsection.some(title => /^(?:headers|заголовки|внешние headers|client headers|внешние заголовки)$/u.test(title));
        const externalHeader = isHeader && subsection.some(title => /^(?:внешние|client)/u.test(title));
        const isBody = subsection.includes('body') || subsection.includes('тело запроса');
        const isQuery = subsection.some(title => /^(?:query|query parameters|параметры query)$/u.test(title));
        const server = columns.includes(serverRole) ? serverRole : columns.includes('field') ? 'field' : undefined;
        const clientOnly = externalHeader || (!server && columns.includes(clientRole));
        const query = isQuery || (kind === 'request' && endpoint.method === 'GET' && !isBody);
        const rowSource = isHeader ? 'header' : query ? 'query' : 'body';
        const correctRequestSource = kind !== 'request' || isHeader || (endpoint.method === 'GET') === query;
        if (correctRequestSource && (server || clientOnly) && (columns.includes('type') || isHeader) && !known.some(key => opposite.includes(key))) {
          const notes = toContractRows(kind === 'request' ? request : response, table, headers, columns, server, clientRole, rowSource, clientOnly);
          const headerNotes = headers.flatMap(header => header.includes('\n') ? [header] : []);
          if (notes.length || headerNotes.length) {
            extra(block, [...headerNotes, ...notes].join('\n\n'), (kind === 'request' ? 'Request' : 'Response') + ': примечания к таблице',
              { notes: [...headerNotes.map(note => '\n' + note), ...notes] });
          }
          if (notes.length) warnings.add('Дополнительные значения таблиц сохранены рядом с полями');
        } else { extra(block, value()); warnings.add('Таблица контракта с неоднозначной структурой сохранена как текст'); }
      } else {
        extra(block, value(), undefined, metadata ?? (!kind ? 'raw' : undefined));
        if (kind === 'request' || kind === 'response' || kind === 'errors') warnings.add('Таблица контракта с неоднозначной структурой сохранена как текст');
      }
      continue;
    }
    const code = macro === 'code' ? macroCode(block.element) : block.element.localName === 'pre' ? block.element.textContent ?? '' : '';
    if (code.trim()) {
      const format = actualFormat(code, parser);
      const group = choiceGroup(block);
      if (format && group) examples.push({ id: 'example-' + block.order, title: labelFor(block), code, format, group });
      else {
        extra(block, code, kind === 'request' ? 'Request: примеры' : kind === 'response' ? 'Response: примеры' : undefined, 'raw');
        warnings.add('Примеры без однозначной стороны или формата сохранены как текст');
      }
    } else if (['plantuml', 'mermaiddiagram'].includes(macro) && macroCode(block.element).trim()) {
      diagram.diagrams.push({ id: 'diagram-' + block.order, title: block.path.at(-1)?.title ?? '',
        code: macroCode(block.element), engine: macro === 'plantuml' ? 'plantuml' : 'mermaid', sourceOnly: true });
    } else {
      const text = storageText(block.element);
      const group = headingRole(block, ['functional', 'nonFunctional', 'goal']);
      const groupRole = group && role(group.title);
      if (text && groupRole && block.path.at(-1)?.id === group?.id && !macro && !block.labels.length) {
        prose.set(groupRole, [...(prose.get(groupRole) ?? []), text]);
      } else if (text) extra(block, text, undefined, block.element.namespaceURI === null ? 'raw' : undefined);
    }
  }
  const existingHeaderNames = new Set(request.rows.filter(row => row.source === 'header').map(row => row.field.toLowerCase()));
  request.rows.push(...DEFAULT_REQUEST_HEADERS.filter(row => !existingHeaderNames.has(row.field.toLowerCase())).map(row => ({ ...row, enabled: false })));
  const proseSection = (key: SectionRole, id: string, title: string): DocSection[] => prose.has(key)
    ? [{ id, kind: 'text', title, enabled: true, value: prose.get(key)!.join('\n\n') }] : [];
  const sections: DocSection[] = [
    ...proseSection('goal', 'goal', 'Цель'), ...proseSection('functional', 'functional', 'Функциональные требования'),
    ...(diagram.diagrams.length ? [diagram] : []), request,
    ...(response.rows.length || response.clientRows?.length || examples.some(item => item.group.endsWith('response')) ? [response] : []),
    ...(errors.rows.length ? [errors] : []), ...proseSection('nonFunctional', 'non-functional', 'Нефункциональные требования')
  ];
  const historyTable = tables.get(history[0])!;
  const historyColumns = tableColumns(historyTable.physical[0] ?? []);
  const jiraRefs = [...new Set(historyTable.grid.slice(1).map(cells => valueFor(historyColumns, valuesAt(cells), 'jira'))
    .filter(value => /^[A-Z][A-Z0-9_]*-\d+$|^https:\/\/[^\s]+\/browse\/[A-Z][A-Z0-9_]*-\d+$/u.test(value)))];
  const author = historyTable.grid.length === 2 ? valueFor(historyColumns, valuesAt(historyTable.grid[1]), 'author') : '';
  const recommendedTemplateId = hasClientData || externalCalls.length || examples.some(item => item.group.startsWith('client-'))
    || methodTemplateConflict({ sections }, 'simple') ? 'orchestration' : 'simple';
  return { ok: true, recommendedTemplateId, method: {
    id: '', name: page.title.trim() || endpoint.method + ' ' + endpoint.path, updatedAt: '', status: 'draft', confluenceImport: source,
    epic: taskValue('epic'), initiators: taskValue('инициаторы'), jiraTicket: jiraRefs.length === 1 ? jiraRefs[0] : undefined,
    responsible: author || undefined, sections
  }, examples, externalCalls, supplemental, warnings: [...warnings] };
}

export function confluenceImportExtras(preview: ImportData, choices: ImportChoices) {
  const additional = [...preview.supplemental];
  for (const item of preview.examples) {
    const multiple = preview.examples.some(other => other.group === item.group && other.id !== item.id);
    if (multiple && item.id !== choices.examples?.[item.group]) {
      const title = item.group.endsWith('request') ? 'Request: примеры' : 'Response: примеры';
      additional.push({ title, text: item.title + '\n\n' + item.code, order: Number(item.id.slice('example-'.length)) });
    }
  }
  const grouped = new Map<string, string[]>();
  for (const item of additional.sort((left, right) => left.order - right.order)) {
    grouped.set(item.title, [...(grouped.get(item.title) ?? []), item.text]);
  }
  return grouped;
}

export function confluenceImportTemplateConflict(preview: ImportData, templateId: MethodTemplateId): string | undefined {
  if (getMethodTemplate(templateId)?.clientContract === false && preview.recommendedTemplateId === 'orchestration') {
    return 'В источнике есть данные Client. Для них нужен шаблон с контрактом Client';
  }
}

export function buildConfluenceImport(preview: ImportData, choices: ImportChoices): MethodDocument {
  const templateId = choices.templateId ?? preview.recommendedTemplateId;
  if (!isMethodTemplateId(templateId)) throw new Error('Выберите шаблон метода');
  const conflict = confluenceImportTemplateConflict(preview, templateId);
  if (conflict) throw new Error(conflict);
  const sections = preview.method.sections.map(section => section.kind === 'parsed' ? { ...section } : section);
  const request = sections.find((section): section is ParsedSection => section.kind === 'parsed' && section.id === 'request')!;
  const response = sections.find((section): section is ParsedSection => section.kind === 'parsed' && section.id === 'response');
  const primaryCall = preview.externalCalls.find(call => call.id === choices.externalCall)
    ?? (preview.externalCalls.length === 1 ? preview.externalCalls[0] : undefined);
  if (preview.externalCalls.length > 1 && !primaryCall) throw new Error('Выберите основной внешний вызов');
  if (primaryCall) {
    request.externalRequestUrl = primaryCall.url;
    if (primaryCall.method) request.externalRequestMethod = primaryCall.method;
  }
  for (const group of ['server-request', 'client-request', 'server-response', 'client-response'] as const) {
    const items = preview.examples.filter(item => item.group === group);
    if (!items.length) continue;
    const selected = items.find(item => item.id === choices.examples?.[group]) ?? (items.length === 1 ? items[0] : undefined);
    if (!selected) throw new Error('Выберите основной пример для ' + group);
    const section = group.endsWith('request') ? request : response!;
    if (group.startsWith('server')) {
      section.input = selected.code; section.format = selected.format; section.lastSyncedFormat = selected.format;
    } else {
      section.clientInput = selected.code; section.clientFormat = selected.format; section.clientLastSyncedFormat = selected.format;
    }
  }
  for (const [title, texts] of confluenceImportExtras(preview, choices)) sections.push({
    id: 'confluence-extra-' + sections.length, title, enabled: true, kind: 'text', value: texts.join('\n\n')
  });
  const result = {
    ...preview.method, templateId, externalUrl: primaryCall?.url,
    sections: methodTemplateSectionsForStorage(sections, templateId)
  };
  const templateIssue = methodTemplateConflict(result, templateId);
  if (templateIssue) throw new Error(templateIssue);
  const problems = [...validateProjectImportPayload(result, 'method'), ...validateImportedSections(sections)];
  if (problems.length) throw new Error(problems.map(problem => problem.message).join(' · '));
  return result;
}

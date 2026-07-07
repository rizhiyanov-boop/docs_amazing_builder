import { getRequestColumnLabel, getRequestColumnOrder } from './requestColumns';
import { getRequestRows, requestHasRows, splitRequestRows } from './requestHeaders';
import { buildInputFromRows } from './sourceSync';
import { resolveSectionTitle } from './sectionTitles';
import { getDiagramImageUrl, resolveDiagramEngine } from './diagramUtils';
import {
  formatDocumentationUrl,
  replaceDocumentationUrls
} from './documentationBaseUrl';
import { normalizeArrayFieldPath } from './fieldPath';
import type { DiagramSection, DocSection, ErrorsSection, ParseFormat, ParsedRow, ParsedSection, TextSection } from './types';

const EMPTY_WIKI_CELL = '\u00A0';

export interface WikiRenderMeta {
  httpMethod?: string;
  path?: string;
  jiraTicket?: string;
  epic?: string;
  initiators?: string;
  responsible?: string;
  externalUrl?: string;
  updatedAt?: string;
}

export interface WikiRenderOptions {
  includeToc?: boolean;
  includeTemplateIntro?: boolean;
  headingOffset?: number;
}

function escapeWiki(value: string): string {
  return value.replaceAll('|', '&#124;');
}

function escapeWikiTableText(value: string): string {
  return escapeWiki(value).replaceAll('{', '&#123;').replaceAll('}', '&#125;');
}

function isDualModelSection(section: ParsedSection): boolean {
  return section.sectionType === 'request' || section.sectionType === 'response';
}

function toWikiCell(value: string): string {
  const normalized = escapeWikiTableText(value)
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll('\t', ' ')
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');

  return normalized.trim() ? normalized : EMPTY_WIKI_CELL;
}

function toWikiExampleCell(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) return EMPTY_WIKI_CELL;
  const looksLikeJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
  if (looksLikeJson) {
    try {
      // Keep JSON in table cells single-line so wiki table markup remains valid.
      return toWikiCell(JSON.stringify(JSON.parse(trimmed)));
    } catch {
      return toWikiCell(trimmed);
    }
  }
  return toWikiCell(trimmed);
}

function toWikiMappingCell(value: string | null | undefined): string {
  const normalized = normalizeArrayFieldPath(value ?? '').trim();
  return normalized ? toWikiCell(normalized) : '-';
}

function toWikiSourceCodeBlock(value: string, format: ParseFormat): string[] {
  const normalized = value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .trim();

  if (!normalized) return [];

  let payload = normalized;
  if (format === 'json') {
    try {
      payload = JSON.stringify(JSON.parse(normalized), null, 2);
    } catch {
      // Keep original content if it isn't valid JSON.
    }
  }

  const codeLanguage = format === 'json' ? 'json' : format === 'xml' ? 'xml' : 'bash';

  return [`{code:${codeLanguage}}`, ...payload.split('\n').map((line) => escapeWiki(line)), '{code}'];
}

function getJsonSchemaExampleInput(schemaInput: string): string {
  if (!schemaInput.trim()) return '';

  try {
    const schema = JSON.parse(schemaInput) as Record<string, unknown>;
    let example: unknown;
    if (Array.isArray(schema.examples) && schema.examples.length > 0) {
      example = schema.examples[0];
    } else if (Object.prototype.hasOwnProperty.call(schema, 'example')) {
      example = schema.example;
    } else if (Object.prototype.hasOwnProperty.call(schema, 'default')) {
      example = schema.default;
    } else {
      return '';
    }

    return JSON.stringify(example, null, 2);
  } catch {
    return '';
  }
}

function getParsedExampleInput(format: ParseFormat, rawInput: string, schemaInput: string, rows: ParsedRow[]): string {
  const trimmedInput = rawInput.trim();
  if (trimmedInput) return format === 'curl' ? replaceDocumentationUrls(trimmedInput) : trimmedInput;
  if (format === 'json') {
    const schemaExample = getJsonSchemaExampleInput(schemaInput);
    if (schemaExample) return schemaExample;
  }
  if (rows.length === 0) return '';
  return buildInputFromRows(format, rows);
}

function toWikiInlineCodeMacro(value: string, format: ParseFormat = 'json'): string {
  const normalized = value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .trim();

  if (!normalized) return '';

  let payload = normalized;
  if (format === 'json') {
    try {
      payload = JSON.stringify(JSON.parse(normalized), null, 2);
    } catch {
      payload = normalized;
    }
  }

  if (format === 'json') {
    return [`{code:json}`, ...payload.split('\n').map((line) => escapeWiki(line)), '{code}'].join('\n');
  }

  if (format === 'xml') {
    return [`{code:xml}`, ...payload.split('\n').map((line) => escapeWiki(line)), '{code}'].join('\n');
  }

  return `{code:bash}${escapeWiki(payload)}{code}`;
}

function buildExternalAuthHeaderRows(section: ParsedSection): ParsedRow[] {
  if (section.externalAuthType === 'bearer') {
    return [{
      field: 'Authorization',
      sourceField: 'Authorization',
      origin: 'generated',
      enabled: true,
      type: 'string',
      required: '+',
      description: 'Авторизация: Bearer token',
      example: `Bearer ${section.externalAuthTokenExample?.trim() || 'token'}`,
      source: 'header'
    }];
  }

  if (section.externalAuthType === 'basic') {
    return [{
      field: 'Authorization',
      sourceField: 'Authorization',
      origin: 'generated',
      enabled: true,
      type: 'string',
      required: '+',
      description: 'Авторизация: Basic auth',
      example: 'Basic <base64(username:password)>',
      source: 'header'
    }];
  }

  if (section.externalAuthType === 'api-key') {
    const headerName = section.externalAuthHeaderName?.trim() || 'X-API-Key';
    return [{
      field: headerName,
      sourceField: headerName,
      origin: 'generated',
      enabled: true,
      type: 'string',
      required: '+',
      description: 'Авторизация: API key',
      example: section.externalAuthApiKeyExample?.trim() || '',
      source: 'header'
    }];
  }

  return [];
}

function renderErrorResponseCell(text: string, responseCode: string): string {
  const messageText = text.trim();
  const codeMacro = toWikiInlineCodeMacro(responseCode, 'json');
  const expandableCodeMacro = codeMacro
    ? `{expand:title=Пример}\n${codeMacro}\n{expand}`
    : '';

  if (messageText && expandableCodeMacro) return `${toWikiCell(messageText)}\n${expandableCodeMacro}`;
  if (messageText) return toWikiCell(messageText);
  if (expandableCodeMacro) return expandableCodeMacro;
  return EMPTY_WIKI_CELL;
}

function renderParsedSourceExamples(section: ParsedSection): string[] {
  const lines: string[] = [];
  const isRequest = section.sectionType === 'request';
  const serverInput = section.input.trim();
  const serverSchema = (section.schemaInput ?? '').trim();
  const clientInput = section.domainModelEnabled ? (section.clientInput ?? '').trim() : '';
  const clientSchema = section.domainModelEnabled ? (section.clientSchemaInput ?? '').trim() : '';
  const sectionLabel = section.sectionType === 'response' ? 'response' : 'request';
  const serverFormat = section.format;
  const clientFormat = section.clientFormat ?? 'json';
  const serverExampleInput = isRequest
    ? serverFormat === 'curl' ? replaceDocumentationUrls(serverInput) : serverInput
    : getParsedExampleInput(serverFormat, serverInput, serverSchema, section.rows);
  const clientExampleInput = section.domainModelEnabled
    ? isRequest
      ? clientFormat === 'curl' ? replaceDocumentationUrls(clientInput) : clientInput
      : getParsedExampleInput(clientFormat, clientInput, clientSchema, section.clientRows ?? [])
    : '';
  const serverCurl = isRequest
    ? buildInputFromRows(
      'curl',
      [...splitRequestRows(getRequestRows(section)).headers.filter((row) => row.enabled !== false), ...(section.rows.filter((row) => row.source !== 'header'))],
      {
        requestUrl: formatDocumentationUrl(section.requestUrl?.trim() || ''),
        requestMethod: section.requestMethod,
        bodyText: section.format === 'json' || section.format === 'xml' ? section.input : undefined
      }
    )
    : '';
  const clientCurl = isRequest && section.domainModelEnabled
    ? buildInputFromRows(
      'curl',
      [
        ...buildExternalAuthHeaderRows(section),
        ...((section.clientRows ?? []).filter((row) => row.source === 'header' && row.enabled !== false)),
        ...((section.clientRows ?? []).filter((row) => row.source !== 'header'))
      ],
      {
        requestUrl: formatDocumentationUrl(section.externalRequestUrl?.trim() || ''),
        requestMethod: section.externalRequestMethod,
        bodyText: section.clientFormat === 'json' || section.clientFormat === 'xml' ? (section.clientInput ?? '') : undefined
      }
    )
    : '';

  const serverFormatLabel = serverFormat === 'curl' ? 'cURL' : serverFormat === 'xml' ? 'XML' : 'JSON';
  const clientFormatLabel = clientFormat === 'curl' ? 'cURL' : clientFormat === 'xml' ? 'XML' : 'JSON';

  const pushServerExample = (): void => {
    if (!serverExampleInput) return;
    lines.push('');
    lines.push(`{expand:title=Пример ${serverFormatLabel} (Server ${sectionLabel})}`);
    lines.push(...toWikiSourceCodeBlock(serverExampleInput, serverFormat));
    lines.push('{expand}');
  };

  const pushServerCurl = (): void => {
    if (!serverCurl) return;
    lines.push('');
    lines.push('{expand:title=Server cURL}');
    lines.push(...toWikiSourceCodeBlock(serverCurl, 'curl'));
    lines.push('{expand}');
  };

  const pushClientExample = (): void => {
    if (!clientExampleInput) return;
    lines.push('');
    lines.push(`{expand:title=Пример ${clientFormatLabel} (Client ${sectionLabel})}`);
    lines.push(...toWikiSourceCodeBlock(clientExampleInput, clientFormat));
    lines.push('{expand}');
  };

  const pushClientCurl = (): void => {
    if (!clientCurl) return;
    lines.push('');
    lines.push('{expand:title=Client cURL}');
    lines.push(...toWikiSourceCodeBlock(clientCurl, 'curl'));
    lines.push('{expand}');
  };

  if (section.sectionType === 'response') {
    pushClientExample();
    pushServerExample();
  } else {
    pushServerExample();
    pushServerCurl();
    pushClientExample();
    pushClientCurl();
  }

  return lines;
}

function hasParsedSourceExample(section: ParsedSection): boolean {
  return Boolean(section.input.trim())
    || Boolean((section.schemaInput ?? '').trim())
    || Boolean(section.domainModelEnabled && (section.clientInput ?? '').trim())
    || Boolean(section.domainModelEnabled && (section.clientSchemaInput ?? '').trim());
}

function toWikiTextBlock(value: string): string[] {
  return value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .map((line) => escapeWikiTableText(line));
}

function wrapWikiTable(tableLines: string[]): string[] {
  return tableLines;
}

function isGoalSection(section: TextSection): boolean {
  return resolveSectionTitle(section.title).trim().toLowerCase() === 'цель';
}

function isProcessDiagramSection(section: DocSection): section is DiagramSection {
  return section.kind === 'diagram' && resolveSectionTitle(section.title).trim().toLowerCase() === 'диаграмма процесса';
}

function shouldRenderTextSection(section: TextSection): boolean {
  if (isGoalSection(section)) return false;
  if (!section.enabled) return true;
  return Boolean(section.value.trim());
}

function shouldRenderParsedSection(section: ParsedSection): boolean {
  if (!section.enabled) return true;
  if (isDualModelSection(section)) {
    return Boolean(section.error) || Boolean(section.clientError) || requestHasRows(section) || hasParsedSourceExample(section);
  }
  return Boolean(section.error) || section.rows.length > 0;
}

function shouldRenderDiagramSection(section: DiagramSection): boolean {
  if (!section.enabled) return true;
  return section.diagrams.some((diagram) => diagram.code.trim());
}

function shouldRenderErrorsSection(section: ErrorsSection): boolean {
  if (!section.enabled) return true;
  return section.rows.length > 0;
}

function renderDefaultTable(rows: ParsedRow[]): string[] {
  const lines = ['||Поле||Тип||Обязательность||Описание||Маскирование в логах||Пример||'];
  for (const row of rows) {
    const cells = [
      toWikiCell(normalizeArrayFieldPath(row.field)),
      toWikiCell(row.type),
      toWikiCell(row.required),
      toWikiCell(row.description),
      row.maskInLogs ? '***' : '   ',
      toWikiExampleCell(row.example)
    ];
    lines.push(`|${cells.join('|')}|`);
  }
  return wrapWikiTable(lines);
}

function renderStructuredTable(rows: ParsedRow[], section: ParsedSection): string[] {
  const columns = getRequestColumnOrder(section, rows);
  const headerCells = columns.map((column) => getRequestColumnLabel(section, column));
  const lines = [`||${headerCells.join('||')}||`];

  for (const row of rows) {
    const cellMap = {
      field: normalizeArrayFieldPath(row.field),
      clientField: normalizeArrayFieldPath(row.clientField ?? ''),
      type: row.type,
      required: row.required,
      validations: row.validations ?? '',
      description: row.description,
      maskInLogs: row.maskInLogs ? '***' : '   ',
      example: row.example
    };

    const cells = columns.map((column) => {
      const value = cellMap[column];
      if (column === 'maskInLogs') return value;
      if (column === 'example') return toWikiExampleCell(value);
      return toWikiCell(value);
    });

    lines.push(`|${cells.join('|')}|`);
  }

  return wrapWikiTable(lines);
}

function renderRequestBodyTable(rows: ParsedRow[]): string[] {
  const lines = ['||Server request||Тип||Обяз.||Валидации||Описание||Пример||Client request||Маск.||'];
  for (const row of rows) {
    const cells = [
      toWikiMappingCell(row.field),
      toWikiCell(row.type),
      toWikiCell(row.required),
      toWikiCell(row.validations ?? ''),
      toWikiCell(row.description),
      toWikiExampleCell(row.example),
      toWikiMappingCell(row.clientField),
      row.maskInLogs ? '***' : '   '
    ];
    lines.push(`|${cells.join('|')}|`);
  }
  return wrapWikiTable(lines);
}

function renderResponseTable(rows: ParsedRow[]): string[] {
  const lines = ['||Server Response||Тип||Описание||Пример||Client Response||Маск.||'];
  for (const row of rows) {
    const cells = [
      toWikiMappingCell(row.field),
      toWikiCell(row.type),
      toWikiCell(row.description),
      toWikiExampleCell(row.example),
      toWikiMappingCell(row.clientField),
      row.maskInLogs ? '***' : '   '
    ];
    lines.push(`|${cells.join('|')}|`);
  }
  return wrapWikiTable(lines);
}

function renderTextSection(section: TextSection): string[] {
  if (!section.enabled) {
    return [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`, '', '_Не используется_'];
  }

  return [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`, '', ...toWikiTextBlock(section.value)];
}

function renderRequestSection(section: ParsedSection): string[] {
  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];
  if (!section.enabled) {
    lines.push('');
    lines.push('_Не используется_');
    return lines;
  }

  const { headers, otherRows } = splitRequestRows(getRequestRows(section));
  const requestError = section.error || section.clientError;
  const externalHeaders = (section.clientRows ?? []).filter((row) => row.source === 'header' && row.enabled !== false);

  if (headers.length > 0) {
    lines.push('');
    lines.push('h3. Headers');
    lines.push('');
    lines.push(...renderStructuredTable(headers, section));
  }
  if (externalHeaders.length > 0) {
    lines.push('');
    lines.push('h3. Внешние headers');
    lines.push('');
    lines.push(...renderStructuredTable(externalHeaders, section));
  }
  if (requestError) {
    lines.push('');
    lines.push(`*Секция заблокирована:* ${toWikiCell(requestError)}`);
  } else if (otherRows.length > 0) {
    lines.push('');
    lines.push('h3. Body');
    lines.push('');
    lines.push(...renderRequestBodyTable(otherRows));
  }

  lines.push(...renderParsedSourceExamples(section));

  return lines;
}
function renderResponseSection(section: ParsedSection): string[] {
  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];
  if (!section.enabled) {
    lines.push('');
    lines.push('_Не используется_');
    return lines;
  }

  if (section.error || section.clientError) {
    lines.push(`*Секция заблокирована:* ${toWikiCell(section.error || section.clientError || '')}`);
    lines.push(...renderParsedSourceExamples(section));
    return lines;
  }

  lines.push(...renderResponseTable(getRequestRows(section)));
  lines.push(...renderParsedSourceExamples(section));
  return lines;
}

function renderParsedSection(section: ParsedSection): string[] {
  if (section.sectionType === 'request') return renderRequestSection(section);
  if (section.sectionType === 'response') return renderResponseSection(section);

  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];

  if (!section.enabled) {
    lines.push('');
    lines.push('_Не используется_');
    return lines;
  }

  if (section.error) {
    lines.push(`*Секция заблокирована:* ${toWikiCell(section.error)}`);
    return lines;
  }

  lines.push(...renderDefaultTable(section.rows));
  return lines;
}

function renderDiagramSection(section: DiagramSection): string[] {
  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];

  if (!section.enabled) {
    lines.push('');
    lines.push('_Не используется_');
    return lines;
  }

  section.diagrams
    .filter((diagram) => diagram.code.trim())
    .forEach((diagram, index) => {
      const title = diagram.title.trim() || `Диаграмма ${index + 1}`;
      const imageUrl = getDiagramImageUrl(resolveDiagramEngine(diagram.code, diagram.engine), diagram.code, 'jpeg');

      lines.push('');
      lines.push(`h3. ${escapeWiki(title)}`);
      lines.push(`!${escapeWiki(imageUrl)}!`);
      if (diagram.description?.trim()) {
        lines.push(...toWikiTextBlock(diagram.description));
      }
      lines.push('{expand:title=Код диаграммы}');
      lines.push('{code}');
      lines.push(escapeWiki(diagram.code));
      lines.push('{code}');
      lines.push('{expand}');
    });

  return lines;
}

function renderProcessDiagramSection(section: DiagramSection): string[] {
  const lines: string[] = ['h2. Диаграмма процесса'];

  if (!section.enabled) {
    lines.push('');
    lines.push('_Не используется_');
    return lines;
  }

  section.diagrams
    .filter((diagram) => diagram.code.trim())
    .forEach((diagram) => {
      const imageUrl = getDiagramImageUrl(resolveDiagramEngine(diagram.code, diagram.engine), diagram.code, 'jpeg');

      lines.push('');
      lines.push(`!${escapeWiki(imageUrl)}!`);
      if (diagram.description?.trim()) {
        lines.push(...toWikiTextBlock(diagram.description));
      }
      lines.push('{expand:title=Код диаграммы}');
      lines.push('{code}');
      lines.push(escapeWiki(diagram.code));
      lines.push('{code}');
      lines.push('{expand}');
    });

  return lines;
}

function renderErrorsSection(section: ErrorsSection): string[] {
  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];

  if (!section.enabled) {
    lines.push('');
    lines.push('_Не используется_');
    return lines;
  }

  if (section.rows.length > 0) {
    lines.push('');
    const tableLines = ['||№||Client HTTP Status||Client Response||Trigger (условия возникновения)||Error Type||Server HTTP Status||Полный internalCode||Server Response||'];
    section.rows.forEach((row, index) => {
      tableLines.push(
        `|${toWikiCell(String(index + 1))}|${toWikiCell(row.clientHttpStatus)}|${renderErrorResponseCell(row.clientResponse, row.clientResponseCode)}|${toWikiCell(row.trigger)}|${toWikiCell(row.errorType)}|${toWikiCell(row.serverHttpStatus)}|${toWikiCell(row.internalCode)}|${renderErrorResponseCell(row.message, row.responseCode)}|`
      );
    });
    lines.push(...wrapWikiTable(tableLines));
  }

  return lines;
}

function renderWikiTemplateIntro(meta: WikiRenderMeta): string[] {
  const methodCell = meta.httpMethod && meta.path
    ? toWikiCell(`${meta.httpMethod} ${meta.path}`)
    : meta.httpMethod
      ? toWikiCell(meta.httpMethod)
      : EMPTY_WIKI_CELL;
  const dateCell = meta.updatedAt
    ? toWikiCell(new Date(meta.updatedAt).toLocaleDateString('ru-RU'))
    : EMPTY_WIKI_CELL;

  const historyTable = wrapWikiTable([
    '||Версия||Описание||Исполнитель||Дата||Jira||',
    `|v.1|Создание документа|${toWikiCell(meta.responsible ?? '')}|${dateCell}|${toWikiCell(meta.jiraTicket ?? '')}|`
  ]);

  const taskTable = wrapWikiTable([
    `|Epic|${toWikiCell(meta.epic ?? '')}|`,
    `|Цель|${EMPTY_WIKI_CELL}|`,
    `|Инициаторы|${toWikiCell(meta.initiators ?? '')}|`
  ]);

  const commonInfoTable = wrapWikiTable([
    `|Метод|${methodCell}|`,
    `|Внешний URL|${toWikiCell(formatDocumentationUrl(meta.externalUrl ?? meta.path ?? ''))}|`
  ]);

  const linksTable = wrapWikiTable([
    '||Ссылка||Описание||',
    `|${EMPTY_WIKI_CELL}|${EMPTY_WIKI_CELL}|`
  ]);

  return [
    'h2. История изменений',
    '',
    ...historyTable,
    '',
    'h2. Постановка задачи',
    '',
    ...taskTable,
    '',
    'h2. Общая информация',
    '',
    ...commonInfoTable,
    '',
    ...linksTable
  ];
}

function shiftWikiHeadingLine(line: string, offset: number): string {
  if (offset === 0) return line;
  const match = /^h([1-6])\. (.*)$/.exec(line);
  if (!match) return line;
  const level = Math.min(6, Math.max(1, Number(match[1]) + offset));
  return `h${level}. ${match[2]}`;
}

export function renderWikiDocument(sections: DocSection[], meta: WikiRenderMeta = {}, options: WikiRenderOptions = {}): string {
  const includeToc = options.includeToc ?? true;
  const includeTemplateIntro = options.includeTemplateIntro ?? true;
  const headingOffset = options.headingOffset ?? 0;
  const lines: string[] = [];
  if (includeToc) {
    lines.push('{toc}', '');
  }
  if (includeTemplateIntro) {
    lines.push(...renderWikiTemplateIntro(meta));
  }

  const processDiagramSection = includeTemplateIntro
    ? sections.find(isProcessDiagramSection)
    : undefined;
  if (processDiagramSection && shouldRenderDiagramSection(processDiagramSection)) {
    lines.push('');
    lines.push(...renderProcessDiagramSection(processDiagramSection).map((line) => shiftWikiHeadingLine(line, headingOffset)));
  }

  for (const section of sections) {
    if (section === processDiagramSection) continue;
    const rendered =
      section.kind === 'text'
        ? shouldRenderTextSection(section)
          ? renderTextSection(section)
          : []
        : section.kind === 'parsed'
          ? shouldRenderParsedSection(section)
            ? renderParsedSection(section)
            : []
          : section.kind === 'diagram'
            ? shouldRenderDiagramSection(section)
              ? isProcessDiagramSection(section)
                ? renderProcessDiagramSection(section)
                : renderDiagramSection(section)
              : []
            : shouldRenderErrorsSection(section)
              ? renderErrorsSection(section)
              : [];

    if (rendered.length > 0) {
      lines.push('');
      lines.push(...rendered.map((line) => shiftWikiHeadingLine(line, headingOffset)));
    }
  }

  return lines.join('\n');
}

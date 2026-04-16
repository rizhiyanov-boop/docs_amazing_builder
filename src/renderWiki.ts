import { getRequestColumnLabel, getRequestColumnOrder } from './requestColumns';
import { getRequestRows, requestHasRows, splitRequestRows } from './requestHeaders';
import { buildInputFromRows } from './sourceSync';
import { resolveSectionTitle } from './sectionTitles';
import { getDiagramImageUrl, resolveDiagramEngine } from './diagramUtils';
import { normalizeArrayFieldPath } from './fieldPath';
import { wrapNonDomainResponseJson } from './parsers';
import type { DiagramSection, DocSection, ErrorsSection, ParsedRow, ParsedSection, TextSection } from './types';

const EMPTY_WIKI_CELL = '&#160;';

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
    .map((part) => part.trimEnd())
    .join('<br/>');

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

function toWikiSourceCodeBlock(value: string, format: 'json' | 'curl'): string[] {
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

  const codeLanguage = format === 'json' ? 'json' : 'bash';

  return [`{code:${codeLanguage}}`, ...payload.split('\n').map((line) => escapeWiki(line)), '{code}'];
}

type JsonSchemaNode = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  enum?: unknown[];
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  oneOf?: JsonSchemaNode[];
  anyOf?: JsonSchemaNode[];
  allOf?: JsonSchemaNode[];
};

function resolveSchemaType(schema: JsonSchemaNode): string | undefined {
  if (Array.isArray(schema.type)) {
    return schema.type.find((item) => item !== 'null');
  }
  return schema.type;
}

function toZodRegex(pattern: string): string {
  return `new RegExp(${JSON.stringify(pattern)})`;
}

function schemaNodeToZod(node: JsonSchemaNode): string {
  const nullable = Array.isArray(node.type) && node.type.includes('null');
  const nodeType = resolveSchemaType(node);

  let expression = 'z.any()';

  const oneOf = Array.isArray(node.oneOf) ? node.oneOf : [];
  const anyOf = Array.isArray(node.anyOf) ? node.anyOf : [];
  const allOf = Array.isArray(node.allOf) ? node.allOf : [];

  if (Array.isArray(node.enum) && node.enum.length > 0) {
    const enumValues = node.enum;
    if (enumValues.every((item) => typeof item === 'string')) {
      expression = `z.enum([${enumValues.map((item) => JSON.stringify(item)).join(', ')}])`;
    } else {
      expression = `z.union([${enumValues.map((item) => `z.literal(${JSON.stringify(item)})`).join(', ')}])`;
    }
  } else if (oneOf.length > 0 || anyOf.length > 0) {
    const variants = (oneOf.length > 0 ? oneOf : anyOf).map((item) => schemaNodeToZod(item));
    expression = variants.length > 1 ? `z.union([${variants.join(', ')}])` : (variants[0] ?? 'z.any()');
  } else if (allOf.length > 0) {
    const variants = allOf.map((item) => schemaNodeToZod(item));
    expression = variants.reduce((acc, current) => (acc ? `z.intersection(${acc}, ${current})` : current), '');
    if (!expression) expression = 'z.any()';
  } else if (nodeType === 'object' || node.properties) {
    const properties = node.properties ?? {};
    const required = new Set(node.required ?? []);
    const entries = Object.entries(properties).map(([key, value]) => {
      let child = schemaNodeToZod(value);
      if (!required.has(key)) child = `${child}.optional()`;
      return `${JSON.stringify(key)}: ${child}`;
    });
    expression = `z.object({${entries.length > 0 ? `\n  ${entries.join(',\n  ')}\n` : ''}})`;
  } else if (nodeType === 'array') {
    const itemSchema = node.items ? schemaNodeToZod(node.items) : 'z.any()';
    expression = `z.array(${itemSchema})`;
    if (typeof node.minItems === 'number') expression += `.min(${node.minItems})`;
    if (typeof node.maxItems === 'number') expression += `.max(${node.maxItems})`;
  } else if (nodeType === 'string' || !nodeType) {
    expression = 'z.string()';
    if (typeof node.minLength === 'number') expression += `.min(${node.minLength})`;
    if (typeof node.maxLength === 'number') expression += `.max(${node.maxLength})`;
    if (node.format === 'email') expression += '.email()';
    else if (node.format === 'uuid') expression += '.uuid()';
    else if (node.format === 'uri' || node.format === 'url') expression += '.url()';
    else if (typeof node.format === 'string') expression += `.describe(${JSON.stringify(`format:${node.format}`)})`;
    if (typeof node.pattern === 'string' && node.pattern.trim()) expression += `.regex(${toZodRegex(node.pattern)})`;
  } else if (nodeType === 'integer') {
    expression = 'z.number().int()';
    if (typeof node.minimum === 'number') expression += `.min(${node.minimum})`;
    if (typeof node.maximum === 'number') expression += `.max(${node.maximum})`;
  } else if (nodeType === 'number') {
    expression = 'z.number()';
    if (typeof node.minimum === 'number') expression += `.min(${node.minimum})`;
    if (typeof node.maximum === 'number') expression += `.max(${node.maximum})`;
  } else if (nodeType === 'boolean') {
    expression = 'z.boolean()';
  } else if (nodeType === 'null') {
    expression = 'z.null()';
  }

  if (nullable && expression !== 'z.null()') {
    expression += '.nullable()';
  }

  return expression;
}

function convertJsonSchemaToZodSource(schemaInput: string, schemaName: string): string {
  const parsed = JSON.parse(schemaInput) as JsonSchemaNode;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON Schema must be an object');
  }

  const rootExpression = schemaNodeToZod(parsed);
  return [
    "import { z } from 'zod';",
    '',
    `export const ${schemaName} = ${rootExpression};`
  ].join('\n');
}

function toWikiZodSchemaCodeBlock(schemaInput: string, schemaName: string): string[] {
  try {
    const source = convertJsonSchemaToZodSource(schemaInput, schemaName);
    return toWikiSourceCodeBlock(source, 'curl').map((line) => {
      if (line === '{code:bash}') return '{code:typescript}';
      return line;
    });
  } catch {
    return [
      '{code:typescript}',
      `// Failed to convert JSON Schema to Zod.`,
      "import { z } from 'zod';",
      `export const ${schemaName} = z.any();`,
      '{code}'
    ];
  }
}

function toWikiInlineCodeMacro(value: string, format: 'json' | 'curl' = 'json'): string {
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

  if (messageText && codeMacro) return `${toWikiCell(messageText)}{expand:title=example}${codeMacro}{expand}`;
  if (messageText) return toWikiCell(messageText);
  if (codeMacro) return `{expand:title=example}${codeMacro}{expand}`;
  return EMPTY_WIKI_CELL;
}

function renderParsedSourceExamples(section: ParsedSection): string[] {
  const lines: string[] = [];
  const isRequest = section.sectionType === 'request';
  const serverInput = section.domainModelEnabled || isRequest ? section.input.trim() : wrapNonDomainResponseJson(section.input.trim());
  const serverSchema = (section.schemaInput ?? '').trim();
  const clientInput = section.domainModelEnabled ? (section.clientInput ?? '').trim() : '';
  const clientSchema = section.domainModelEnabled ? (section.clientSchemaInput ?? '').trim() : '';
  const sectionLabel = section.sectionType === 'response' ? 'response' : 'request';
  const serverFormat = section.format;
  const clientFormat = section.clientFormat ?? 'json';
  const serverCurl = isRequest
    ? buildInputFromRows(
      'curl',
      [...splitRequestRows(getRequestRows(section)).headers.filter((row) => row.enabled !== false), ...(section.rows.filter((row) => row.source !== 'header'))],
      {
        requestUrl: section.requestUrl?.trim() || '',
        requestMethod: section.requestMethod,
        bodyJson: section.format === 'json' ? section.input : undefined
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
        requestUrl: section.externalRequestUrl?.trim() || '',
        requestMethod: section.externalRequestMethod,
        bodyJson: section.clientFormat === 'json' ? (section.clientInput ?? '') : undefined
      }
    )
    : '';

  const serverFormatLabel = serverFormat === 'curl' ? 'cURL' : 'JSON';
  const clientFormatLabel = clientFormat === 'curl' ? 'cURL' : 'JSON';

  if (serverInput) {
    lines.push('');
    lines.push(`{expand:title=Пример ${serverFormatLabel} (Server ${sectionLabel})}`);
    lines.push(...toWikiSourceCodeBlock(serverInput, serverFormat));
    lines.push('{expand}');
  }

  if (serverCurl) {
    lines.push('');
    lines.push('{expand:title=Server cURL}');
    lines.push(...toWikiSourceCodeBlock(serverCurl, 'curl'));
    lines.push('{expand}');
  }

  if (clientInput) {
    lines.push('');
    lines.push(`{expand:title=Пример ${clientFormatLabel} (Client ${sectionLabel})}`);
    lines.push(...toWikiSourceCodeBlock(clientInput, clientFormat));
    lines.push('{expand}');
  }

  if (clientCurl) {
    lines.push('');
    lines.push('{expand:title=Client cURL}');
    lines.push(...toWikiSourceCodeBlock(clientCurl, 'curl'));
    lines.push('{expand}');
  }

  if (serverSchema) {
    lines.push('');
    lines.push(`{expand:title=Zod Schema (Server ${sectionLabel})}`);
    lines.push(...toWikiZodSchemaCodeBlock(serverSchema, `server${sectionLabel === 'response' ? 'Response' : 'Request'}Schema`));
    lines.push('{expand}');
  }

  if (clientSchema) {
    lines.push('');
    lines.push(`{expand:title=Zod Schema (Client ${sectionLabel})}`);
    lines.push(...toWikiZodSchemaCodeBlock(clientSchema, `client${sectionLabel === 'response' ? 'Response' : 'Request'}Schema`));
    lines.push('{expand}');
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

function normalizeValidationConditionForWiki(value: string): string {
  return value.replace(/\[\s*([^\]]*?)\s*\]/g, (_match, inner: string) => {
    const normalizedInner = inner.trim();
    if (!normalizedInner) return '[]';
    return `( ${normalizedInner} )`;
  });
}

function normalizeValidationCauseForWiki(value: string): string {
  return normalizeArrayFieldPath(value);
}

function wrapWikiTable(tableLines: string[]): string[] {
  return tableLines;
}

function shouldRenderTextSection(section: TextSection): boolean {
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
  return section.rows.length > 0 || section.validationRules.length > 0;
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

  if (headers.length > 0) {
    lines.push('');
    lines.push('h3. Headers');
    lines.push('');
    lines.push(...renderStructuredTable(headers, section));
  }
  if (requestError) {
    lines.push('');
    lines.push(`*Секция заблокирована:* ${toWikiCell(requestError)}`);
  } else if (otherRows.length > 0) {
    lines.push('');
    lines.push('h3. Параметры');
    lines.push('');
    lines.push(...renderStructuredTable(otherRows, section));
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

  lines.push(...renderStructuredTable(getRequestRows(section), section));
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

  if (section.validationRules.length > 0) {
    lines.push('');
    lines.push('h3. Правила валидации');
    const tableLines = ['||№||Параметр (server request)||Кейс валидации||Условие возникновения||cause||'];

    section.validationRules.forEach((row, index) => {
      tableLines.push(
        `|${toWikiCell(String(index + 1))}|${toWikiCell(normalizeArrayFieldPath(row.parameter))}|${toWikiCell(row.validationCase)}|${toWikiCell(normalizeValidationConditionForWiki(row.condition))}|${toWikiCell(normalizeValidationCauseForWiki(row.cause))}|`
      );
    });
    lines.push(...wrapWikiTable(tableLines));
  }

  return lines;
}

function renderWikiTemplateIntro(sections: DocSection[]): string[] {
  const historyTable = wrapWikiTable([
    '||Версия||Описание||Исполнитель||Дата||Jira||',
    `|v.1|Создание документа|${EMPTY_WIKI_CELL}|${EMPTY_WIKI_CELL}|${EMPTY_WIKI_CELL}|`
  ]);

  const taskTable = wrapWikiTable([
    `|Epic|${EMPTY_WIKI_CELL}|`,
    `|Цель|${EMPTY_WIKI_CELL}|`,
    `|Инициаторы|${EMPTY_WIKI_CELL}|`,
    `|Ответственный разработчик / модуль|${EMPTY_WIKI_CELL}|`
  ]);

  const requestSection = sections.find(
    (s): s is Extract<DocSection, { kind: 'parsed' }> => s.kind === 'parsed' && s.sectionType === 'request'
  );

  const serverMethod = requestSection?.requestMethod ?? EMPTY_WIKI_CELL;
  const serverUrl = requestSection?.requestUrl ?? EMPTY_WIKI_CELL;
  const serverValue = serverMethod !== EMPTY_WIKI_CELL && serverUrl !== EMPTY_WIKI_CELL ? `${serverMethod} ${serverUrl}` : EMPTY_WIKI_CELL;

  const clientMethod = requestSection?.domainModelEnabled ? (requestSection?.externalRequestMethod ?? EMPTY_WIKI_CELL) : EMPTY_WIKI_CELL;
  const clientUrl = requestSection?.domainModelEnabled ? (requestSection?.externalRequestUrl ?? EMPTY_WIKI_CELL) : EMPTY_WIKI_CELL;
  const clientValue = clientMethod !== EMPTY_WIKI_CELL && clientUrl !== EMPTY_WIKI_CELL ? `${clientMethod} ${clientUrl}` : EMPTY_WIKI_CELL;

  const commonInfoTable = wrapWikiTable([
    `|Метод|${toWikiCell(serverValue)}|`,
    `|Внешний URL|${toWikiCell(clientValue)}|`
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
    ...commonInfoTable
  ];
}

export function renderWikiDocument(sections: DocSection[]): string {
  const lines: string[] = ['{toc}', '', ...renderWikiTemplateIntro(sections)];

  for (const section of sections) {
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
              ? renderDiagramSection(section)
              : []
            : shouldRenderErrorsSection(section)
              ? renderErrorsSection(section)
              : [];

    if (rendered.length > 0) {
      lines.push('');
      lines.push(...rendered);
    }
  }

  return lines.join('\n');
}

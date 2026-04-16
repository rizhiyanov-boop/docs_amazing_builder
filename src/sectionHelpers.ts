import {
  DEFAULT_API_KEY_EXAMPLE,
  DEFAULT_API_KEY_HEADER,
  DEFAULT_BEARER_TOKEN_EXAMPLE,
  getEditorRequestRows,
  getRequestHeaderRows
} from './requestHeaders';
import type { DocSection, ParseFormat, ParsedRow, ParsedSection, RequestMethod } from './types';

function createSectionId(prefix = 'section'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isRequestSection(section: ParsedSection): boolean {
  return section.sectionType === 'request';
}

export function isResponseSection(section: ParsedSection): boolean {
  return section.sectionType === 'response';
}

export function isDualModelSection(section: ParsedSection): boolean {
  return isRequestSection(section) || isResponseSection(section);
}

export function getSectionSideLabel(section: ParsedSection, target: 'server' | 'client'): string {
  const kind = isResponseSection(section) ? 'response' : 'request';
  return `${target === 'client' ? 'Client' : 'Server'} ${kind}`;
}

export function getSectionRows(section: ParsedSection): ParsedRow[] {
  return isDualModelSection(section) ? getEditorRequestRows(section) : section.rows;
}

export function getRequestHeaderRowsForEditor(section: ParsedSection): ParsedRow[] {
  return isRequestSection(section) ? getRequestHeaderRows(section) : [];
}

export function getExternalRequestHeaderRowsForEditor(section: ParsedSection): ParsedRow[] {
  if (!isRequestSection(section)) return [];
  return [...(section.clientRows ?? []).filter((row) => row.source === 'header')].sort((left, right) => left.field.localeCompare(right.field));
}

function getExternalAuthHeaderRows(section: ParsedSection): ParsedRow[] {
  if (!isRequestSection(section)) return [];

  if (section.externalAuthType === 'bearer') {
    const tokenExample = section.externalAuthTokenExample?.trim() || DEFAULT_BEARER_TOKEN_EXAMPLE;
    return [{
      field: 'Authorization',
      sourceField: 'Authorization',
      origin: 'generated',
      enabled: true,
      type: 'string',
      required: '+',
      description: 'Авторизация: Bearer token',
      example: `Bearer ${tokenExample}`,
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
    const headerName = section.externalAuthHeaderName?.trim() || DEFAULT_API_KEY_HEADER;
    const apiKeyExample = section.externalAuthApiKeyExample?.trim() || DEFAULT_API_KEY_EXAMPLE;
    return [{
      field: headerName,
      sourceField: headerName,
      origin: 'generated',
      enabled: true,
      type: 'string',
      required: '+',
      description: 'Авторизация: API key',
      example: apiKeyExample,
      source: 'header'
    }];
  }

  return [];
}

export function getExternalSourceRows(section: ParsedSection): ParsedRow[] {
  const clientRows = section.clientRows ?? [];
  const authRows = getExternalAuthHeaderRows(section);
  const existingHeaderNames = new Set(clientRows.filter((row) => row.source === 'header').map((row) => row.field.trim().toLowerCase()));
  const nextRows = [...clientRows];

  for (const authRow of authRows) {
    if (!existingHeaderNames.has(authRow.field.trim().toLowerCase())) {
      nextRows.unshift(authRow);
    }
  }

  return nextRows;
}

export function normalizeParsedRowsForSection(section: ParsedSection, rows: ParsedRow[]): ParsedRow[] {
  if (isDualModelSection(section)) {
    return rows.map((row) => ({
      ...row,
      source: row.source ?? 'body'
    }));
  }

  return rows.map((row) => ({
    ...row,
    source: row.source ?? 'parsed'
  }));
}

export function getRowsRelevantToSourceFormat(rows: ParsedRow[], format: ParseFormat): ParsedRow[] {
  if (format !== 'json') return rows;
  return rows.filter((row) => row.source !== 'header' && row.source !== 'url' && row.source !== 'query');
}

export function withRowIds(rows: ParsedRow[]): ParsedRow[] {
  return rows.map((row) => ({
    ...row,
    id: row.id || createSectionId('row')
  }));
}

export function withSectionRowIds(section: DocSection): DocSection {
  if (section.kind !== 'parsed') return section;
  return {
    ...section,
    rows: withRowIds(section.rows),
    clientRows: section.clientRows ? withRowIds(section.clientRows) : section.clientRows
  };
}

export function normalizeRequestRowsForMethod(rows: ParsedRow[], method: RequestMethod | undefined): ParsedRow[] {
  const targetSource = method === 'GET' ? 'query' : 'body';
  return rows.map((row) => {
    if (row.source === 'header' || row.source === 'url') return row;
    return { ...row, source: targetSource };
  });
}

export function validateSection(section: DocSection): string {
  if (section.kind === 'errors') return '';

  if (section.kind === 'diagram') {
    const hasContent = section.diagrams.some((diagram) => diagram.code.trim());
    if (!hasContent) return '';
    const invalid = section.diagrams.find((diagram) => !diagram.code.trim());
    if (invalid) return 'Заполните код всех добавленных диаграмм или удалите пустые';
    return '';
  }

  if (section.kind !== 'parsed') return '';

  if (isDualModelSection(section)) {
    const hasServerInput = Boolean(section.input.trim());
    const hasServerSchema = Boolean((section.schemaInput ?? '').trim());
    const hasClientInput = section.domainModelEnabled ? Boolean(section.clientInput?.trim()) : false;
    const hasClientSchema = section.domainModelEnabled ? Boolean((section.clientSchemaInput ?? '').trim()) : false;

    if (section.error) return `Секция заблокирована: ${section.error}`;
    if (section.clientError) return `${getSectionSideLabel(section, 'client')} заблокирован: ${section.clientError}`;
    if (!hasServerInput && !hasServerSchema && !hasClientInput && !hasClientSchema && getSectionRows(section).length === 0) return '';
    if (getSectionRows(section).length === 0) return 'Нет распарсенных строк';
    return '';
  }

  if (!section.input.trim() && !(section.schemaInput ?? '').trim()) return 'Введите исходные данные или JSON Schema для парсинга';
  if (section.error) return `Секция заблокирована: ${section.error}`;
  if (section.rows.length === 0) return 'Нет распарсенных строк';
  return '';
}

import type { ParsedRow, ParsedSection } from './types';

export const OPTIONAL_MARK = '-';

export type RequestAuthInfo = {
  schemeLabel: string;
  headerName: string;
  example: string;
  details: Array<{ label: string; value: string }>;
};

export const DEFAULT_BEARER_TOKEN_EXAMPLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<payload>.<signature>';
export const DEFAULT_BASIC_USERNAME = 'api-user';
export const DEFAULT_BASIC_PASSWORD = 'secret-password';
export const DEFAULT_API_KEY_HEADER = 'X-API-Key';
export const DEFAULT_API_KEY_EXAMPLE = 'sk_live_51QExampleKey';

export const DEFAULT_REQUEST_HEADERS: ParsedRow[] = [
  { field: 'X-CLIENT-ID', sourceField: 'X-CLIENT-ID', origin: 'generated', enabled: true, type: 'string', required: '-', description: 'ID клиента', example: '', source: 'header' },
  { field: 'X-USER-ID', sourceField: 'X-USER-ID', origin: 'generated', enabled: true, type: 'string', required: '-', description: 'ID пользователя', example: '', source: 'header' },
  { field: 'X-SOURCE-SYSTEM', sourceField: 'X-SOURCE-SYSTEM', origin: 'generated', enabled: true, type: 'string', required: '-', description: 'Система-инициатор', example: '', source: 'header' },
  { field: 'X-BP-ID', sourceField: 'X-BP-ID', origin: 'generated', enabled: true, type: 'string', required: '-', description: 'ID бизнес-процесса', example: '', source: 'header' },
  { field: 'X-BP-NAME', sourceField: 'X-BP-NAME', origin: 'generated', enabled: true, type: 'string', required: '-', description: 'Название бизнес-процесса', example: '', source: 'header' },
  { field: 'traceparent', sourceField: 'traceparent', origin: 'generated', enabled: true, type: 'string', required: '-', description: 'TraceParent для распределенного трейсинга', example: '', source: 'header' }
];

const REQUEST_HEADER_ORDER = new Map(DEFAULT_REQUEST_HEADERS.map((header, index) => [header.field.toLowerCase(), index]));
const DEFAULT_REQUEST_HEADER_NAMES = new Set(DEFAULT_REQUEST_HEADERS.map((header) => header.field.toLowerCase()));

function isDualModelSection(section: ParsedSection): boolean {
  return section.sectionType === 'request' || section.sectionType === 'response';
}

function getRowKey(row: ParsedRow): string {
  return row.sourceField?.trim() || row.field.trim() || row.clientSourceField?.trim() || row.clientField?.trim() || '';
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '');
}

function splitTokens(value: string): string[] {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function getSimilarityScore(left: string, right: string): number {
  const normalizedLeft = normalizeKey(left);
  const normalizedRight = normalizeKey(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 10_000;
  if (normalizedLeft.endsWith(normalizedRight) || normalizedRight.endsWith(normalizedLeft)) return 7_500;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return 5_000;

  const leftTokens = splitTokens(left);
  const rightTokens = splitTokens(right);
  const sharedTokens = leftTokens.filter((token) => rightTokens.includes(token));
  if (sharedTokens.length > 0) {
    return sharedTokens.length * 1_000 - Math.abs(leftTokens.length - rightTokens.length) * 10;
  }

  let commonPrefix = 0;
  const maxLength = Math.min(normalizedLeft.length, normalizedRight.length);
  while (commonPrefix < maxLength && normalizedLeft[commonPrefix] === normalizedRight[commonPrefix]) {
    commonPrefix += 1;
  }

  return commonPrefix;
}

function sortHeaders(rows: ParsedRow[]): ParsedRow[] {
  return [...rows].sort((left, right) => {
    const leftOrder = REQUEST_HEADER_ORDER.get(left.field.trim().toLowerCase());
    const rightOrder = REQUEST_HEADER_ORDER.get(right.field.trim().toLowerCase());

    if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;
    return left.field.localeCompare(right.field);
  });
}

function mergeDefaultHeaders(rows: ParsedRow[]): ParsedRow[] {
  const normalizedRows = rows.map((row) => ({ ...row, enabled: row.enabled ?? true }));
  const byName = new Map(normalizedRows.filter((row) => row.source === 'header').map((row) => [row.field.trim().toLowerCase(), row]));
  const merged = [...normalizedRows.filter((row) => row.source !== 'header')];

  const headerRows: ParsedRow[] = [];

  for (const header of DEFAULT_REQUEST_HEADERS) {
    const existing = byName.get(header.field.toLowerCase());
    if (existing) {
      headerRows.push({ ...existing, enabled: existing.enabled ?? true });
      byName.delete(header.field.toLowerCase());
    } else {
      headerRows.push({ ...header });
    }
  }

  headerRows.push(...Array.from(byName.values()));
  return [...sortHeaders(headerRows), ...merged];
}

function filterEnabledRows(rows: ParsedRow[]): ParsedRow[] {
  return rows.filter((row) => row.source !== 'header' || row.enabled !== false);
}

function getRequestAuthInfoInternal(section: ParsedSection): RequestAuthInfo | null {
  if (section.sectionType !== 'request') return null;

  if (section.authType === 'bearer') {
    const tokenExample = section.authTokenExample?.trim() || DEFAULT_BEARER_TOKEN_EXAMPLE;
    return {
      schemeLabel: 'Bearer token',
      headerName: 'Authorization',
      example: `Bearer ${tokenExample}`,
      details: [
        { label: 'Схема', value: 'Bearer token' },
        { label: 'Header', value: 'Authorization' },
        { label: 'Пример', value: `Bearer ${tokenExample}` }
      ]
    };
  }

  if (section.authType === 'basic') {
    const username = section.authUsername?.trim() || DEFAULT_BASIC_USERNAME;
    const password = section.authPassword?.trim() || DEFAULT_BASIC_PASSWORD;
    return {
      schemeLabel: 'Basic auth',
      headerName: 'Authorization',
      example: 'Basic <base64(username:password)>',
      details: [
        { label: 'Схема', value: 'Basic auth' },
        { label: 'Header', value: 'Authorization' },
        { label: 'Логин', value: username },
        { label: 'Пароль', value: password },
        { label: 'Пример', value: 'Basic <base64(username:password)>' }
      ]
    };
  }

  if (section.authType === 'api-key') {
    const headerName = section.authHeaderName?.trim() || DEFAULT_API_KEY_HEADER;
    const apiKeyExample = section.authApiKeyExample?.trim() || DEFAULT_API_KEY_EXAMPLE;
    return {
      schemeLabel: 'API key',
      headerName,
      example: apiKeyExample,
      details: [
        { label: 'Схема', value: 'API key' },
        { label: 'Header', value: headerName },
        { label: 'Пример', value: apiKeyExample }
      ]
    };
  }

  return null;
}

function getRequestAuthRows(section: ParsedSection): ParsedRow[] {
  const authInfo = getRequestAuthInfoInternal(section);
  if (!authInfo) return [];

  return [
    {
      field: authInfo.headerName,
      sourceField: authInfo.headerName,
      origin: 'generated',
      enabled: true,
      type: 'string',
      required: '+',
      description: `Авторизация: ${authInfo.schemeLabel}`,
      example: authInfo.example,
      source: 'header'
    }
  ];
}

function getRequestServerRows(section: ParsedSection, options?: { includeDisabledHeaders?: boolean; includeAuth?: boolean }): ParsedRow[] {
  const includeDisabledHeaders = options?.includeDisabledHeaders ?? false;
  const includeAuth = options?.includeAuth ?? true;

  if (section.sectionType !== 'request') {
    return includeDisabledHeaders ? section.rows : filterEnabledRows(section.rows);
  }

  const rowsWithDefaults = mergeDefaultHeaders(section.rows);
  const visibleRows = includeDisabledHeaders ? rowsWithDefaults : filterEnabledRows(rowsWithDefaults);
  if (!includeAuth) return visibleRows;

  const authRows = getRequestAuthRows(section);
  const existingHeaderNames = new Set(visibleRows.filter((row) => row.source === 'header').map((row) => row.field.trim().toLowerCase()));
  const nextRows = [...visibleRows];

  for (const header of authRows) {
    if (!existingHeaderNames.has(header.field.trim().toLowerCase())) {
      nextRows.unshift(header);
    }
  }

  return nextRows;
}

function isMappableRow(row: ParsedRow): boolean {
  return row.source !== 'header' && row.source !== 'url';
}

function getValidClientMappings(section: ParsedSection): Record<string, string> {
  if (!isDualModelSection(section)) return {};

  const clientKeys = new Set((section.clientRows ?? []).map((row) => getRowKey(row)));
  const serverKeys = new Set(
    section.rows
      .filter((row) => isMappableRow(row))
      .map((row) => getRowKey(row))
  );

  return Object.fromEntries(
    Object.entries(section.clientMappings ?? {}).filter(([serverKey, clientKey]) => serverKeys.has(serverKey) && clientKeys.has(clientKey))
  );
}

function mergeRequestRows(section: ParsedSection): ParsedRow[] {
  const serverRows = getRequestServerRows(section, { includeDisabledHeaders: false, includeAuth: true });

  if (!isDualModelSection(section) || !section.domainModelEnabled) return serverRows;

  const clientRows = section.clientRows ?? [];
  const clientByKey = new Map(clientRows.map((row) => [getRowKey(row), row]));
  const mappings = getValidClientMappings(section);
  const mappedClientKeys = new Set(Object.values(mappings));

  const mergedServerRows = serverRows.map((row) => {
    if (!isMappableRow(row)) return row;

    const mappedClientKey = mappings[getRowKey(row)];
    if (!mappedClientKey) return row;

    const clientRow = clientByKey.get(mappedClientKey);
    if (!clientRow) return row;

    return {
      ...row,
      clientField: clientRow.field,
      clientSourceField: clientRow.sourceField,
      clientOrigin: clientRow.origin
    };
  });

  const unmappedClientRows = clientRows
    .filter((row) => !mappedClientKeys.has(getRowKey(row)))
    .map((row) => ({
      ...row,
      clientField: row.field,
      clientSourceField: row.sourceField,
      clientOrigin: row.origin,
      field: ''
    }));

  return [...mergedServerRows, ...unmappedClientRows];
}

export function getRequestRows(section: ParsedSection): ParsedRow[] {
  if (!isDualModelSection(section)) return section.rows;
  return mergeRequestRows(section);
}

export function getEditorRequestRows(section: ParsedSection): ParsedRow[] {
  if (!isDualModelSection(section)) return section.rows;
  const mergedRows = mergeRequestRows(section).filter((row) => row.source !== 'header' && row.source !== 'url');
  if (section.sectionType === 'request' && section.requestMethod === 'GET') {
    return mergedRows.filter((row) => row.source === 'query');
  }
  return mergedRows.filter((row) => row.source !== 'query');
}

export function getRequestHeaderRows(section: ParsedSection): ParsedRow[] {
  return sortHeaders(getRequestServerRows(section, { includeDisabledHeaders: true, includeAuth: true }).filter((row) => row.source === 'header'));
}

export function isDefaultRequestHeader(row: ParsedRow): boolean {
  return DEFAULT_REQUEST_HEADER_NAMES.has(row.field.trim().toLowerCase());
}

export function isAuthHeader(section: ParsedSection, row: ParsedRow): boolean {
  const authInfo = getRequestAuthInfoInternal(section);
  return Boolean(authInfo && row.field.trim().toLowerCase() === authInfo.headerName.trim().toLowerCase());
}

export function getMappingOptions(section: ParsedSection, displayField: string): ParsedRow[] {
  if (!isDualModelSection(section) || !section.domainModelEnabled) return [];

  return [...(section.clientRows ?? [])].sort((left, right) => {
    const scoreDiff = getSimilarityScore(displayField, right.field) - getSimilarityScore(displayField, left.field);
    if (scoreDiff !== 0) return scoreDiff;
    return left.field.localeCompare(right.field);
  });
}

export function getPreviouslyUsedClientKeys(section: ParsedSection, currentRow: ParsedRow): Set<string> {
  if (!isDualModelSection(section)) return new Set();

  const currentKey = getParsedRowKey(currentRow);
  const currentValue = getMappedClientField(section, currentRow);

  return new Set(
    Object.entries(getValidClientMappings(section))
      .filter(([rowKey, clientKey]) => rowKey !== currentKey && clientKey !== currentValue)
      .map(([, clientKey]) => clientKey)
  );
}

export function requestHasRows(section: ParsedSection): boolean {
  return getRequestRows(section).length > 0;
}

export function splitRequestRows(rows: ParsedRow[]): {
  headers: ParsedRow[];
  otherRows: ParsedRow[];
  urlRow?: ParsedRow;
} {
  const headers = rows.filter((row) => row.source === 'header');
  const urlRow = rows.find((row) => row.source === 'url');
  const otherRows = rows.filter((row) => row.source !== 'header' && row.source !== 'url');

  return { headers, otherRows, urlRow };
}

export function isRequestMappingRow(row: ParsedRow): boolean {
  return isMappableRow(row) && Boolean(row.field.trim());
}

export function getMappedClientField(section: ParsedSection, row: ParsedRow): string {
  return getValidClientMappings(section)[getRowKey(row)] ?? '';
}

export function getParsedRowKey(row: ParsedRow): string {
  return getRowKey(row);
}

export function hasInputDrift(rows: ParsedRow[]): boolean {
  return rows.some((row) => row.origin === 'manual' || (row.origin === 'parsed' && row.sourceField && row.field !== row.sourceField));
}

export function getInputDriftRows(rows: ParsedRow[]): ParsedRow[] {
  return rows.filter((row) => row.origin === 'manual' || (row.origin === 'parsed' && row.sourceField && row.field !== row.sourceField));
}

export function getRequestAuthInfo(section: ParsedSection): RequestAuthInfo | null {
  return getRequestAuthInfoInternal(section);
}

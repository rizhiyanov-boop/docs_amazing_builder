import type { ParsedRow, ParsedSection } from './types';

export const OPTIONAL_MARK = '\u00B1';

export const DEFAULT_REQUEST_HEADERS: ParsedRow[] = [
  { field: 'X-CLIENT-ID', sourceField: 'X-CLIENT-ID', origin: 'generated', type: 'string', required: '-', description: 'ID клиента', example: '', source: 'header' },
  { field: 'X-USER-ID', sourceField: 'X-USER-ID', origin: 'generated', type: 'string', required: '-', description: 'ID пользователя', example: '', source: 'header' },
  { field: 'X-SOURCE-SYSTEM', sourceField: 'X-SOURCE-SYSTEM', origin: 'generated', type: 'string', required: '-', description: 'Система-инициатор', example: '', source: 'header' },
  { field: 'X-BP-ID', sourceField: 'X-BP-ID', origin: 'generated', type: 'string', required: '-', description: 'ID бизнес-процесса', example: '', source: 'header' },
  { field: 'X-BP-NAME', sourceField: 'X-BP-NAME', origin: 'generated', type: 'string', required: '-', description: 'Название бизнес-процесса', example: '', source: 'header' },
  { field: 'traceparent', sourceField: 'traceparent', origin: 'generated', type: 'string', required: '-', description: 'TraceParent для распределенного трейсинга', example: '', source: 'header' }
];

const REQUEST_HEADER_ORDER = new Map(
  DEFAULT_REQUEST_HEADERS.map((header, index) => [header.field.toLowerCase(), index])
);

function getRowKey(row: ParsedRow): string {
  return row.sourceField?.trim() || row.field.trim();
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

function withDefaultHeaders(rows: ParsedRow[]): ParsedRow[] {
  const presentHeaders = new Set(
    rows
      .filter((row) => row.source === 'header')
      .map((row) => row.field.trim().toLowerCase())
  );

  const merged = [...rows];
  for (const header of DEFAULT_REQUEST_HEADERS) {
    if (!presentHeaders.has(header.field.toLowerCase())) {
      merged.push(header);
    }
  }

  return merged.sort((left, right) => {
    const leftOrder = left.source === 'header' ? REQUEST_HEADER_ORDER.get(left.field.toLowerCase()) : undefined;
    const rightOrder = right.source === 'header' ? REQUEST_HEADER_ORDER.get(right.field.toLowerCase()) : undefined;

    if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;
    return 0;
  });
}

function isMappableRow(row: ParsedRow): boolean {
  return row.source !== 'header' && row.source !== 'url';
}

function getValidClientMappings(section: ParsedSection): Record<string, string> {
  if (section.id !== 'request') return {};

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

function mergeRequestRows(section: ParsedSection, includeDefaultHeaders: boolean): ParsedRow[] {
  const serverRows = includeDefaultHeaders ? withDefaultHeaders(section.rows) : section.rows;

  if (section.id !== 'request' || !section.domainModelEnabled) return serverRows;

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
  if (section.id !== 'request') return section.rows;
  return mergeRequestRows(section, true);
}

export function getEditorRequestRows(section: ParsedSection): ParsedRow[] {
  if (section.id !== 'request') return section.rows;

  const hiddenRequestHeaders = new Set(DEFAULT_REQUEST_HEADERS.map((header) => header.field.toLowerCase()));
  return mergeRequestRows(
    {
      ...section,
      rows: section.rows.filter(
        (row) => !(row.source === 'header' && hiddenRequestHeaders.has(row.field.trim().toLowerCase()))
      )
    },
    false
  );
}

export function getMappingOptions(section: ParsedSection, displayField: string): ParsedRow[] {
  if (section.id !== 'request' || !section.domainModelEnabled) return [];

  return [...(section.clientRows ?? [])]
    .sort((left, right) => {
      const scoreDiff = getSimilarityScore(displayField, right.field) - getSimilarityScore(displayField, left.field);
      if (scoreDiff !== 0) return scoreDiff;
      return left.field.localeCompare(right.field);
    });
}

export function getPreviouslyUsedClientKeys(section: ParsedSection, currentRow: ParsedRow): Set<string> {
  if (section.id !== 'request') return new Set();

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

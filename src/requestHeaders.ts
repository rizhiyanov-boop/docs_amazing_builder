import type { ParsedRow, ParsedSection } from './types';

export const OPTIONAL_MARK = '\u00B1';

export const DEFAULT_REQUEST_HEADERS: ParsedRow[] = [
  { field: 'X-CLIENT-ID', type: 'string', required: '-', description: 'ID клиента', example: '', source: 'header' },
  { field: 'X-USER-ID', type: 'string', required: '-', description: 'ID пользователя', example: '', source: 'header' },
  { field: 'X-SOURCE-SYSTEM', type: 'string', required: '-', description: 'Система-инициатор', example: '', source: 'header' },
  { field: 'X-BP-ID', type: 'string', required: '-', description: 'ID бизнес-процесса', example: '', source: 'header' },
  { field: 'X-BP-NAME', type: 'string', required: '-', description: 'Название бизнес-процесса', example: '', source: 'header' },
  { field: 'traceparent', type: 'string', required: '-', description: 'TraceParent для распределенного трейсинга', example: '', source: 'header' }
];

const REQUEST_HEADER_ORDER = new Map(
  DEFAULT_REQUEST_HEADERS.map((header, index) => [header.field.toLowerCase(), index])
);

export function getRequestRows(section: ParsedSection): ParsedRow[] {
  if (section.id !== 'request') return section.rows;

  const presentHeaders = new Set(
    section.rows
      .filter((row) => row.source === 'header')
      .map((row) => row.field.trim().toLowerCase())
  );

  const merged = [...section.rows];
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

export function splitRequestRows(rows: ParsedRow[]): {
  headers: ParsedRow[];
  otherRows: ParsedRow[];
  urlRow?: ParsedRow;
} {
  const headers = rows.filter((row) => row.source === 'header');
  const urlRow = rows.find((row) => row.field === 'request.url');
  const otherRows = rows.filter((row) => row.source !== 'header' && row.field !== 'request.url');

  return { headers, otherRows, urlRow };
}

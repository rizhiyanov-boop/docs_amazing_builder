import type { ParsedRow, ParsedSection, RequestColumnKey } from './types';

export const DEFAULT_REQUEST_COLUMN_ORDER: RequestColumnKey[] = [
  'field',
  'type',
  'required',
  'clientField',
  'description',
  'example'
];

const BASE_COLUMN_LABELS: Record<RequestColumnKey, string> = {
  field: 'Поле',
  type: 'Тип',
  required: 'Обязательность',
  clientField: 'Client request',
  description: 'Описание',
  example: 'Пример'
};

export function getRequestColumnLabel(section: ParsedSection, column: RequestColumnKey): string {
  if (column === 'clientField') {
    return section.sectionType === 'response' ? 'Client response' : 'Client request';
  }

  return BASE_COLUMN_LABELS[column];
}

export function getRequestColumnOrder(section: ParsedSection, rows: ParsedRow[]): RequestColumnKey[] {
  if (section.sectionType !== 'request' && section.sectionType !== 'response') {
    return DEFAULT_REQUEST_COLUMN_ORDER.filter((column) => column !== 'clientField');
  }

  const hasClientField = rows.some((row) => Boolean(row.clientField?.trim()));
  const allowed = DEFAULT_REQUEST_COLUMN_ORDER.filter((column) => hasClientField || column !== 'clientField');
  const current = section.requestColumnOrder ?? DEFAULT_REQUEST_COLUMN_ORDER;
  const normalized = current.filter((column): column is RequestColumnKey => allowed.includes(column));

  for (const column of allowed) {
    if (!normalized.includes(column)) {
      normalized.push(column);
    }
  }

  return normalized;
}

export function moveRequestColumn(order: RequestColumnKey[], from: RequestColumnKey, to: RequestColumnKey): RequestColumnKey[] {
  if (from === to) return order;
  const next = [...order];
  const fromIndex = next.indexOf(from);
  const toIndex = next.indexOf(to);
  if (fromIndex === -1 || toIndex === -1) return order;
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}

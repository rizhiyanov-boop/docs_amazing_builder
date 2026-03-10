import { DEFAULT_REQUEST_COLUMN_ORDER } from './requestColumns';
import type { DocSection, ParsedRow } from './types';

export const DEFAULT_SECTION_TITLE = 'Новая секция';

function normalizeRow(row: ParsedRow): ParsedRow {
  return {
    ...row,
    sourceField: row.sourceField ?? (row.origin === 'manual' ? undefined : row.field),
    origin: row.origin ?? 'parsed'
  };
}

export function resolveSectionTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || DEFAULT_SECTION_TITLE;
}

export function sanitizeSections(sections: DocSection[]): DocSection[] {
  return sections.map((section) => {
    if (section.kind !== 'parsed') {
      return {
        ...section,
        title: resolveSectionTitle(section.title)
      };
    }

    if (section.id !== 'request') {
      return {
        ...section,
        title: resolveSectionTitle(section.title),
        lastSyncedFormat: section.lastSyncedFormat ?? section.format,
        rows: section.rows.map(normalizeRow)
      };
    }

    return {
      ...section,
      title: resolveSectionTitle(section.title),
      lastSyncedFormat: section.lastSyncedFormat ?? section.format,
      rows: section.rows.map(normalizeRow),
      domainModelEnabled: section.domainModelEnabled ?? false,
      clientFormat: section.clientFormat ?? 'json',
      clientLastSyncedFormat: section.clientLastSyncedFormat ?? section.clientFormat ?? 'json',
      clientInput: section.clientInput ?? '',
      clientRows: (section.clientRows ?? []).map(normalizeRow),
      clientError: section.clientError ?? '',
      clientMappings: section.clientMappings ?? {},
      requestColumnOrder: section.requestColumnOrder ?? DEFAULT_REQUEST_COLUMN_ORDER
    };
  });
}

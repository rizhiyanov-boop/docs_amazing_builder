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

function isDualModelSectionId(id: string): boolean {
  return id === 'request' || id === 'response';
}

export function resolveSectionTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || DEFAULT_SECTION_TITLE;
}

export function sanitizeSections(sections: DocSection[]): DocSection[] {
  return sections.map((section) => {
    const normalizedSection =
      section.kind === 'parsed' && section.id === 'body'
        ? { ...section, id: 'response', title: section.title === 'Body / Выходные параметры' ? 'Response' : section.title }
        : section;

    if (normalizedSection.kind !== 'parsed') {
      return {
        ...normalizedSection,
        title: resolveSectionTitle(normalizedSection.title)
      };
    }

    if (!isDualModelSectionId(normalizedSection.id)) {
      return {
        ...normalizedSection,
        title: resolveSectionTitle(normalizedSection.title),
        lastSyncedFormat: normalizedSection.lastSyncedFormat ?? normalizedSection.format,
        rows: normalizedSection.rows.map(normalizeRow)
      };
    }

    return {
      ...normalizedSection,
      title: resolveSectionTitle(normalizedSection.title),
      lastSyncedFormat: normalizedSection.lastSyncedFormat ?? normalizedSection.format,
      rows: normalizedSection.rows.map(normalizeRow),
      domainModelEnabled: normalizedSection.domainModelEnabled ?? false,
      clientFormat: normalizedSection.clientFormat ?? 'json',
      clientLastSyncedFormat: normalizedSection.clientLastSyncedFormat ?? normalizedSection.clientFormat ?? 'json',
      clientInput: normalizedSection.clientInput ?? '',
      clientRows: (normalizedSection.clientRows ?? []).map(normalizeRow),
      clientError: normalizedSection.clientError ?? '',
      clientMappings: normalizedSection.clientMappings ?? {},
      requestColumnOrder: normalizedSection.requestColumnOrder ?? DEFAULT_REQUEST_COLUMN_ORDER
    };
  });
}


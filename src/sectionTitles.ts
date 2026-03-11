import { DEFAULT_REQUEST_COLUMN_ORDER } from './requestColumns';
import {
  DEFAULT_API_KEY_EXAMPLE,
  DEFAULT_API_KEY_HEADER,
  DEFAULT_BASIC_PASSWORD,
  DEFAULT_BASIC_USERNAME,
  DEFAULT_BEARER_TOKEN_EXAMPLE
} from './requestHeaders';
import type { DocSection, ParsedRow, ParsedSectionType } from './types';

export const DEFAULT_SECTION_TITLE = 'Новая секция';

function normalizeRow(row: ParsedRow): ParsedRow {
  return {
    ...row,
    sourceField: row.sourceField ?? (row.origin === 'manual' ? undefined : row.field),
    origin: row.origin ?? 'parsed',
    enabled: row.enabled ?? true
  };
}

function isDualModelSectionId(id: string): boolean {
  return id === 'request' || id === 'response';
}

function resolveParsedSectionType(section: Extract<DocSection, { kind: 'parsed' }>): ParsedSectionType {
  if (section.sectionType) return section.sectionType;
  if (section.id === 'request') return 'request';
  if (section.id === 'response' || section.id === 'body') return 'response';
  return 'generic';
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
        sectionType: resolveParsedSectionType(normalizedSection),
        title: resolveSectionTitle(normalizedSection.title),
        lastSyncedFormat: normalizedSection.lastSyncedFormat ?? normalizedSection.format,
        rows: normalizedSection.rows.map(normalizeRow)
      };
    }

    const sectionType = resolveParsedSectionType(normalizedSection);

    return {
      ...normalizedSection,
      sectionType,
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
      requestColumnOrder: normalizedSection.requestColumnOrder ?? DEFAULT_REQUEST_COLUMN_ORDER,
      authType: sectionType === 'request' ? normalizedSection.authType ?? 'none' : undefined,
      authHeaderName: sectionType === 'request' ? normalizedSection.authHeaderName ?? DEFAULT_API_KEY_HEADER : undefined,
      authTokenExample: sectionType === 'request' ? normalizedSection.authTokenExample ?? DEFAULT_BEARER_TOKEN_EXAMPLE : undefined,
      authUsername: sectionType === 'request' ? normalizedSection.authUsername ?? DEFAULT_BASIC_USERNAME : undefined,
      authPassword: sectionType === 'request' ? normalizedSection.authPassword ?? DEFAULT_BASIC_PASSWORD : undefined,
      authApiKeyExample: sectionType === 'request' ? normalizedSection.authApiKeyExample ?? DEFAULT_API_KEY_EXAMPLE : undefined,
      requestUrl: sectionType === 'request' ? normalizedSection.requestUrl ?? '' : undefined,
      requestMethod: sectionType === 'request' ? normalizedSection.requestMethod ?? 'POST' : undefined,
      requestProtocol: sectionType === 'request' ? normalizedSection.requestProtocol ?? 'REST' : undefined,
      externalRequestUrl: sectionType === 'request' ? normalizedSection.externalRequestUrl ?? '' : undefined,
      externalRequestMethod: sectionType === 'request' ? normalizedSection.externalRequestMethod ?? 'POST' : undefined,
      externalAuthType: sectionType === 'request' ? normalizedSection.externalAuthType ?? 'none' : undefined,
      externalAuthHeaderName: sectionType === 'request' ? normalizedSection.externalAuthHeaderName ?? DEFAULT_API_KEY_HEADER : undefined,
      externalAuthTokenExample: sectionType === 'request' ? normalizedSection.externalAuthTokenExample ?? DEFAULT_BEARER_TOKEN_EXAMPLE : undefined,
      externalAuthUsername: sectionType === 'request' ? normalizedSection.externalAuthUsername ?? DEFAULT_BASIC_USERNAME : undefined,
      externalAuthPassword: sectionType === 'request' ? normalizedSection.externalAuthPassword ?? DEFAULT_BASIC_PASSWORD : undefined,
      externalAuthApiKeyExample: sectionType === 'request' ? normalizedSection.externalAuthApiKeyExample ?? DEFAULT_API_KEY_EXAMPLE : undefined
    };
  });
}

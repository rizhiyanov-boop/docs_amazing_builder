import { DEFAULT_REQUEST_COLUMN_ORDER } from './requestColumns';
import {
  DEFAULT_API_KEY_EXAMPLE,
  DEFAULT_API_KEY_HEADER,
  DEFAULT_BASIC_PASSWORD,
  DEFAULT_BASIC_USERNAME,
  DEFAULT_BEARER_TOKEN_EXAMPLE
} from './requestHeaders';
import { ERROR_CATALOG_BY_CODE } from './errorCatalog';
import type { DocSection, ParsedRow, ParsedSectionType } from './types';

export const DEFAULT_SECTION_TITLE = 'Новая секция';

function normalizeRow(row: ParsedRow): ParsedRow {
  const normalizedField = row.field ?? '';

  return {
    ...row,
    field: normalizedField,
    sourceField: row.sourceField ?? (row.origin === 'manual' ? undefined : normalizedField),
    clientField: row.clientField ?? '',
    clientSourceField: row.clientSourceField ?? undefined,
    origin: row.origin ?? 'parsed',
    enabled: row.enabled ?? true,
    type: row.type ?? '',
    required: row.required ?? '',
    description: row.description ?? '',
    example: row.example ?? '',
    maskInLogs: row.maskInLogs ?? false
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

export function resolveSectionTitle(title: string | null | undefined): string {
  const trimmed = (title ?? '').trim();
  return trimmed || DEFAULT_SECTION_TITLE;
}

function normalizeInternalCode(internalCode: string): string {
  const trimmed = internalCode.trim();
  if (trimmed === 'payments.transfer.validation.amount.invalid') {
    return '100101';
  }
  return trimmed;
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

export function sanitizeSections(sections: DocSection[]): DocSection[] {
  return sections
    .filter((section) => section.id !== 'external-url')
    .map((section) => {
    if (section.kind === 'errors') {
      return {
        ...section,
        title: resolveSectionTitle(section.title),
        rows: (section.rows ?? []).map((row) => {
          const normalizedInternalCode = normalizeInternalCode(row.internalCode ?? '');
          const preset = ERROR_CATALOG_BY_CODE.get(normalizedInternalCode);
          const legacyClientResponse = row.clientResponse ?? '';
          const normalizedClientResponseCode = row.clientResponseCode ?? '';
          const useLegacyClientResponseAsCode = !normalizedClientResponseCode.trim() && looksLikeJson(legacyClientResponse);

          return {
            clientHttpStatus: row.clientHttpStatus ?? '',
            clientResponse: useLegacyClientResponseAsCode ? '' : legacyClientResponse,
            clientResponseCode: useLegacyClientResponseAsCode ? legacyClientResponse : normalizedClientResponseCode,
            trigger: row.trigger ?? '',
            errorType: row.errorType ?? '-',
            serverHttpStatus: row.errorType === 'BusinessException' ? '422' : (preset?.httpStatus ?? row.serverHttpStatus ?? ''),
            internalCode: normalizedInternalCode,
            message: preset?.message ?? row.message ?? '',
            responseCode: row.responseCode ?? ''
          };
        }),
        validationRules: (section.validationRules ?? []).map((rule) => ({
          parameter: rule.parameter ?? '',
          validationCase: rule.validationCase ?? '',
          condition: rule.condition ?? '',
          cause: rule.cause ?? ''
        }))
      };
    }

    if (section.kind === 'text' && section.id === 'errors') {
      const legacyTrigger = section.value?.trim() ?? '';

      return {
        id: section.id,
        title: resolveSectionTitle(section.title),
        enabled: section.enabled,
        kind: 'errors',
        rows: [
          {
            clientHttpStatus: '',
            clientResponse: '',
            clientResponseCode: '',
            trigger: legacyTrigger,
            errorType: '-',
            serverHttpStatus: '',
            internalCode: '',
            message: '',
            responseCode: ''
          }
        ],
        validationRules: []
      };
    }

    if (section.kind === 'diagram') {
      return {
        ...section,
        title: resolveSectionTitle(section.title),
        diagrams: (section.diagrams ?? []).map((diagram, index) => ({
          id: diagram.id || `diagram-${Date.now()}-${index}`,
          title: diagram.title ?? '',
          engine: diagram.engine === 'plantuml' ? 'plantuml' : 'mermaid',
          code: diagram.code ?? '',
          description: diagram.description ?? ''
        }))
      };
    }

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
      const normalizedFormat = normalizedSection.format === 'curl' ? 'curl' : 'json';
      const normalizedRows = Array.isArray(normalizedSection.rows) ? normalizedSection.rows.map(normalizeRow) : [];

      return {
        ...normalizedSection,
        format: normalizedFormat,
        input: normalizedSection.input ?? '',
        error: normalizedSection.error ?? '',
        schemaInput: normalizedSection.schemaInput ?? '',
        sectionType: resolveParsedSectionType(normalizedSection),
        title: resolveSectionTitle(normalizedSection.title),
        lastSyncedFormat: normalizedSection.lastSyncedFormat ?? normalizedFormat,
        rows: normalizedRows
      };
    }

    const sectionType = resolveParsedSectionType(normalizedSection);
    const normalizedFormat = normalizedSection.format === 'curl' ? 'curl' : 'json';
    const normalizedRows = Array.isArray(normalizedSection.rows) ? normalizedSection.rows.map(normalizeRow) : [];

    return {
      ...normalizedSection,
      sectionType,
      format: normalizedFormat,
      input: normalizedSection.input ?? '',
      error: normalizedSection.error ?? '',
      schemaInput: normalizedSection.schemaInput ?? '',
      title: resolveSectionTitle(normalizedSection.title),
      lastSyncedFormat: normalizedSection.lastSyncedFormat ?? normalizedFormat,
      rows: normalizedRows,
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

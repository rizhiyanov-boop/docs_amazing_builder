import type { ParsedCurlMeta } from './parsers';
import { buildInputFromRows } from './sourceSync';
import type { ParseFormat, ParsedRow, ParsedSection } from './types';

export type ParseTarget = 'server' | 'client';

function isRequestSection(section: ParsedSection): boolean {
  return section.sectionType === 'request';
}

function isDualModelSection(section: ParsedSection): boolean {
  return section.sectionType === 'request' || section.sectionType === 'response';
}

function normalizeRowsAfterSync(rows: ParsedRow[]): ParsedRow[] {
  return rows.map((row) =>
    row.origin === 'generated'
      ? row
      : { ...row, sourceField: row.field, origin: row.origin === 'manual' ? 'parsed' : row.origin }
  );
}

export function getSourceValue(section: ParsedSection, target: ParseTarget): string {
  return target === 'client' && isDualModelSection(section) ? section.clientInput ?? '' : section.input;
}

export function getSourceFormat(section: ParsedSection, target: ParseTarget): ParseFormat {
  return target === 'client' && isDualModelSection(section) ? section.clientFormat ?? 'json' : section.format;
}

export function detectSourceFormat(draft: string): ParseFormat | null {
  const trimmed = draft.trim();
  if (!trimmed) return null;

  if (/^curl(?:\s|$)/i.test(trimmed)) return 'curl';

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      return null;
    }
  }

  return null;
}

export function validateSourceDraft(format: ParseFormat, draft: string): string {
  if (format !== 'json') return '';
  if (!draft.trim()) return '';

  try {
    JSON.parse(draft);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : 'Некорректный JSON';
  }
}

export function beautifySourceDraft(format: ParseFormat, draft: string): string {
  if (format === 'json') return JSON.stringify(JSON.parse(draft), null, 2);
  return draft.trim();
}

export function applyDetectedSourceFormatToSection(
  section: ParsedSection,
  target: ParseTarget,
  draft: string
): { nextSection: ParsedSection; format: ParseFormat } {
  const currentFormat = getSourceFormat(section, target);
  const detectedFormat = detectSourceFormat(draft);
  if (!detectedFormat || detectedFormat === currentFormat) {
    return { nextSection: section, format: currentFormat };
  }

  if (target === 'client' && isDualModelSection(section)) {
    return {
      nextSection: { ...section, clientFormat: detectedFormat, clientError: '' },
      format: detectedFormat
    };
  }

  return {
    nextSection: { ...section, format: detectedFormat, error: '' },
    format: detectedFormat
  };
}

export function buildSectionAfterParseSuccess(
  section: ParsedSection,
  target: ParseTarget,
  format: ParseFormat,
  input: string,
  rows: ParsedRow[],
  curlMeta: ParsedCurlMeta | null
): ParsedSection {
  if (target === 'client' && isDualModelSection(section)) {
    return {
      ...section,
      clientFormat: format,
      clientInput: input,
      clientRows: rows,
      clientError: '',
      clientLastSyncedFormat: format,
      externalRequestUrl: isRequestSection(section) ? curlMeta?.url ?? section.externalRequestUrl ?? '' : section.externalRequestUrl,
      externalRequestMethod: isRequestSection(section) ? curlMeta?.method ?? section.externalRequestMethod ?? 'POST' : section.externalRequestMethod
    };
  }

  return {
    ...section,
    format,
    input,
    rows,
    error: '',
    lastSyncedFormat: format,
    requestUrl: isRequestSection(section) ? curlMeta?.url ?? section.requestUrl ?? '' : section.requestUrl,
    requestMethod: isRequestSection(section) ? curlMeta?.method ?? section.requestMethod ?? 'POST' : section.requestMethod
  };
}

export function buildSectionAfterParseFailure(
  section: ParsedSection,
  target: ParseTarget,
  format: ParseFormat,
  input: string,
  message: string
): ParsedSection {
  if (target === 'client' && isDualModelSection(section)) {
    return {
      ...section,
      clientFormat: format,
      clientInput: input,
      clientRows: [],
      clientError: message
    };
  }

  return {
    ...section,
    format,
    input,
    rows: [],
    error: message
  };
}

export function buildSectionAfterSourceSave(
  section: ParsedSection,
  target: ParseTarget,
  format: ParseFormat,
  draft: string
): ParsedSection {
  if (target === 'client' && isDualModelSection(section)) {
    return { ...section, clientFormat: format, clientInput: draft, clientError: '' };
  }

  return { ...section, format, input: draft, error: '' };
}

export function buildSectionAfterSyncInput(
  section: ParsedSection,
  target: ParseTarget,
  externalSourceRows: ParsedRow[],
  requestHeaderRowsForEditor: ParsedRow[]
): ParsedSection {
  if (target === 'client' && isDualModelSection(section)) {
    const clientRows = section.clientRows ?? [];
    return {
      ...section,
      clientInput: buildInputFromRows(section.clientFormat ?? 'json', externalSourceRows, {
        requestUrl: section.externalRequestUrl,
        requestMethod: section.externalRequestMethod
      }),
      clientLastSyncedFormat: section.clientFormat ?? 'json',
      clientRows: normalizeRowsAfterSync(clientRows)
    };
  }

  const serverRows = isRequestSection(section)
    ? [...requestHeaderRowsForEditor.filter((row) => row.enabled !== false), ...section.rows.filter((row) => row.source !== 'header')]
    : section.rows;

  return {
    ...section,
    input: buildInputFromRows(section.format, serverRows, {
      requestUrl: section.requestUrl,
      requestMethod: section.requestMethod
    }),
    lastSyncedFormat: section.format,
    rows: normalizeRowsAfterSync(section.rows)
  };
}

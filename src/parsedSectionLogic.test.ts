import { describe, expect, it } from 'vitest';
import {
  applyDetectedSourceFormatToSection,
  beautifySourceDraft,
  buildSectionAfterParseFailure,
  buildSectionAfterParseSuccess,
  buildSectionAfterSourceSave,
  buildSectionAfterSyncInput,
  detectSourceFormat,
  getSourceFormat,
  getSourceValue,
  validateSourceDraft
} from './parsedSectionLogic';
import type { ParsedRow, ParsedSection } from './types';

function createSection(): ParsedSection {
  return {
    id: 'request',
    title: 'Request',
    enabled: true,
    kind: 'parsed',
    sectionType: 'request',
    format: 'curl',
    lastSyncedFormat: 'curl',
    input: 'curl -X POST "https://api.example.com/source"',
    rows: [
      {
        field: 'name',
        sourceField: 'name',
        origin: 'manual',
        type: 'string',
        required: '+',
        description: '',
        example: '"demo"',
        source: 'body'
      }
    ],
    error: '',
    domainModelEnabled: true,
    clientFormat: 'json',
    clientLastSyncedFormat: 'json',
    clientInput: '{\n  "clientName": "demo"\n}',
    clientRows: [
      {
        field: 'clientName',
        sourceField: 'clientName',
        origin: 'manual',
        type: 'string',
        required: '+',
        description: '',
        example: '"demo"',
        source: 'body'
      }
    ],
    clientError: '',
    clientMappings: {},
    authType: 'none',
    authHeaderName: 'Authorization',
    authTokenExample: '',
    authUsername: '',
    authPassword: '',
    authApiKeyExample: '',
    requestUrl: 'https://api.example.com/source',
    requestMethod: 'POST',
    requestProtocol: 'REST',
    externalRequestUrl: 'https://external.example.com/source',
    externalRequestMethod: 'POST',
    externalAuthType: 'none',
    externalAuthHeaderName: 'X-API-Key',
    externalAuthTokenExample: '',
    externalAuthUsername: '',
    externalAuthPassword: '',
    externalAuthApiKeyExample: ''
  };
}

describe('parsedSectionLogic', () => {
  it('detects source formats and validates json drafts', () => {
    expect(detectSourceFormat('curl -X GET "https://example.com"')).toBe('curl');
    expect(detectSourceFormat('{"id":1}')).toBe('json');
    expect(validateSourceDraft('json', '{"id":1}')).toBe('');
    expect(validateSourceDraft('json', '{"id":}')).not.toBe('');
  });

  it('reads correct source value and format by target', () => {
    const section = createSection();

    expect(getSourceValue(section, 'server')).toContain('curl');
    expect(getSourceValue(section, 'client')).toContain('clientName');
    expect(getSourceFormat(section, 'server')).toBe('curl');
    expect(getSourceFormat(section, 'client')).toBe('json');
  });

  it('applies detected format and source save without touching unrelated side', () => {
    const section = createSection();

    const { nextSection, format } = applyDetectedSourceFormatToSection(section, 'server', '{"id":1}');
    const saved = buildSectionAfterSourceSave(nextSection, 'server', format, '{"id":1}');

    expect(format).toBe('json');
    expect(saved.format).toBe('json');
    expect(saved.input).toBe('{"id":1}');
    expect(saved.clientInput).toContain('clientName');
  });

  it('builds parsed section updates for parse success and failure', () => {
    const section = createSection();
    const rows: ParsedRow[] = [
      {
        field: 'id',
        sourceField: 'id',
        origin: 'parsed',
        type: 'int',
        required: '+',
        description: '',
        example: '1',
        source: 'body'
      }
    ];

    const success = buildSectionAfterParseSuccess(section, 'server', 'json', '{"id":1}', rows, {
      url: 'https://api.example.com/items',
      method: 'PATCH'
    });
    const failure = buildSectionAfterParseFailure(section, 'client', 'json', '{"id":}', 'Некорректный JSON');

    expect(success.rows).toEqual(rows);
    expect(success.requestMethod).toBe('PATCH');
    expect(success.requestUrl).toBe('https://api.example.com/items');
    expect(failure.clientRows).toEqual([]);
    expect(failure.clientError).toBe('Некорректный JSON');
  });

  it('syncs input from rows and normalizes row origins', () => {
    const section = createSection();
    const syncedClient = buildSectionAfterSyncInput(section, 'client', section.clientRows ?? [], []);
    const syncedServer = buildSectionAfterSyncInput(section, 'server', [], []);

    expect(syncedClient.clientInput).toContain('clientName');
    expect(syncedClient.clientRows?.[0].origin).toBe('parsed');
    expect(syncedClient.clientRows?.[0].sourceField).toBe('clientName');
    expect(syncedServer.input).toContain('https://api.example.com/source');
    expect(syncedServer.rows[0].origin).toBe('parsed');
  });

  it('beautifies json drafts', () => {
    expect(beautifySourceDraft('json', '{"id":1}')).toContain('\n');
    expect(beautifySourceDraft('curl', '  curl test  ')).toBe('curl test');
  });
});

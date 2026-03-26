import type { DocSection, ParsedRow, ParsedSection } from '../types';

export function makeParsedRow(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    field: 'id',
    sourceField: 'id',
    origin: 'parsed',
    enabled: true,
    type: 'int',
    required: '+',
    description: 'Identifier',
    example: '1',
    source: 'parsed',
    ...overrides
  };
}

export function makeRequestSection(overrides: Partial<ParsedSection> = {}): ParsedSection {
  return {
    id: 'request',
    title: 'Request',
    enabled: true,
    kind: 'parsed',
    sectionType: 'request',
    format: 'json',
    input: '',
    rows: [],
    error: '',
    domainModelEnabled: true,
    clientFormat: 'json',
    clientInput: '',
    clientRows: [],
    clientError: '',
    clientMappings: {},
    authType: 'none',
    authHeaderName: 'X-API-Key',
    authTokenExample: 'token',
    authUsername: 'user',
    authPassword: 'pass',
    authApiKeyExample: 'key',
    requestUrl: 'https://api.example.com/method',
    requestMethod: 'POST',
    requestProtocol: 'REST',
    externalRequestUrl: '',
    externalRequestMethod: 'POST',
    externalAuthType: 'none',
    externalAuthHeaderName: 'X-API-Key',
    externalAuthTokenExample: 'token',
    externalAuthUsername: 'user',
    externalAuthPassword: 'pass',
    externalAuthApiKeyExample: 'key',
    ...overrides
  };
}

export function makeResponseSection(overrides: Partial<ParsedSection> = {}): ParsedSection {
  return {
    ...makeRequestSection({
      id: 'response',
      title: 'Response',
      sectionType: 'response',
      requestUrl: undefined,
      requestMethod: undefined,
      requestProtocol: undefined
    }),
    ...overrides
  };
}

export function makeSectionsForRender(): DocSection[] {
  return [
    { id: 'goal', title: 'Цель', enabled: true, kind: 'text', value: 'Тестовая цель' },
    makeRequestSection({
      rows: [makeParsedRow({ field: 'requestId', type: 'string', required: '+', description: 'Request id', example: 'req-1' })]
    }),
    makeResponseSection({
      rows: [makeParsedRow({ field: 'status', type: 'string', required: '+', description: 'Status', example: 'OK' })]
    })
  ];
}

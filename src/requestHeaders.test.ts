import { describe, expect, it } from 'vitest';
import {
  getMappedClientField,
  getRequestHeaderRows,
  getRequestRows,
  isAuthHeader
} from './requestHeaders';
import type { ParsedSection } from './types';

function createRequestSection(): ParsedSection {
  return {
    id: 'request',
    title: 'Request',
    enabled: true,
    kind: 'parsed',
    sectionType: 'request',
    format: 'curl',
    lastSyncedFormat: 'curl',
    input: '',
    rows: [
      {
        field: 'customerId',
        sourceField: 'customerId',
        origin: 'parsed',
        type: 'string',
        required: '+',
        description: '',
        example: '"123"',
        source: 'body'
      },
      {
        field: 'X-Correlation-Id',
        sourceField: 'X-Correlation-Id',
        origin: 'parsed',
        enabled: true,
        type: 'string',
        required: '+',
        description: '',
        example: 'abc',
        source: 'header'
      }
    ],
    error: '',
    domainModelEnabled: true,
    clientFormat: 'json',
    clientLastSyncedFormat: 'json',
    clientInput: '',
    clientRows: [
      {
        field: 'clientId',
        sourceField: 'clientId',
        origin: 'parsed',
        type: 'string',
        required: '+',
        description: '',
        example: '"123"',
        source: 'body'
      },
      {
        field: 'extraClientField',
        sourceField: 'extraClientField',
        origin: 'manual',
        type: 'string',
        required: '-',
        description: '',
        example: '"x"',
        source: 'body'
      }
    ],
    clientError: '',
    clientMappings: {
      customerId: 'clientId'
    },
    authType: 'bearer',
    authHeaderName: 'Authorization',
    authTokenExample: 'token-123',
    authUsername: 'user',
    authPassword: 'pass',
    authApiKeyExample: 'key',
    requestUrl: 'https://api.example.com',
    requestMethod: 'POST',
    requestProtocol: 'REST',
    externalRequestUrl: '',
    externalRequestMethod: 'POST',
    externalAuthType: 'none',
    externalAuthHeaderName: 'X-API-Key',
    externalAuthTokenExample: '',
    externalAuthUsername: '',
    externalAuthPassword: '',
    externalAuthApiKeyExample: ''
  };
}

describe('requestHeaders', () => {
  it('adds default and auth headers for request editor', () => {
    const section = createRequestSection();

    const headers = getRequestHeaderRows(section);

    expect(headers.some((row) => row.field === 'X-CLIENT-ID')).toBe(true);
    expect(headers.some((row) => row.field === 'Authorization' && isAuthHeader(section, row))).toBe(true);
    expect(headers.some((row) => row.field === 'X-Correlation-Id')).toBe(true);
  });

  it('merges mapped client fields into request rows and keeps unmapped client rows', () => {
    const section = createRequestSection();

    const rows = getRequestRows(section);
    const mappedRow = rows.find((row) => row.field === 'customerId');
    const unmappedClientRow = rows.find((row) => row.clientField === 'extraClientField');

    expect(mappedRow).toBeDefined();
    expect(getMappedClientField(section, mappedRow!)).toBe('clientId');
    expect(mappedRow?.clientField).toBe('clientId');
    expect(unmappedClientRow?.field).toBe('');
  });
});

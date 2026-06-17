import { describe, expect, it } from 'vitest';
import {
  getEditorRequestRows,
  getInputDriftRows,
  getMappingOptions,
  getRequestAuthInfo,
  getRequestHeaderRows,
  hasInputDrift,
  requestHasRows,
  splitRequestRows
} from './requestHeaders';
import { normalizeParsedRowsForSection } from './sectionHelpers';
import { makeParsedRow, makeRequestSection, makeResponseSection } from './test/fixtures';

describe('requestHeaders', () => {
  it('detects and returns input drift rows', () => {
    const rows = [
      makeParsedRow({ field: 'id', sourceField: 'id', origin: 'parsed' }),
      makeParsedRow({ field: 'user_id', sourceField: 'userId', origin: 'parsed' }),
      makeParsedRow({ field: 'manualField', origin: 'manual', sourceField: undefined })
    ];

    expect(hasInputDrift(rows)).toBe(true);
    expect(getInputDriftRows(rows)).toHaveLength(2);
  });

  it('does not treat shortened xml display paths as input drift', () => {
    const rows = [
      makeParsedRow({ field: '@requestId', sourceField: 'CustomerInfoRequest.@requestId', origin: 'parsed' }),
      makeParsedRow({ field: 'Header.SourceSystem', sourceField: 'CustomerInfoRequest.Header.SourceSystem', origin: 'parsed' })
    ];

    expect(hasInputDrift(rows)).toBe(false);
    expect(getInputDriftRows(rows)).toHaveLength(0);
  });

  it('splits headers, url and non-header rows', () => {
    const rows = [
      makeParsedRow({ field: 'X-Trace-Id', source: 'header' }),
      makeParsedRow({ field: 'request.url', source: 'url', example: 'https://api.example.com' }),
      makeParsedRow({ field: 'payload.id', source: 'parsed' })
    ];

    const split = splitRequestRows(rows);
    expect(split.headers).toHaveLength(1);
    expect(split.urlRow?.field).toBe('request.url');
    expect(split.otherRows).toHaveLength(1);
  });

  it('returns auth info for bearer mode', () => {
    const section = makeRequestSection({
      authType: 'bearer',
      authTokenExample: 'token-123'
    });
    const auth = getRequestAuthInfo(section);

    expect(auth).not.toBeNull();
    expect(auth?.headerName).toBe('Authorization');
    expect(auth?.example).toContain('Bearer token-123');
  });

  it('returns prioritized mapping options by similarity', () => {
    const section = makeRequestSection({
      clientRows: [
        makeParsedRow({ field: 'orderId', sourceField: 'orderId' }),
        makeParsedRow({ field: 'customerId', sourceField: 'customerId' }),
        makeParsedRow({ field: 'id', sourceField: 'id' })
      ]
    });

    const options = getMappingOptions(section, 'customerId');
    expect(options[0]?.field).toBe('customerId');
  });

  it('normalizes json request rows by server and client http methods', () => {
    const section = makeRequestSection({
      requestMethod: 'GET',
      externalRequestMethod: 'POST'
    });

    const serverRows = normalizeParsedRowsForSection(section, [makeParsedRow({ field: 'employeeId', source: undefined })], { requestMethod: 'GET' });
    const clientRows = normalizeParsedRowsForSection(section, [makeParsedRow({ field: 'employeeId', source: undefined })], { requestMethod: 'POST' });

    expect(serverRows[0]?.source).toBe('query');
    expect(clientRows[0]?.source).toBe('body');
  });

  it('keeps get server to post client mapping rows visible', () => {
    const section = makeRequestSection({
      requestMethod: 'GET',
      externalRequestMethod: 'POST',
      rows: [
        makeParsedRow({ field: 'employeeId', sourceField: 'employeeId', source: 'query' })
      ],
      clientRows: [
        makeParsedRow({ field: 'employeeId', sourceField: 'employeeId', source: 'body' }),
        makeParsedRow({ field: 'includeInactive', sourceField: 'includeInactive', source: 'body' })
      ],
      clientMappings: {
        employeeId: 'employeeId'
      }
    });

    const rows = getEditorRequestRows(section);

    expect(rows.find((row) => row.field === 'employeeId')).toMatchObject({
      source: 'query',
      clientField: 'employeeId'
    });
    expect(rows.find((row) => row.clientField === 'includeInactive')).toMatchObject({
      field: '',
      source: 'body'
    });
  });

  it('injects default request headers', () => {
    const section = makeRequestSection({ rows: [] });
    const headers = getRequestHeaderRows(section);
    expect(headers.some((row) => row.field === 'X-CLIENT-ID')).toBe(true);
  });

  it('correctly reports when section has rows', () => {
    const emptyResponse = makeResponseSection({ rows: [], clientRows: [] });
    expect(requestHasRows(emptyResponse)).toBe(false);

    const responseWithRows = makeResponseSection({ rows: [makeParsedRow({ field: 'status' })], clientRows: [] });
    expect(requestHasRows(responseWithRows)).toBe(true);
  });
});

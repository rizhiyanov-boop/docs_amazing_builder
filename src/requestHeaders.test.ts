import { describe, expect, it } from 'vitest';
import {
  getInputDriftRows,
  getMappingOptions,
  getRequestAuthInfo,
  getRequestHeaderRows,
  hasInputDrift,
  requestHasRows,
  splitRequestRows
} from './requestHeaders';
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

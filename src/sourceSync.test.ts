import { describe, expect, it } from 'vitest';
import { buildInputFromRows } from './sourceSync';
import { makeParsedRow } from './test/fixtures';

describe('sourceSync', () => {
  it('builds json from rows with nested paths and typed values', () => {
    const rows = [
      makeParsedRow({ field: 'user.id', type: 'int', example: '42' }),
      makeParsedRow({ field: 'user.name', type: 'string', example: 'Alice' }),
      makeParsedRow({ field: 'user.active', type: 'boolean', example: 'true' }),
      makeParsedRow({ field: 'meta.tags', type: 'array', example: '["a","b"]' })
    ];

    const result = buildInputFromRows('json', rows);
    const parsed = JSON.parse(result) as {
      user: { id: number; name: string; active: boolean };
      meta: { tags: string[] };
    };

    expect(parsed.user.id).toBe(42);
    expect(parsed.user.name).toBe('Alice');
    expect(parsed.user.active).toBe(true);
    expect(parsed.meta.tags).toEqual(['a', 'b']);
  });

  it('ignores header and url rows when building json', () => {
    const rows = [
      makeParsedRow({ field: 'request.url', source: 'url', example: 'https://api.example.com' }),
      makeParsedRow({ field: 'X-Trace-Id', source: 'header', example: 'abc-123' }),
      makeParsedRow({ field: 'payload.id', source: 'parsed', type: 'int', example: '7' })
    ];

    const parsed = JSON.parse(buildInputFromRows('json', rows)) as { payload: { id: number } };
    expect(parsed).toEqual({ payload: { id: 7 } });
  });

  it('builds curl command with headers, method and url', () => {
    const rows = [
      makeParsedRow({ field: 'X-Trace-Id', source: 'header', example: 'abc-123', type: 'string' }),
      makeParsedRow({ field: 'request.url', source: 'url', example: 'https://api.example.com/from-row', type: 'string' }),
      makeParsedRow({ field: 'userId', source: 'parsed', type: 'int', example: '100' })
    ];

    const curl = buildInputFromRows('curl', rows, {
      requestMethod: 'PATCH',
      requestUrl: 'https://api.example.com/override'
    });

    expect(curl).toContain('curl -X PATCH');
    expect(curl).toContain('"https://api.example.com/override"');
    expect(curl).toContain('-H "X-Trace-Id: abc-123"');
    expect(curl).toContain('--data-raw');
  });

  it('uses default curl url when url is missing', () => {
    const curl = buildInputFromRows('curl', [makeParsedRow({ field: 'id', type: 'int', example: '1' })]);
    expect(curl).toContain('"https://example.com"');
  });
});

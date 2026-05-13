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
      makeParsedRow({ field: 'search', source: 'query', example: 'invoice-1' }),
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

  it('builds get curl with query params in url and without body', () => {
    const rows = [
      makeParsedRow({ field: 'request.url', source: 'url', example: 'https://api.example.com/items', type: 'string' }),
      makeParsedRow({ field: 'page', source: 'query', type: 'int', example: '2' }),
      makeParsedRow({ field: 'search', source: 'query', type: 'string', example: 'invoice' })
    ];

    const curl = buildInputFromRows('curl', rows, {
      requestMethod: 'GET',
      requestUrl: 'https://api.example.com/items'
    });

    expect(curl).toContain('curl -X GET');
    expect(curl).toContain('"https://api.example.com/items?page=2&search=invoice"');
    expect(curl).not.toContain('--data-raw');
  });

  it('keeps string examples as plain text instead of json parsing', () => {
    const rows = [
      makeParsedRow({ field: 'note', type: 'string', example: '{"raw":true}', source: 'parsed' })
    ];
    const parsed = JSON.parse(buildInputFromRows('json', rows)) as { note: string };
    expect(parsed.note).toBe('{"raw":true}');
  });

  it('escapes single quotes in curl body payload', () => {
    const rows = [makeParsedRow({ field: 'author', type: 'string', example: "O'Reilly", source: 'parsed' })];
    const curl = buildInputFromRows('curl', rows, { requestMethod: 'POST' });
    expect(curl).toContain("--data-raw '{");
    expect(curl).toContain("O'\"'\"'Reilly");
  });

  it('uses default curl url when url is missing', () => {
    const curl = buildInputFromRows('curl', [makeParsedRow({ field: 'id', type: 'int', example: '1' })]);
    expect(curl).toContain('"https://example.com"');
  });

  it('builds root array json from $[index] fields', () => {
    const rows = [
      makeParsedRow({ field: '$[0].id', type: 'int', example: '1' }),
      makeParsedRow({ field: '$[0].name', type: 'string', example: 'Alpha' }),
      makeParsedRow({ field: '$[1].id', type: 'int', example: '2' })
    ];

    const parsed = JSON.parse(buildInputFromRows('json', rows)) as Array<{ id: number; name?: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toEqual({ id: 1, name: 'Alpha' });
    expect(parsed[1]).toEqual({ id: 2 });
  });

  it('builds root array json from [index] shorthand fields', () => {
    const rows = [
      makeParsedRow({ field: '[0].name', type: 'string', example: 'One' }),
      makeParsedRow({ field: '[1].name', type: 'string', example: 'Two' })
    ];

    const parsed = JSON.parse(buildInputFromRows('json', rows)) as Array<{ name: string }>;
    expect(parsed).toEqual([{ name: 'One' }, { name: 'Two' }]);
  });
});

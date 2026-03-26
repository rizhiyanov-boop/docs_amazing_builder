import { describe, expect, it } from 'vitest';
import { parseCurlMeta, parseToRows } from './parsers';

describe('parsers', () => {
  it('parses nested json to flattened rows', () => {
    const rows = parseToRows('json', '{"id":1,"user":{"name":"Alice"},"items":[{"active":true}]}');

    expect(rows.some((row) => row.field === 'id' && row.type === 'int')).toBe(true);
    expect(rows.some((row) => row.field === 'user.name' && row.type === 'string')).toBe(true);
    expect(rows.some((row) => row.field === 'items' && row.type === 'array_object')).toBe(true);
    expect(rows.some((row) => row.field === 'items[0].active' && row.type === 'boolean')).toBe(true);
  });

  it('parses curl payload, headers and url', () => {
    const curl =
      "curl -X POST \"https://api.example.com/method\" -H \"X-Trace-Id: 123\" -H \"Content-Type: application/json\" --data-raw '{\"id\":123,\"ok\":true}'";

    const rows = parseToRows('curl', curl);

    expect(rows.some((row) => row.source === 'url' && row.example === 'https://api.example.com/method')).toBe(true);
    expect(rows.some((row) => row.source === 'header' && row.field === 'X-Trace-Id')).toBe(true);
    expect(rows.some((row) => row.source === 'body' && row.field === 'id' && row.type === 'int')).toBe(true);
    expect(rows.some((row) => row.source === 'body' && row.field === 'ok' && row.type === 'boolean')).toBe(true);
  });

  it('extracts curl metadata (method and url)', () => {
    const meta = parseCurlMeta('curl -X PATCH "https://example.com/v1/user/42"');
    expect(meta.method).toBe('PATCH');
    expect(meta.url).toBe('https://example.com/v1/user/42');
  });

  it('throws when input is empty', () => {
    expect(() => parseToRows('json', '   ')).toThrow('Поле ввода пустое');
  });

  it('handles large payload for mvp stability', () => {
    const largeObject: Record<string, number> = {};
    for (let index = 0; index < 1200; index += 1) {
      largeObject[`field_${index}`] = index;
    }

    const rows = parseToRows('json', JSON.stringify(largeObject));
    expect(rows.length).toBe(1200);
    expect(rows[0].origin).toBe('parsed');
  });
});

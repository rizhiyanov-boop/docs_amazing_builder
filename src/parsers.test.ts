import { describe, expect, it } from 'vitest';
import { parseCurlMeta, parseJsonSchemaToRows, parseToRows } from './parsers';

describe('parsers', () => {
  it('parses nested json to flattened rows', () => {
    const rows = parseToRows('json', '{"id":1,"user":{"name":"Alice"},"items":[{"active":true}]}');

    expect(rows.some((row) => row.field === 'id' && row.type === 'int')).toBe(true);
    expect(rows.some((row) => row.field === 'user' && row.type === 'object')).toBe(true);
    expect(rows.some((row) => row.field === 'user.name' && row.type === 'string')).toBe(true);
    expect(rows.some((row) => row.field === 'items' && row.type === 'array_object')).toBe(true);
    expect(rows.some((row) => row.field === 'items[0]' && row.type === 'object')).toBe(true);
    expect(rows.some((row) => row.field === 'items[0].active' && row.type === 'boolean')).toBe(true);
  });

  it('keeps quoted numbers as string in json payload', () => {
    const rows = parseToRows('json', '{"externalId":"123","amount":123}');

    expect(rows.some((row) => row.field === 'externalId' && row.type === 'string')).toBe(true);
    expect(rows.some((row) => row.field === 'amount' && row.type === 'int')).toBe(true);
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

  it('keeps quoted numbers as string in curl json body', () => {
    const curl =
      "curl -X POST \"https://api.example.com/method\" --data-raw '{\"externalId\":\"123\",\"amount\":123}'";

    const rows = parseToRows('curl', curl);

    expect(rows.some((row) => row.source === 'body' && row.field === 'externalId' && row.type === 'string')).toBe(true);
    expect(rows.some((row) => row.source === 'body' && row.field === 'amount' && row.type === 'int')).toBe(true);
  });

  it('extracts curl metadata (method and url)', () => {
    const meta = parseCurlMeta('curl -X PATCH "https://example.com/v1/user/42"');
    expect(meta.method).toBe('PATCH');
    expect(meta.url).toBe('https://example.com/v1/user/42');
  });

  it('extracts query params from get curl url', () => {
    const curl = 'curl -X GET "https://example.com/v1/items?page=2&search=invoice"';
    const rows = parseToRows('curl', curl);
    const meta = parseCurlMeta(curl);

    expect(meta.method).toBe('GET');
    expect(meta.url).toBe('https://example.com/v1/items');
    expect(rows.some((row) => row.source === 'url' && row.example === 'https://example.com/v1/items')).toBe(true);
    expect(rows.some((row) => row.source === 'query' && row.field === 'page' && row.example === '2')).toBe(true);
    expect(rows.some((row) => row.source === 'query' && row.field === 'search' && row.example === 'invoice')).toBe(true);
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

  it('parses json schema to flattened rows', () => {
    const schema = JSON.stringify({
      type: 'object',
      required: ['globId', 'items'],
      properties: {
        globId: { type: 'string', description: 'Global ID' },
        amount: { type: 'number' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'integer' },
              active: { type: 'boolean' }
            }
          }
        }
      }
    });

    const rows = parseJsonSchemaToRows(schema);

    expect(rows.some((row) => row.field === 'globId' && row.type === 'string' && row.required === '+')).toBe(true);
    expect(rows.some((row) => row.field === 'amount' && row.type === 'number' && row.required === '-')).toBe(true);
    expect(rows.some((row) => row.field === 'items' && row.type === 'array_object')).toBe(true);
    expect(rows.some((row) => row.field === 'items[0]' && row.type === 'object')).toBe(true);
    expect(rows.some((row) => row.field === 'items[0].id' && row.type === 'int')).toBe(true);
    expect(rows.some((row) => row.field === 'items[0].active' && row.type === 'boolean')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { parseCurlMeta, parseToRows } from './parsers';

describe('parsers', () => {
  it('flattens nested json into parsed rows', () => {
    const rows = parseToRows(
      'json',
      JSON.stringify({
        user: {
          id: 7,
          profile: {
            active: true
          }
        },
        tags: [{ code: 'vip' }]
      })
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'user.id', type: 'int', example: '7' }),
        expect.objectContaining({ field: 'user.profile.active', type: 'boolean', example: 'true' }),
        expect.objectContaining({ field: 'tags', type: 'array_object' }),
        expect.objectContaining({ field: 'tags[0].code', type: 'string', example: '"vip"' })
      ])
    );
  });

  it('extracts curl body headers and url rows', () => {
    const rows = parseToRows(
      'curl',
      `curl -X POST "https://api.example.com/payments" -H "X-Trace-Id: 42" --data-raw '{"amount":100,"confirmed":true}'`
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'X-Trace-Id', source: 'header', type: 'int', example: '42' }),
        expect.objectContaining({ field: 'amount', source: 'body', type: 'int', example: '100' }),
        expect.objectContaining({ field: 'confirmed', source: 'body', type: 'boolean', example: 'true' }),
        expect.objectContaining({ field: 'request.url', source: 'url', example: 'https://api.example.com/payments' })
      ])
    );
  });

  it('extracts curl meta and defaults request method when only url is present', () => {
    const meta = parseCurlMeta('curl "https://api.example.com/profile"');

    expect(meta).toEqual({
      method: 'POST',
      url: 'https://api.example.com/profile'
    });
  });
});

import { describe, expect, it } from 'vitest';
import { buildInputFromRows } from './sourceSync';
import type { ParsedRow } from './types';

describe('sourceSync', () => {
  it('rebuilds nested json payload from rows', () => {
    const rows: ParsedRow[] = [
      {
        field: 'user.id',
        sourceField: 'user.id',
        origin: 'parsed',
        type: 'int',
        required: '+',
        description: '',
        example: '12'
      },
      {
        field: 'user.flags.active',
        sourceField: 'user.flags.active',
        origin: 'parsed',
        type: 'boolean',
        required: '+',
        description: '',
        example: 'true'
      },
      {
        field: 'items[0].sku',
        sourceField: 'items[0].sku',
        origin: 'parsed',
        type: 'string',
        required: '+',
        description: '',
        example: '"A-1"'
      }
    ];

    const output = buildInputFromRows('json', rows);

    expect(JSON.parse(output)).toEqual({
      user: {
        id: 12,
        flags: {
          active: true
        }
      },
      items: [{ sku: 'A-1' }]
    });
  });

  it('rebuilds curl payload with url method and headers', () => {
    const rows: ParsedRow[] = [
      {
        field: 'Authorization',
        sourceField: 'Authorization',
        origin: 'generated',
        enabled: true,
        type: 'string',
        required: '+',
        description: '',
        example: 'Bearer token',
        source: 'header'
      },
      {
        field: 'amount',
        sourceField: 'amount',
        origin: 'parsed',
        type: 'int',
        required: '+',
        description: '',
        example: '100'
      }
    ];

    const output = buildInputFromRows('curl', rows, {
      requestMethod: 'PATCH',
      requestUrl: 'https://api.example.com/payments/1'
    });

    expect(output).toContain('curl -X PATCH "https://api.example.com/payments/1"');
    expect(output).toContain('-H "Authorization: Bearer token"');
    expect(output).toContain(`"amount": 100`);
  });
});

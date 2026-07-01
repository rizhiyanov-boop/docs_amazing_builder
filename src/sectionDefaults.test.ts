import { describe, expect, it } from 'vitest';
import { createParsedSection } from './sectionFactories';
import { sanitizeSections } from './sectionTitles';
import type { ParsedSection } from './types';

describe('contract mode defaults', () => {
  it('creates request and response sections in orchestration mode', () => {
    expect(createParsedSection('request').domainModelEnabled).toBe(true);
    expect(createParsedSection('response').domainModelEnabled).toBe(true);
    expect(createParsedSection('generic').domainModelEnabled).toBeUndefined();
  });

  it('defaults legacy dual-model sections to orchestration without overriding explicit simple mode', () => {
    const legacyRequest = {
      ...createParsedSection('request', 'request'),
      domainModelEnabled: undefined
    } satisfies ParsedSection;
    const simpleResponse = {
      ...createParsedSection('response', 'response'),
      domainModelEnabled: false
    } satisfies ParsedSection;

    const normalized = sanitizeSections([legacyRequest, simpleResponse]) as ParsedSection[];

    expect(normalized[0]?.domainModelEnabled).toBe(true);
    expect(normalized[1]?.domainModelEnabled).toBe(false);
  });

  it('keeps imported row validations, accepts legacy validation key and defaults missing value to empty text', () => {
    const request = {
      ...createParsedSection('request', 'request'),
      rows: [
        {
          field: 'amount',
          type: 'number',
          required: '+',
          validations: 'min: 1',
          description: 'Amount',
          example: '100',
          source: 'body'
        },
        {
          field: 'comment',
          type: 'string',
          required: '-',
          validation: 'legacy validation text',
          description: 'Comment',
          example: '',
          source: 'body'
        } as ParsedSection['rows'][number] & { validation: string },
        {
          field: 'status',
          type: 'string',
          required: '-',
          description: 'Status',
          example: '',
          source: 'body'
        }
      ]
    } satisfies ParsedSection;

    const [normalized] = sanitizeSections([request]) as ParsedSection[];

    expect(normalized?.rows[0]?.validations).toBe('min: 1');
    expect(normalized?.rows[1]?.validations).toBe('legacy validation text');
    expect(normalized?.rows[2]?.validations).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { renderHtmlDocument } from './renderHtml';
import type { DocSection } from './types';

const sections: DocSection[] = [
  {
    id: 'goal',
    title: 'Goal',
    enabled: true,
    kind: 'text',
    value: 'Document the transfer flow'
  },
  {
    id: 'request',
    title: 'Request',
    enabled: true,
    kind: 'parsed',
    sectionType: 'request',
    format: 'json',
    lastSyncedFormat: 'json',
    input: '{\n  "accountId": "12345",\n  "amount": 1500\n}',
    rows: [
      {
        field: 'accountId',
        sourceField: 'accountId',
        type: 'string',
        required: '+',
        description: 'Source account',
        example: '12345',
        source: 'body'
      },
      {
        field: 'amount',
        sourceField: 'amount',
        type: 'number',
        required: '+',
        description: 'Transfer amount',
        example: '1500',
        source: 'body'
      }
    ],
    error: '',
    authType: 'bearer',
    authTokenExample: 'demo-token',
    requestUrl: 'https://api.example.local/v1/transfer',
    requestMethod: 'POST',
    requestProtocol: 'REST',
    domainModelEnabled: true,
    clientFormat: 'json',
    clientLastSyncedFormat: 'json',
    clientInput: '{\n  "externalId": "abc-123"\n}',
    clientRows: [
      {
        field: 'externalId',
        sourceField: 'externalId',
        type: 'string',
        required: '+',
        description: 'Client transfer id',
        example: 'abc-123',
        source: 'body'
      }
    ],
    clientError: '',
    clientMappings: {
      accountId: 'externalId'
    },
    externalRequestUrl: 'https://partner.example.local/v2/transfer',
    externalRequestMethod: 'POST',
    externalAuthType: 'api-key',
    externalAuthHeaderName: 'X-Partner-Key',
    externalAuthApiKeyExample: 'partner-secret'
  },
  {
    id: 'legacy',
    title: 'Legacy',
    enabled: false,
    kind: 'text',
    value: ''
  }
];

describe('renderHtmlDocument', () => {
  it('renders request auth, source examples, and disabled sections', () => {
    const html = renderHtmlDocument(sections, 'dark', { interactive: false });

    expect(html).toContain('Document the transfer flow');
    expect(html).toContain('Authorization');
    expect(html).toContain('Bearer token');
    expect(html).toContain('X-Partner-Key');
    expect(html).toContain('Server request example');
    expect(html).toContain('Client request example');
    expect(html).toContain('Не используется');
  });

  it('includes request metadata and rendered schema rows', () => {
    const html = renderHtmlDocument(sections, 'light', { interactive: false });

    expect(html).toContain('https://api.example.local/v1/transfer');
    expect(html).toContain('https://partner.example.local/v2/transfer');
    expect(html).toContain('accountId');
    expect(html).toContain('amount');
    expect(html).toContain('externalId');
    expect(html).toContain('language-curl');
    expect(html).toContain('code-keyword');
  });
});

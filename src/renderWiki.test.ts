import { describe, expect, it } from 'vitest';
import { renderWikiDocument } from './renderWiki';
import type { DocSection } from './types';

const sections: DocSection[] = [
  {
    id: 'goal',
    title: 'Goal',
    enabled: true,
    kind: 'text',
    value: 'Collect payment request data'
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
      }
    ],
    error: '',
    authType: 'basic',
    authUsername: 'api-user',
    authPassword: 'secret-password',
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
    clientMappings: {},
    externalRequestUrl: 'https://partner.example.local/v2/transfer',
    externalRequestMethod: 'POST'
  },
  {
    id: 'legacy',
    title: 'Legacy',
    enabled: false,
    kind: 'text',
    value: ''
  }
];

describe('renderWikiDocument', () => {
  it('renders toc, auth details, and source examples', () => {
    const wiki = renderWikiDocument(sections);

    expect(wiki).toContain('{toc}');
    expect(wiki).toContain('h3. Authorization');
    expect(wiki).toContain('*Логин:* api-user');
    expect(wiki).toContain('*Пароль:* secret-password');
    expect(wiki).toContain('{expand:title=Пример JSON (Server request)}');
    expect(wiki).toContain('{expand:title=Пример JSON (Client request)}');
  });

  it('keeps disabled sections visible as not used', () => {
    const wiki = renderWikiDocument(sections);

    expect(wiki).toContain('h2. Legacy');
    expect(wiki).toContain('_Не используется_');
    expect(wiki).toContain('https://api.example.local/v1/transfer');
  });
});

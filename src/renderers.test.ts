import { describe, expect, it } from 'vitest';
import { renderHtmlDocument } from './renderHtml';
import { renderWikiDocument } from './renderWiki';
import { makeRequestSection, makeSectionsForRender } from './test/fixtures';
import type { DocSection } from './types';

describe('renderers', () => {
  it('renders html document shell and section data', () => {
    const html = renderHtmlDocument(makeSectionsForRender(), 'light', { interactive: false });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Документация API');
    expect(html).toContain('Тестовая цель');
  });

  it('renders wiki document shell and sections', () => {
    const wiki = renderWikiDocument(makeSectionsForRender());

    expect(wiki).toContain('{toc}');
    expect(wiki).toContain('h2. История изменений');
    expect(wiki).toContain('h2. Цель');
    expect(wiki).toContain('Тестовая цель');
  });

  it('renders parse error marker for blocked request section in wiki', () => {
    const sections: DocSection[] = [
      makeRequestSection({
        error: 'Ошибка парсинга',
        rows: []
      })
    ];

    const wiki = renderWikiDocument(sections);
    expect(wiki).toContain('Секция заблокирована');
    expect(wiki).toContain('Ошибка парсинга');
  });

  it('renders array paths as empty brackets in wiki and html', () => {
    const sections: DocSection[] = [
      makeRequestSection({
        rows: [
          {
            field: 'items[0]',
            sourceField: 'items[0]',
            origin: 'parsed',
            enabled: true,
            type: 'array_object',
            required: '+',
            description: 'Items list',
            example: '-',
            source: 'body'
          },
          {
            field: 'items[0].name',
            sourceField: 'items[0].name',
            origin: 'parsed',
            enabled: true,
            clientField: 'payload[o].name',
            type: 'string',
            required: '+',
            description: 'Item name',
            example: 'A',
            source: 'body'
          }
        ]
      })
    ];

    const wiki = renderWikiDocument(sections);
    const html = renderHtmlDocument(sections, 'light', { interactive: false });

    expect(wiki).toContain('items[]');
    expect(wiki).toContain('items[].name');
    expect(wiki).toContain('payload[].name');
    expect(wiki).not.toContain('items[0]');
    expect(wiki).not.toContain('payload[o]');

    expect(html).toContain('items[]');
    expect(html).toContain('items[].name');
    expect(html).toContain('payload[].name');
    expect(html).not.toContain('items[0]');
    expect(html).not.toContain('payload[o]');
  });

  it('exports auto-generated request curl in wiki', () => {
    const sections: DocSection[] = [
      makeRequestSection({
        rows: [
          {
            field: 'requestId',
            sourceField: 'requestId',
            origin: 'parsed',
            enabled: true,
            type: 'string',
            required: '+',
            description: 'Request id',
            example: 'req-1',
            source: 'body'
          }
        ],
        requestUrl: 'https://api.example.com/payments',
        requestMethod: 'POST',
        input: ''
      })
    ];

    const wiki = renderWikiDocument(sections);
    expect(wiki).toContain('{expand:title=Server cURL}');
    expect(wiki).toContain('curl -X POST "https://api.example.com/payments"');
  });

  it('builds wiki curl body from request JSON example when it exists', () => {
    const sections: DocSection[] = [
      makeRequestSection({
        rows: [
          {
            field: 'requestId',
            sourceField: 'requestId',
            origin: 'parsed',
            enabled: true,
            type: 'string',
            required: '+',
            description: 'Request id',
            example: 'row-value',
            source: 'body'
          }
        ],
        requestUrl: 'https://api.example.com/payments',
        requestMethod: 'POST',
        format: 'json',
        input: '{"requestId":"from-json-example"}'
      })
    ];

    const wiki = renderWikiDocument(sections);
    expect(wiki).toContain('"requestId": "from-json-example"');
    expect(wiki).not.toContain('"requestId": "row-value"');
  });

  it('exports request schema as Zod schema in wiki expand block', () => {
    const sections: DocSection[] = [
      makeRequestSection({
        schemaInput: JSON.stringify({
          type: 'object',
          required: ['requestId'],
          properties: {
            requestId: { type: 'string', minLength: 1 },
            amount: { type: 'number', minimum: 0 }
          }
        })
      })
    ];

    const wiki = renderWikiDocument(sections);
    expect(wiki).toContain('{expand:title=Zod Schema (Server request)}');
    expect(wiki).toContain('{code:typescript}');
    expect(wiki).toContain("import { z } from 'zod';");
    expect(wiki).toContain('export const serverRequestSchema = z.object({');
    expect(wiki).toContain('"requestId": z.string().min(1)');
    expect(wiki).toContain('"amount": z.number().min(0).optional()');
    expect(wiki).not.toContain('{expand:title=JSON Schema (Server request)}');
  });

  it('exports error response json as pretty multi-line code block in wiki table', () => {
    const sections: DocSection[] = [
      {
        id: 'errors',
        title: 'Ошибки',
        enabled: true,
        kind: 'errors',
        rows: [
          {
            clientHttpStatus: '400',
            clientResponse: 'Bad request',
            clientResponseCode: '{"error":{"code":"100101","message":"Bad request"}}',
            trigger: 'Ошибка валидации',
            errorType: 'BusinessException',
            serverHttpStatus: '422',
            internalCode: '100101',
            message: 'Bad request',
            responseCode: '{"error":{"code":"100101","message":"Bad request"}}'
          }
        ],
        validationRules: []
      }
    ];

    const wiki = renderWikiDocument(sections);
    expect(wiki).toContain('{code:json}\n{\n  "error": {');
    expect(wiki).toContain('"message": "Bad request"');
  });

  it('normalizes [0] to [] in wiki validation rules parameter column', () => {
    const sections: DocSection[] = [
      {
        id: 'errors',
        title: 'Ошибки',
        enabled: true,
        kind: 'errors',
        rows: [],
        validationRules: [
          {
            parameter: 'items[0].incomeType',
            validationCase: 'Pattern',
            condition: '^\\d+$',
            cause: 'items[0].incomeType must match pattern ^\\d+$'
          }
        ]
      }
    ];

    const wiki = renderWikiDocument(sections);
    expect(wiki).toContain('items[].incomeType');
    expect(wiki).toContain('|1|items[].incomeType|Pattern|^\\d+$|items[].incomeType must match pattern ^\\d+$|');
  });

  it('normalizes regex classes in wiki validation condition for confluence compatibility', () => {
    const sections: DocSection[] = [
      {
        id: 'errors',
        title: 'Ошибки',
        enabled: true,
        kind: 'errors',
        rows: [],
        validationRules: [
          {
            parameter: 'borrower.docDate',
            validationCase: 'Pattern',
            condition: 'Значение должно содержать последовательно: одно из значений: 0[1-9], [12][0-9], 3[01], затем символ ".", затем одно из значений: 0[1-9], 1[0-2], затем символ ".", затем 4 цифры',
            cause: 'borrower.docDate has invalid date/time format'
          }
        ]
      }
    ];

    const wiki = renderWikiDocument(sections);
    expect(wiki).not.toContain('0[1-9]');
    expect(wiki).not.toContain('[12][0-9]');
    expect(wiki).toContain('0( 1-9 )');
    expect(wiki).toContain('( 12 )( 0-9 )');
  });
});

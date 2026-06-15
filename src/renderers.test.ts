import { describe, expect, it } from 'vitest';
import { renderHtmlDocument } from './renderHtml';
import { renderProjectHtmlDocument, renderProjectWikiDocument } from './projectExport';
import { renderWikiDocument } from './renderWiki';
import { makeRequestSection, makeSectionsForRender } from './test/fixtures';
import type { DocSection, MethodDocument, MethodGroup, ProjectSection } from './types';

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
            serverHttpStatus: '400',
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

  it('fills method and path in wiki intro from meta', () => {
    const wiki = renderWikiDocument([], {
      httpMethod: 'POST',
      path: '/api/v1/saveContract'
    });
    expect(wiki).toContain('POST /api/v1/saveContract');
  });

  it('fills jira in wiki history from meta', () => {
    const wiki = renderWikiDocument([], { jiraTicket: 'GRKI-1234' });
    expect(wiki).toContain('GRKI-1234');
  });

  it('keeps empty cells when meta is empty', () => {
    const wiki = renderWikiDocument([], {});
    expect(wiki).toContain('\u00A0');
  });

  it('renders wiki sections without toc/intro and shifts headings for project export composition', () => {
    const wiki = renderWikiDocument(makeSectionsForRender(), {}, {
      includeToc: false,
      includeTemplateIntro: false,
      headingOffset: 2
    });

    expect(wiki).not.toContain('{toc}');
    expect(wiki).not.toContain('h2. История изменений');
    expect(wiki).toContain('h4. Цель');
    expect(wiki).toContain('Тестовая цель');
  });

  it('renders project diagrams in html and wiki exports and includes methods in project wiki', () => {
    const projectSections: ProjectSection[] = [
      {
        id: 'project-diagram',
        title: 'Project Diagram',
        enabled: true,
        type: 'diagram',
        content: 'Diagram caption',
        order: 0,
        diagramEngine: 'mermaid',
        diagramCode: 'graph LR\n  A --> B'
      }
    ];
    const methods: MethodDocument[] = [
      {
        id: 'method-1',
        name: 'Save Claim',
        updatedAt: '2026-05-13T10:00:00.000Z',
        jiraTicket: 'GRKI-77',
        epic: 'Claims',
        responsible: 'Team A',
        status: 'review',
        sections: makeSectionsForRender()
      }
    ];

    const html = renderProjectHtmlDocument({
      projectName: 'Project A',
      updatedAt: '2026-05-13T10:00:00.000Z',
      projectSections,
      flows: [],
      methods,
      groups: [],
      theme: 'light'
    });
    const wiki = renderProjectWikiDocument({
      projectName: 'Project A',
      updatedAt: '2026-05-13T10:00:00.000Z',
      projectSections,
      flows: [],
      methods
    });

    expect(html).toContain('Project Diagram');
    expect(html).toContain('Diagram caption');
    expect(html).toContain('mermaid.ink');
    expect(wiki).toContain('h2. Методы');
    expect(wiki).toContain('h3. Save Claim');
    expect(wiki).toContain('*Jira:* GRKI-77');
    expect(wiki).toContain('*Статус:* На ревью');
    expect(wiki).toContain('h4. Цель');
    expect(wiki).toContain('!https://mermaid.ink');
  });

  it('renders nested project html navigation by method groups and method sections', () => {
    const methodASections: DocSection[] = [
      { id: 'goal-a', title: 'Goal A', enabled: true, kind: 'text', value: 'A' },
      { id: 'hidden-a', title: 'Hidden A', enabled: false, kind: 'text', value: 'Hidden' }
    ];
    const methodBSections: DocSection[] = [
      { id: 'goal-b', title: 'Goal B', enabled: true, kind: 'text', value: 'B' }
    ];
    const methodCSections: DocSection[] = [
      { id: 'goal-c', title: 'Goal C', enabled: true, kind: 'text', value: 'C' }
    ];
    const methods: MethodDocument[] = [
      { id: 'method-a', name: 'Method A', updatedAt: '2026-05-13T10:00:00.000Z', sections: methodASections },
      { id: 'method-b', name: 'Method B', updatedAt: '2026-05-13T10:00:00.000Z', sections: methodBSections },
      { id: 'method-c', name: 'Method C', updatedAt: '2026-05-13T10:00:00.000Z', sections: methodCSections }
    ];
    const groups: MethodGroup[] = [
      { id: 'group-claims', name: 'Claims', methodIds: ['method-b', 'method-a'], links: [] },
      { id: 'group-duplicate', name: 'Duplicate Group', methodIds: ['method-a'], links: [] }
    ];

    const html = renderProjectHtmlDocument({
      projectName: 'Project A',
      updatedAt: '2026-05-13T10:00:00.000Z',
      projectSections: [],
      flows: [],
      methods,
      groups,
      theme: 'light'
    });

    expect(html).toContain('href="#method-group-group-claims"');
    expect(html).toContain('id="method-group-group-claims"');
    expect(html).toContain('href="#method-method-a"');
    expect(html).toContain('href="#method-method-b"');
    expect(html).toContain('href="#method-method-a-section-goal-a"');
    expect(html).toContain('id="method-method-a-section-goal-a"');
    expect(html).toContain('href="#method-group-ungrouped"');
    expect(html).toContain('href="#method-method-c"');
    expect(html.indexOf('href="#method-method-b"')).toBeLessThan(html.indexOf('href="#method-method-a"'));
    expect(html).not.toContain('Hidden A');
    expect(html).not.toContain('Duplicate Group');
  });

  it('renders brief project exports with method declarations only', () => {
    const methods: MethodDocument[] = [
      {
        id: 'method-a',
        name: 'Method A',
        updatedAt: '2026-05-13T10:00:00.000Z',
        jiraTicket: 'GRKI-1',
        sections: [{ id: 'goal-a', title: 'Goal A', enabled: true, kind: 'text', value: 'Detailed body A' }]
      },
      {
        id: 'method-empty',
        name: 'Empty Method',
        updatedAt: '2026-05-13T10:00:00.000Z',
        sections: []
      }
    ];

    const html = renderProjectHtmlDocument({
      projectName: 'Project A',
      updatedAt: '2026-05-13T10:00:00.000Z',
      projectSections: [],
      flows: [],
      methods,
      groups: [],
      theme: 'light',
      detailMode: 'brief'
    });
    const wiki = renderProjectWikiDocument({
      projectName: 'Project A',
      updatedAt: '2026-05-13T10:00:00.000Z',
      projectSections: [],
      flows: [],
      methods,
      detailMode: 'brief'
    });

    expect(html).toContain('Method A');
    expect(html).toContain('Empty Method');
    expect(html).toContain('Jira');
    expect(html).not.toContain('Detailed body A');
    expect(html).not.toContain('method-method-a-section-goal-a');
    expect(wiki).toContain('h3. Method A');
    expect(wiki).toContain('h3. Empty Method');
    expect(wiki).toContain('*Jira:* GRKI-1');
    expect(wiki).not.toContain('Detailed body A');
    expect(wiki).not.toContain('h4. Goal A');
  });
});

import { describe, expect, it } from 'vitest';
import { renderHtmlDocument } from './renderHtml';
import { renderProjectHtmlDocument, renderProjectWikiDocument } from './projectExport';
import { renderWikiDocument } from './renderWiki';
import { DOCUMENTATION_BASE_URL_TEST_VALUE } from './documentationBaseUrl';
import { makeParsedRow, makeRequestSection, makeResponseSection, makeSectionsForRender } from './test/fixtures';
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
    expect(wiki).not.toContain('h2. Цель');
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
    expect(wiki).toContain(`curl -X POST "${DOCUMENTATION_BASE_URL_TEST_VALUE}/payments"`);
  });

  it('renders full internal url in wiki method description', () => {
    const wiki = renderWikiDocument([], {
      httpMethod: 'POST',
      path: '/payments',
      externalUrl: 'https://api.example.com/payments'
    });

    expect(wiki).toContain(`|Внешний URL|${DOCUMENTATION_BASE_URL_TEST_VALUE}/payments|`);
    expect(wiki).not.toContain('BASE_URL_TEST');
  });

  it('does not render authorization summary block in wiki request section', () => {
    const wiki = renderWikiDocument([
      makeRequestSection({
        authType: 'basic',
        authUsername: '',
        authPassword: '',
        rows: []
      })
    ]);

    expect(wiki).not.toContain('h3. Authorization');
    expect(wiki).not.toContain('Схема: Basic auth');
  });

  it('renders dash for missing request/response wiki mapping cells', () => {
    const wiki = renderWikiDocument([
      makeRequestSection({
        rows: [
          makeParsedRow({
            field: 'requestId',
            clientField: '',
            type: 'string',
            required: '+',
            description: 'Request id',
            example: 'req-1',
            source: 'body'
          })
        ]
      }),
      makeResponseSection({
        rows: [
          makeParsedRow({
            field: '',
            clientField: 'payload.status',
            type: 'string',
            required: '+',
            description: 'Status',
            example: 'OK',
            source: 'body'
          })
        ]
      })
    ]);

    expect(wiki).toContain('|requestId|string|+| |Request id|req-1|-|   |');
    expect(wiki).toContain('|-|string|Status|OK|payload.status|   |');
  });

  it('does not render html break tags in wiki table cells', () => {
    const wiki = renderWikiDocument([
      makeRequestSection({
        rows: [
          makeParsedRow({
            field: 'requestId',
            type: 'string',
            required: '+',
            description: 'Line one\nLine two',
            example: 'req-1',
            source: 'body'
          })
        ]
      })
    ]);

    expect(wiki).not.toContain('<br');
    expect(wiki).toContain('Line one Line two');
  });

  it('renders server response example in wiki from json schema examples when source input is empty', () => {
    const sections: DocSection[] = [
      makeResponseSection({
        input: '',
        schemaInput: JSON.stringify({
          type: 'array',
          examples: [
            [
              {
                id: 1001,
                fio: 'Ivanov Ivan'
              }
            ]
          ],
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              fio: { type: 'string' }
            }
          }
        }),
        rows: [
          {
            field: 'id',
            sourceField: 'id',
            origin: 'parsed',
            enabled: true,
            clientField: 'data[].employeeId',
            type: 'long',
            required: '+',
            description: 'Identifier',
            example: '1001',
            source: 'parsed'
          }
        ],
        domainModelEnabled: true,
        clientInput: JSON.stringify({ data: [{ employeeId: 1001 }] }, null, 2)
      })
    ];

    const wiki = renderWikiDocument(sections);
    const clientResponseExampleTitle = '{expand:title=Пример JSON (Client response)}';
    const serverResponseExampleTitle = '{expand:title=Пример JSON (Server response)}';

    expect(wiki.indexOf(clientResponseExampleTitle)).toBeLessThan(wiki.indexOf(serverResponseExampleTitle));
    expect(wiki).toContain(serverResponseExampleTitle);
    expect(wiki).toContain('"id": 1001');
    expect(wiki).toContain(clientResponseExampleTitle);
  });

  it('keeps SOAP protocol in HTML but omits request metadata from wiki', () => {
    const sections: DocSection[] = [
      makeRequestSection({
        format: 'xml',
        requestProtocol: 'SOAP',
        input: '<CreditApplicationRequest><Header /></CreditApplicationRequest>',
        rows: [
          {
            field: 'CreditApplicationRequest.Header',
            sourceField: 'CreditApplicationRequest.Header',
            origin: 'parsed',
            enabled: true,
            type: 'object',
            required: '+',
            description: '',
            example: '-',
            source: 'body'
          }
        ]
      })
    ];

    const wiki = renderWikiDocument(sections);
    const html = renderHtmlDocument(sections, 'light', { interactive: false });

    expect(wiki).not.toContain('h3. Общее описание метода');
    expect(wiki).not.toContain('h3. Внешний вызов');
    expect(wiki).not.toContain('SOAP');
    expect(html).toContain('SOAP');
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

  it('does not export Zod schemas in wiki', () => {
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
    expect(wiki).not.toContain('Zod Schema');
    expect(wiki).not.toContain("import { z } from 'zod';");
    expect(wiki).not.toContain('serverRequestSchema');
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
    expect(wiki).toContain('{expand:title=Пример}');
    expect(wiki).not.toContain('{expand:title=Пример JSON}');
    expect(wiki).toContain('{code:json}\n{\n  "error": {');
    expect(wiki).toContain('"message": "Bad request"');
  });

  it('does not render an errors section when it contains only validation rules', () => {
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
    expect(wiki).not.toContain('items[].incomeType');
    expect(wiki).not.toContain('Правила валидации');
    expect(wiki).not.toContain('Pattern');
  });

  it('does not render validation rules alongside the errors table', () => {
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
            clientResponseCode: '',
            trigger: 'Validation failed',
            errorType: 'BusinessException',
            serverHttpStatus: '400',
            internalCode: '100101',
            message: 'Bad request',
            responseCode: ''
          }
        ],
        validationRules: [
          {
            parameter: 'borrower.docDate',
            validationCase: 'Pattern',
            condition: 'date pattern',
            cause: 'borrower.docDate has invalid date/time format'
          }
        ]
      }
    ];

    const wiki = renderWikiDocument(sections);
    expect(wiki).toContain('Validation failed');
    expect(wiki).not.toContain('borrower.docDate');
    expect(wiki).not.toContain('Правила валидации');
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
    expect(wiki).not.toContain('h4. Цель');
  });

  it('exports process diagram description without diagram title heading in wiki', () => {
    const wiki = renderWikiDocument([
      {
        id: 'process-diagram',
        title: 'Диаграмма процесса',
        enabled: true,
        kind: 'diagram',
        diagrams: [
          {
            id: 'diagram-1',
            title: 'Internal diagram title',
            engine: 'plantuml',
            code: '@startuml\nA -> B\n@enduml',
            description: 'Process diagram description'
          }
        ]
      }
    ]);

    expect(wiki).toContain('h2. Диаграмма процесса');
    expect(wiki).toContain('Process diagram description');
    expect(wiki).not.toContain('h3. Internal diagram title');
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
    expect(wiki).not.toContain('h4. Цель');
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

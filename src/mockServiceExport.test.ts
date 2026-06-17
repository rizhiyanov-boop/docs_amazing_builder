import { describe, expect, it } from 'vitest';
import { buildMockServicePayload } from './mockServiceExport';
import type { MethodDocument } from './types';

function createMethodFixture(): MethodDocument {
  return {
    id: 'method-1',
    name: 'Test Method',
    updatedAt: new Date().toISOString(),
    sections: [
      {
        id: 'request',
        title: 'Request',
        enabled: true,
        kind: 'parsed',
        sectionType: 'request',
        format: 'curl',
        input: '',
        error: '',
        rows: [
          { field: 'globId', type: 'string', required: '+', description: '', example: 'string', source: 'body' },
          { field: 'traceparent', type: 'string', required: '+', description: '', example: '00-abc-xyz-01', source: 'header' }
        ]
      },
      {
        id: 'response',
        title: 'Response',
        enabled: true,
        kind: 'parsed',
        sectionType: 'response',
        format: 'json',
        input: '',
        error: '',
        rows: [
          { field: 'code', type: 'string', required: '+', description: '', example: 'Success', source: 'body' }
        ]
      },
      {
        id: 'errors',
        title: 'Ошибки',
        enabled: true,
        kind: 'errors',
        rows: [
          {
            clientHttpStatus: '400',
            clientResponse: '',
            clientResponseCode: '',
            trigger: 'Ошибка валидации',
            errorType: 'CommonException',
            serverHttpStatus: '400',
            internalCode: '100101',
            message: 'Bad request sent to the system',
            responseCode: '{"error":{"code":"100101","message":"Bad request sent to the system"}}'
          }
        ],
        validationRules: [
          {
            parameter: 'globId',
            validationCase: 'Pattern',
            condition: '/^[A-Za-z0-9-]+$/',
            cause: 'Invalid input for field <field>'
          }
        ]
      }
    ]
  };
}

describe('mockServiceExport', () => {
  it('builds payload with example, body rules and response templates', () => {
    const payload = buildMockServicePayload(createMethodFixture()) as Record<string, unknown>;

    expect(payload.example).toBeTruthy();
    expect(payload.bodyRules).toBeTruthy();
    expect(payload.headerRules).toBeTruthy();
    expect(payload.rules).toBeTruthy();
    expect(payload.responseOK).toBeTruthy();
    expect(payload.responseFail).toBeTruthy();

    const bodyRules = payload.bodyRules as Record<string, unknown>;
    expect(bodyRules.globId).toBeTruthy();

    const globIdRule = bodyRules.globId as Record<string, unknown>;
    expect(globIdRule.required).toBe(true);

    const rules = globIdRule.rules as Array<Record<string, unknown>>;
    expect(rules.some((rule) => rule.comparator === 'type')).toBe(true);
    expect(rules.some((rule) => rule.comparator === 'regex')).toBe(true);
  });

  it('keeps xml request and response bodies in mock payload', () => {
    const method = createMethodFixture();
    const request = method.sections.find((section) => section.kind === 'parsed' && section.sectionType === 'request');
    const response = method.sections.find((section) => section.kind === 'parsed' && section.sectionType === 'response');

    if (!request || request.kind !== 'parsed' || !response || response.kind !== 'parsed') {
      throw new Error('Fixture sections are missing');
    }

    request.format = 'xml';
    request.input = '<request><globId>abc</globId></request>';
    request.rows = [
      { field: 'request.globId', type: 'string', required: '+', description: '', example: 'abc', source: 'body' }
    ];
    response.format = 'xml';
    response.input = '<response><code>Success</code></response>';
    response.rows = [
      { field: 'response.code', type: 'string', required: '+', description: '', example: 'Success', source: 'body' }
    ];

    const errors = method.sections.find((section) => section.kind === 'errors');
    if (errors?.kind === 'errors') {
      errors.rows = errors.rows.map((row) => ({
        ...row,
        responseCode: '<error><code>100101</code></error>'
      }));
    }

    const payload = buildMockServicePayload(method) as Record<string, unknown>;
    const example = payload.example as { body: unknown };
    const rules = payload.rules as Array<{ response: { headers: Record<string, string>; body: unknown } }>;
    const responseOK = payload.responseOK as { body: unknown };
    const responseFail = payload.responseFail as { body: unknown };

    expect(example.body).toBe('<request><globId>abc</globId></request>');
    expect(rules[0].response.headers['Content-Type']).toBe('application/xml');
    expect(rules[0].response.body).toBe('<response><code>Success</code></response>');
    expect(responseOK.body).toBe('<response><code>Success</code></response>');
    expect(responseFail.body).toBe('<error><code>100101</code></error>');
  });
});

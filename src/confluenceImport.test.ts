import { describe, expect, it } from 'vitest';
import { renderConfluenceDocument } from './confluenceDocument';
import { buildConfluenceImport, prepareConfluenceImport } from './confluenceImport';
import { renderHtmlDocument } from './renderHtml';
import { renderWikiDocument } from './renderWiki';
import { getRequestRows } from './requestHeaders';
import { importTestOrigin, templateImportPage } from './test/confluenceImportFixtures';
import { asWorkspaceProjectData, normalizeMethodDocument } from './workspaceBootstrap';
import { sectionsForMethodTemplate } from './methodTemplates';

describe('Confluence method import', () => {
  it.each(['-', '–', '—'])('imports Client-only response fields when Server uses %s', marker => {
    const page = templateImportPage();
    page.storage = page.storage!.replace(
      '</tr></table>\n    <h4>Пример ответа (Server Response)</h4>',
      '</tr><tr><td>' + marker + '</td><td>string</td><td>errorMessage</td><td>***</td></tr>'
        + '<tr><td>' + marker + '</td><td>integer</td><td>code</td><td></td></tr>'
        + '</table>\n    <h4>Пример ответа (Server Response)</h4>'
    );
    const preview = prepareConfluenceImport(page, importTestOrigin);
    if (!preview.ok) throw new Error(preview.reasons.join(', '));
    const method = normalizeMethodDocument(buildConfluenceImport(preview, {}));
    expect(method.sections.find(section => section.id === 'response')).toMatchObject({
      rows: [{ field: 'data.result' }],
      clientRows: [
        { field: 'result' },
        { field: 'errorMessage', type: 'string', maskInLogs: true },
        { field: 'code', type: 'integer' }
      ],
      clientMappings: { 'data.result': 'result' }
    });
  });

  it('imports the publication template with canonical rows, examples and a diagram', () => {
    const preview = prepareConfluenceImport(templateImportPage(), importTestOrigin);
    if (!preview.ok) throw new Error(preview.reasons.join(', '));
    const method = normalizeMethodDocument(buildConfluenceImport(preview, {}));
    expect(method.templateId).toBe('orchestration');
    expect(() => buildConfluenceImport(preview, { templateId: 'simple' })).toThrow(/есть данные Client/);
    const request = sectionsForMethodTemplate(method.sections, method.templateId).find(section => section.kind === 'parsed' && section.id === 'request');
    if (request?.kind !== 'parsed') throw new Error('Expected Request');
    expect(request).toMatchObject({ requestUrl: '/api/example', format: 'curl', clientMappings: { 'data.id': 'requestId' } });
    expect(getRequestRows(request).filter(row => row.source === 'header')).toEqual([]);
    expect(getRequestRows(request)).toContainEqual(expect.objectContaining({ field: 'data.id', clientField: 'requestId', maskInLogs: true }));
    expect(method.sections.find(section => section.id === 'process-diagram')).toMatchObject({
      diagrams: [{ engine: 'plantuml', code: expect.stringContaining('A -> B'), sourceOnly: true }]
    });
    expect(renderHtmlDocument(method.sections)).not.toContain('https://www.plantuml.com');
    expect(renderWikiDocument(method.sections)).not.toContain('https://www.plantuml.com');
    expect(renderConfluenceDocument(method).diagrams).toContainEqual(expect.objectContaining({ code: expect.stringContaining('A -> B') }));
    expect(method.sections.find(section => section.id === 'errors')).toMatchObject({ rows: [{ serverHttpStatus: '400', internalCode: '999999' }] });
    expect(method.sections.map(section => section.title)).not.toContain('История изменений');
    expect(asWorkspaceProjectData('Test', [method], method.id).methods[0]).toMatchObject({
      status: 'draft', confluenceImport: { baseUrl: importTestOrigin, pageId: '901', version: 2 }
    });
    expect(method.confluence).toBeUndefined();
  });

  it('keeps merged header values and ambiguous error rows while requiring a primary call and example', () => {
    const preview = prepareConfluenceImport(templateImportPage({ variant: true }), importTestOrigin);
    if (!preview.ok) throw new Error(preview.reasons.join(', '));
    expect(preview.externalCalls.map(call => call.url)).toEqual(['https://test.example/api', 'https://prod.example/api', '/api/auth']);
    const examples = preview.examples.filter(example => example.group === 'server-request');
    expect(examples.map(example => example.format)).toEqual(['curl', 'json']);
    expect(() => buildConfluenceImport(preview, {})).toThrow(/основной внешний вызов/);
    const externalCall = preview.externalCalls[1].id;
    expect(() => buildConfluenceImport(preview, { externalCall })).toThrow(/основной пример/);
    const method = buildConfluenceImport(preview, { externalCall, examples: { 'server-request': examples[1].id } });
    const request = method.sections.find(section => section.kind === 'parsed' && section.id === 'request');
    if (request?.kind !== 'parsed') throw new Error('Expected Request');
    expect(request).toMatchObject({ requestUrl: '/api/example', externalRequestUrl: 'https://prod.example/api', input: '{"data":{"id":"test"}}' });
    expect(request.rows).toContainEqual(expect.objectContaining({ field: 'Authorization', example: 'Bearer example', required: '+', maskInLogs: true }));
    expect(request.rows).toContainEqual(expect.objectContaining({ field: 'X-USER-ID', example: 'test-user', maskInLogs: true }));
    const extra = method.sections.flatMap(section => section.kind === 'text' ? [section.value] : []).join('\n');
    for (const text of ['Basic example', 'Маскировать ID', 'Обизательность: +', 'Ответ об успехе', 'Server HTTP code: 600301',
      '{"issue":1}', '{"issue":2}', 'curl -X POST', 'https://test.example/api', 'https://prod.example/api', '/api/auth']) expect(extra).toContain(text);
    expect(method.sections.find(section => section.id === 'errors')).toBeUndefined();
  });

  it('rejects non-template pages and a conflicting public endpoint', () => {
    expect(prepareConfluenceImport({ ...templateImportPage(), storage: '<h2>Request</h2><p>Unstructured</p>' }, importTestOrigin))
      .toMatchObject({ ok: false, reasons: [expect.stringContaining('История изменений'), expect.stringContaining('Постановка задачи'), expect.stringContaining('Общая информация')] });
    expect(prepareConfluenceImport(templateImportPage({ ambiguousEndpoint: true }), importTestOrigin))
      .toMatchObject({ ok: false, reasons: [expect.stringContaining('однозначный HTTP-метод')] });
  });

  it('keeps an omitted server HTTP status empty when the error is representable', () => {
    const page = templateImportPage();
    const storage = page.storage!.replace('<th>Server HTTP status</th>', '').replace('<td>400</td><td>999999</td>', '<td>999999</td>');
    const preview = prepareConfluenceImport({ ...page, storage }, importTestOrigin);
    if (!preview.ok) throw new Error(preview.reasons.join(', '));
    const method = normalizeMethodDocument(buildConfluenceImport(preview, {}));
    expect(method.sections.find(section => section.id === 'errors')).toMatchObject({
      rows: [{ clientHttpStatus: '400', serverHttpStatus: '', internalCode: '999999' }]
    });
  });
});

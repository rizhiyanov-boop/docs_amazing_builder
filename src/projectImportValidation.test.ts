import { describe, expect, it } from 'vitest';
import { loadWorkspaceProjectFromPayload, parseProjectImportText, ProjectImportError } from './projectImport';
import { validateProjectImportPayload } from './projectImportValidation';
import { makeRequestSection, makeParsedRow } from './test/fixtures';

const method = () => ({ id: 'm1', name: 'Method', sections: [makeRequestSection({ rows: [makeParsedRow({ id: 'r1', source: 'body' })] })] });
const payload = () => ({ version: 3, methods: [method()], groups: [] });

describe('import diagnostics', () => {
  it.each([
    [{ version: 3, methods: [] }, 'methods'],
    [{ version: 3, methods: [null] }, 'methods[0]'],
    [{ version: 3, methods: [{ sections: null }] }, 'methods[0].sections'],
    [{ version: 999, methods: [method()] }, 'version'],
    [{ version: 3, methods: [{ sections: [{ id: 'request', kind: 'parsed', rows: [null] }] }] }, 'methods[0].sections[0].rows[0]'],
    [{ version: 3, methods: [{ sections: [{ id: 'request', kind: 'parsed', rows: [{ field: 42 }] }] }] }, 'methods[0].sections[0].rows[0].field'],
    [{ version: 3, methods: [{ sections: [{ id: 'request', kind: 'parsed', domainModelEnabled: 'false' }] }] }, 'methods[0].sections[0].domainModelEnabled'],
    [{ version: 3, methods: [{ sections: [{ id: 'request', kind: 'parsed', requestMethod: 'HEAD' }] }] }, 'methods[0].sections[0].requestMethod'],
    [{ version: 3, methods: [{ sections: [{ id: 'request', kind: 'parsed', clientMappings: { id: 1 } }] }] }, 'methods[0].sections[0].clientMappings["id"]'],
    [{ version: 3, methods: [method()], flows: [{ nodes: [null] }] }, 'flows[0].nodes[0]'],
    [{ version: 3, methods: [method()], flows: [{ edges: [{ fromNodeId: 'n1', toNodeId: 'n2', mappings: [{ source: null }] }] }] }, 'flows[0].edges[0].mappings[0].source']
  ])('rejects structural problem at %s before normalization', (input, path) => {
    const original = JSON.stringify(input);
    const issues = validateProjectImportPayload(input, 'workspace');
    expect(issues.map(issue => issue.path)).toContain(path);
    expect(() => loadWorkspaceProjectFromPayload(input)).toThrow(ProjectImportError);
    expect(JSON.stringify(input)).toBe(original);
  });

  it('rejects duplicate IDs, including collisions caused by legacy body normalization', () => {
    expect(() => loadWorkspaceProjectFromPayload({ version: 3, methods: [method(), method()] })).toThrow('methods[1].id');
    const original = payload();
    original.methods[0].sections.push({ ...original.methods[0].sections[0], id: 'body' }, { ...original.methods[0].sections[0], id: 'response' });
    expect(() => loadWorkspaceProjectFromPayload(original)).toThrow('sections[2].id');
    const rowDuplicate = payload();
    rowDuplicate.methods[0].sections[0].rows.push({ ...rowDuplicate.methods[0].sections[0].rows[0] });
    expect(() => loadWorkspaceProjectFromPayload(rowDuplicate)).toThrow('rows[1].id');
  });

  it('diagnoses malformed single-method sections instead of treating them as API source', () => {
    expect(() => parseProjectImportText('{"name":"Method","sections":null}', 'method.json')).toThrow('sections: Ожидается array');
  });

  it('keeps legacy contract mode and safely normalizes partial custom rows', () => {
    const result = parseProjectImportText('{"id":"m1","sections":[{"id":"custom-request","kind":"parsed","sectionType":"request","clientRows":[{}]},{"id":"goal","kind":"text"}]}', 'old.json');
    if (result.kind !== 'workspace') throw new Error('Expected workspace');
    expect(result.workspace.methods[0].sections[0]).toMatchObject({ enabled: true, clientRows: [{ field: '', description: '', example: '' }] });
    expect(result.workspace.methods[0].sections[0]).not.toHaveProperty('domainModelEnabled');
    expect(result.workspace.methods[0].sections[1]).toMatchObject({ enabled: true, value: '' });
  });

  it('shows reversed mappings and hidden GET body fields as warnings', () => {
    const original = payload();
    original.methods[0].sections[0] = makeRequestSection({ requestMethod: 'GET', rows: [makeParsedRow({ field: 'id', sourceField: 'id', source: 'body' })], clientRows: [makeParsedRow({ field: 'externalId', sourceField: 'externalId' })], clientMappings: { externalId: 'id' } });
    const result = parseProjectImportText(JSON.stringify(original), 'draft.json');
    if (result.kind !== 'workspace') throw new Error('Expected workspace');
    expect(result.warnings.map(issue => issue.path)).toEqual(expect.arrayContaining(['methods[0].sections[0].clientMappings["externalId"]', 'methods[0].sections[0].rows[0].source']));
  });

  it('uses the same mapping rules as the renderer for headers and generic sections', () => {
    const original = payload();
    original.methods[0].sections[0] = makeRequestSection({
      rows: [makeParsedRow({ field: 'X-Trace', sourceField: 'X-Trace', source: 'header' })],
      clientRows: [makeParsedRow({ field: 'trace', sourceField: 'trace' })], clientMappings: { 'X-Trace': 'trace' }
    });
    original.methods[0].sections.push(makeRequestSection({
      id: 'custom', sectionType: 'generic', rows: [makeParsedRow({ field: 'id', sourceField: 'id' })],
      clientRows: [makeParsedRow({ field: 'externalId', sourceField: 'externalId' })], clientMappings: { id: 'externalId' }
    }));
    const result = parseProjectImportText(JSON.stringify(original), 'draft.json');
    if (result.kind !== 'workspace') throw new Error('Expected workspace');
    expect(result.warnings.map(issue => issue.path)).toEqual(expect.arrayContaining([
      'methods[0].sections[0].clientMappings["X-Trace"]', 'methods[0].sections[1].clientMappings["id"]'
    ]));
  });

  it.each(['null', '42', '"example"', 'true'])('routes primitive API source %s safely', text => {
    expect(parseProjectImportText(text, 'sample.json')).toMatchObject({ kind: 'source', sourceFormat: 'json' });
  });
});

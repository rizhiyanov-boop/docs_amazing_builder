import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadWorkspaceProjectFromPayload, parseProjectImportText, prepareMethodsMerge, prepareProjectImportBatch } from './projectImport';
import { loadWorkspaceProject } from './workspaceBootstrap';
import { makeParsedRow, makeRequestSection } from './test/fixtures';
import type { WorkspaceProjectData } from './types';

function workspace(): WorkspaceProjectData {
  return {
    version: 3, projectName: 'Import project', updatedAt: '2026-10-01T00:00:00.000Z', activeMethodId: 'm1',
    methods: [{
      id: 'm1', name: 'Lookup', updatedAt: '2026-10-01T00:00:00.000Z',
      sections: [makeRequestSection({
        input: '{"different":"source"}', schemaInput: '{"type":"object"}',
        rows: [makeParsedRow({ id: 's1', field: 'id', sourceField: 'id', source: 'body', validations: 'min: 1', maskInLogs: true })],
        clientRows: [makeParsedRow({ id: 'c1', field: 'externalId', sourceField: 'externalId', source: 'body' })],
        clientMappings: { id: 'externalId' }
      })]
    }],
    groups: [{ id: 'g1', name: 'Group', methodIds: ['m1'], links: [] }],
    projectSections: [{ id: 'p1', title: 'Overview', enabled: true, type: 'text', content: 'Project docs', order: 0 }],
    flows: [{ id: 'f1', name: 'Flow', nodes: [{ id: 'n1', type: 'method', position: { x: 0, y: 0 }, methodRef: { methodId: 'm1' } }], edges: [] }]
  };
}

describe('project import preparation', () => {
  it('keeps canonical rows, mappings and project content without reparsing source', () => {
    const original = workspace();
    const result = parseProjectImportText(JSON.stringify(original), 'project.json');
    expect(result.kind).toBe('workspace');
    if (result.kind !== 'workspace') return;
    expect(result.workspace.methods[0].sections[0]).toMatchObject(original.methods[0].sections[0]);
    expect(result.workspace.groups).toEqual(original.groups);
    expect(result.workspace.projectSections).toEqual(original.projectSections);
    expect(result.workspace.flows?.[0]).toMatchObject(original.flows![0]);
  });

  it('normalizes a partial method and derives its name from the filename', () => {
    const result = parseProjectImportText(JSON.stringify({ id: 'partial', sections: [{ id: 'request', kind: 'parsed', enabled: true, rows: [{ id: 'r1', source: 'body' }] }] }), 'partial.json');
    expect(result.kind).toBe('workspace');
    if (result.kind !== 'workspace') return;
    expect(result.workspace.methods[0].name).toBe('partial');
    expect(result.workspace.methods[0].sections[0]).toMatchObject({ format: 'json', input: '', rows: [{ field: '', type: '', description: '', example: '' }] });
  });

  it('preserves metadata through file import, merge, localStorage and a JSON roundtrip', () => {
    const original = workspace();
    Object.assign(original.methods[0], { jiraTicket: 'TEST-1', epic: 'Epic', initiators: 'Team', responsible: 'Owner', externalUrl: 'https://example.test', status: 'review' });
    const imported = loadWorkspaceProjectFromPayload(original);
    expect(imported.methods[0]).toMatchObject(original.methods[0]);
    expect(prepareMethodsMerge([imported], []).methods[0]).toMatchObject({ ...original.methods[0], id: expect.any(String) });
    expect(loadWorkspaceProjectFromPayload(JSON.parse(JSON.stringify(imported)))).toEqual(imported);
    window.localStorage.setItem('import-test', JSON.stringify(original));
    try { expect(loadWorkspaceProject('import-test', true).methods[0]).toEqual(imported.methods[0]); }
    finally { window.localStorage.removeItem('import-test'); }
  });

  it('reports draft references and generated defaults without discarding their data', () => {
    const original = workspace();
    original.activeMethodId = 'deleted';
    original.groups[0].methodIds.push('deleted');
    original.flows![0].nodes[0].methodRef = { methodId: 'deleted' };
    original.projectSections = [];
    const result = parseProjectImportText(JSON.stringify(original), 'draft.json');
    if (result.kind !== 'workspace') throw new Error('Expected workspace');
    expect(result.warnings.map(issue => issue.path)).toEqual(expect.arrayContaining(['activeMethodId', 'projectSections', 'groups[0].methodIds[1]', 'flows[0].nodes[0].methodRef.methodId']));
    expect(result.workspace.groups[0].methodIds).toContain('deleted');
    expect(result.workspace.flows![0].nodes[0].methodRef?.methodId).toBe('deleted');
  });

  it('isolates structural errors by file and preserves their exact diagnostic paths', () => {
    const original = workspace();
    const invalid = JSON.parse(JSON.stringify(original));
    invalid.methods[0].sections[0].rows[0].example = 42;
    const result = prepareProjectImportBatch([{ name: 'valid.json', text: JSON.stringify(original) }, { name: 'invalid.json', text: JSON.stringify(invalid) }]);
    expect(result.items).toHaveLength(1);
    expect(result.invalidFiles[0]).toMatchObject({ fileName: 'invalid.json', reason: expect.stringContaining('methods[0].sections[0].rows[0].example') });
  });

  it.each([
    'test-imports/method-a.json', 'test-imports/method-b.json', 'test-imports/method-c.json', 'test-imports/method-single-object.json',
    'docs/ai-import-json/saveClaim.import.template.json', 'docs/ultimate-import.json'
  ])('loads existing project fixture %s', path => {
    const result = parseProjectImportText(readFileSync(resolve(path), 'utf8'), path);
    expect(result.kind).toBe('workspace');
    if (result.kind !== 'workspace') return;
    expect(result.workspace.methods.length).toBeGreaterThan(0);
    expect(loadWorkspaceProjectFromPayload(JSON.parse(JSON.stringify(result.workspace)))).toEqual(result.workspace);
  });

  it('keeps the legacy sections-only import route', () => {
    const result = parseProjectImportText(JSON.stringify({ version: 2, sections: [{ id: 'goal', title: 'Goal', kind: 'text', enabled: true, value: 'Legacy' }] }), 'old.json');
    expect(result).toMatchObject({ kind: 'sections', sections: [{ id: 'goal', value: 'Legacy' }] });
  });

  it.each([
    ['{"body":{"id":1}}', 'json', 'request'], ['{"status":"OK"}', 'json', 'response'],
    ['[{"id":1}]', 'json', 'response'], ["curl 'https://example.test'", 'curl', 'request'],
    ['<request><id>1</id></request>', 'xml', 'request']
  ])('routes source %s independently of workspace loading', (text, sourceFormat, sampleType) => {
    expect(parseProjectImportText(text, 'source')).toEqual({ kind: 'source', rawText: text, sourceFormat, sampleType });
  });

  it('returns valid batch documents and isolates malformed and unsupported files', () => {
    const result = prepareProjectImportBatch([
      { name: 'project.json', text: JSON.stringify(workspace()) },
      { name: 'legacy.json', text: '{"sections":[{"id":"goal","kind":"text","title":"Goal","enabled":true,"value":"Legacy"}]}' },
      { name: 'bad.json', text: '{broken' }, { name: 'sample.json', text: '{"status":"OK"}' }
    ]);
    expect(result.items.map(item => item.sourceName)).toEqual(['project.json', 'legacy.json']);
    expect(result.items[1].workspace.methods[0].name).toBe('legacy');
    expect(result.invalidFiles.map(item => item.fileName)).toEqual(['bad.json', 'sample.json']);
  });

  it('remaps each document independently, reserves names and never mutates the inputs', () => {
    const first = workspace();
    const second = workspace();
    first.groups[0].links = [{ fromMethodId: 'm1', toMethodId: 'm1', relationType: 'sync', note: 'Self' }];
    const originals = JSON.stringify([first, second]);
    const merged = prepareMethodsMerge([first, second], [{ ...first.methods[0], name: 'lookup' }]);
    expect(merged.methods.map(method => method.name)).toEqual(['Lookup 2', 'Lookup 3']);
    expect(new Set(merged.methods.map(method => method.id)).size).toBe(2);
    expect(merged.methods[0].id).not.toBe('m1');
    expect(merged.groups[0].methodIds).toEqual([merged.methods[0].id]);
    expect(merged.groups[0].links[0]).toEqual({ fromMethodId: merged.methods[0].id, toMethodId: merged.methods[0].id, relationType: 'sync', note: 'Self' });
    expect(merged.groups[1].methodIds).toEqual([merged.methods[1].id]);
    expect(JSON.stringify([first, second])).toBe(originals);
  });
});

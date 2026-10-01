import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CODEX_IMPORT_PROFILE, validateCodexProjectImport } from './codexImportValidation';
import { loadWorkspaceProjectFromPayload, parseProjectImportText, prepareProjectImportBatch } from './projectImport';
import { buildInputFromRows } from './sourceSync';
import { getRequestRows } from './requestHeaders';
import type { ParsedSection, WorkspaceProjectData } from './types';

type GeneratedProject = WorkspaceProjectData & { importProfile: string };
function example(name = 'simple-post'): GeneratedProject {
  return JSON.parse(readFileSync(resolve(`docs/ai-import-json/examples/${name}.json`), 'utf8'));
}
const request = (payload: GeneratedProject): ParsedSection => payload.methods[0].sections.find(section => section.id === 'request') as ParsedSection;
const diagnostics = (payload: unknown) => validateCodexProjectImport(payload).map(issue => issue.path);

describe('Codex generation contract', () => {
  it.each(['simple-post', 'orchestration', 'get-query', 'root-array', 'xml'])('validates and imports the published %s example with stable data', name => {
    const payload = example(name);
    const before = JSON.stringify(payload);
    expect(validateCodexProjectImport(payload)).toEqual([]);
    const result = parseProjectImportText(before, `${name}.json`);
    if (result.kind !== 'workspace') throw new Error('Expected workspace');
    expect(result.warnings).toEqual([]);
    expect(result.workspace.methods.map(method => method.id)).toEqual(payload.methods.map(method => method.id));
    const roundtrip = { ...JSON.parse(JSON.stringify(result.workspace)), importProfile: CODEX_IMPORT_PROFILE };
    expect(validateCodexProjectImport(roundtrip)).toEqual([]);
    expect(loadWorkspaceProjectFromPayload(roundtrip)).toEqual(result.workspace);
    expect(JSON.stringify(payload)).toBe(before);
  });

  it('renders the documented Server → Client mappings for both request and response', () => {
    const payload = example('orchestration');
    const loaded = loadWorkspaceProjectFromPayload(payload);
    const parsed = loaded.methods[0].sections.filter((section): section is ParsedSection => section.kind === 'parsed');
    expect(getRequestRows(parsed[0]).find(row => row.field === 'externalId')?.clientField).toBe('customerId');
    expect(getRequestRows(parsed[1]).find(row => row.field === 'externalId')?.clientField).toBe('data.customerId');
    expect(loaded.flows?.[0].edges[1].mappings?.[0]).toEqual(payload.flows?.[0].edges[1].mappings?.[0]);
  });

  it('keeps strings and nested/root array paths correct when restoring JSON', () => {
    const post = request(example());
    expect(JSON.parse(buildInputFromRows('json', post.rows))).toEqual({ customerId: 'demo-001', items: [{ id: 1 }] });
    const array = request(example('root-array'));
    expect(array.rows.map(row => row.field)).toEqual(['$', '[0].id']);
    expect(JSON.parse(buildInputFromRows('json', array.rows))).toEqual([{ id: 1 }]);
  });

  it.each([
    ['unknown root key', (p: GeneratedProject) => Object.assign(p, { methodGroups: [] }), 'methodGroups'],
    ['unknown nested key', (p: GeneratedProject) => Object.assign(request(p).rows[0], { examples: 'x' }), 'methods[0].sections[3].rows[0].examples'],
    ['missing field', (p: GeneratedProject) => delete request(p).rows[0].validations, 'methods[0].sections[3].rows[0].validations'],
    ['unknown profile', (p: GeneratedProject) => p.importProfile = 'codex-v2', 'importProfile'],
    ['version', (p: GeneratedProject) => p.version = 2, 'version'],
    ['timestamp', (p: GeneratedProject) => p.updatedAt = '2026-02-30T00:00:00.000Z', 'updatedAt'],
    ['empty enum', (p: GeneratedProject) => request(p).rows[0].required = '', 'methods[0].sections[3].rows[0].required'],
    ['ambiguous required', (p: GeneratedProject) => request(p).rows[0].required = '±', 'methods[0].sections[3].rows[0].required'],
    ['old schema source', (p: GeneratedProject) => request(p).schemaInput = '{}', 'methods[0].sections[3].schemaInput'],
    ['empty flows', (p: GeneratedProject) => p.flows = [], 'flows'],
    ['empty project sections', (p: GeneratedProject) => p.projectSections = [], 'projectSections'],
    ['string boolean', (p: GeneratedProject) => Object.assign(request(p), { domainModelEnabled: 'false' }), 'methods[0].sections[3].domainModelEnabled'],
    ['missing mapping id', (p: GeneratedProject) => delete (p.flows![0].edges[1].mappings![0] as { id?: string }).id, 'flows[0].edges[1].mappings[0].id']
  ])('rejects %s with an exact path and without changing input', (name, mutate, path) => {
    const payload = example(name === 'missing mapping id' ? 'orchestration' : 'simple-post');
    mutate(payload);
    const before = JSON.stringify(payload);
    expect(diagnostics(payload)).toContain(path);
    expect(() => loadWorkspaceProjectFromPayload(payload)).toThrow(path);
    expect(JSON.stringify(payload)).toBe(before);
  });

  it.each([
    ['active method', (p: GeneratedProject) => p.activeMethodId = 'absent', 'activeMethodId'],
    ['row key alias', (p: GeneratedProject) => request(p).rows[0].sourceField = 'alias', 'methods[0].sections[3].rows[0].sourceField'],
    ['row ID collision across sides', (p: GeneratedProject) => request(p).clientRows![0].id = request(p).rows[0].id, 'methods[0].sections[3].clientRows[0].id'],
    ['duplicate key', (p: GeneratedProject) => request(p).rows.push({ ...request(p).rows[0], id: 'other-row' }), 'methods[0].sections[3].rows[3].sourceField'],
    ['reversed mapping', (p: GeneratedProject) => request(p).clientMappings = { customerId: 'externalId' }, 'methods[0].sections[3].clientMappings["customerId"]'],
    ['stale flow method', (p: GeneratedProject) => p.flows![0].nodes[1].methodRef!.methodId = 'absent', 'flows[0].nodes[1].methodRef.methodId'],
    ['flow row/path mismatch', (p: GeneratedProject) => p.flows![0].edges[1].mappings![0].source.fieldPath = 'techData', 'flows[0].edges[1].mappings[0].source'],
    ['wrong flow endpoint', (p: GeneratedProject) => p.flows![0].edges[1].mappings![0].source.nodeId = 'next', 'flows[0].edges[1].mappings[0].source.nodeId'],
    ['GET body', (p: GeneratedProject) => request(p).requestMethod = 'GET', 'methods[0].sections[3].rows[0].source'],
    ['source drift', (p: GeneratedProject) => request(p).input = '{"unrelated":true}', 'methods[0].sections[3].input'],
    ['string quoting drift', (p: GeneratedProject) => request(p).rows[0].example = '"demo-001"', 'methods[0].sections[3].input'],
    ['bad numeric example', (p: GeneratedProject) => request(p).rows[2].example = 'NaN', 'methods[0].sections[3].rows[2].example'],
    ['unsafe long', (p: GeneratedProject) => Object.assign(request(p).rows[2], { type: 'long', example: '9007199254740993' }), 'methods[0].sections[3].rows[2].example'],
    ['display array path', (p: GeneratedProject) => Object.assign(request(p).rows[2], { field: 'items[].id', sourceField: 'items[].id' }), 'methods[0].sections[3].rows[2].field'],
    ['container after child', (p: GeneratedProject) => request(p).rows.reverse(), 'methods[0].sections[3].rows[0].field'],
    ['array without index', (p: GeneratedProject) => Object.assign(request(p).rows[2], { field: 'items.id', sourceField: 'items.id' }), 'methods[0].sections[3].rows[2].field'],
    ['project order', (p: GeneratedProject) => p.projectSections![0].order = 9, 'projectSections[0].order']
  ])('blocks semantic ambiguity: %s', (name, mutate, path) => {
    const dual = ['row ID collision across sides', 'reversed mapping', 'stale flow method', 'flow row/path mismatch', 'wrong flow endpoint'].includes(name);
    const payload = example(dual ? 'orchestration' : 'simple-post');
    mutate(payload);
    expect(diagnostics(payload)).toContain(path);
  });

  it('blocks unsupported paths before reconstructing JSON', () => {
    const payload = example();
    Object.assign(request(payload).rows[0], { field: '__proto__.codexPolluted', sourceField: '__proto__.codexPolluted' });
    expect(diagnostics(payload)).toContain('methods[0].sections[3].rows[0].field');
    expect({}).not.toHaveProperty('codexPolluted');
  });

  it('diagnoses normalization of error catalog values before applying a generated document', () => {
    const payload = example();
    const errors = payload.methods[0].sections.find(section => section.kind === 'errors');
    if (errors?.kind !== 'errors') throw new Error('Expected errors section');
    errors.rows.push({ clientHttpStatus: '400', clientResponse: '', clientResponseCode: '', trigger: '', errorType: 'BusinessException', serverHttpStatus: '400', internalCode: '', message: '', responseCode: '' });
    expect(diagnostics(payload)).toContain('methods[0].sections[5].rows[0].serverHttpStatus');
  });

  it('requires explicit auth examples and rejects unused credential fields', () => {
    const payload = example();
    request(payload).authType = 'bearer';
    expect(diagnostics(payload)).toContain('methods[0].sections[3].authTokenExample');
    request(payload).authTokenExample = 'TOKEN_EXAMPLE';
    expect(validateCodexProjectImport(payload)).toEqual([]);
    request(payload).authPassword = 'PASSWORD_EXAMPLE';
    expect(diagnostics(payload)).toContain('methods[0].sections[3].authPassword');
  });

  it('distinguishes numeric object keys from array indexes in diagnostic paths', () => {
    const payload = example('orchestration');
    Object.assign(request(payload).clientMappings!, { '123': 42 });
    expect(diagnostics(payload)).toContain('methods[0].sections[3].clientMappings["123"]');
  });

  it('isolates invalid generated files in a batch while keeping compatibility imports', () => {
    const invalid = example();
    request(invalid).rows[0].required = '±';
    const result = prepareProjectImportBatch([
      { name: 'valid.json', text: JSON.stringify(example()) }, { name: 'invalid.json', text: JSON.stringify(invalid) },
      { name: 'legacy.json', text: '{"version":2,"methods":[{"sections":[{"id":"goal","kind":"text"}]}]}' }
    ]);
    expect(result.items.map(item => item.sourceName)).toEqual(['valid.json', 'legacy.json']);
    expect(result.invalidFiles[0].reason).toContain('required');
  });

  it('keeps unmarked legacy values on the existing compatibility path', () => {
    const payload = example();
    delete (payload as { importProfile?: string }).importProfile;
    request(payload).rows[0].required = '±';
    request(payload).schemaInput = '{"type":"object"}';
    const loaded = loadWorkspaceProjectFromPayload(payload).methods[0].sections[3];
    expect(loaded).toMatchObject({ schemaInput: '{"type":"object"}' });
    if (loaded.kind !== 'parsed') throw new Error('Expected parsed section');
    expect(loaded.rows[0].required).toBe('±');
  });
});

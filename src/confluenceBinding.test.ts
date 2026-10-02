import { afterEach, describe, expect, it } from 'vitest';
import { normalizeConfluenceBinding } from './confluenceBinding';
import { asWorkspaceProjectData, loadWorkspaceProject } from './workspaceBootstrap';
import { createInitialSections } from './sectionFactories';
import { buildWorkspaceImportFromMethodPayload, loadWorkspaceProjectFromPayload, prepareMethodsMerge } from './projectImport';

const binding = {
  baseUrl: 'https://confluence.example.test', spaceKey: '~tester', pageId: '123',
  lastPublishedVersion: 3, publishedFingerprint: 'a1b2c3d4', publishedAt: '2026-10-02T10:00:00.000Z'
};
afterEach(() => localStorage.clear());

describe('Confluence publication binding', () => {
  it('retains only metadata, excluding credentials and remote tree/content', () => {
    expect(normalizeConfluenceBinding({ ...binding, token: 'do-not-persist', children: [{ id: '1' }], storage: '<p>private</p>' }))
      .toEqual(binding);
  });

  it.each([
    { ...binding, baseUrl: 'https://user:password@confluence.example.test' },
    { ...binding, baseUrl: 'https://confluence.example.test/?token=secret' },
    { ...binding, baseUrl: 'javascript:alert(1)' },
    { ...binding, lastPublishedVersion: 0 },
    { ...binding, pageId: '../private' }
  ])('discards malformed imported bindings', (value) => {
    expect(normalizeConfluenceBinding(value)).toBeUndefined();
  });

  it('preserves the binding through Workspace v3 save and reload without persisting its extra fields', () => {
    const method = { id: 'm1', name: 'Method', updatedAt: binding.publishedAt, sections: [],
      confluence: { ...binding, token: 'do-not-persist', tree: ['private'] } };
    const workspace = asWorkspaceProjectData('Project', [method], 'm1', []);
    const serialized = JSON.stringify(workspace);
    expect(serialized).not.toContain('do-not-persist');
    expect(serialized).not.toContain('private');
    localStorage.setItem('binding-test', serialized);
    expect(loadWorkspaceProject('binding-test', true).methods[0].confluence).toEqual(binding);
    expect(loadWorkspaceProject('binding-test', true).version).toBe(3);
  });

  it('keeps a binding when restoring a method/project, but clears it when importing as a new method', () => {
    const method = { id: 'm1', name: 'Method', updatedAt: binding.publishedAt,
      sections: createInitialSections(), confluence: { ...binding, token: 'do-not-persist', ancestors: ['private'] } };
    const restoredMethod = buildWorkspaceImportFromMethodPayload(method, 'method.json');
    expect(restoredMethod.methods[0].confluence).toEqual(binding);
    const restoredProject = loadWorkspaceProjectFromPayload(restoredMethod);
    expect(restoredProject.methods[0].confluence).toEqual(binding);
    expect(JSON.stringify(restoredProject)).not.toContain('do-not-persist');
    expect(JSON.stringify(restoredProject)).not.toContain('private');
    expect(prepareMethodsMerge([restoredProject], []).methods[0].confluence).toBeUndefined();
  });
});

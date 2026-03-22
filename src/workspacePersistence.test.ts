import { describe, expect, it } from 'vitest';
import { asWorkspaceProjectData, loadWorkspaceProject, loadWorkspaceProjectFromPayload } from './workspacePersistence';
import type { DocSection, MethodDocument, WorkspaceProjectData } from './types';

function createMethodId(): string {
  return 'generated-method-id';
}

function createMethodDocument(name = 'Метод 1', sections: DocSection[] = [], id = createMethodId()): MethodDocument {
  return {
    id,
    name,
    updatedAt: '2026-03-21T00:00:00.000Z',
    sections
  };
}

function createWorkspaceSeed(): WorkspaceProjectData {
  const method = createMethodDocument();
  return {
    version: 3,
    updatedAt: '2026-03-21T00:00:00.000Z',
    activeMethodId: method.id,
    methods: [method],
    groups: []
  };
}

const deps = {
  createMethodId,
  createMethodDocument,
  createWorkspaceSeed,
  sanitizeSections: (sections: DocSection[]) => sections,
  enableMultiMethods: false
};

describe('workspacePersistence', () => {
  it('loads legacy project payload into workspace format', () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          version: 2,
          updatedAt: '2026-03-20T10:00:00.000Z',
          sections: [{ id: 'goal', title: 'Цель', enabled: true, kind: 'text', value: 'demo' }]
        })
    };

    const workspace = loadWorkspaceProject('doc-builder-project-v2', storage, deps);

    expect(workspace.methods).toHaveLength(1);
    expect(workspace.methods[0].sections[0]).toEqual(
      expect.objectContaining({
        id: 'goal',
        kind: 'text'
      })
    );
  });

  it('normalizes payload to a single active method when multi method mode is off', () => {
    const workspace = loadWorkspaceProjectFromPayload(
      {
        version: 3,
        updatedAt: '2026-03-20T10:00:00.000Z',
        activeMethodId: 'second',
        methods: [
          createMethodDocument('One', [], 'first'),
          createMethodDocument('Two', [], 'second')
        ],
        groups: [{ id: 'g1', name: 'Group', methodIds: ['first', 'second'], links: [] }]
      },
      deps
    );

    expect(workspace.activeMethodId).toBe('second');
    expect(workspace.methods).toHaveLength(1);
    expect(workspace.methods[0].id).toBe('second');
    expect(workspace.groups).toEqual([]);
  });

  it('falls back to the first available method when active id is stale', () => {
    const methods = [createMethodDocument('One', [], 'first')];

    const workspace = asWorkspaceProjectData(methods, 'missing', [], deps);

    expect(workspace.activeMethodId).toBe('first');
    expect(workspace.methods).toHaveLength(1);
  });
});

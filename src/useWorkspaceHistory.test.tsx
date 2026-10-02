import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { useWorkspaceHistory } from './hooks/useWorkspaceHistory';
import type { ConfluenceBinding } from './confluenceTypes';
import type { MethodDocument, MethodGroup, ProjectFlow, ProjectSection } from './types';

function createMethod(name: string): MethodDocument {
  return {
    id: 'method-1',
    name,
    updatedAt: '2026-04-29T00:00:00Z',
    sections: []
  };
}

function useHistoryHarness(initialMethods: MethodDocument[] = [createMethod('Method A')]) {
  const [projectName, setProjectName] = useState('Project A');
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [methods, setMethodsState] = useState<MethodDocument[]>(initialMethods);
  const [methodGroups, setMethodGroups] = useState<MethodGroup[]>([]);
  const [projectSections, setProjectSections] = useState<ProjectSection[]>([]);
  const [flows, setFlows] = useState<ProjectFlow[]>([]);
  const [activeMethodId, setActiveMethodId] = useState('method-1');
  const [selectedId, setSelectedId] = useState('');
  const history = useWorkspaceHistory({
    projectName,
    methods,
    methodGroups,
    projectSections,
    flows,
    activeMethodId,
    selectedId,
    workspaceVersion,
    historyLimit: 50,
    historyCoalesceMs: -1,
    normalizeProjectName: (value) => value?.trim() || 'New Project',
    deepClone: (value) => JSON.parse(JSON.stringify(value)),
    setProjectName,
    setMethodsState,
    setMethodGroups,
    setProjectSections,
    setFlows,
    setActiveMethodId,
    setSelectedId
  });
  function updateProjectName(value: string): void {
    setWorkspaceVersion((current) => current + 1);
    setProjectName(value);
  }

  function updateMethods(value: MethodDocument[], recordHistory = true): void {
    if (recordHistory) setWorkspaceVersion((current) => current + 1);
    setMethodsState(value);
  }

  return { projectName, methods, setProjectName: updateProjectName, setMethods: updateMethods, ...history };
}

const publishedBinding: ConfluenceBinding = {
  baseUrl: 'https://confluence.example.test', spaceKey: 'TEST', pageId: '123',
  lastPublishedVersion: 1, publishedFingerprint: 'docbuilder-v1-a1b2c3d4a1b2c3d4',
  publishedAt: '2026-10-02T10:00:00.000Z'
};

describe('useWorkspaceHistory', () => {
  it('keeps the first publication binding on undo and its newer external version on redo', () => {
    const { result } = renderHook(() => useHistoryHarness());
    act(() => result.current.setMethods([{ ...result.current.methods[0], name: 'Edited method' }]));
    act(() => result.current.setMethods([{ ...result.current.methods[0], confluence: publishedBinding }], false));

    act(() => result.current.undoWorkspace());
    expect(result.current.methods[0].name).toBe('Method A');
    expect(result.current.methods[0].confluence).toEqual(publishedBinding);
    expect((result.current.getPersistedHistoryState().lastSnapshot?.methods[0] as MethodDocument).confluence)
      .toEqual(publishedBinding);

    const newerBinding = { ...publishedBinding, lastPublishedVersion: 2, publishedFingerprint: 'docbuilder-v1-0000000000000002' };
    act(() => result.current.setMethods([{ ...result.current.methods[0], confluence: newerBinding }], false));
    act(() => result.current.redoWorkspace());
    expect(result.current.methods[0].name).toBe('Edited method');
    expect(result.current.methods[0].confluence).toEqual(newerBinding);
    expect((result.current.getPersistedHistoryState().lastSnapshot?.methods[0] as MethodDocument).confluence)
      .toEqual(newerBinding);

    act(() => result.current.setProjectName('Project after publication'));
    act(() => result.current.undoWorkspace());
    expect(result.current.methods[0].confluence).toEqual(newerBinding);
  });

  it('does not resurrect a binding removed from an existing method', () => {
    const { result } = renderHook(() => useHistoryHarness([{ ...createMethod('Method A'), confluence: publishedBinding }]));
    act(() => result.current.setMethods([{ ...result.current.methods[0], name: 'Edited method' }]));
    act(() => result.current.setMethods([{ ...result.current.methods[0], confluence: undefined }], false));

    act(() => result.current.undoWorkspace());
    expect(result.current.methods[0].name).toBe('Method A');
    expect(result.current.methods[0].confluence).toBeUndefined();
  });

  it('restores a deleted method together with its last recorded publication binding', () => {
    const { result } = renderHook(() => useHistoryHarness([{ ...createMethod('Method A'), confluence: publishedBinding }]));
    act(() => result.current.setMethods([]));
    expect(result.current.methods).toHaveLength(0);

    act(() => result.current.undoWorkspace());
    expect(result.current.methods[0].name).toBe('Method A');
    expect(result.current.methods[0].confluence).toEqual(publishedBinding);
  });

  it('keeps an immediate edit undoable after applying an undo snapshot', async () => {
    const { result } = renderHook(() => useHistoryHarness());

    await act(async () => {});

    act(() => {
      result.current.setProjectName('Project B');
    });
    await act(async () => {});

    act(() => {
      result.current.undoWorkspace();
    });
    await act(async () => {});
    expect(result.current.projectName).toBe('Project A');

    act(() => {
      result.current.setProjectName('Project C');
    });
    await act(async () => {});

    act(() => {
      result.current.undoWorkspace();
    });
    await act(async () => {});

    expect(result.current.projectName).toBe('Project A');
  });
});

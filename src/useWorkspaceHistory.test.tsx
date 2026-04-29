import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { useWorkspaceHistory } from './hooks/useWorkspaceHistory';
import type { MethodDocument, MethodGroup, ProjectFlow, ProjectSection } from './types';

function createMethod(name: string): MethodDocument {
  return {
    id: 'method-1',
    name,
    updatedAt: '2026-04-29T00:00:00Z',
    sections: []
  };
}

function useHistoryHarness() {
  const [projectName, setProjectName] = useState('Project A');
  const [methods, setMethodsState] = useState<MethodDocument[]>([createMethod('Method A')]);
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
  return { projectName, setProjectName, ...history };
}

describe('useWorkspaceHistory', () => {
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

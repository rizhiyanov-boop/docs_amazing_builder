import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { useRemoteProjectAutosave } from './hooks/useRemoteProjectAutosave';
import type { WorkspaceProjectData } from './types';

type HarnessProps = {
  workspace: WorkspaceProjectData;
  saveWorkspace: (params: { projectId?: string; name: string; workspace: WorkspaceProjectData }) => Promise<{ id: string; updatedAt: string }>;
  hiddenProvider: () => boolean;
};

function HookHarness({ workspace, saveWorkspace, hiddenProvider }: HarnessProps) {
  const remoteHydratedRef = useRef(true);
  const remoteSaveInFlightRef = useRef(false);
  const remotePendingChangesRef = useRef(0);
  const remoteLastObservedHashRef = useRef('');
  const remoteLastSavedHashRef = useRef('');

  useRemoteProjectAutosave({
    authUser: { id: 'usr_1', login: 'user' },
    remoteHydratedRef,
    remoteSaveInFlightRef,
    remotePendingChangesRef,
    remoteLastObservedHashRef,
    remoteLastSavedHashRef,
    normalizedProjectName: workspace.projectName ?? 'Test',
    methods: workspace.methods,
    activeMethodId: workspace.activeMethodId ?? '',
    methodGroups: workspace.groups,
    projectSections: workspace.projectSections ?? [],
    flows: workspace.flows ?? [],
    serverProjectId: 'prj_1',
    remoteSaveChangeThreshold: 10,
    remoteSaveIdleMs: 30,
    buildWorkspace: () => workspace,
    saveWorkspace,
    onSaved: () => {},
    onError: () => {}
  });

  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: hiddenProvider
  });

  return null;
}

function createWorkspace(name: string): WorkspaceProjectData {
  const now = '2026-05-07T00:00:00.000Z';
  return {
    version: 3,
    projectName: 'Test',
    updatedAt: now,
    activeMethodId: 'method_1',
    methods: [{ id: 'method_1', name, updatedAt: now, sections: [] }],
    groups: [],
    projectSections: [],
    flows: []
  };
}

describe('useRemoteProjectAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not re-save unchanged workspace hash', async () => {
    const saveWorkspace = vi.fn().mockResolvedValue({ id: 'prj_1', updatedAt: '2026-05-07T00:00:00.000Z' });
    const hiddenState = { value: false };

    const { rerender } = render(
      <HookHarness
        workspace={createWorkspace('Method A')}
        saveWorkspace={saveWorkspace}
        hiddenProvider={() => hiddenState.value}
      />
    );

    await vi.runAllTimersAsync();
    expect(saveWorkspace).toHaveBeenCalledTimes(1);

    rerender(
      <HookHarness
        workspace={createWorkspace('Method A')}
        saveWorkspace={saveWorkspace}
        hiddenProvider={() => hiddenState.value}
      />
    );
    await vi.runAllTimersAsync();
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
  });

  it('defers autosave while document is hidden and flushes on visibilitychange', async () => {
    const saveWorkspace = vi.fn().mockResolvedValue({ id: 'prj_1', updatedAt: '2026-05-07T00:00:00.000Z' });
    const hiddenState = { value: true };

    render(
      <HookHarness
        workspace={createWorkspace('Method B')}
        saveWorkspace={saveWorkspace}
        hiddenProvider={() => hiddenState.value}
      />
    );

    await vi.runAllTimersAsync();
    expect(saveWorkspace).toHaveBeenCalledTimes(0);

    hiddenState.value = false;
    document.dispatchEvent(new Event('visibilitychange'));

    await vi.runAllTimersAsync();
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
  });
});

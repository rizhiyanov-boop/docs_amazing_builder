import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { MethodDocument, MethodGroup, ProjectFlow, ProjectSection, WorkspaceProjectData } from '../types';
import type { AuthUser as ServerAuthUser } from '../serverSyncClient';

type SaveResult = {
  id: string;
  updatedAt: string;
};

type UseRemoteProjectAutosaveOptions = {
  authUser: ServerAuthUser | null;
  remoteHydratedRef: MutableRefObject<boolean>;
  normalizedProjectName: string;
  methods: MethodDocument[];
  activeMethodId: string;
  methodGroups: MethodGroup[];
  projectSections: ProjectSection[];
  flows: ProjectFlow[];
  serverProjectId: string | null;
  remoteSaveChangeThreshold: number;
  remoteSaveIdleMs: number;
  buildWorkspace: () => WorkspaceProjectData;
  saveWorkspace: (params: {
    projectId?: string;
    name: string;
    workspace: WorkspaceProjectData;
  }) => Promise<SaveResult>;
  onSaved: (params: {
    saved: SaveResult;
    workspace: WorkspaceProjectData;
    projectName: string;
    workspaceHash: string;
  }) => void;
  onError: (message: string) => void;
};

type UseRemoteProjectAutosaveResult = {
  remoteSaveInFlightRef: MutableRefObject<boolean>;
  remotePendingChangesRef: MutableRefObject<number>;
  remoteLastObservedHashRef: MutableRefObject<string>;
  remoteLastSavedHashRef: MutableRefObject<string>;
  cancelPendingRemoteSave: () => void;
  resetRemoteTracking: () => void;
};

export function useRemoteProjectAutosave({
  authUser,
  remoteHydratedRef,
  normalizedProjectName,
  methods,
  activeMethodId,
  methodGroups,
  projectSections,
  flows,
  serverProjectId,
  remoteSaveChangeThreshold,
  remoteSaveIdleMs,
  buildWorkspace,
  saveWorkspace,
  onSaved,
  onError
}: UseRemoteProjectAutosaveOptions): UseRemoteProjectAutosaveResult {
  const remoteSaveTimerRef = useRef<number | null>(null);
  const remoteSaveInFlightRef = useRef(false);
  const remotePendingChangesRef = useRef(0);
  const remoteLastObservedHashRef = useRef('');
  const remoteLastSavedHashRef = useRef('');

  function cancelPendingRemoteSave(): void {
    if (remoteSaveTimerRef.current !== null) {
      window.clearTimeout(remoteSaveTimerRef.current);
      remoteSaveTimerRef.current = null;
    }
  }

  function resetRemoteTracking(): void {
    cancelPendingRemoteSave();
    remotePendingChangesRef.current = 0;
    remoteLastObservedHashRef.current = '';
    remoteLastSavedHashRef.current = '';
  }

  useEffect(() => {
    if (!authUser || !remoteHydratedRef.current) return;

    const workspace = buildWorkspace();
    const currentHash = JSON.stringify(workspace);

    if (currentHash === remoteLastObservedHashRef.current) {
      return;
    }

    remoteLastObservedHashRef.current = currentHash;
    remotePendingChangesRef.current += 1;

    const flushRemoteSave = async (): Promise<void> => {
      if (!authUser || !remoteHydratedRef.current) return;
      if (remoteSaveInFlightRef.current) return;
      if (remotePendingChangesRef.current <= 0) return;

      remoteSaveInFlightRef.current = true;
      cancelPendingRemoteSave();

      const latestWorkspace = buildWorkspace();
      const workspaceHash = JSON.stringify(latestWorkspace);

      try {
        const saved = await saveWorkspace({
          projectId: serverProjectId ?? undefined,
          name: normalizedProjectName,
          workspace: latestWorkspace
        });
        onSaved({
          saved,
          workspace: latestWorkspace,
          projectName: normalizedProjectName,
          workspaceHash
        });
        remoteLastSavedHashRef.current = workspaceHash;
        remotePendingChangesRef.current = 0;
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Ошибка сохранения на сервер');
      } finally {
        remoteSaveInFlightRef.current = false;
      }
    };

    if (!serverProjectId || remotePendingChangesRef.current >= remoteSaveChangeThreshold) {
      void flushRemoteSave();
      return;
    }

    cancelPendingRemoteSave();
    remoteSaveTimerRef.current = window.setTimeout(() => {
      void flushRemoteSave();
    }, remoteSaveIdleMs);

    return () => {
      cancelPendingRemoteSave();
    };
  }, [
    authUser,
    normalizedProjectName,
    methods,
    activeMethodId,
    methodGroups,
    projectSections,
    flows,
    serverProjectId,
    remoteHydratedRef,
    remoteSaveChangeThreshold,
    remoteSaveIdleMs,
    buildWorkspace,
    saveWorkspace,
    onSaved,
    onError
  ]);

  return {
    remoteSaveInFlightRef,
    remotePendingChangesRef,
    remoteLastObservedHashRef,
    remoteLastSavedHashRef,
    cancelPendingRemoteSave,
    resetRemoteTracking
  };
}

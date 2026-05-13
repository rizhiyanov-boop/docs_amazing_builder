import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { MethodDocument, MethodGroup, ProjectFlow, ProjectSection, WorkspaceProjectData } from '../types';
import type { AuthUser as ServerAuthUser } from '../serverSyncClient';
import { hashWorkspace } from '../workspaceHash';

type SaveResult = {
  id: string;
  updatedAt: string;
};

type UseRemoteProjectAutosaveOptions = {
  authUser: ServerAuthUser | null;
  remoteHydratedRef: MutableRefObject<boolean>;
  remoteSaveInFlightRef: MutableRefObject<boolean>;
  remotePendingChangesRef: MutableRefObject<number>;
  remoteLastObservedHashRef: MutableRefObject<string>;
  remoteLastSavedHashRef: MutableRefObject<string>;
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
  remoteSaveInFlightRef,
  remotePendingChangesRef,
  remoteLastObservedHashRef,
  remoteLastSavedHashRef,
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

  const flushRemoteSave = useCallback(async (): Promise<void> => {
    if (!authUser || !remoteHydratedRef.current) return;
    if (remoteSaveInFlightRef.current) return;
    if (remotePendingChangesRef.current <= 0) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    remoteSaveInFlightRef.current = true;
    cancelPendingRemoteSave();

    try {
      const latestWorkspace = buildWorkspace();
      const workspaceHash = hashWorkspace(latestWorkspace);

      if (workspaceHash === remoteLastSavedHashRef.current) {
        remotePendingChangesRef.current = 0;
        return;
      }

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
      onError(error instanceof Error ? error.message : 'РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ РЅР° СЃРµСЂРІРµСЂ');
    } finally {
      remoteSaveInFlightRef.current = false;
    }
  }, [
    authUser,
    buildWorkspace,
    normalizedProjectName,
    onError,
    onSaved,
    remoteHydratedRef,
    remotePendingChangesRef,
    remoteSaveInFlightRef,
    saveWorkspace,
    serverProjectId,
    remoteLastSavedHashRef
  ]);

  useEffect(() => {
    if (!authUser || !remoteHydratedRef.current) return;

    const workspace = buildWorkspace();
    const currentHash = hashWorkspace(workspace);

    if (currentHash === remoteLastObservedHashRef.current) {
      return;
    }

    remoteLastObservedHashRef.current = currentHash;
    remotePendingChangesRef.current += 1;

    if (typeof document !== 'undefined' && document.hidden) return;

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
    remotePendingChangesRef,
    remoteLastObservedHashRef,
    remoteSaveChangeThreshold,
    remoteSaveIdleMs,
    buildWorkspace,
    flushRemoteSave
  ]);

  useEffect(() => {
    if (!authUser || !remoteHydratedRef.current) return;

    const handleVisibilityChange = (): void => {
      if (document.hidden) return;
      if (remotePendingChangesRef.current <= 0) return;
      if (remoteSaveInFlightRef.current) return;

      cancelPendingRemoteSave();
      remoteSaveTimerRef.current = window.setTimeout(() => {
        void flushRemoteSave();
      }, remoteSaveIdleMs);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    authUser,
    remoteHydratedRef,
    remotePendingChangesRef,
    remoteSaveInFlightRef,
    flushRemoteSave,
    remoteSaveIdleMs
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

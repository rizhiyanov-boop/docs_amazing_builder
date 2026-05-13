import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ApiError,
  fetchCurrentUser,
  listServerProjects,
  loadServerProject,
  saveServerProject,
  type AuthUser as ServerAuthUser,
  type PersistedHistoryState,
  type ProjectListItem
} from '../serverSyncClient';
import type { WorkspaceProjectData } from '../types';
import { hashWorkspace } from '../workspaceHash';

export type ServerProjectPayload = {
  id: string;
  name: string;
  workspace: WorkspaceProjectData;
  history?: PersistedHistoryState | null;
  updatedAt: string;
};

export type CachedServerProjectData = {
  workspace: WorkspaceProjectData;
  history: PersistedHistoryState | null;
  loadedAt: number;
};

export type ProjectMethodPreview = {
  id: string;
  name: string;
  sectionCount: number;
};

type UseServerSyncOptions = {
  storageServerProjectIdKey: string;
  projectCacheTtlMs: number;
  projectPreloadConcurrency: number;
  projectPreloadStartDelayMs: number;
  remoteHydratedRef: React.MutableRefObject<boolean>;
  remoteLastObservedHashRef: React.MutableRefObject<string>;
  remoteLastSavedHashRef: React.MutableRefObject<string>;
  remotePendingChangesRef: React.MutableRefObject<number>;
  normalizeProjectName: (value: string | null | undefined) => string;
  deepClone: <T>(value: T) => T;
  applyWorkspaceState: (workspace: WorkspaceProjectData) => void;
  applyPersistedHistoryState: (history: PersistedHistoryState | null) => void;
  setToastMessage: (message: string) => void;
};

function loadPersistedServerProjectId(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function getMethodPreviews(workspace: WorkspaceProjectData): ProjectMethodPreview[] {
  return workspace.methods.map((method) => ({
    id: method.id,
    name: method.name,
    sectionCount: method.sections.length
  }));
}

export function useServerSync({
  storageServerProjectIdKey,
  projectCacheTtlMs,
  projectPreloadConcurrency,
  projectPreloadStartDelayMs,
  remoteHydratedRef,
  remoteLastObservedHashRef,
  remoteLastSavedHashRef,
  remotePendingChangesRef,
  normalizeProjectName,
  deepClone,
  applyWorkspaceState,
  applyPersistedHistoryState,
  setToastMessage
}: UseServerSyncOptions) {
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<ServerAuthUser | null>(null);
  const [serverProjectId, setServerProjectId] = useState<string | null>(() => loadPersistedServerProjectId(storageServerProjectIdKey));
  const [serverProjects, setServerProjects] = useState<ProjectListItem[]>([]);
  const [projectMethodPreviews, setProjectMethodPreviews] = useState<Record<string, ProjectMethodPreview[]>>({});
  const [serverSyncError, setServerSyncError] = useState('');
  const [isProjectSwitching, setIsProjectSwitching] = useState(false);
  const [switchingProjectId, setSwitchingProjectId] = useState<string | null>(null);
  const projectCacheRef = useRef<Map<string, CachedServerProjectData>>(new Map());
  const preloadInFlightRef = useRef<Set<string>>(new Set());
  const preloadQueueTimerRef = useRef<number | null>(null);

  const isProjectCacheFresh = useCallback((cached: CachedServerProjectData): boolean => (
    Date.now() - cached.loadedAt < projectCacheTtlMs
  ), [projectCacheTtlMs]);

  const upsertProjectCache = useCallback((projectId: string, cached: CachedServerProjectData): void => {
    projectCacheRef.current.set(projectId, cached);
    setProjectMethodPreviews((current) => ({
      ...current,
      [projectId]: getMethodPreviews(cached.workspace)
    }));
  }, []);

  const removeProjectCache = useCallback((projectId: string): void => {
    projectCacheRef.current.delete(projectId);
    setProjectMethodPreviews((current) => {
      if (!(projectId in current)) return current;
      const next = { ...current };
      delete next[projectId];
      return next;
    });
  }, []);

  const upsertServerProjectListEntry = useCallback((entry: ProjectListItem): void => {
    setServerProjects((current) => {
      const next = [entry, ...current.filter((item) => item.id !== entry.id)];
      next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return next;
    });
  }, []);

  const saveServerProjectWithFallback = useCallback(async (params: {
    projectId?: string;
    name: string;
    workspace: WorkspaceProjectData;
  }): Promise<{ id: string; updatedAt: string }> => {
    try {
      return await saveServerProject(params);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && params.projectId) {
        setServerProjectId(null);
        setServerSyncError('Серверный проект удалён. Создаю новую копию проекта.');
        return saveServerProject({
          name: params.name,
          workspace: params.workspace
        });
      }
      throw error;
    }
  }, []);

  const saveRemoteWorkspace = useCallback(async (params: { projectId?: string; name: string; workspace: WorkspaceProjectData }) => (
    saveServerProjectWithFallback(params)
  ), [saveServerProjectWithFallback]);

  const payloadToCachedServerProject = useCallback((payload: ServerProjectPayload): CachedServerProjectData => {
    const normalizedWorkspace = {
      ...payload.workspace,
      projectName: normalizeProjectName(payload.workspace.projectName || payload.name)
    };

    return {
      workspace: deepClone(normalizedWorkspace),
      history: null,
      loadedAt: Date.now()
    };
  }, [deepClone, normalizeProjectName]);

  const applyLoadedServerProject = useCallback((payload: ServerProjectPayload): void => {
    const cached = payloadToCachedServerProject(payload);
    const normalizedWorkspace = deepClone(cached.workspace);

    applyWorkspaceState(normalizedWorkspace);
    applyPersistedHistoryState(null);
    setServerProjectId(payload.id);
    upsertProjectCache(payload.id, cached);
    const loadedHash = hashWorkspace(normalizedWorkspace);
    remoteLastObservedHashRef.current = loadedHash;
    remoteLastSavedHashRef.current = loadedHash;
    remotePendingChangesRef.current = 0;
  }, [
    applyPersistedHistoryState,
    applyWorkspaceState,
    deepClone,
    payloadToCachedServerProject,
    remoteLastObservedHashRef,
    remoteLastSavedHashRef,
    remotePendingChangesRef,
    upsertProjectCache
  ]);

  const applyCachedServerProject = useCallback((projectId: string, cached: CachedServerProjectData): void => {
    const cachedWorkspace = deepClone(cached.workspace);
    applyWorkspaceState(cachedWorkspace);
    applyPersistedHistoryState(null);
    setServerProjectId(projectId);
    const loadedHash = hashWorkspace(cachedWorkspace);
    remoteLastObservedHashRef.current = loadedHash;
    remoteLastSavedHashRef.current = loadedHash;
    remotePendingChangesRef.current = 0;
  }, [
    applyPersistedHistoryState,
    applyWorkspaceState,
    deepClone,
    remoteLastObservedHashRef,
    remoteLastSavedHashRef,
    remotePendingChangesRef
  ]);

  const loadServerProjectIntoWorkspace = useCallback(async (projectId: string): Promise<void> => {
    const payload = (await loadServerProject(projectId)) as ServerProjectPayload;
    applyLoadedServerProject(payload);
  }, [applyLoadedServerProject]);

  const preloadServerProjectToCache = useCallback(async (projectId: string): Promise<void> => {
    if (!projectId) return;
    const cached = projectCacheRef.current.get(projectId);
    if (cached && isProjectCacheFresh(cached)) return;

    const payload = (await loadServerProject(projectId)) as ServerProjectPayload;
    const nextCached = payloadToCachedServerProject(payload);
    upsertProjectCache(projectId, nextCached);
  }, [isProjectCacheFresh, payloadToCachedServerProject, upsertProjectCache]);

  const handleServerProjectSelect = useCallback(async (nextId: string): Promise<void> => {
    if (!nextId) {
      setServerProjectId(null);
      setServerSyncError('');
      setToastMessage('Выбран новый проект');
      return;
    }

    if (nextId === serverProjectId && !isProjectSwitching) {
      return;
    }

    setIsProjectSwitching(true);
    setSwitchingProjectId(nextId);

    try {
      remoteHydratedRef.current = false;
      const cached = projectCacheRef.current.get(nextId);
      if (cached && isProjectCacheFresh(cached)) {
        applyCachedServerProject(nextId, cached);
        setServerSyncError('');
        setToastMessage('Проект открыт из кэша');
        return;
      }
      await loadServerProjectIntoWorkspace(nextId);
      setServerSyncError('');
      setToastMessage('Проект загружен с сервера');
    } catch (error) {
      setServerSyncError(error instanceof Error ? error.message : 'Ошибка синхронизации с сервером');
    } finally {
      remoteHydratedRef.current = true;
      setSwitchingProjectId(null);
      setIsProjectSwitching(false);
    }
  }, [
    applyCachedServerProject,
    isProjectCacheFresh,
    isProjectSwitching,
    loadServerProjectIntoWorkspace,
    remoteHydratedRef,
    serverProjectId,
    setToastMessage
  ]);

  const handleRemoteAutosaveSaved = useCallback((params: {
    saved: { id: string; updatedAt: string };
    workspace: WorkspaceProjectData;
    projectName: string;
    workspaceHash: string;
  }): void => {
    setServerProjectId(params.saved.id);
    upsertProjectCache(params.saved.id, {
      workspace: deepClone(params.workspace),
      history: null,
      loadedAt: Date.now()
    });
    setServerSyncError('');
    upsertServerProjectListEntry({ id: params.saved.id, name: params.projectName, updatedAt: params.saved.updatedAt });
    void params.workspaceHash;
  }, [deepClone, upsertProjectCache, upsertServerProjectListEntry]);

  const handleRemoteAutosaveError = useCallback((message: string): void => {
    setServerSyncError(message);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateFromServer(): Promise<void> {
      try {
        setAuthLoading(true);
        const user = await fetchCurrentUser();
        if (cancelled) return;

        setAuthUser(user);
        setServerSyncError('');

        if (!user) {
          setServerProjects([]);
          remoteHydratedRef.current = true;
          return;
        }

        const projects = await listServerProjects();
        if (cancelled) return;
        setServerProjects(projects);
        if (projects.length === 0) {
          setServerProjectId(null);
          remoteHydratedRef.current = true;
          return;
        }

        setServerProjectId((current) => {
          if (current && projects.some((project) => project.id === current)) {
            return current;
          }
          return null;
        });
      } catch (error) {
        if (!cancelled) {
          setServerSyncError(error instanceof Error ? error.message : 'Ошибка синхронизации с сервером');
        }
      } finally {
        if (!cancelled) {
          remoteHydratedRef.current = true;
          setAuthLoading(false);
        }
      }
    }

    void hydrateFromServer();

    return () => {
      cancelled = true;
    };
  }, [remoteHydratedRef]);

  useEffect(() => {
    try {
      if (serverProjectId) {
        localStorage.setItem(storageServerProjectIdKey, serverProjectId);
      } else {
        localStorage.removeItem(storageServerProjectIdKey);
      }
    } catch {
      // Ignore persistence errors for optional sync key.
    }
  }, [serverProjectId, storageServerProjectIdKey]);

  useEffect(() => {
    const availableProjectIds = new Set(serverProjects.map((project) => project.id));
    for (const cachedId of Array.from(projectCacheRef.current.keys())) {
      if (!availableProjectIds.has(cachedId)) {
        removeProjectCache(cachedId);
      }
    }
  }, [removeProjectCache, serverProjects]);

  const preloadServerProjectToCacheRef = useRef(preloadServerProjectToCache);

  useLayoutEffect(() => {
    preloadServerProjectToCacheRef.current = preloadServerProjectToCache;
  });

  useEffect(() => {
    if (!authUser) return;
    if (serverProjects.length === 0) return;

    let cancelled = false;

    if (preloadQueueTimerRef.current !== null) {
      window.clearTimeout(preloadQueueTimerRef.current);
      preloadQueueTimerRef.current = null;
    }

    const runPreloadQueue = async (): Promise<void> => {
      const targetIds = serverProjects
        .map((project) => project.id)
        .filter((projectId) => projectId !== serverProjectId);

      if (targetIds.length === 0) return;

      let cursor = 0;
      const worker = async (): Promise<void> => {
        while (!cancelled) {
          const targetId = targetIds[cursor];
          cursor += 1;
          if (!targetId) return;

          const cached = projectCacheRef.current.get(targetId);
          if (cached && isProjectCacheFresh(cached)) {
            continue;
          }
          if (preloadInFlightRef.current.has(targetId)) {
            continue;
          }

          preloadInFlightRef.current.add(targetId);
          try {
            await preloadServerProjectToCacheRef.current(targetId);
          } catch {
            // Ignore preload errors: they should not block interactive flow.
          } finally {
            preloadInFlightRef.current.delete(targetId);
          }
        }
      };

      const workers = Array.from(
        { length: Math.min(projectPreloadConcurrency, targetIds.length) },
        () => worker()
      );
      await Promise.all(workers);
    };

    preloadQueueTimerRef.current = window.setTimeout(() => {
      void runPreloadQueue();
      preloadQueueTimerRef.current = null;
    }, projectPreloadStartDelayMs);

    return () => {
      cancelled = true;
      if (preloadQueueTimerRef.current !== null) {
        window.clearTimeout(preloadQueueTimerRef.current);
        preloadQueueTimerRef.current = null;
      }
    };
  }, [
    authUser,
    isProjectCacheFresh,
    projectPreloadConcurrency,
    projectPreloadStartDelayMs,
    serverProjectId,
    serverProjects
  ]);

  useEffect(() => () => {
    if (preloadQueueTimerRef.current !== null) {
      window.clearTimeout(preloadQueueTimerRef.current);
    }
  }, []);

  return {
    authLoading,
    authUser,
    serverProjectId,
    serverProjects,
    projectMethodPreviews,
    serverSyncError,
    isProjectSwitching,
    switchingProjectId,
    projectCacheRef,
    setAuthUser,
    setServerProjectId,
    setServerProjects,
    setServerSyncError,
    upsertProjectCache,
    removeProjectCache,
    upsertServerProjectListEntry,
    saveServerProjectWithFallback,
    saveRemoteWorkspace,
    loadServerProjectIntoWorkspace,
    handleServerProjectSelect,
    applyCachedServerProject,
    handleRemoteAutosaveSaved,
    handleRemoteAutosaveError,
    isProjectCacheFresh
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { MethodDocument, MethodGroup, ProjectFlow, ProjectSection } from '../types';
import type { PersistedHistoryState } from '../serverSyncClient';

export type WorkspaceSnapshot = {
  projectName: string;
  methods: MethodDocument[];
  methodGroups: MethodGroup[];
  projectSections: ProjectSection[];
  flows: ProjectFlow[];
  activeMethodId: string;
  selectedId: string;
};

type UseWorkspaceHistoryOptions = {
  projectName: string;
  methods: MethodDocument[];
  methodGroups: MethodGroup[];
  projectSections: ProjectSection[];
  flows: ProjectFlow[];
  activeMethodId: string;
  selectedId: string;
  workspaceVersion: number;
  historyLimit: number;
  historyCoalesceMs: number;
  normalizeProjectName: (value: string | null | undefined) => string;
  deepClone: <T>(value: T) => T;
  setProjectName: Dispatch<SetStateAction<string>>;
  setMethodsState: Dispatch<SetStateAction<MethodDocument[]>>;
  setMethodGroups: Dispatch<SetStateAction<MethodGroup[]>>;
  setProjectSections: Dispatch<SetStateAction<ProjectSection[]>>;
  setFlows: Dispatch<SetStateAction<ProjectFlow[]>>;
  setActiveMethodId: Dispatch<SetStateAction<string>>;
  setSelectedId: Dispatch<SetStateAction<string>>;
};

type UseWorkspaceHistoryResult = {
  canUndo: boolean;
  canRedo: boolean;
  undoWorkspace: () => void;
  redoWorkspace: () => void;
  getPersistedHistoryState: () => PersistedHistoryState;
  applyPersistedHistoryState: (history: PersistedHistoryState | null) => void;
};

export function useWorkspaceHistory({
  projectName,
  methods,
  methodGroups,
  projectSections,
  flows,
  activeMethodId,
  selectedId,
  workspaceVersion,
  historyLimit,
  historyCoalesceMs,
  normalizeProjectName,
  deepClone,
  setProjectName,
  setMethodsState,
  setMethodGroups,
  setProjectSections,
  setFlows,
  setActiveMethodId,
  setSelectedId
}: UseWorkspaceHistoryOptions): UseWorkspaceHistoryResult {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const undoStackRef = useRef<WorkspaceSnapshot[]>([]);
  const redoStackRef = useRef<WorkspaceSnapshot[]>([]);
  const historyLastSnapshotRef = useRef<WorkspaceSnapshot | null>(null);
  const historyLastPushAtRef = useRef(0);
  const prevVersionRef = useRef(workspaceVersion);

  const cloneSnapshot = useCallback((snapshot: WorkspaceSnapshot): WorkspaceSnapshot => ({
    projectName: snapshot.projectName,
    methods: deepClone(snapshot.methods),
    methodGroups: deepClone(snapshot.methodGroups),
    projectSections: deepClone(snapshot.projectSections),
    flows: deepClone(snapshot.flows),
    activeMethodId: snapshot.activeMethodId,
    selectedId: snapshot.selectedId
  }), [deepClone]);

  const getWorkspaceSnapshot = useCallback((): WorkspaceSnapshot => ({
    projectName,
    methods,
    methodGroups,
    projectSections,
    flows,
    activeMethodId,
    selectedId
  }), [projectName, methods, methodGroups, projectSections, flows, activeMethodId, selectedId]);

  function applyWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void {
    historyLastSnapshotRef.current = cloneSnapshot(snapshot);
    prevVersionRef.current = workspaceVersion;
    setProjectName(snapshot.projectName);
    setMethodsState(snapshot.methods);
    setMethodGroups(snapshot.methodGroups);
    setProjectSections(snapshot.projectSections);
    setFlows(snapshot.flows);
    setActiveMethodId(snapshot.activeMethodId);
    setSelectedId(snapshot.selectedId);
  }

  function undoWorkspace(): void {
    if (undoStackRef.current.length === 0) return;
    const current = cloneSnapshot(getWorkspaceSnapshot());
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(current);
    applyWorkspaceSnapshot(cloneSnapshot(previous));
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }

  function redoWorkspace(): void {
    if (redoStackRef.current.length === 0) return;
    const current = cloneSnapshot(getWorkspaceSnapshot());
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(current);
    applyWorkspaceSnapshot(cloneSnapshot(next));
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }

  function toPersistedHistorySnapshot(snapshot: WorkspaceSnapshot): PersistedHistoryState['undoStack'][number] {
    return {
      projectName: snapshot.projectName,
      methods: deepClone(snapshot.methods) as unknown[],
      methodGroups: deepClone(snapshot.methodGroups) as unknown[],
      projectSections: deepClone(snapshot.projectSections) as unknown[],
      flows: deepClone(snapshot.flows) as unknown[],
      activeMethodId: snapshot.activeMethodId,
      selectedId: snapshot.selectedId
    };
  }

  function fromPersistedHistorySnapshot(snapshot: PersistedHistoryState['undoStack'][number]): WorkspaceSnapshot {
    return {
      projectName: normalizeProjectName(snapshot.projectName),
      methods: deepClone(snapshot.methods) as MethodDocument[],
      methodGroups: deepClone(snapshot.methodGroups) as MethodGroup[],
      projectSections: deepClone((snapshot as PersistedHistoryState['undoStack'][number] & { projectSections?: unknown[] }).projectSections ?? []) as ProjectSection[],
      flows: deepClone((snapshot as PersistedHistoryState['undoStack'][number] & { flows?: unknown[] }).flows ?? []) as ProjectFlow[],
      activeMethodId: snapshot.activeMethodId,
      selectedId: snapshot.selectedId
    };
  }

  function getPersistedHistoryState(): PersistedHistoryState {
    return {
      undoStack: undoStackRef.current.map((item) => toPersistedHistorySnapshot(item)),
      redoStack: redoStackRef.current.map((item) => toPersistedHistorySnapshot(item)),
      lastSnapshot: historyLastSnapshotRef.current ? toPersistedHistorySnapshot(historyLastSnapshotRef.current) : null,
      lastHash: '',
      lastPushAt: historyLastPushAtRef.current
    };
  }

  function applyPersistedHistoryState(history: PersistedHistoryState | null): void {
    if (!history) {
      undoStackRef.current = [];
      redoStackRef.current = [];
      historyLastSnapshotRef.current = null;
      historyLastPushAtRef.current = 0;
      prevVersionRef.current = workspaceVersion;
      setCanUndo(false);
      setCanRedo(false);
      return;
    }

    undoStackRef.current = history.undoStack.map((item) => fromPersistedHistorySnapshot(item));
    redoStackRef.current = history.redoStack.map((item) => fromPersistedHistorySnapshot(item));
    historyLastSnapshotRef.current = history.lastSnapshot ? fromPersistedHistorySnapshot(history.lastSnapshot) : null;
    historyLastPushAtRef.current = history.lastPushAt;
    prevVersionRef.current = workspaceVersion;
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }

  useEffect(() => {
    const snapshot = getWorkspaceSnapshot();

    if (!historyLastSnapshotRef.current) {
      historyLastSnapshotRef.current = cloneSnapshot(snapshot);
      prevVersionRef.current = workspaceVersion;
      setCanUndo(undoStackRef.current.length > 0);
      setCanRedo(redoStackRef.current.length > 0);
      return;
    }

    if (workspaceVersion === prevVersionRef.current) {
      return;
    }
    prevVersionRef.current = workspaceVersion;

    const now = Date.now();
    if (now - historyLastPushAtRef.current <= historyCoalesceMs) {
      return;
    }

    const previousSnapshot = historyLastSnapshotRef.current;
    historyLastSnapshotRef.current = cloneSnapshot(snapshot);
    undoStackRef.current.push(cloneSnapshot(previousSnapshot));
    if (undoStackRef.current.length > historyLimit) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    historyLastPushAtRef.current = now;
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, [workspaceVersion, cloneSnapshot, getWorkspaceSnapshot, historyCoalesceMs, historyLimit]);

  return {
    canUndo,
    canRedo,
    undoWorkspace,
    redoWorkspace,
    getPersistedHistoryState,
    applyPersistedHistoryState
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { MethodDocument, MethodGroup } from '../types';
import type { PersistedHistoryState } from '../serverSyncClient';

export type WorkspaceSnapshot = {
  projectName: string;
  methods: MethodDocument[];
  methodGroups: MethodGroup[];
  activeMethodId: string;
  selectedId: string;
};

type UseWorkspaceHistoryOptions = {
  projectName: string;
  methods: MethodDocument[];
  methodGroups: MethodGroup[];
  activeMethodId: string;
  selectedId: string;
  historyLimit: number;
  historyCoalesceMs: number;
  normalizeProjectName: (value: string | null | undefined) => string;
  deepClone: <T>(value: T) => T;
  setProjectName: Dispatch<SetStateAction<string>>;
  setMethodsState: Dispatch<SetStateAction<MethodDocument[]>>;
  setMethodGroups: Dispatch<SetStateAction<MethodGroup[]>>;
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
  activeMethodId,
  selectedId,
  historyLimit,
  historyCoalesceMs,
  normalizeProjectName,
  deepClone,
  setProjectName,
  setMethodsState,
  setMethodGroups,
  setActiveMethodId,
  setSelectedId
}: UseWorkspaceHistoryOptions): UseWorkspaceHistoryResult {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const undoStackRef = useRef<WorkspaceSnapshot[]>([]);
  const redoStackRef = useRef<WorkspaceSnapshot[]>([]);
  const historyLastSnapshotRef = useRef<WorkspaceSnapshot | null>(null);
  const historyLastHashRef = useRef('');
  const historyLastPushAtRef = useRef(0);
  const historySuspendRef = useRef(false);

  const cloneSnapshot = useCallback((snapshot: WorkspaceSnapshot): WorkspaceSnapshot => ({
    projectName: snapshot.projectName,
    methods: deepClone(snapshot.methods),
    methodGroups: deepClone(snapshot.methodGroups),
    activeMethodId: snapshot.activeMethodId,
    selectedId: snapshot.selectedId
  }), [deepClone]);

  const getWorkspaceSnapshot = useCallback((): WorkspaceSnapshot => ({
    projectName,
    methods,
    methodGroups,
    activeMethodId,
    selectedId
  }), [projectName, methods, methodGroups, activeMethodId, selectedId]);

  function applyWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void {
    historySuspendRef.current = true;
    setProjectName(snapshot.projectName);
    setMethodsState(snapshot.methods);
    setMethodGroups(snapshot.methodGroups);
    setActiveMethodId(snapshot.activeMethodId);
    setSelectedId(snapshot.selectedId);
    window.setTimeout(() => {
      historySuspendRef.current = false;
    }, 0);
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
      activeMethodId: snapshot.activeMethodId,
      selectedId: snapshot.selectedId
    };
  }

  function fromPersistedHistorySnapshot(snapshot: PersistedHistoryState['undoStack'][number]): WorkspaceSnapshot {
    return {
      projectName: normalizeProjectName(snapshot.projectName),
      methods: deepClone(snapshot.methods) as MethodDocument[],
      methodGroups: deepClone(snapshot.methodGroups) as MethodGroup[],
      activeMethodId: snapshot.activeMethodId,
      selectedId: snapshot.selectedId
    };
  }

  function getPersistedHistoryState(): PersistedHistoryState {
    return {
      undoStack: undoStackRef.current.map((item) => toPersistedHistorySnapshot(item)),
      redoStack: redoStackRef.current.map((item) => toPersistedHistorySnapshot(item)),
      lastSnapshot: historyLastSnapshotRef.current ? toPersistedHistorySnapshot(historyLastSnapshotRef.current) : null,
      lastHash: historyLastHashRef.current,
      lastPushAt: historyLastPushAtRef.current
    };
  }

  function applyPersistedHistoryState(history: PersistedHistoryState | null): void {
    if (!history) {
      undoStackRef.current = [];
      redoStackRef.current = [];
      historyLastSnapshotRef.current = null;
      historyLastHashRef.current = '';
      historyLastPushAtRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);
      return;
    }

    undoStackRef.current = history.undoStack.map((item) => fromPersistedHistorySnapshot(item));
    redoStackRef.current = history.redoStack.map((item) => fromPersistedHistorySnapshot(item));
    historyLastSnapshotRef.current = history.lastSnapshot ? fromPersistedHistorySnapshot(history.lastSnapshot) : null;
    historyLastHashRef.current = history.lastHash;
    historyLastPushAtRef.current = history.lastPushAt;
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }

  useEffect(() => {
    const snapshot = getWorkspaceSnapshot();
    const hash = JSON.stringify(snapshot);

    if (!historyLastSnapshotRef.current) {
      historyLastSnapshotRef.current = cloneSnapshot(snapshot);
      historyLastHashRef.current = hash;
      setCanUndo(undoStackRef.current.length > 0);
      setCanRedo(redoStackRef.current.length > 0);
      return;
    }

    if (hash === historyLastHashRef.current) {
      return;
    }

    const previousSnapshot = historyLastSnapshotRef.current;
    historyLastSnapshotRef.current = cloneSnapshot(snapshot);
    historyLastHashRef.current = hash;

    if (historySuspendRef.current) {
      return;
    }

    const now = Date.now();
    if (now - historyLastPushAtRef.current <= historyCoalesceMs) {
      return;
    }

    undoStackRef.current.push(cloneSnapshot(previousSnapshot));
    if (undoStackRef.current.length > historyLimit) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    historyLastPushAtRef.current = now;
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, [cloneSnapshot, getWorkspaceSnapshot, historyCoalesceMs, historyLimit]);

  return {
    canUndo,
    canRedo,
    undoWorkspace,
    redoWorkspace,
    getPersistedHistoryState,
    applyPersistedHistoryState
  };
}

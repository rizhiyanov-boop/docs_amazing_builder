import type { DocSection, MethodDocument, MethodGroup, ProjectData, WorkspaceProjectData } from './types';

type CreateMethodId = () => string;
type CreateMethodDocument = (name?: string, sections?: DocSection[], id?: string) => MethodDocument;
type CreateWorkspaceSeed = () => WorkspaceProjectData;
type SanitizeSections = (sections: DocSection[]) => DocSection[];
type StorageLike = Pick<Storage, 'getItem'>;

type WorkspaceDeps = {
  createMethodId: CreateMethodId;
  createMethodDocument: CreateMethodDocument;
  createWorkspaceSeed: CreateWorkspaceSeed;
  sanitizeSections: SanitizeSections;
  enableMultiMethods: boolean;
};

function normalizeWorkspaceForModeInternal(
  workspace: WorkspaceProjectData,
  enableMultiMethods: boolean,
  createMethodDocument: CreateMethodDocument
): WorkspaceProjectData {
  if (enableMultiMethods) return workspace;

  const resolvedMethod = workspace.methods.find((method) => method.id === workspace.activeMethodId) ?? workspace.methods[0] ?? createMethodDocument();
  return {
    ...workspace,
    activeMethodId: resolvedMethod.id,
    methods: [resolvedMethod],
    groups: []
  };
}

export function asWorkspaceProjectData(
  methods: MethodDocument[],
  activeMethodId: string,
  groups: MethodGroup[],
  deps: Pick<WorkspaceDeps, 'createMethodDocument' | 'sanitizeSections' | 'enableMultiMethods'>
): WorkspaceProjectData {
  const normalizedMethods = methods.length > 0 ? methods : [deps.createMethodDocument()];
  const resolvedActiveMethodId = normalizedMethods.some((method) => method.id === activeMethodId)
    ? activeMethodId
    : normalizedMethods[0].id;

  const workspace: WorkspaceProjectData = {
    version: 3,
    updatedAt: new Date().toISOString(),
    activeMethodId: resolvedActiveMethodId,
    methods: normalizedMethods.map((method) => ({
      ...method,
      updatedAt: method.updatedAt || new Date().toISOString(),
      sections: deps.sanitizeSections(method.sections)
    })),
    groups
  };

  return normalizeWorkspaceForModeInternal(workspace, deps.enableMultiMethods, deps.createMethodDocument);
}

export function loadWorkspaceProjectFromPayload(
  payload: WorkspaceProjectData,
  deps: WorkspaceDeps
): WorkspaceProjectData {
  const methods = payload.methods
    .filter((method) => method && Array.isArray(method.sections))
    .map((method, index) => ({
      id: method.id || deps.createMethodId(),
      name: method.name?.trim() || `Метод ${index + 1}`,
      updatedAt: method.updatedAt || new Date().toISOString(),
      sections: deps.sanitizeSections(method.sections)
    }));

  if (methods.length === 0) return deps.createWorkspaceSeed();

  const groups = Array.isArray(payload.groups)
    ? payload.groups.map((group) => ({
        id: group.id || `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: group.name?.trim() || 'Новая цепочка',
        methodIds: Array.isArray(group.methodIds) ? group.methodIds.filter(Boolean) : [],
        links: Array.isArray(group.links) ? group.links : []
      }))
    : [];

  const activeMethodId =
    payload.activeMethodId && methods.some((method) => method.id === payload.activeMethodId)
      ? payload.activeMethodId
      : methods[0].id;

  const workspace: WorkspaceProjectData = {
    version: 3,
    updatedAt: payload.updatedAt || new Date().toISOString(),
    methods,
    groups,
    activeMethodId
  };

  return normalizeWorkspaceForModeInternal(workspace, deps.enableMultiMethods, deps.createMethodDocument);
}

export function loadWorkspaceProject(
  storageKey: string,
  storage: StorageLike,
  deps: WorkspaceDeps
): WorkspaceProjectData {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return deps.createWorkspaceSeed();
    const parsed = JSON.parse(raw) as WorkspaceProjectData | ProjectData;

    if ('methods' in parsed && Array.isArray(parsed.methods)) {
      return loadWorkspaceProjectFromPayload(parsed, deps);
    }

    if ('sections' in parsed && Array.isArray(parsed.sections)) {
      const legacyMethod = deps.createMethodDocument('Метод 1', deps.sanitizeSections(parsed.sections));
      return {
        version: 3,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        activeMethodId: legacyMethod.id,
        methods: [legacyMethod],
        groups: []
      };
    }

    return deps.createWorkspaceSeed();
  } catch {
    return deps.createWorkspaceSeed();
  }
}

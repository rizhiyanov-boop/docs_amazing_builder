import { parseToRows } from './parsers';
import { sanitizeSections } from './sectionTitles';
import { validateCodexProjectImport } from './codexImportValidation';
import {
  isImportRecord, validateProjectImportPayload, validateImportedWorkspace, validateImportedSections,
  type ImportIssue
} from './projectImportValidation';
import {
  asWorkspaceProjectData, DEFAULT_METHOD_NAME, createMethodId, normalizeMethodDocument,
  normalizeProjectName, normalizeWorkspaceForMode, sanitizeProjectSections, sanitizeProjectFlows
} from './workspaceBootstrap';
import type { DocSection, MethodDocument, MethodGroup, ParseFormat, ProjectSection, ProjectFlow, WorkspaceProjectData } from './types';

type JsonImportSampleType = 'request' | 'response';
type WorkspaceProjectImportPayload = Record<string, unknown> & {
  methods: Record<string, unknown>[];
  groups?: Record<string, unknown>[];
};
type MethodDocumentImportPayload = Record<string, unknown> & {
  id?: unknown;
  name?: unknown;
  updatedAt?: unknown;
  jiraTicket?: unknown;
  epic?: unknown;
  initiators?: unknown;
  responsible?: unknown;
  externalUrl?: unknown;
  status?: unknown;
  sections: unknown;
};

export type ProjectImportResult =
  | { kind: 'workspace'; workspace: WorkspaceProjectData; warnings: ImportIssue[] }
  | { kind: 'sections'; sections: DocSection[]; warnings: ImportIssue[] }
  | { kind: 'source'; rawText: string; sourceFormat: ParseFormat; sampleType: JsonImportSampleType };

function guessJsonSampleType(value: unknown): JsonImportSampleType {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'response';

  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload).map((key) => key.toLowerCase());

  const requestMarkers = ['request', 'headers', 'params', 'query', 'body', 'payload', 'method', 'path', 'url'];
  const responseMarkers = ['response', 'result', 'status', 'code', 'message', 'error'];

  const requestHits = requestMarkers.filter((marker) => keys.some((key) => key.includes(marker))).length;
  const responseHits = responseMarkers.filter((marker) => keys.some((key) => key.includes(marker))).length;

  if (responseHits >= requestHits) return 'response';
  return 'request';
}

export class ProjectImportError extends Error {
  readonly issues: ImportIssue[];

  constructor(issues: ImportIssue[]) {
    super(issues.map(issue => `${issue.path || '$'}: ${issue.message}`).join('\n'));
    this.name = 'ProjectImportError';
    this.issues = issues;
  }
}

function assertValid(issues: ImportIssue[]): void {
  const errors = issues.filter(issue => issue.level === 'error');
  if (errors.length > 0) throw new ProjectImportError(errors);
}

function isMethodDocumentImportPayload(value: Record<string, unknown>): value is MethodDocumentImportPayload {
  return 'sections' in value
    && !Array.isArray(value.methods)
    && (typeof value.name === 'string' || typeof value.id === 'string');
}

function workspaceWarnings(payload: Record<string, unknown>, workspace: WorkspaceProjectData): ImportIssue[] {
  const issues = validateImportedWorkspace(workspace).filter(issue => issue.level === 'warning');
  if (payload.activeMethodId && payload.activeMethodId !== workspace.activeMethodId) issues.push({
    level: 'warning', path: 'activeMethodId', message: 'Активный метод не найден; выбран первый метод'
  });
  for (const field of ['projectSections', 'flows'] as const) {
    if (!Array.isArray(payload[field]) || payload[field].length === 0) issues.push({
      level: 'warning', path: field, message: 'Созданы стандартные данные для отсутствующего или пустого массива'
    });
  }
  return issues;
}

function getUniqueMethodImportName(name: string, takenNames: Set<string>): string {
  const baseName = name.trim() || DEFAULT_METHOD_NAME;
  if (!takenNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let suffix = 2;
  while (takenNames.has(`${baseName} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }

  return `${baseName} ${suffix}`;
}

export function buildWorkspaceImportFromMethodPayload(
  payload: unknown,
  fallbackName: string,
  enableMultiMethods = true
): WorkspaceProjectData {
  assertValid(validateProjectImportPayload(payload, 'method'));
  if (!isImportRecord(payload)) throw new Error('Ожидается объект метода');
  const resolvedName = typeof payload.name === 'string' && payload.name.trim()
    ? payload.name.trim()
    : fallbackName.replace(/\.json$/i, '').trim() || DEFAULT_METHOD_NAME;
  const method = normalizeMethodDocument(payload, 0, resolvedName);

  const workspace = asWorkspaceProjectData(
    resolvedName,
    [method], method.id, [], undefined, undefined, enableMultiMethods
  );
  assertValid(validateImportedWorkspace(workspace));
  return workspace;
}

export function loadWorkspaceProjectFromPayload(payload: unknown, enableMultiMethods = true): WorkspaceProjectData {
  if (isImportRecord(payload) && Object.hasOwn(payload, 'importProfile')) assertValid(validateCodexProjectImport(payload));
  assertValid(validateProjectImportPayload(payload, 'workspace'));
  if (!isImportRecord(payload)) throw new Error('Ожидается объект проекта');
  const raw = payload as WorkspaceProjectImportPayload;
  const methods = raw.methods.map((method, index) => normalizeMethodDocument(method, index));

  const groups = Array.isArray(payload.groups)
    ? payload.groups.filter(isImportRecord).map((group) => ({
        id: typeof group.id === 'string' && group.id.trim() ? group.id.trim() : `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: typeof group.name === 'string' && group.name.trim() ? group.name.trim() : 'Новая цепочка',
        methodIds: Array.isArray(group.methodIds) ? group.methodIds.filter((methodId): methodId is string => typeof methodId === 'string' && Boolean(methodId.trim())) : [],
        links: Array.isArray(group.links)
          ? group.links.filter((link): link is MethodGroup['links'][number] => (
              isImportRecord(link)
              && typeof link.fromMethodId === 'string'
              && typeof link.toMethodId === 'string'
            ))
          : []
      }))
    : [];

  const activeMethodId = typeof payload.activeMethodId === 'string' && methods.some((method) => method.id === payload.activeMethodId)
    ? payload.activeMethodId
    : methods[0].id;

  const workspace: WorkspaceProjectData = {
    version: 3,
    projectName: normalizeProjectName(typeof payload.projectName === 'string' ? payload.projectName : undefined),
    updatedAt: typeof payload.updatedAt === 'string' && payload.updatedAt ? payload.updatedAt : new Date().toISOString(),
    methods,
    groups,
    activeMethodId,
    projectSections: sanitizeProjectSections(Array.isArray(payload.projectSections) ? payload.projectSections as ProjectSection[] : undefined),
    flows: sanitizeProjectFlows(Array.isArray(payload.flows) ? payload.flows as ProjectFlow[] : undefined, methods)
  };

  assertValid(validateImportedWorkspace(workspace));
  return normalizeWorkspaceForMode(workspace, enableMultiMethods);
}

export function prepareMethodsMerge(workspaces: WorkspaceProjectData[], existingMethods: MethodDocument[], enableMultiMethods = true): { methods: MethodDocument[]; groups: MethodGroup[] } {
  const loadedWorkspaces = workspaces.map((workspace) => loadWorkspaceProjectFromPayload(workspace, enableMultiMethods));
  const hasMethods = loadedWorkspaces.some((workspace) => workspace.methods.length > 0);
  if (!hasMethods) {
    return { methods: [], groups: [] };
  }

  const takenNames = new Set(existingMethods.map((method) => method.name.trim().toLowerCase()));
  const importedMethods: MethodDocument[] = [];
  const importedGroups: MethodGroup[] = [];

  for (const loaded of loadedWorkspaces) {
    const methodIdMap = new Map<string, string>();
    for (const method of loaded.methods) {
      const nextId = createMethodId();
      methodIdMap.set(method.id, nextId);

      const nextName = getUniqueMethodImportName(method.name, takenNames);
      takenNames.add(nextName.toLowerCase());

      importedMethods.push({
        ...method,
        confluence: undefined,
        id: nextId,
        name: nextName,
        updatedAt: method.updatedAt || new Date().toISOString()
      });
    }

    if (!enableMultiMethods) continue;
    const remappedGroups = loaded.groups
      .map((group) => {
        const remappedMethodIds = group.methodIds
          .map((methodId) => methodIdMap.get(methodId) ?? null)
          .filter((methodId): methodId is string => Boolean(methodId));

        if (remappedMethodIds.length === 0) {
          return null;
        }

        const remappedLinks = group.links
          .map((link) => {
            const fromMethodId = methodIdMap.get(link.fromMethodId);
            const toMethodId = methodIdMap.get(link.toMethodId);
            if (!fromMethodId || !toMethodId) return null;
            return {
              ...link,
              fromMethodId,
              toMethodId
            };
          })
          .filter((link): link is MethodGroup['links'][number] => Boolean(link));

        return {
          ...group,
          id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          methodIds: remappedMethodIds,
          links: remappedLinks
        };
      })
      .filter((group): group is MethodGroup => Boolean(group));
    importedGroups.push(...remappedGroups);
  }

  if (importedMethods.length === 0) {
    return { methods: [], groups: [] };
  }

  return { methods: importedMethods, groups: importedGroups };
}

/** Classifies and prepares data without reading files or changing React state. */
export function parseProjectImportText(rawText: string, fileName: string, enableMultiMethods = true): ProjectImportResult {
  const text = rawText.trim();
  if (!text) throw new Error('Вставьте JSON, XML или cURL.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const format = /^curl(?:\s|$)/i.test(text) ? 'curl'
      : text.startsWith('<') && (text.endsWith('>') || /^<\?xml\b/i.test(text)) ? 'xml' : null;
    if (!format) throw new Error('Неподдерживаемый формат: нужен JSON, XML или cURL');
    parseToRows(format, text);
    return { kind: 'source', rawText: text, sourceFormat: format, sampleType: 'request' };
  }
  if (isImportRecord(parsed) && (Object.hasOwn(parsed, 'importProfile') || Array.isArray(parsed.methods) || ('methods' in parsed && 'version' in parsed))) {
    const workspace = loadWorkspaceProjectFromPayload(parsed, enableMultiMethods);
    return { kind: 'workspace', workspace, warnings: workspaceWarnings(parsed, workspace) };
  }
  if (isImportRecord(parsed) && isMethodDocumentImportPayload(parsed)) {
    const workspace = buildWorkspaceImportFromMethodPayload(parsed, fileName, enableMultiMethods);
    return { kind: 'workspace', workspace, warnings: workspaceWarnings(parsed, workspace) };
  }
  if (isImportRecord(parsed) && (Array.isArray(parsed.sections) || ('sections' in parsed && 'version' in parsed))) {
    assertValid(validateProjectImportPayload(parsed, 'sections'));
    const sections = sanitizeSections(parsed.sections as DocSection[]);
    const issues = validateImportedSections(sections);
    assertValid(issues);
    return { kind: 'sections', sections, warnings: issues.filter(issue => issue.level === 'warning') };
  }
  return { kind: 'source', rawText: text, sourceFormat: 'json', sampleType: guessJsonSampleType(parsed) };
}

export function prepareProjectImportBatch(files: { name: string; text: string }[], enableMultiMethods = true) {
  const items: { sourceName: string; workspace: WorkspaceProjectData; warnings: ImportIssue[] }[] = [];
  const invalidFiles: { fileName: string; reason: string }[] = [];
  for (const file of files) {
    try {
      // Multi-file import only accepts JSON documents, not API source samples.
      const parsed: unknown = JSON.parse(file.text.trim());
      const result = parseProjectImportText(file.text, file.name, enableMultiMethods);
      if (result.kind === 'workspace') {
        items.push({ sourceName: file.name, workspace: result.workspace, warnings: result.warnings });
      } else if (result.kind === 'sections' && isImportRecord(parsed)) {
        const workspace = buildWorkspaceImportFromMethodPayload({ ...parsed, sections: result.sections }, file.name, enableMultiMethods);
        items.push({ sourceName: file.name, workspace, warnings: workspaceWarnings(parsed, workspace) });
      } else {
        invalidFiles.push({ fileName: file.name, reason: 'Неподдерживаемый формат: нужен JSON с methods[] или sections[]' });
      }
    } catch (error) {
      invalidFiles.push({ fileName: file.name, reason: error instanceof ProjectImportError ? error.message : 'Некорректный JSON' });
    }
  }
  return { items, invalidFiles };
}

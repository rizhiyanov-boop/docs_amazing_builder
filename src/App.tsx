import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import './tokens.css';
import './App.css';
import { parseCurlMeta, parseJsonSchemaToRows, parseToRows, wrapNonDomainResponseJson } from './parsers';
import { getDiagramExportFileName, getDiagramImageUrl, resolveDiagramEngine } from './diagramUtils';
import { ERROR_CATALOG_BY_CODE } from './errorCatalog';
import { buildServerErrorResponseTemplate } from './errorResponseTemplate';
import { getRequestColumnLabel, getRequestColumnOrder, moveRequestColumn } from './requestColumns';
import { buildMockServicePayload } from './mockServiceExport';
import {
  DEFAULT_API_KEY_EXAMPLE,
  DEFAULT_API_KEY_HEADER,
  DEFAULT_BASIC_PASSWORD,
  DEFAULT_BASIC_USERNAME,
  DEFAULT_BEARER_TOKEN_EXAMPLE,
  getInputDriftRows,
  getMappedClientField,
  getMappingOptions,
  getParsedRowKey,
  getPreviouslyUsedClientKeys,
  isAuthHeader,
  isDefaultRequestHeader,
  isRequestMappingRow
} from './requestHeaders';
import { renderHtmlDocument } from './renderHtml';
import { getFlowExportFileName, renderProjectHtmlDocument, renderProjectWikiDocument } from './projectExport';
import { editorElementToWikiText, editorHtmlToWikiText, escapeRichTextHtml, richTextToHtml } from './richText';
import { renderWikiDocument } from './renderWiki';
import { buildValidationRulesFromSchemaInput } from './schemaValidationRules';
import {
  getExternalRequestHeaderRowsForEditor,
  getExternalSourceRows,
  getRequestHeaderRowsForEditor,
  getRowsRelevantToSourceFormat,
  getSectionRows,
  getSectionSideLabel,
  isDualModelSection,
  isRequestSection,
  isResponseSection,
  normalizeParsedRowsForSection,
  normalizeRequestRowsForMethod,
  validateSection,
  withSectionRowIds
} from './sectionHelpers';
import { resolveSectionTitle, sanitizeSections } from './sectionTitles';
import { buildInputFromRows } from './sourceSync';
import {
  getDuplicateValueSet,
  getDynamicTextareaRows,
  highlightCode,
  STRUCTURED_EXAMPLE_PLACEHOLDER,
  usesStructuredPlaceholder,
  validateExampleValue,
  validateJsonDraft
} from './editorValueUtils';
import {
  cloneSectionForPaste,
  createDiagramItem,
  createErrorRow,
  createInitialSections,
  createParsedSection,
  createSectionFromBlockType,
  createValidationRuleRow,
  getValidationCaseOptionsForSection,
  normalizeLegacyErrorRowsInSections,
  REQUIRED_OPTIONS,
  RICH_TEXT_HIGHLIGHT_OPTIONS,
  TYPE_OPTIONS_COMMON,
  TYPE_OPTIONS_EXTENDED,
  VALIDATION_CASE_OPTIONS
} from './sectionFactories';
import {
  asWorkspaceProjectData as asWorkspaceProjectDataCore,
  createDefaultFlow,
  createDefaultProjectSections,
  createMethodDocument,
  createMethodId,
  createOnboardingDemoWorkspace,
  createProjectSectionId,
  createWorkspaceSeed,
  loadWorkspaceProject as loadWorkspaceProjectCore,
  normalizeWorkspaceForMode as normalizeWorkspaceForModeCore,
  sanitizeProjectFlows,
  sanitizeProjectSections
} from './workspaceBootstrap';
import { ONBOARDING_FEATURES } from './onboarding/featureFlags';
import { ONBOARDING_STEPS, evaluateOnboardingProgress, resolveOnboardingStep, type OnboardingStepId } from './onboarding/steps';
import { loadOnboardingState, markOnboardingCompleted, markOnboardingStarted, saveOnboardingState } from './onboarding/storage';
import { emitOnboardingEvent } from './onboarding/telemetry';
import { buildValidationRulesWithAi, fillDescriptionsWithAi, repairJsonWithAi, suggestMappingsWithAi, suggestMaskFieldsWithAi } from './openrouterClient';
import { AppTopbar } from './components/AppTopbar';
import { DiagramSectionEditor } from './components/DiagramSectionEditor';
import { ErrorsSectionEditor } from './components/ErrorsSectionEditor';
import { MethodSectionSidebar } from './components/MethodSectionSidebar';
import type { AddableBlockType } from './components/MethodSectionSidebar';
import { ParsedSectionEditor } from './components/ParsedSectionEditor';
import { ProjectDocsEditor } from './components/ProjectDocsEditor';
import { ProjectFlowsEditor } from './components/ProjectFlowsEditor';
import { WorkspaceTabs } from './components/WorkspaceTabs';
import { useRemoteProjectAutosave } from './hooks/useRemoteProjectAutosave';
import { useWorkspaceHistory } from './hooks/useWorkspaceHistory';
import {
  fetchCurrentUser,
  loginWithPassword,
  listServerProjects,
  loadServerProject,
  deleteServerProject,
  logoutFromServer,
  registerWithPassword,
  saveServerProject,
  type AuthUser as ServerAuthUser,
  type PersistedHistoryState,
  type ProjectListItem
} from './serverSyncClient';
import type { OnboardingState } from './onboarding/types';
import { applyThemeToRoot } from './theme';
import type { ThemeName } from './theme';
import { validateProjectFlow } from './flowValidation';
import { buildFlowMermaid } from './flowDiagram';
import type {
  DiagramItem,
  DiagramSection,
  DocSection,
  ErrorRow,
  MethodDocument,
  MethodGroup,
  ParsedRow,
  ParsedSection,
  ParseFormat,
  ProjectFlow,
  ProjectData,
  ProjectSection,
  RequestAuthType,
  RequestColumnKey,
  RequestMethod,
  ValidationRuleRow,
  WorkspaceProjectData
} from './types';

const STORAGE_KEY = 'doc-builder-project-v2';
const STORAGE_SERVER_PROJECT_ID_KEY = 'doc-builder-server-project-id-v1';
const ONBOARDING_ENTRY_SUPPRESS_KEY = 'doc-builder-onboarding-entry-suppressed-v1';
const THEME_STORAGE_KEY = 'doc-builder-theme-v1';
const TABLE_FIELD_COLUMN_WIDTH_KEY = 'doc-builder-table-field-column-width-v1';
const SIDEBAR_WIDTH_KEY = 'doc-builder-sidebar-width-v1';
const SIDEBAR_HIDDEN_KEY = 'doc-builder-sidebar-hidden-v1';
const DEFAULT_METHOD_NAME = 'Метод 1';
const DEFAULT_PROJECT_NAME = 'Новый проект';
const DELETE_UNDO_WINDOW_MS = 8000;
const HISTORY_LIMIT = 50;
const HISTORY_COALESCE_MS = 700;
const REMOTE_SAVE_CHANGE_THRESHOLD = 10;
const REMOTE_SAVE_IDLE_MS = 20000;
const LOCAL_AUTOSAVE_DEBOUNCE_MS = 320;
const PROJECT_CACHE_TTL_MS = 3 * 60 * 1000;
const PROJECT_PRELOAD_CONCURRENCY = 2;
const PROJECT_PRELOAD_START_DELAY_MS = 900;
const DEFAULT_TABLE_FIELD_COLUMN_WIDTH = 320;
const MIN_TABLE_FIELD_COLUMN_WIDTH = 220;
const MAX_TABLE_FIELD_COLUMN_WIDTH = 640;
const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;
const COMPACT_LAYOUT_MEDIA_QUERY = '(max-width: 64rem)';
const EMPTY_SECTIONS: DocSection[] = [];
const ENABLE_MULTI_METHODS = true;
const DEFAULT_RICH_TEXT_HIGHLIGHT = '#fef08a';

function clampTableFieldColumnWidth(value: number): number {
  return Math.min(MAX_TABLE_FIELD_COLUMN_WIDTH, Math.max(MIN_TABLE_FIELD_COLUMN_WIDTH, Math.round(value)));
}

function clampSidebarWidth(value: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(value)));
}

function normalizeProjectName(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || DEFAULT_PROJECT_NAME;
}

function deepClone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function loadOnboardingEntrySuppressed(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_ENTRY_SUPPRESS_KEY) === '1';
  } catch {
    return false;
  }
}

function saveOnboardingEntrySuppressed(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(ONBOARDING_ENTRY_SUPPRESS_KEY, '1');
    } else {
      localStorage.removeItem(ONBOARDING_ENTRY_SUPPRESS_KEY);
    }
  } catch {
    // Ignore persistence errors for local preference.
  }
}

function loadPersistedServerProjectId(): string | null {
  try {
    return localStorage.getItem(STORAGE_SERVER_PROJECT_ID_KEY);
  } catch {
    return null;
  }
}

function loadPersistedTheme(): ThemeName {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function loadPersistedTableFieldColumnWidth(): number {
  try {
    const raw = localStorage.getItem(TABLE_FIELD_COLUMN_WIDTH_KEY);
    if (!raw) return DEFAULT_TABLE_FIELD_COLUMN_WIDTH;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampTableFieldColumnWidth(parsed) : DEFAULT_TABLE_FIELD_COLUMN_WIDTH;
  } catch {
    return DEFAULT_TABLE_FIELD_COLUMN_WIDTH;
  }
}

function loadPersistedSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (!raw) return DEFAULT_SIDEBAR_WIDTH;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

function loadPersistedSidebarHidden(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

function isCompactLayoutViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(COMPACT_LAYOUT_MEDIA_QUERY).matches;
}

type TabKey = 'editor' | 'html' | 'wiki';
type WorkspaceScope = 'methods' | 'project-docs' | 'flows';
type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';
type ParseTarget = 'server' | 'client';
type JsonImportSampleType = 'request' | 'response';
type JsonImportTargetSide = 'server' | 'client';
type AuthDialogMode = 'login' | 'register';

type AutosaveInfo = { state: AutosaveState; at?: string };
type TableValidation = Map<string, string>;
type EditableFieldState = {
  sectionId: string;
  rowKey: string;
  draft: string;
  target: ParseTarget;
  column: 'field' | 'clientField';
};
type EditableRequestCellState = {
  sectionId: string;
  rowKey: string;
  column: 'type' | 'required' | 'description' | 'example';
  draft: string;
  target: ParseTarget;
};
type EditableHeaderCellState = {
  sectionId: string;
  rowKey: string;
  column: 'description' | 'example';
  target: ParseTarget;
  draft: string;
};
type EditableMappingCellState = {
  sectionId: string;
  rowKey: string;
};
type EditableSourceState = {
  sectionId: string;
  target: ParseTarget;
  draft: string;
};
type EditableSchemaState = {
  sectionId: string;
  target: ParseTarget;
  draft: string;
};
type EditableTitleState = {
  sectionId: string;
  draft: string;
};
type DriftAlertState = Record<string, boolean>;
type ExpanderState = Record<string, boolean>;
type InternalCodePopoverState = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};
type EditableFieldOptions = {
  allowEdit?: boolean;
  onDelete?: () => void;
  editTarget?: ParseTarget;
};
type DeletedRowUndoState = {
  sectionId: string;
  target: ParseTarget;
  row: ParsedRow;
  index: number;
};
type SectionClipboardState = {
  type: 'section';
  section: DocSection;
};

type ServerProjectPayload = {
  id: string;
  name: string;
  workspace: WorkspaceProjectData;
  history: PersistedHistoryState | null;
  updatedAt: string;
};

type CachedServerProjectData = {
  workspace: WorkspaceProjectData;
  history: PersistedHistoryState | null;
  loadedAt: number;
};

type ProjectMethodPreview = {
  id: string;
  name: string;
  sectionCount: number;
};

type JsonImportRoutingState = {
  fileName: string;
  rawText: string;
  sampleType: JsonImportSampleType;
  domainModelEnabled: boolean;
  targetSide: JsonImportTargetSide;
};

type WorkspaceMethodsImportRoutingState = {
  fileName: string;
  workspace: WorkspaceProjectData;
};

type ProjectTextImportState = {
  rawText: string;
  fromOnboarding: boolean;
};

type SourceTextImportState = {
  sectionId: string;
  target: ParseTarget;
  draft: string;
};
type AuthDialogState = {
  mode: AuthDialogMode;
  login: string;
  password: string;
  isSubmitting: boolean;
  error: string;
};
type PendingMethodDeleteState = {
  methodId: string;
  methodName: string;
  sectionCount: number;
};

type PendingSectionDeleteState = {
  sectionId: string;
  sectionTitle: string;
};

type RichTextAction = 'bold' | 'italic' | 'code' | 'h3' | 'ul' | 'ol' | 'quote' | 'highlight';
type RichTextCommandOptions = {
  color?: string;
  language?: string;
};

type AiRequestStatusState = 'loading' | 'success';
type AiRequestStatus = {
  state: AiRequestStatusState;
  message: string;
};
type AuthRequestStatusState = 'loading' | 'success';
type AuthRequestStatus = {
  state: AuthRequestStatusState;
  message: string;
};

type OnboardingEntryPath = 'quick_start' | 'scratch' | 'import';
type OnboardingNavSource = 'prev' | 'next' | 'chip' | 'cta' | 'hint';
type OnboardingStepTarget = {
  tab: TabKey;
  sectionId?: string;
  openExpander?: 'source-server' | 'source-client';
  anchor: string;
  hintMessage?: string;
};

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

function normalizeWorkspaceForMode(workspace: WorkspaceProjectData): WorkspaceProjectData {
  return normalizeWorkspaceForModeCore(workspace, ENABLE_MULTI_METHODS);
}

function asWorkspaceProjectData(
  projectName: string,
  methods: MethodDocument[],
  activeMethodId: string,
  groups: MethodGroup[] = [],
  projectSections: ProjectSection[] = createDefaultProjectSections(),
  flows: ProjectFlow[] = [createDefaultFlow(methods[0]?.id)]
): WorkspaceProjectData {
  return asWorkspaceProjectDataCore(
    projectName,
    methods,
    activeMethodId,
    groups,
    projectSections,
    flows,
    ENABLE_MULTI_METHODS
  );
}

function loadWorkspaceProject(): WorkspaceProjectData {
  return loadWorkspaceProjectCore(STORAGE_KEY, ENABLE_MULTI_METHODS);
}

function slugifyMethodFileName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'method';
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function reorderSections(list: DocSection[], fromId: string, toId: string): DocSection[] {
  if (fromId === toId) return list;
  const next = [...list];
  const fromIndex = next.findIndex((section) => section.id === fromId);
  const toIndex = next.findIndex((section) => section.id === toId);
  if (fromIndex === -1 || toIndex === -1) return list;
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  const activeTextSectionIdRef = useRef<string | null>(null);
  const sectionAnchorRefs = useRef<Map<string, HTMLElement>>(new Map());
  const inlineFieldInputRef = useRef<HTMLInputElement | null>(null);
  const inlineRequestCellInputRef = useRef<HTMLElement | null>(null);
  const sectionVisibilityRatiosRef = useRef<Map<string, number>>(new Map());
  const suppressObserverSelectionUntilRef = useRef<number>(0);
  const observerRafRef = useRef<number | null>(null);
  const sectionJumpHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const richEditorSelectionRef = useRef<{ editor: HTMLElement; range: Range } | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);
  const aiStatusResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authStatusResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textEditorWikiSnapshotRef = useRef<string>('');
  const diagramTextRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const methodNameInputRef = useRef<HTMLInputElement | null>(null);
  const projectNameInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const previousMethodIdRef = useRef<string | null>(null);
  const initialWorkspace = useMemo(() => loadWorkspaceProject(), []);
  const initialOnboarding = useMemo(() => loadOnboardingState(), []);
  const initialProjectSections = useMemo(
    () => sanitizeProjectSections(initialWorkspace.projectSections),
    [initialWorkspace]
  );
  const initialFlows = useMemo(
    () => sanitizeProjectFlows(initialWorkspace.flows, initialWorkspace.methods),
    [initialWorkspace]
  );
  const [projectName, setProjectName] = useState<string>(() => normalizeProjectName(initialWorkspace.projectName));
  const [methods, setMethodsState] = useState<MethodDocument[]>(() => initialWorkspace.methods);
  const [methodGroups, setMethodGroups] = useState<MethodGroup[]>(() => initialWorkspace.groups);
  const [projectSections, setProjectSections] = useState<ProjectSection[]>(() => initialProjectSections);
  const [flows, setFlows] = useState<ProjectFlow[]>(() => initialFlows);
  const [activeProjectSectionId, setActiveProjectSectionId] = useState<string | null>(() => initialProjectSections[0]?.id ?? null);
  const [activeFlowId, setActiveFlowId] = useState<string | null>(() => initialFlows[0]?.id ?? null);
  const [activeMethodId, setActiveMethodId] = useState<string>(() => initialWorkspace.activeMethodId ?? initialWorkspace.methods[0]?.id ?? createMethodId());
  const [selectedId, setSelectedId] = useState<string>(() => initialWorkspace.methods[0]?.sections[0]?.id ?? createInitialSections()[0].id);
  const [tab, setTab] = useState<TabKey>('editor');
  const [workspaceScope, setWorkspaceScope] = useState<WorkspaceScope>('methods');
  const [sectionJumpHighlightId, setSectionJumpHighlightId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeName>(() => loadPersistedTheme());
  const [autosave, setAutosave] = useState<AutosaveInfo>({ state: 'idle' });
  const [importError, setImportError] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<RequestColumnKey | null>(null);
  const [parsedFieldColumnWidth, setParsedFieldColumnWidth] = useState<number>(() => loadPersistedTableFieldColumnWidth());
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => loadPersistedSidebarWidth());
  const [isSidebarHidden, setIsSidebarHidden] = useState<boolean>(() => loadPersistedSidebarHidden());
  const [isCompactLayout, setIsCompactLayout] = useState<boolean>(() => isCompactLayoutViewport());
  const [editingField, setEditingField] = useState<EditableFieldState | null>(null);
  const [editingRequestCell, setEditingRequestCell] = useState<EditableRequestCellState | null>(null);
  const [editingHeaderCell, setEditingHeaderCell] = useState<EditableHeaderCellState | null>(null);
  const [editingMappingCell, setEditingMappingCell] = useState<EditableMappingCellState | null>(null);
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [editingMethodNameDraft, setEditingMethodNameDraft] = useState('');
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [editingProjectNameDraft, setEditingProjectNameDraft] = useState('');
  const [editingSource, setEditingSource] = useState<EditableSourceState | null>(null);
  const [editingSchema, setEditingSchema] = useState<EditableSchemaState | null>(null);
  const [sourceEditorError, setSourceEditorError] = useState('');
  const [requestCellError, setRequestCellError] = useState('');
  const [aiErrorMessage, setAiErrorMessage] = useState('');
  const [aiRequestStatus, setAiRequestStatus] = useState<AiRequestStatus | null>(null);
  const [aiBusyKey, setAiBusyKey] = useState<string | null>(null);
  const [authRequestStatus, setAuthRequestStatus] = useState<AuthRequestStatus | null>(null);
  const [authBusyKey, setAuthBusyKey] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<EditableTitleState | null>(null);
  const [expandedDriftAlerts, setExpandedDriftAlerts] = useState<DriftAlertState>({});
  const [expanderState, setExpanderState] = useState<ExpanderState>({});
  const [openInternalCodeKey, setOpenInternalCodeKey] = useState<string | null>(null);
  const [highlightedInternalCodeIndex, setHighlightedInternalCodeIndex] = useState(0);
  const [internalCodePopoverState, setInternalCodePopoverState] = useState<InternalCodePopoverState | null>(null);
  const [isAddEntityMenuOpen, setIsAddEntityMenuOpen] = useState(false);
  const [isDeleteEntityMenuOpen, setIsDeleteEntityMenuOpen] = useState(false);
  const [isOnboardingNavVisible, setIsOnboardingNavVisible] = useState(false);
  const [pendingMethodNameFocus, setPendingMethodNameFocus] = useState(false);
  const [pendingProjectNameFocus, setPendingProjectNameFocus] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [deletedRowUndo, setDeletedRowUndo] = useState<DeletedRowUndoState | null>(null);
  const [sectionClipboard, setSectionClipboard] = useState<SectionClipboardState | null>(null);
  const [openSectionActionsMenuId, setOpenSectionActionsMenuId] = useState<string | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Record<string, true>>({});
  const [expandedMethodId, setExpandedMethodId] = useState<string | null>(() => initialWorkspace.activeMethodId ?? initialWorkspace.methods[0]?.id ?? null);
  const [isSectionPanelPulse, setIsSectionPanelPulse] = useState(false);
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(() => initialOnboarding);
  const [suppressOnboardingEntry, setSuppressOnboardingEntry] = useState<boolean>(() => loadOnboardingEntrySuppressed());
  const [showOnboardingEntry, setShowOnboardingEntry] = useState<boolean>(
    () => ONBOARDING_FEATURES.onboardingV1 && !initialOnboarding.dismissed && !loadOnboardingEntrySuppressed()
  );
  const [showDeleteProjectDialog, setShowDeleteProjectDialog] = useState(false);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);
  const [authDialog, setAuthDialog] = useState<AuthDialogState | null>(null);
  const [pendingMethodDelete, setPendingMethodDelete] = useState<PendingMethodDeleteState | null>(null);
  const [pendingSectionDelete, setPendingSectionDelete] = useState<PendingSectionDeleteState | null>(null);
  const [jsonImportRouting, setJsonImportRouting] = useState<JsonImportRoutingState | null>(null);
  const [workspaceMethodsImportRouting, setWorkspaceMethodsImportRouting] = useState<WorkspaceMethodsImportRoutingState | null>(null);
  const [projectTextImport, setProjectTextImport] = useState<ProjectTextImportState | null>(null);
  const [sourceTextImport, setSourceTextImport] = useState<SourceTextImportState | null>(null);
  const [hasOnboardingExport, setHasOnboardingExport] = useState(false);
  const [dismissedOnboardingHints, setDismissedOnboardingHints] = useState<Record<string, true>>({});
  const [onboardingNavStep, setOnboardingNavStep] = useState<OnboardingStepId>(() => initialOnboarding.currentStep);
  const [onboardingStepHint, setOnboardingStepHint] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<ServerAuthUser | null>(null);
  const [serverProjectId, setServerProjectId] = useState<string | null>(() => loadPersistedServerProjectId());
  const [serverProjects, setServerProjects] = useState<ProjectListItem[]>([]);
  const [projectMethodCounts, setProjectMethodCounts] = useState<Record<string, number>>({});
  const [projectMethodPreviews, setProjectMethodPreviews] = useState<Record<string, ProjectMethodPreview[]>>({});
  const [serverSyncError, setServerSyncError] = useState('');
  const [isProjectSwitching, setIsProjectSwitching] = useState(false);
  const [switchingProjectId, setSwitchingProjectId] = useState<string | null>(null);
  const internalCodeAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    return () => {
      if (observerRafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(observerRafRef.current);
      }
      if (sectionJumpHighlightTimerRef.current) {
        clearTimeout(sectionJumpHighlightTimerRef.current);
      }
      if (aiStatusResetTimeoutRef.current) {
        clearTimeout(aiStatusResetTimeoutRef.current);
      }
      if (authStatusResetTimeoutRef.current) {
        clearTimeout(authStatusResetTimeoutRef.current);
      }
      if (localAutosaveTimerRef.current !== null) {
        window.clearTimeout(localAutosaveTimerRef.current);
      }
      if (localAutosaveFlushRef.current !== null) {
        window.clearTimeout(localAutosaveFlushRef.current);
      }
      if (preloadQueueTimerRef.current !== null) {
        window.clearTimeout(preloadQueueTimerRef.current);
      }
    };
  }, []);

  function persistParsedFieldColumnWidth(width: number): void {
    try {
      localStorage.setItem(TABLE_FIELD_COLUMN_WIDTH_KEY, String(width));
    } catch {
      // Ignore persistence errors for local preference.
    }
  }

  function persistSidebarWidth(width: number): void {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
    } catch {
      // Ignore persistence errors for local preference.
    }
  }

  function persistLocalWorkspace(workspace: WorkspaceProjectData): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      return true;
    } catch {
      return false;
    }
  }

  function getMethodPreviews(workspace: WorkspaceProjectData): ProjectMethodPreview[] {
    return workspace.methods.map((method) => ({
      id: method.id,
      name: method.name,
      sectionCount: method.sections.length
    }));
  }

  function upsertProjectCache(projectId: string, cached: CachedServerProjectData): void {
    projectCacheRef.current.set(projectId, cached);
    setProjectMethodPreviews((current) => ({
      ...current,
      [projectId]: getMethodPreviews(cached.workspace)
    }));
  }

  function removeProjectCache(projectId: string): void {
    projectCacheRef.current.delete(projectId);
    setProjectMethodPreviews((current) => {
      if (!(projectId in current)) return current;
      const next = { ...current };
      delete next[projectId];
      return next;
    });
  }

  function startSidebarResize(event: ReactMouseEvent<HTMLButtonElement>): void {
    if (isSidebarHidden) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = sidebarWidth;
    let nextWidth = startWidth;

    const onMouseMove = (moveEvent: MouseEvent): void => {
      nextWidth = clampSidebarWidth(startWidth + moveEvent.clientX - startX);
      setSidebarWidth(nextWidth);
    };

    const onMouseUp = (): void => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      persistSidebarWidth(nextWidth);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function clearAiStatusResetTimeout(): void {
    if (aiStatusResetTimeoutRef.current) {
      clearTimeout(aiStatusResetTimeoutRef.current);
      aiStatusResetTimeoutRef.current = null;
    }
  }

  function startAiRequestStatus(message: string): void {
    clearAiStatusResetTimeout();
    setAiRequestStatus({ state: 'loading', message });
  }

  function completeAiRequestStatus(message: string): void {
    clearAiStatusResetTimeout();
    setAiRequestStatus({ state: 'success', message });
    aiStatusResetTimeoutRef.current = setTimeout(() => {
      setAiRequestStatus((current) => (current?.state === 'success' ? null : current));
      aiStatusResetTimeoutRef.current = null;
    }, 3500);
  }

  function clearAuthStatusResetTimeout(): void {
    if (authStatusResetTimeoutRef.current) {
      clearTimeout(authStatusResetTimeoutRef.current);
      authStatusResetTimeoutRef.current = null;
    }
  }

  function startAuthRequestStatus(message: string): void {
    clearAuthStatusResetTimeout();
    setAuthRequestStatus({ state: 'loading', message });
  }

  function completeAuthRequestStatus(message: string): void {
    clearAuthStatusResetTimeout();
    setAuthRequestStatus({ state: 'success', message });
    authStatusResetTimeoutRef.current = setTimeout(() => {
      setAuthRequestStatus((current) => (current?.state === 'success' ? null : current));
      authStatusResetTimeoutRef.current = null;
    }, 3500);
  }
  const internalCodePopoverRef = useRef<HTMLDivElement | null>(null);
  const previousOnboardingStepRef = useRef(onboardingState.currentStep);
  const onboardingStepHintTimerRef = useRef<number | null>(null);
  const onboardingSpotlightTimerRef = useRef<number | null>(null);
  const onboardingSpotlightNodeRef = useRef<HTMLElement | null>(null);
  const deletedRowUndoTimerRef = useRef<number | null>(null);
  const deleteProjectCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteProjectDialogRef = useRef<HTMLDivElement | null>(null);
  const remoteHydratedRef = useRef(false);
  const projectCacheRef = useRef<Map<string, CachedServerProjectData>>(new Map());
  const preloadInFlightRef = useRef<Set<string>>(new Set());
  const preloadQueueTimerRef = useRef<number | null>(null);
  const localAutosaveTimerRef = useRef<number | null>(null);
  const localAutosaveFlushRef = useRef<number | null>(null);
  const normalizedProjectName = projectName.trim() || DEFAULT_PROJECT_NAME;
  const activeMethod = methods.find((method) => method.id === activeMethodId) ?? methods[0];
  const sections = useMemo(() => activeMethod?.sections ?? EMPTY_SECTIONS, [activeMethod]);
  const {
    canUndo,
    canRedo,
    undoWorkspace,
    redoWorkspace,
    getPersistedHistoryState,
    applyPersistedHistoryState
  } = useWorkspaceHistory({
    projectName,
    methods,
    methodGroups,
    projectSections,
    flows,
    activeMethodId,
    selectedId,
    historyLimit: HISTORY_LIMIT,
    historyCoalesceMs: HISTORY_COALESCE_MS,
    normalizeProjectName,
    deepClone,
    setProjectName,
    setMethodsState,
    setMethodGroups,
    setProjectSections,
    setFlows,
    setActiveMethodId,
    setSelectedId
  });
  const buildWorkspaceProjectData = () => asWorkspaceProjectData(
    normalizedProjectName,
    methods,
    activeMethodId,
    methodGroups,
    projectSections,
    flows
  );
  const saveRemoteWorkspace = (params: { projectId?: string; name: string; workspace: WorkspaceProjectData }) =>
    saveServerProjectWithFallback(params);
  const handleRemoteAutosaveSaved = (params: {
    saved: { id: string; updatedAt: string };
    workspace: WorkspaceProjectData;
    projectName: string;
    workspaceHash: string;
  }) => {
    setServerProjectId(params.saved.id);
    setProjectMethodCounts((current) => ({
      ...current,
      [params.saved.id]: params.workspace.methods.length
    }));
    upsertProjectCache(params.saved.id, {
      workspace: deepClone(params.workspace),
      history: null,
      loadedAt: Date.now()
    });
    setServerSyncError('');
    upsertServerProjectListEntry({ id: params.saved.id, name: params.projectName, updatedAt: params.saved.updatedAt });
    remoteLastSavedHashRef.current = params.workspaceHash;
  };
  const handleRemoteAutosaveError = (message: string) => {
    setServerSyncError(message);
  };
  const {
    remoteSaveInFlightRef,
    remotePendingChangesRef,
    remoteLastObservedHashRef,
    remoteLastSavedHashRef,
    cancelPendingRemoteSave,
    resetRemoteTracking
  } = useRemoteProjectAutosave({
    authUser,
    remoteHydratedRef,
    normalizedProjectName,
    methods,
    activeMethodId,
    methodGroups,
    projectSections,
    flows,
    serverProjectId,
    remoteSaveChangeThreshold: REMOTE_SAVE_CHANGE_THRESHOLD,
    remoteSaveIdleMs: REMOTE_SAVE_IDLE_MS,
    buildWorkspace: buildWorkspaceProjectData,
    saveWorkspace: saveRemoteWorkspace,
    onSaved: handleRemoteAutosaveSaved,
    onError: handleRemoteAutosaveError
  });
  const methodNameWarning = useMemo(() => {
    if (!activeMethod) return '';
    const trimmed = activeMethod.name.trim();
    if (!trimmed) return 'Название метода не может быть пустым';
    const normalized = trimmed.toLowerCase();
    const hasDuplicate = methods.some((method) => method.id !== activeMethod.id && method.name.trim().toLowerCase() === normalized);
    return hasDuplicate ? 'Метод с таким названием уже существует' : '';
  }, [methods, activeMethod]);

  const exportTitle = activeMethod ? `Экспортируется только метод "${activeMethod.name.trim() || DEFAULT_METHOD_NAME}"` : 'Выберите метод';
  const activeFlowIssues = useMemo(() => {
    const current = flows.find((flow) => flow.id === activeFlowId) ?? flows[0];
    if (!current) return [];
    return validateProjectFlow(current, methods);
  }, [flows, activeFlowId, methods]);
  const canRenderWorkspace = workspaceScope !== 'methods' || sections.length > 0;

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
  }, []);

  useEffect(() => {
    try {
      if (serverProjectId) {
        localStorage.setItem(STORAGE_SERVER_PROJECT_ID_KEY, serverProjectId);
      } else {
        localStorage.removeItem(STORAGE_SERVER_PROJECT_ID_KEY);
      }
    } catch {
      // Ignore persistence errors for optional sync key.
    }
  }, [serverProjectId]);

  useEffect(() => {
    if (!serverProjectId) return;
    setExpandedProjectIds((current) => {
      if (current[serverProjectId]) return current;
      return {
        ...current,
        [serverProjectId]: true
      };
    });
  }, [serverProjectId]);

  useEffect(() => {
    const availableProjectIds = new Set(serverProjects.map((project) => project.id));
    for (const cachedId of Array.from(projectCacheRef.current.keys())) {
      if (!availableProjectIds.has(cachedId)) {
        removeProjectCache(cachedId);
      }
    }
  }, [serverProjects]);

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
            await preloadServerProjectToCache(targetId);
          } catch {
            // Ignore preload errors: they should not block interactive flow.
          } finally {
            preloadInFlightRef.current.delete(targetId);
          }
        }
      };

      const workers = Array.from(
        { length: Math.min(PROJECT_PRELOAD_CONCURRENCY, targetIds.length) },
        () => worker()
      );
      await Promise.all(workers);
    };

    preloadQueueTimerRef.current = window.setTimeout(() => {
      void runPreloadQueue();
      preloadQueueTimerRef.current = null;
    }, PROJECT_PRELOAD_START_DELAY_MS);

    return () => {
      cancelled = true;
      if (preloadQueueTimerRef.current !== null) {
        window.clearTimeout(preloadQueueTimerRef.current);
        preloadQueueTimerRef.current = null;
      }
    };
  }, [authUser, serverProjects, serverProjectId]);

  useEffect(() => {
    const topbar = topbarRef.current;
    const root = document.documentElement;
    if (!topbar) return;

    const updateStickyOffset = (): void => {
      const topInset = 12;
      const panelGap = 3;
      const topbarHeight = topbar.offsetHeight;
      const topbarOffset = Math.ceil(topbarHeight + topInset + panelGap);
      root.style.setProperty('--sticky-topbar-offset', `${topbarOffset}px`);
      root.style.setProperty('--sticky-sidebar-offset', `${topbarOffset}px`);
    };

    updateStickyOffset();
    window.addEventListener('resize', updateStickyOffset);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateStickyOffset);
      observer.observe(topbar);
    }

    return () => {
      window.removeEventListener('resize', updateStickyOffset);
      observer?.disconnect();
      root.style.removeProperty('--sticky-topbar-offset');
      root.style.removeProperty('--sticky-sidebar-offset');
    };
  }, [showOnboardingEntry, onboardingState.status]);

  useEffect(() => {
    if (!showDeleteProjectDialog) return;
    deleteProjectCancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelDeleteServerProject();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const container = deleteProjectDialogRef.current;
      if (!container) return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((node) => !node.hasAttribute('disabled') && !node.getAttribute('aria-hidden'));

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!active || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!active || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showDeleteProjectDialog]);

  useEffect(() => {
    setMethodsState((prev) => {
      let changed = false;
      const next = prev.map((method) => {
        const normalizedSections = normalizeLegacyErrorRowsInSections(method.sections);
        if (normalizedSections === method.sections) return method;
        changed = true;
        return {
          ...method,
          sections: normalizedSections
        };
      });

      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    setMethodsState((prev) => {
      let changed = false;
      const next = prev.map((method) => {
        const sections = method.sections.map((section) => {
          if (section.kind !== 'parsed') return section;

          let sectionChanged = false;
          const rows = section.rows.map((row) => {
            if (row.sourceField?.trim() || !row.field.trim()) return row;
            sectionChanged = true;
            return { ...row, sourceField: row.field.trim() };
          });

          if (section.sectionType !== 'request' && section.sectionType !== 'response') {
            if (!sectionChanged) return section;
            changed = true;
            return { ...section, rows };
          }

          const clientRows = (section.clientRows ?? []).map((row) => {
            const nextSourceField = row.sourceField?.trim() || row.field.trim();
            if (!nextSourceField || row.sourceField?.trim()) return row;
            sectionChanged = true;
            return { ...row, sourceField: nextSourceField };
          });

          if (!sectionChanged) return section;
          changed = true;
          return {
            ...section,
            rows,
            clientRows
          };
        });

        if (sections === method.sections) return method;
        return {
          ...method,
          sections
        };
      });

      return changed ? next : prev;
    });
  }, []);

  function applyWorkspaceState(workspace: WorkspaceProjectData): void {
    const resolvedActiveMethod = workspace.methods.find((method) => method.id === workspace.activeMethodId) ?? workspace.methods[0];
    const nextProjectSections = sanitizeProjectSections(workspace.projectSections);
    const nextFlows = sanitizeProjectFlows(workspace.flows, workspace.methods);
    setProjectName(normalizeProjectName(workspace.projectName));
    setMethodsState(workspace.methods);
    setMethodGroups(workspace.groups);
    setProjectSections(nextProjectSections);
    setFlows(nextFlows);
    setActiveProjectSectionId(nextProjectSections[0]?.id ?? null);
    setActiveFlowId(nextFlows[0]?.id ?? null);
    setActiveMethodId(resolvedActiveMethod?.id ?? createMethodId());
    setSelectedId(resolvedActiveMethod?.sections[0]?.id ?? createInitialSections()[0].id);
    setWorkspaceScope('methods');
    setTab('editor');
  }

  function startOnboardingEntry(path: OnboardingEntryPath): void {
    saveOnboardingEntrySuppressed(suppressOnboardingEntry);
    const nextState = markOnboardingStarted(path);
    setOnboardingState(nextState);
    setHasOnboardingExport(false);
    setDismissedOnboardingHints({});
    emitOnboardingEvent('onboarding_started', { source: path });
    setShowOnboardingEntry(false);
  }

  function handleQuickStartOnboarding(): void {
    startOnboardingEntry('quick_start');
    const seed = createOnboardingDemoWorkspace();
    applyWorkspaceState(seed);
    setToastMessage('Открыт демо-проект с готовым примером request/response.');
  }

  function handleScratchOnboarding(): void {
    startOnboardingEntry('scratch');
    const seed = createWorkspaceSeed();
    applyWorkspaceState(seed);
    setToastMessage('Создан новый пустой проект.');
  }

  function handleImportOnboarding(): void {
    startOnboardingEntry('import');
    setProjectTextImport({ rawText: '', fromOnboarding: true });
  }

  function closeOnboardingEntry(): void {
    saveOnboardingEntrySuppressed(suppressOnboardingEntry);
    setShowOnboardingEntry(false);
  }

  function openProjectImportDialog(fromOnboarding = false): void {
    setProjectTextImport({ rawText: '', fromOnboarding });
    setImportError('');
  }

  function closeProjectImportDialog(): void {
    setProjectTextImport(null);
  }

  function openAuthDialog(mode: AuthDialogMode): void {
    setAuthDialog({
      mode,
      login: '',
      password: '',
      isSubmitting: false,
      error: ''
    });
  }

  function closeAuthDialog(): void {
    setAuthDialog(null);
  }

  function updateAuthDialogField(field: 'login' | 'password', value: string): void {
    setAuthDialog((current) => (current ? { ...current, [field]: value, error: '' } : current));
  }

  async function submitAuthDialog(): Promise<void> {
    const current = authDialog;
    if (!current || current.isSubmitting || Boolean(authBusyKey)) return;

    const login = current.login.trim();
    const password = current.password;
    if (!login || !password) {
      setAuthDialog((prev) => (prev ? { ...prev, error: 'Логин и пароль обязательны' } : prev));
      return;
    }

    const busyKey = current.mode === 'login' ? 'auth:login' : 'auth:register';
    setAuthDialog((prev) => (prev ? { ...prev, isSubmitting: true, error: '' } : prev));
    setAuthBusyKey(busyKey);
    startAuthRequestStatus(current.mode === 'login' ? 'Авторизация: выполняю вход...' : 'Авторизация: создаю аккаунт...');
    remoteHydratedRef.current = false;

    try {
      const user = current.mode === 'login'
        ? await loginWithPassword({ login, password })
        : await registerWithPassword({ login, password });

      setAuthUser(user);
      setServerSyncError('');
      const projects = await listServerProjects();
      setServerProjects(projects);
      if (projects.length > 0) {
        await loadServerProjectIntoWorkspace(projects[0].id);
      } else {
        setServerProjectId(null);
      }
      setToastMessage(current.mode === 'login' ? 'Вы вошли в аккаунт' : 'Регистрация выполнена');
      completeAuthRequestStatus(current.mode === 'login' ? 'Авторизация: вход выполнен' : 'Авторизация: регистрация выполнена');
      setAuthDialog(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : current.mode === 'login'
            ? 'Не удалось войти'
            : 'Не удалось зарегистрироваться';
      clearAuthStatusResetTimeout();
      setAuthRequestStatus(null);
      setAuthDialog((prev) => (prev ? { ...prev, isSubmitting: false, error: message } : prev));
      setServerSyncError(message);
    } finally {
      setAuthBusyKey(null);
      remoteHydratedRef.current = true;
    }
  }

  function upsertServerProjectListEntry(entry: ProjectListItem): void {
    setServerProjects((current) => {
      const next = [entry, ...current.filter((item) => item.id !== entry.id)];
      next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return next;
    });
  }

  function resolveServerProjectName(projectId: string | null): string {
    if (!projectId) return 'проект';
    const found = serverProjects.find((project) => project.id === projectId);
    return found?.name?.trim() || 'проект';
  }

  function startProjectRename(): void {
    setEditingProjectName(true);
    setEditingProjectNameDraft(projectName);
    setPendingProjectNameFocus(true);
  }

  function finishProjectRename(): void {
    const nextName = normalizeProjectName(editingProjectNameDraft || projectName);
    setProjectName(nextName);
    setEditingProjectNameDraft('');
    setEditingProjectName(false);
    setPendingProjectNameFocus(false);
  }

  function cancelProjectRename(): void {
    setEditingProjectNameDraft('');
    setEditingProjectName(false);
    setPendingProjectNameFocus(false);
  }

  async function saveServerProjectWithFallback(params: {
    projectId?: string;
    name: string;
    workspace: WorkspaceProjectData;
    history?: PersistedHistoryState;
  }): Promise<{ id: string; updatedAt: string }> {
    try {
      return await saveServerProject(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (params.history !== undefined && message.includes('Слишком большой объем данных')) {
        return saveServerProject({
          projectId: params.projectId,
          name: params.name,
          workspace: params.workspace
        });
      }
      throw error;
    }
  }

  function isProjectCacheFresh(cached: CachedServerProjectData): boolean {
    return Date.now() - cached.loadedAt < PROJECT_CACHE_TTL_MS;
  }

  function payloadToCachedServerProject(payload: ServerProjectPayload): CachedServerProjectData {
    const normalizedWorkspace = {
      ...payload.workspace,
      projectName: normalizeProjectName(payload.workspace.projectName || payload.name)
    };

    return {
      workspace: deepClone(normalizedWorkspace),
      history: payload.history ? deepClone(payload.history) : null,
      loadedAt: Date.now()
    };
  }

  function applyLoadedServerProject(payload: ServerProjectPayload): void {
    const cached = payloadToCachedServerProject(payload);
    const normalizedWorkspace = deepClone(cached.workspace);

    applyWorkspaceState(normalizedWorkspace);
    applyPersistedHistoryState(payload.history);
    setServerProjectId(payload.id);
    setProjectMethodCounts((current) => ({
      ...current,
      [payload.id]: normalizedWorkspace.methods.length
    }));
    upsertProjectCache(payload.id, cached);
    const loadedHash = JSON.stringify(normalizedWorkspace);
    remoteLastObservedHashRef.current = loadedHash;
    remoteLastSavedHashRef.current = loadedHash;
    remotePendingChangesRef.current = 0;
  }

  function applyCachedServerProject(projectId: string, cached: CachedServerProjectData): void {
    const cachedWorkspace = deepClone(cached.workspace);
    applyWorkspaceState(cachedWorkspace);
    applyPersistedHistoryState(cached.history ? deepClone(cached.history) : null);
    setServerProjectId(projectId);
    setProjectMethodCounts((current) => ({
      ...current,
      [projectId]: cachedWorkspace.methods.length
    }));
    const loadedHash = JSON.stringify(cachedWorkspace);
    remoteLastObservedHashRef.current = loadedHash;
    remoteLastSavedHashRef.current = loadedHash;
    remotePendingChangesRef.current = 0;
  }

  async function loadServerProjectIntoWorkspace(projectId: string): Promise<void> {
    const payload = (await loadServerProject(projectId)) as ServerProjectPayload;
    applyLoadedServerProject(payload);
  }

  async function preloadServerProjectToCache(projectId: string): Promise<void> {
    if (!projectId) return;
    const cached = projectCacheRef.current.get(projectId);
    if (cached && isProjectCacheFresh(cached)) return;

    const payload = (await loadServerProject(projectId)) as ServerProjectPayload;
    const nextCached = payloadToCachedServerProject(payload);
    upsertProjectCache(projectId, nextCached);
    setProjectMethodCounts((current) => ({
      ...current,
      [projectId]: nextCached.workspace.methods.length
    }));
  }

  async function handleServerProjectSelect(nextId: string): Promise<void> {
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
  }

  function cancelDeleteServerProject(): void {
    setShowDeleteProjectDialog(false);
    setPendingDeleteProjectId(null);
  }

  function requestDeleteCurrentProject(): void {
    setIsDeleteEntityMenuOpen(false);
    if (!serverProjectId) {
      setToastMessage('Удаление доступно только для сохраненного проекта.');
      return;
    }

    setPendingDeleteProjectId(serverProjectId);
    setShowDeleteProjectDialog(true);
  }

  function copySection(sectionId: string): void {
    const section = sections.find((item) => item.id === sectionId);
    if (!section) return;
    setSectionClipboard({
      type: 'section',
      section: deepClone(section)
    });
    setToastMessage(`Секция «${resolveSectionTitle(section.title)}» скопирована`);
  }

  function pasteSectionRelative(targetSectionId: string, position: 'above' | 'below'): void {
    if (!sectionClipboard || sectionClipboard.type !== 'section') return;

    const nextSection = cloneSectionForPaste(sectionClipboard.section);
    const nextSelectedId = nextSection.id;

    setSections((prev) => {
      const targetIndex = prev.findIndex((section) => section.id === targetSectionId);
      if (targetIndex === -1) return prev;

      const insertIndex = position === 'above' ? targetIndex : targetIndex + 1;
      const next = [...prev];
      next.splice(insertIndex, 0, nextSection);
      return next;
    });

    setSelectedId(nextSelectedId);
    setToastMessage(`Секция вставлена ${position === 'above' ? 'выше' : 'ниже'}`);
  }

  function addSectionRelative(targetSectionId: string, blockType: AddableBlockType, position: 'above' | 'below' = 'below'): void {
    const nextSection = createSectionFromBlockType(blockType);
    const nextSelectedId = nextSection.id;

    setSections((prev) => {
      const targetIndex = prev.findIndex((section) => section.id === targetSectionId);
      if (targetIndex === -1) return prev;

      const insertIndex = position === 'above' ? targetIndex : targetIndex + 1;
      const next = [...prev];
      next.splice(insertIndex, 0, nextSection);
      return next;
    });

    setSelectedId(nextSelectedId);
    setToastMessage('Раздел добавлен');
  }

  async function confirmDeleteServerProject(): Promise<void> {
    const projectId = pendingDeleteProjectId;
    if (!projectId) return;
    setShowDeleteProjectDialog(false);
    setPendingDeleteProjectId(null);

    const previousProjects = serverProjects;
    const previousServerProjectId = serverProjectId;
    const deletedProjectCache = projectCacheRef.current.get(projectId);
    const nextProjects = serverProjects.filter((project) => project.id !== projectId);

    setServerProjects(nextProjects);
    removeProjectCache(projectId);

    if (previousServerProjectId === projectId) {
      if (nextProjects.length > 0) {
        void handleServerProjectSelect(nextProjects[0].id);
      } else {
        setServerProjectId(null);
        setServerSyncError('');
      }
    }

    setToastMessage('Удаляю проект...');

    try {
      await deleteServerProject(projectId);
      setToastMessage('Проект удален');
    } catch (error) {
      if (deletedProjectCache) {
        upsertProjectCache(projectId, deletedProjectCache);
      }
      setServerProjects(previousProjects);

      if (previousServerProjectId === projectId) {
        if (deletedProjectCache && isProjectCacheFresh(deletedProjectCache)) {
          applyCachedServerProject(projectId, deletedProjectCache);
        } else {
          void handleServerProjectSelect(projectId);
        }
      }

      setServerSyncError(error instanceof Error ? error.message : 'Ошибка удаления проекта');
      setToastMessage('Не удалось удалить проект. Состояние восстановлено.');
    }
  }

  async function handleLogout(): Promise<void> {
    if (authBusyKey) return;
    setAuthBusyKey('auth:logout');
    startAuthRequestStatus('Авторизация: выполняю выход...');
    let serverLogoutFailed = false;
    try {
      await logoutFromServer();
    } catch (error) {
      serverLogoutFailed = true;
      setServerSyncError(error instanceof Error ? error.message : 'Не удалось выйти из аккаунта');
    } finally {
      try {
        localStorage.removeItem(STORAGE_SERVER_PROJECT_ID_KEY);
      } catch {
        // Ignore storage cleanup errors.
      }

      setAuthUser(null);
      setServerProjectId(null);
      setServerProjects([]);
      setServerSyncError((current) => (serverLogoutFailed ? current : ''));
      applyPersistedHistoryState(null);
      resetRemoteTracking();
      setToastMessage(
        serverLogoutFailed
          ? 'Серверная сессия не завершена. Локальные данные сохранены.'
          : 'Вы вышли из аккаунта'
      );
      completeAuthRequestStatus(
        serverLogoutFailed
          ? 'Авторизация: локальный выход выполнен, сервер недоступен'
          : 'Авторизация: выход выполнен'
      );
      setAuthBusyKey(null);
    }
  }

  function getParsedSectionIdByType(type: JsonImportSampleType): string | undefined {
    return sections.find((section) => section.kind === 'parsed' && section.sectionType === type)?.id;
  }

  function applyRoutedJsonImport(): void {
    if (!jsonImportRouting) return;

    const targetType = jsonImportRouting.sampleType;
    let nextSelectedId = '';

    setSections((prev) => {
      const existing = prev.find((section): section is ParsedSection => section.kind === 'parsed' && section.sectionType === targetType);
      const targetId = existing?.id ?? `${targetType}-${Date.now()}`;

      const base = existing
        ? prev
        : [...prev, createParsedSection(targetType, targetId)];

      const next = base.map((section) => {
        if (section.kind !== 'parsed' || section.id !== targetId) return section;

        let parsedRows: ParsedRow[] = [];
        let parseError = '';
        try {
          const shouldWrap = section.sectionType === 'response' && !section.domainModelEnabled;
          const inputToParse = shouldWrap ? wrapNonDomainResponseJson(jsonImportRouting.rawText) : jsonImportRouting.rawText;
          parsedRows = normalizeParsedRowsForSection(section, parseToRows('json', inputToParse));
        } catch (error) {
          parseError = error instanceof Error ? error.message : 'Ошибка парсинга';
        }

        const nextDomainEnabled = jsonImportRouting.domainModelEnabled ? true : section.domainModelEnabled;
        const initializedClientProps = nextDomainEnabled
          ? {
              clientFormat: section.clientFormat ?? 'json',
              clientLastSyncedFormat: section.clientLastSyncedFormat ?? 'json',
              clientInput: section.clientInput ?? '',
              clientRows: section.clientRows ?? [],
              clientError: section.clientError ?? '',
              clientMappings: section.clientMappings ?? {}
            }
          : {
              clientFormat: section.clientFormat,
              clientLastSyncedFormat: section.clientLastSyncedFormat,
              clientInput: section.clientInput,
              clientRows: section.clientRows,
              clientError: section.clientError,
              clientMappings: section.clientMappings
            };

        if (jsonImportRouting.targetSide === 'client') {
          return {
            ...section,
            domainModelEnabled: nextDomainEnabled,
            ...initializedClientProps,
            clientFormat: 'json' as const,
            clientLastSyncedFormat: 'json' as const,
            clientInput: jsonImportRouting.rawText,
            clientRows: parsedRows,
            clientError: parseError
          };
        }

        return {
          ...section,
          domainModelEnabled: nextDomainEnabled,
          ...initializedClientProps,
          format: 'json' as const,
          lastSyncedFormat: 'json' as const,
          input: jsonImportRouting.rawText,
          rows: parsedRows,
          error: parseError
        };
      });

      nextSelectedId = targetId;
      return next;
    });

    if (nextSelectedId) setSelectedId(nextSelectedId);
    setTab('editor');
    setImportError('');
    setJsonImportRouting(null);
    setToastMessage(
      `JSON импортирован и распарсен в ${jsonImportRouting.sampleType === 'request' ? 'Request' : 'Response'} (${jsonImportRouting.targetSide === 'client' ? 'Client' : 'Server'}).`
    );
  }

  function dismissJsonImportRouting(): void {
    setJsonImportRouting(null);
  }

  function markOnboardingExportTouched(): void {
    if (!ONBOARDING_FEATURES.onboardingV1 || onboardingState.status !== 'active') return;
    setHasOnboardingExport(true);
  }

  function switchMethod(method: MethodDocument): void {
    setEditingMethodId(null);
    setEditingMethodNameDraft('');
    setActiveMethodId(method.id);
    setExpandedMethodId(method.id);
    setSelectedId(method.sections[0]?.id ?? createInitialSections()[0].id);
    if (isCompactLayout) setIsSidebarHidden(true);
  }

  function toggleMethodExpanded(method: MethodDocument): void {
    setExpandedMethodId((current) => (current === method.id ? null : method.id));
    if (activeMethodId !== method.id) {
      switchMethod(method);
    }
  }

  function startMethodRename(method: MethodDocument): void {
    if (activeMethodId !== method.id) {
      switchMethod(method);
    }
    setEditingMethodId(method.id);
    setEditingMethodNameDraft(method.name);
    setPendingMethodNameFocus(true);
  }

  function finishMethodRename(): void {
    if (!editingMethodId) return;
    const resolved = (editingMethodNameDraft || '').trim() || DEFAULT_METHOD_NAME;
    setMethodsState((prev) =>
      prev.map((method) =>
        method.id === editingMethodId
          ? {
              ...method,
              name: resolved,
              updatedAt: new Date().toISOString()
            }
          : method
      )
    );
    setEditingMethodNameDraft('');
    setEditingMethodId(null);
  }

  function cancelMethodRename(): void {
    setEditingMethodNameDraft('');
    setEditingMethodId(null);
  }

  function setSections(next: DocSection[] | ((prev: DocSection[]) => DocSection[])): void {
    setMethodsState((prev) => {
      if (prev.length === 0) {
        const baseSections = typeof next === 'function' ? next(createInitialSections()) : next;
        const seedMethod = createMethodDocument(DEFAULT_METHOD_NAME, baseSections);
        setActiveMethodId(seedMethod.id);
        return [seedMethod];
      }

      const targetMethodId = activeMethodId || prev[0].id;
      const methodIndex = prev.findIndex((method) => method.id === targetMethodId);
      if (methodIndex === -1) return prev;

      const currentMethod = prev[methodIndex];
      const nextSections = typeof next === 'function' ? next(currentMethod.sections) : next;
      const nextMethods = [...prev];
      nextMethods[methodIndex] = {
        ...currentMethod,
        updatedAt: new Date().toISOString(),
        sections: nextSections
      };
      return nextMethods;
    });
  }

  function createMethod(): void {
    const name = `Метод ${methods.length + 1}`;
    const method = createMethodDocument(name, createInitialSections());
    setMethodsState((prev) => [...prev, method]);
    setActiveMethodId(method.id);
    setExpandedMethodId(method.id);
    setSelectedId(method.sections[0]?.id ?? createInitialSections()[0].id);
    setEditingMethodId(method.id);
    setEditingMethodNameDraft(name);
    setPendingMethodNameFocus(true);
    setTab('editor');
    setIsAddEntityMenuOpen(false);
    setIsDeleteEntityMenuOpen(false);
  }

  function createProject(): void {
    const seed = createWorkspaceSeed();
    applyWorkspaceState(seed);
    setServerProjectId(null);
    setServerSyncError('');
    setIsAddEntityMenuOpen(false);
    setIsDeleteEntityMenuOpen(false);
    setToastMessage('Создан новый пустой проект.');
  }

  function createProjectDocSection(): void {
    const nextSection: ProjectSection = {
      id: createProjectSectionId(),
      title: `Раздел ${projectSections.length + 1}`,
      enabled: true,
      type: 'text',
      content: '',
      order: projectSections.length
    };
    setProjectSections((prev) => [...prev, nextSection]);
    setActiveProjectSectionId(nextSection.id);
  }

  function updateProjectDocSection(sectionId: string, updater: (current: ProjectSection) => ProjectSection): void {
    setProjectSections((prev) => {
      const next = prev.map((section) => (section.id === sectionId ? updater(section) : section));
      return next.map((section, index) => ({ ...section, order: index }));
    });
  }

  function moveProjectDocSection(sectionId: string, direction: 'up' | 'down'): void {
    setProjectSections((prev) => {
      const index = prev.findIndex((section) => section.id === sectionId);
      if (index === -1) return prev;
      const nextIndex = direction === 'up' ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [section] = next.splice(index, 1);
      next.splice(nextIndex, 0, section);
      return next.map((item, itemIndex) => ({ ...item, order: itemIndex }));
    });
  }

  function deleteProjectDocSection(sectionId: string): void {
    setProjectSections((prev) => {
      const next = prev.filter((section) => section.id !== sectionId).map((section, index) => ({ ...section, order: index }));
      if (next.length === 0) {
        const fallback = createDefaultProjectSections();
        setActiveProjectSectionId(fallback[0]?.id ?? null);
        return fallback;
      }
      if (activeProjectSectionId === sectionId) {
        setActiveProjectSectionId(next[0].id);
      }
      return next;
    });
  }

  function createProjectFlow(): void {
    const next = createDefaultFlow(activeMethod?.id);
    setFlows((prev) => [...prev, next]);
    setActiveFlowId(next.id);
  }

  function updateProjectFlow(flowId: string, updater: (current: ProjectFlow) => ProjectFlow): void {
    setFlows((prev) =>
      prev.map((flow) =>
        flow.id === flowId
          ? {
              ...updater(flow),
              updatedAt: new Date().toISOString()
            }
          : flow
      )
    );
  }

  function deleteProjectFlow(flowId: string): void {
    setFlows((prev) => {
      const next = prev.filter((flow) => flow.id !== flowId);
      if (next.length === 0) {
        const fallback = [createDefaultFlow(activeMethod?.id)];
        setActiveFlowId(fallback[0].id);
        return fallback;
      }
      if (activeFlowId === flowId) {
        setActiveFlowId(next[0].id);
      }
      return next;
    });
  }

  function deleteActiveMethod(): void {
    setIsDeleteEntityMenuOpen(false);
    if (!activeMethod) return;
    if (methods.length <= 1) {
      setToastMessage('Нельзя удалить последний метод. Сначала создайте еще один метод.');
      return;
    }

    setPendingMethodDelete({
      methodId: activeMethod.id,
      methodName: activeMethod.name,
      sectionCount: activeMethod.sections.length
    });
  }

  function cancelDeleteMethod(): void {
    setPendingMethodDelete(null);
  }

  function confirmDeleteMethod(): void {
    if (!pendingMethodDelete) return;
    const deletingMethodId = pendingMethodDelete.methodId;
    const deletingMethodName = pendingMethodDelete.methodName;
    setPendingMethodDelete(null);

    setMethodsState((prev) => {
      const currentIndex = prev.findIndex((method) => method.id === deletingMethodId);
      if (currentIndex === -1) return prev;
      const next = prev.filter((method) => method.id !== deletingMethodId);
      const fallback = next[currentIndex] ?? next[currentIndex - 1] ?? next[0];
      if (fallback) {
        setActiveMethodId(fallback.id);
        setExpandedMethodId(fallback.id);
        setSelectedId(fallback.sections[0]?.id ?? createInitialSections()[0].id);
      } else {
        setExpandedMethodId(null);
      }
      return next;
    });

    setMethodGroups((prev) =>
      prev.map((group) => ({
        ...group,
        methodIds: group.methodIds.filter((id) => id !== deletingMethodId),
        links: group.links.filter((link) => link.fromMethodId !== deletingMethodId && link.toMethodId !== deletingMethodId)
      }))
    );

    setToastMessage(`Метод "${deletingMethodName}" удален`);
  }

  useEffect(() => {
    if (!editingMethodId) return;
    if (methods.some((method) => method.id === editingMethodId)) return;
    setEditingMethodId(null);
    setEditingMethodNameDraft('');
  }, [methods]);

  useEffect(() => {
    if (!sections.length) return;
    if (sections.some((section) => section.id === selectedId)) return;
    setSelectedId(sections[0].id);
  }, [sections, selectedId, activeMethodId]);

  useEffect(() => {
    if (projectSections.length === 0) return;
    if (activeProjectSectionId && projectSections.some((section) => section.id === activeProjectSectionId)) return;
    setActiveProjectSectionId(projectSections[0].id);
  }, [projectSections, activeProjectSectionId]);

  useEffect(() => {
    if (flows.length === 0) return;
    if (activeFlowId && flows.some((flow) => flow.id === activeFlowId)) return;
    setActiveFlowId(flows[0].id);
  }, [flows, activeFlowId]);

  useEffect(() => {
    if (!pendingMethodNameFocus || !activeMethod || activeMethod.id !== activeMethodId || editingMethodId !== activeMethod.id) return;
    if (!methodNameInputRef.current) return;
    methodNameInputRef.current.focus();
    methodNameInputRef.current.select();
    setPendingMethodNameFocus(false);
  }, [pendingMethodNameFocus, activeMethod, activeMethodId, editingMethodId]);

  useEffect(() => {
    if (!pendingProjectNameFocus || !editingProjectName) return;
    if (!projectNameInputRef.current) return;
    try {
      projectNameInputRef.current.focus({ preventScroll: true });
    } catch {
      projectNameInputRef.current.focus();
    }
    projectNameInputRef.current.select();
    setPendingProjectNameFocus(false);
  }, [pendingProjectNameFocus, editingProjectName]);

  useEffect(() => {
    if (!editingField) return;
    const target = inlineFieldInputRef.current;
    if (!target) return;

    const focusWithoutScroll = (): void => {
      try {
        target.focus({ preventScroll: true });
      } catch {
        target.focus();
      }
    };

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(focusWithoutScroll);
      return;
    }

    focusWithoutScroll();
  }, [editingField?.sectionId, editingField?.rowKey, editingField?.target, editingField?.column]);

  useEffect(() => {
    if (!editingRequestCell) return;
    const target = inlineRequestCellInputRef.current;
    if (!target) return;

    const focusWithoutScroll = (): void => {
      try {
        (target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).focus({ preventScroll: true });
      } catch {
        (target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).focus();
      }
    };

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(focusWithoutScroll);
      return;
    }

    focusWithoutScroll();
  }, [editingRequestCell?.sectionId, editingRequestCell?.rowKey, editingRequestCell?.column, editingRequestCell?.target]);

  useEffect(() => {
    if (!activeMethodId) return;
    const previousMethodId = previousMethodIdRef.current;
    previousMethodIdRef.current = activeMethodId;

    if (!previousMethodId || previousMethodId === activeMethodId) return;
    if (!activeMethod) return;

    setIsSectionPanelPulse(true);
    setToastMessage(`Выбран метод "${activeMethod.name.trim() || DEFAULT_METHOD_NAME}"`);
  }, [activeMethodId, activeMethod]);

  useEffect(() => {
    if (!isSectionPanelPulse) return;
    const timerId = window.setTimeout(() => setIsSectionPanelPulse(false), 260);
    return () => window.clearTimeout(timerId);
  }, [isSectionPanelPulse]);

  useEffect(() => {
    if (!openInternalCodeKey) {
      setInternalCodePopoverState(null);
      return;
    }

    const updatePopoverPosition = () => {
      const anchor = internalCodeAnchorRefs.current[openInternalCodeKey];
      if (!anchor) {
        setInternalCodePopoverState(null);
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const viewportPadding = 8;
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      const available = openUp ? spaceAbove - gap : spaceBelow - gap;

      setInternalCodePopoverState({
        top: openUp ? rect.top + window.scrollY - gap : rect.bottom + window.scrollY + gap,
        left: rect.left + window.scrollX,
        width: rect.width,
        maxHeight: Math.max(120, Math.min(260, available)),
        openUp
      });
    };

    const scheduleUpdate = () => {
      window.requestAnimationFrame(updatePopoverPosition);
    };

    updatePopoverPosition();
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);

    return () => {
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
    };
  }, [openInternalCodeKey]);

  useEffect(() => {
    if (!openInternalCodeKey) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const anchor = internalCodeAnchorRefs.current[openInternalCodeKey];
      const popover = internalCodePopoverRef.current;
      if ((anchor && anchor.contains(target)) || (popover && popover.contains(target))) {
        return;
      }

      setOpenInternalCodeKey(null);
    };

    document.addEventListener('mousedown', handleOutsideClick, true);
    return () => document.removeEventListener('mousedown', handleOutsideClick, true);
  }, [openInternalCodeKey]);

  useEffect(() => {
    if (openInternalCodeKey) {
      setHighlightedInternalCodeIndex(0);
    }
  }, [openInternalCodeKey]);

  useEffect(() => {
    if (!toastMessage) return;
    const timerId = window.setTimeout(() => setToastMessage(''), 2200);
    return () => window.clearTimeout(timerId);
  }, [toastMessage]);

  useEffect(() => {
    return () => {
      if (deletedRowUndoTimerRef.current) {
        window.clearTimeout(deletedRowUndoTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleHistoryHotkeys = (event: KeyboardEvent): void => {
      const code = event.code;
      const isMod = event.ctrlKey || event.metaKey;
      if (!isMod) return;

      // Use physical key codes so shortcuts work in any keyboard layout (RU/EN/etc).
      const isUndoCombo = code === 'KeyZ' && !event.shiftKey;
      const isRedoCombo = (code === 'KeyZ' && event.shiftKey) || code === 'KeyY';
      if (!isUndoCombo && !isRedoCombo) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable = tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
      if (isEditable) return;

      event.preventDefault();
      if (isUndoCombo) {
        if (deletedRowUndo) {
          undoDeletedRow();
          return;
        }
        undoWorkspace();
        return;
      }

      redoWorkspace();
    };

    window.addEventListener('keydown', handleHistoryHotkeys);
    return () => window.removeEventListener('keydown', handleHistoryHotkeys);
  }, [deletedRowUndo, methods, methodGroups, activeMethodId, selectedId]);

  useEffect(() => {
    setTab('editor');
  }, [selectedId]);

  const validationMap: TableValidation = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of sections) map.set(section.id, validateSection(section));
    return map;
  }, [sections]);

  const selectedSection = sections.find((section) => section.id === selectedId) ?? sections[0];
  const activeTextSection = selectedSection?.kind === 'text' ? selectedSection : null;

  useEffect(() => {
    if (tab !== 'editor') return;
    if (editingField || editingRequestCell || editingHeaderCell || editingTitle || editingSource || editingSchema || editingMappingCell) return;
    if (typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') return;

    const anchors = sections
      .map((section) => ({ sectionId: section.id, node: sectionAnchorRefs.current.get(section.id) }))
      .filter((item): item is { sectionId: string; node: HTMLElement } => Boolean(item.node));

    if (anchors.length === 0) return;

    const observer = new window.IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const sectionId = (entry.target as HTMLElement).dataset.sectionId;
          if (!sectionId) continue;
          if (entry.isIntersecting) {
            sectionVisibilityRatiosRef.current.set(sectionId, entry.intersectionRatio);
          } else {
            sectionVisibilityRatiosRef.current.delete(sectionId);
          }
        }

        if (observerRafRef.current !== null) return;
        observerRafRef.current = window.requestAnimationFrame(() => {
          observerRafRef.current = null;
          if (Date.now() < suppressObserverSelectionUntilRef.current) return;

          let bestSectionId: string | null = null;
          let bestRatio = -1;
          for (const section of sections) {
            const ratio = sectionVisibilityRatiosRef.current.get(section.id);
            if (ratio === undefined) continue;
            if (ratio > bestRatio) {
              bestRatio = ratio;
              bestSectionId = section.id;
            }
          }

          if (!bestSectionId || bestRatio < 0.2) return;
          if (bestSectionId === selectedId) return;

          const currentRatio = sectionVisibilityRatiosRef.current.get(selectedId) ?? 0;
          const ratioDelta = bestRatio - currentRatio;
          if (ratioDelta < 0.08) return;

          setSelectedId(bestSectionId);
        });
      },
      {
        threshold: [0.2, 0.45, 0.7],
        rootMargin: '-96px 0px -35% 0px'
      }
    );

    sectionVisibilityRatiosRef.current.clear();
    for (const item of anchors) observer.observe(item.node);

    return () => {
      observer.disconnect();
      if (observerRafRef.current !== null) {
        window.cancelAnimationFrame(observerRafRef.current);
        observerRafRef.current = null;
      }
      sectionVisibilityRatiosRef.current.clear();
    };
  }, [tab, sections, selectedId, editingField, editingRequestCell, editingHeaderCell, editingTitle, editingSource, editingSchema, editingMappingCell]);

  function isSelectionInsideListItem(): boolean {
    if (!textEditor) return false;
    const from = textEditor.state.selection.$from;
    for (let depth = from.depth; depth > 0; depth -= 1) {
      const nodeName = from.node(depth).type.name;
      if (nodeName === 'listItem' || nodeName === 'list_item') return true;
    }
    return false;
  }

  const textEditor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        codeBlock: false
      }),
      Highlight.configure({ multicolor: true })
    ],
    content: activeTextSection ? richTextToHtml(activeTextSection.value, { editable: true }) : '<p></p>',
    editorProps: {
      attributes: {
        class: 'rich-text-editor'
      },
      handleDOMEvents: {
        keydown: (view, event) => {
          if (event.key !== 'Tab') return false;

          const from = view.state.selection.$from;
          let insideListItem = false;
          for (let depth = from.depth; depth > 0; depth -= 1) {
            const nodeName = from.node(depth).type.name;
            if (nodeName === 'listItem' || nodeName === 'list_item') {
              insideListItem = true;
              break;
            }
          }
          if (!insideListItem) return false;

          const listItemType = (view.state.schema.nodes as Record<string, unknown>).listItem || (view.state.schema.nodes as Record<string, unknown>).list_item;
          if (!listItemType) {
            event.preventDefault();
            return true;
          }

          const command = event.shiftKey ? liftListItem(listItemType as never) : sinkListItem(listItemType as never);
          const handled = command(view.state, view.dispatch);

          // Always keep Tab inside editor when cursor is in a list item.
          event.preventDefault();
          if (!handled) view.focus();
          return true;
        }
      }
    },
    onUpdate: ({ editor }) => {
      const sectionId = activeTextSectionIdRef.current;
      if (!sectionId) return;

      const nextValue = editorHtmlToWikiText(editor.getHTML());
      textEditorWikiSnapshotRef.current = nextValue;
      updateSection(sectionId, (current) => (current.kind === 'text' && current.value !== nextValue ? { ...current, value: nextValue } : current));
    }
  });

  useEffect(() => {
    activeTextSectionIdRef.current = activeTextSection?.id ?? null;
  }, [activeTextSection?.id]);

  useEffect(() => {
    if (!textEditor) return;

    if (!activeTextSection) {
      textEditor.commands.setContent('<p></p>', { emitUpdate: false });
      textEditorWikiSnapshotRef.current = '';
      return;
    }

    if (textEditor.isFocused && textEditorWikiSnapshotRef.current === activeTextSection.value) {
      return;
    }

    const nextHtml = richTextToHtml(activeTextSection.value, { editable: true });
    textEditor.commands.setContent(nextHtml, { emitUpdate: false });
    textEditorWikiSnapshotRef.current = activeTextSection.value;
  }, [textEditor, activeTextSection?.id, activeTextSection?.value]);

  const selectedServerSourceRows =
    selectedSection?.kind === 'parsed' ? getRowsRelevantToSourceFormat(selectedSection.rows, selectedSection.format) : [];
  const selectedClientSourceRows =
    selectedSection?.kind === 'parsed' && isDualModelSection(selectedSection)
      ? getRowsRelevantToSourceFormat(selectedSection.clientRows ?? [], selectedSection.clientFormat ?? 'json')
      : [];
  const hasSelectedServerSourceInput = selectedSection?.kind === 'parsed' ? Boolean(selectedSection.input.trim()) : false;
  const hasSelectedClientSourceInput =
    selectedSection?.kind === 'parsed' && isDualModelSection(selectedSection) ? Boolean((selectedSection.clientInput ?? '').trim()) : false;
  const selectedServerDriftRows = hasSelectedServerSourceInput ? getInputDriftRows(selectedServerSourceRows) : [];
  const selectedClientDriftRows = hasSelectedClientSourceInput ? getInputDriftRows(selectedClientSourceRows) : [];
  const selectedServerDuplicateValues = hasSelectedServerSourceInput ? Array.from(getDuplicateValueSet(selectedServerSourceRows)) : [];
  const selectedClientDuplicateValues = hasSelectedClientSourceInput ? Array.from(getDuplicateValueSet(selectedClientSourceRows)) : [];
  const selectedServerFormatDrift =
    selectedSection?.kind === 'parsed'
      ? Boolean(hasSelectedServerSourceInput && selectedServerSourceRows.length > 0 && selectedSection.lastSyncedFormat && selectedSection.lastSyncedFormat !== selectedSection.format)
      : false;
  const selectedClientFormatDrift =
    selectedSection?.kind === 'parsed' && isDualModelSection(selectedSection)
      ? Boolean(hasSelectedClientSourceInput && selectedClientSourceRows.length > 0 && selectedSection.clientLastSyncedFormat && selectedSection.clientLastSyncedFormat !== (selectedSection.clientFormat ?? 'json'))
      : false;

  const onboardingProgress = useMemo(
    () => evaluateOnboardingProgress(sections, hasOnboardingExport),
    [sections, hasOnboardingExport]
  );
  const nextOnboardingStep = useMemo(() => resolveOnboardingStep(onboardingProgress), [onboardingProgress]);

  useEffect(() => {
    if (!ONBOARDING_FEATURES.onboardingV1 || !ONBOARDING_FEATURES.onboardingGuidedMode) return;
    if (onboardingState.status !== 'active') return;
    if (onboardingState.currentStep === nextOnboardingStep) return;

    setOnboardingState((prev) => {
      if (prev.status !== 'active' || prev.currentStep === nextOnboardingStep) return prev;
      const next = { ...prev, currentStep: nextOnboardingStep };
      saveOnboardingState(next);
      return next;
    });
  }, [onboardingState.status, onboardingState.currentStep, nextOnboardingStep]);

  useEffect(() => {
    if (!ONBOARDING_FEATURES.onboardingV1 || !ONBOARDING_FEATURES.onboardingGuidedMode) {
      previousOnboardingStepRef.current = onboardingState.currentStep;
      return;
    }

    const previous = previousOnboardingStepRef.current;
    if (onboardingState.status !== 'active' || previous === onboardingState.currentStep) {
      previousOnboardingStepRef.current = onboardingState.currentStep;
      return;
    }

    emitOnboardingEvent('onboarding_step_changed', {
      stepId: onboardingState.currentStep,
      source: onboardingState.entryPath ?? undefined
    });
    previousOnboardingStepRef.current = onboardingState.currentStep;
  }, [onboardingState.status, onboardingState.currentStep, onboardingState.entryPath]);

  useEffect(() => {
    if (!ONBOARDING_FEATURES.onboardingV1) return;
    if (onboardingState.status !== 'active' || !hasOnboardingExport) return;

    const source = onboardingState.entryPath ?? undefined;
    emitOnboardingEvent('first_export_done', {
      stepId: onboardingState.currentStep,
      source
    });

    const completedState = markOnboardingCompleted();
    setOnboardingState(completedState);
    setHasOnboardingExport(false);
    setShowOnboardingEntry(false);

    emitOnboardingEvent('onboarding_completed', {
      stepId: 'export-docs',
      source
    });
    setToastMessage('Навигация завершена: первый экспорт выполнен.');
  }, [onboardingState.status, onboardingState.entryPath, onboardingState.currentStep, hasOnboardingExport]);

  const htmlPreviewOutput = useMemo(() => renderHtmlDocument(sections, theme, { interactive: false }), [sections, theme]);
  const wikiOutput = useMemo(() => renderWikiDocument(sections), [sections]);
  const onboardingStepCompleted = useMemo<Record<OnboardingStepId, boolean>>(
    () => ({
      'prepare-source': onboardingProgress.hasSourceInput,
      'run-parse': onboardingProgress.hasParsedRows,
      'refine-structure': onboardingProgress.hasStructuredContent,
      'export-docs': onboardingState.status === 'completed' || onboardingProgress.hasExportedDocs
    }),
    [onboardingProgress, onboardingState.status]
  );
  const onboardingNavStepIndex = useMemo(
    () => Math.max(0, ONBOARDING_STEPS.findIndex((step) => step.id === onboardingNavStep)),
    [onboardingNavStep]
  );
  const activeOnboardingStep = ONBOARDING_STEPS[onboardingNavStepIndex] ?? ONBOARDING_STEPS[0];
  const requestSectionId = useMemo(
    () => sections.find((section) => section.kind === 'parsed' && section.sectionType === 'request')?.id ?? sections.find((section) => section.kind === 'parsed')?.id,
    [sections]
  );
  const firstTextSectionId = useMemo(() => sections.find((section) => section.kind === 'text')?.id, [sections]);

  useEffect(() => {
    if (onboardingState.status !== 'active') return;
    setOnboardingNavStep(onboardingState.currentStep);
  }, [onboardingState.status, onboardingState.currentStep]);

  useEffect(() => {
    return () => {
      if (onboardingStepHintTimerRef.current) {
        window.clearTimeout(onboardingStepHintTimerRef.current);
      }
      if (onboardingSpotlightTimerRef.current) {
        window.clearTimeout(onboardingSpotlightTimerRef.current);
      }
      onboardingSpotlightNodeRef.current?.classList.remove('onboarding-spotlight-active');
    };
  }, []);

  function setOnboardingStepHintMessage(message: string): void {
    setOnboardingStepHint(message);
    if (onboardingStepHintTimerRef.current) {
      window.clearTimeout(onboardingStepHintTimerRef.current);
    }
    onboardingStepHintTimerRef.current = window.setTimeout(() => {
      setOnboardingStepHint('');
      onboardingStepHintTimerRef.current = null;
    }, 3600);
  }

  function getOnboardingStepTarget(stepId: OnboardingStepId): OnboardingStepTarget {
    if (stepId === 'prepare-source') {
      return {
        tab: 'editor',
        sectionId: requestSectionId,
        openExpander: 'source-server',
        anchor: 'prepare-source'
      };
    }

    if (stepId === 'run-parse') {
      return {
        tab: 'editor',
        sectionId: requestSectionId,
        openExpander: 'source-server',
        anchor: 'run-parse'
      };
    }

    if (stepId === 'refine-structure') {
      return {
        tab: 'editor',
        sectionId: firstTextSectionId,
        anchor: 'refine-structure'
      };
    }

    if (stepId === 'export-docs') {
      return {
        tab: 'editor',
        anchor: 'export-docs',
        hintMessage: 'Используйте кнопки Экспорт HTML/Wiki в верхней панели.'
      };
    }

    return {
      tab: 'editor',
      anchor: 'prepare-source'
    };
  }

  function canNavigateToOnboardingStep(stepId: OnboardingStepId): { allowed: boolean; reason?: string } {
    const targetIndex = ONBOARDING_STEPS.findIndex((step) => step.id === stepId);
    if (targetIndex < 0) return { allowed: false, reason: 'Шаг не найден.' };
    return { allowed: true };
  }

  function spotlightOnboardingAnchor(anchor: string, stepTitle: string): void {
    const selector = `[data-onboarding-anchor="${anchor}"]`;
    window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(selector);
      if (!target) return;

      if (onboardingSpotlightTimerRef.current) {
        window.clearTimeout(onboardingSpotlightTimerRef.current);
      }

      onboardingSpotlightNodeRef.current?.classList.remove('onboarding-spotlight-active');
      onboardingSpotlightNodeRef.current = target;

      target.classList.remove('onboarding-spotlight-active');
      void target.offsetWidth;
      target.classList.add('onboarding-spotlight-active');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const focusCandidate =
        target.matches('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
          ? target
          : target.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');

      focusCandidate?.focus({ preventScroll: true });

      onboardingSpotlightTimerRef.current = window.setTimeout(() => {
        target.classList.remove('onboarding-spotlight-active');
        onboardingSpotlightTimerRef.current = null;
      }, 2100);
    }, 90);

    void stepTitle;
  }

  function goToOnboardingStep(stepId: OnboardingStepId, source: OnboardingNavSource, force = false): void {
    void force;

    setOnboardingNavStep(stepId);

    const target = getOnboardingStepTarget(stepId);
    if (target.sectionId) {
      setSelectedId(target.sectionId);
    }
    setTab(target.tab);
    if (target.sectionId && target.openExpander) {
      setExpanderOpen(target.sectionId, target.openExpander, true);
    }
    if (target.hintMessage) {
      setToastMessage(target.hintMessage);
    }

    spotlightOnboardingAnchor(target.anchor, ONBOARDING_STEPS.find((step) => step.id === stepId)?.title ?? stepId);
    emitOnboardingEvent('onboarding_step_jump', { stepId, source });
  }

  function focusOnboardingCurrentStep(): void {
    goToOnboardingStep(onboardingNavStep, 'cta', true);
  }

  function jumpToOnboardingStep(stepId: OnboardingStepId): void {
    const selectedStep = ONBOARDING_STEPS.find((step) => step.id === stepId);
    const access = canNavigateToOnboardingStep(stepId);
    const hint = access.allowed ? selectedStep?.description : access.reason;
    if (hint) {
      setOnboardingStepHintMessage(hint);
    }

    setDismissedOnboardingHints((prev) => {
      if (!prev[stepId]) return prev;
      const next = { ...prev };
      delete next[stepId];
      return next;
    });

    goToOnboardingStep(stepId, 'chip');
  }

  const activeOnboardingHint = useMemo(() => {
    if (!ONBOARDING_FEATURES.onboardingV1 || !ONBOARDING_FEATURES.onboardingGuidedMode) return null;
    if (onboardingState.status !== 'active') return null;
    if (dismissedOnboardingHints[onboardingNavStep]) return null;

    if (onboardingNavStep === 'prepare-source') {
      return {
        title: 'Добавьте источник данных',
        description: 'Откройте request/response и вставьте source (для request: JSON/cURL, для response: JSON), чтобы начать парсинг.',
        actionLabel: 'Открыть source'
      };
    }

    if (onboardingNavStep === 'run-parse') {
      return {
        title: 'Запустите парсер',
        description: 'После вставки источника нажмите Парсить, чтобы таблица параметров заполнилась автоматически.',
        actionLabel: 'Перейти к парсеру'
      };
    }

    if (onboardingNavStep === 'refine-structure') {
      return {
        title: 'Заполните смысловые блоки',
        description: 'Добавьте описание в текст, диаграмму или раздел ошибок, чтобы структура документа была полной.',
        actionLabel: 'Открыть текстовый блок'
      };
    }

    if (onboardingNavStep === 'export-docs') {
      return {
        title: 'Экспортируйте документацию',
        description: 'Скачайте HTML или Wiki, чтобы зафиксировать результат и завершить базовый сценарий.',
        actionLabel: 'Открыть экспорт'
      };
    }

    return null;
  }, [onboardingState.status, onboardingNavStep, dismissedOnboardingHints]);

  function handleActiveOnboardingHintAction(): void {
    if (!activeOnboardingHint) return;

    goToOnboardingStep(onboardingNavStep, 'hint', true);
  }

  function renderOnboardingEntryIcon(path: OnboardingEntryPath): ReactNode {
    if (path === 'quick_start') {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3l2.6 5.2L20 11l-5.4 2.8L12 19l-2.6-5.2L4 11l5.4-2.8L12 3Z" />
        </svg>
      );
    }

    if (path === 'scratch') {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M9 9h6M9 13h6M12 7v12" />
        </svg>
      );
    }

    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 4v10m0 0l-3-3m3 3l3-3" />
        <rect x="4" y="14" width="16" height="6" rx="2" />
      </svg>
    );
  }

  function renderUiIcon(name: string): ReactNode {
    if (name === 'import') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4v10" /><path d="M8 8l4-4 4 4" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>;
    if (name === 'download') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4v10" /><path d="m9 11 3 3 3-3" /></svg>;
    if (name === 'export') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20V10" /><path d="M8 16l4 4 4-4" /><path d="M4 9V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" /></svg>;
    if (name === 'undo') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 7 5 11l4 4" /><path d="M6 11h8a5 5 0 0 1 0 10h-2" /></svg>;
    if (name === 'redo') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 7l4 4-4 4" /><path d="M18 11h-8a5 5 0 0 0 0 10h2" /></svg>;
    if (name === 'save') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 4h10l4 4v12H5z" /><path d="M8 4v4h6V4" /><path d="M8 20v-5h8v5" /></svg>;
    if (name === 'onboarding_nav') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="3" /><circle cx="12" cy="12" r="3" /><circle cx="19" cy="12" r="3" /><path d="M4.4 12h1.2" /><path d="M12 11v2" /><path d="M11.2 11h1.6" /><path d="M18.2 11h1.6" /><path d="M18.2 13h1.6" /><path d="M8 12h1" /><path d="M15 12h1" /></svg>;
    if (name === 'theme_moon') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 1 0 9.8 9.8Z" /></svg>;
    if (name === 'theme_sun') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="m4.9 4.9 2.1 2.1" /><path d="m17 17 2.1 2.1" /><path d="m19.1 4.9-2.1 2.1" /><path d="m7 17-2.1 2.1" /></svg>;
    if (name === 'add_row') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 7v10M7 12h10" /></svg>;
    if (name === 'format_json') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5c-2 0-3 1.4-3 3.2V10c0 1.2-.6 2-2 2 1.4 0 2 .8 2 2v1.8C5 17.6 6 19 8 19" /><path d="M16 5c2 0 3 1.4 3 3.2V10c0 1.2.6 2 2 2-1.4 0-2 .8-2 2v1.8c0 1.8-1 3.2-3 3.2" /></svg>;
    if (name === 'copy') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" /></svg>;
    if (name === 'paste_above') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 17V7" /><path d="m8 11 4-4 4 4" /><path d="M5 20h14" /></svg>;
    if (name === 'paste_below') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 7v10" /><path d="m8 13 4 4 4-4" /><path d="M5 4h14" /></svg>;
    if (name === 'ai_describe') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="12" rx="3" /><path d="M8 9h8" /><path d="M12 16v4" /><path d="M8 20h8" /></svg>;
    if (name === 'ai_map') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="6" cy="12" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="18" cy="17" r="2" /><path d="M8 12h4" /><path d="M12 12l4-5" /><path d="M12 12l4 5" /></svg>;
    if (name === 'ai_mask') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3 5 6v5c0 4.2 2.6 8.2 7 10 4.4-1.8 7-5.8 7-10V6l-7-3Z" /><path d="M9 12h6" /><path d="M10 9h4" /></svg>;
    if (name === 'add_method') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 6v12M6 12h12" /></svg>;
    if (name === 'delete_method') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14" /></svg>;
    if (name === 'delete_section') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 7h14" /><path d="M9 7V5h6v2" /><path d="M8 7l1 12h6l1-12" /></svg>;
    if (name === 'add_section') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" /></svg>;
    if (name === 'skip') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 6l8 6-8 6V6Z" /><path d="M14 6l8 6-8 6V6Z" /></svg>;
    if (name === 'search') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.2-4.2" /></svg>;
    if (name === 'settings') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 2a7 7 0 0 0-1.7 1L5 5l-2 3.4 2 1.6a7 7 0 0 0 0 2L3 13.6 5 17l2.4-1a7 7 0 0 0 1.7 1l.4 2h5l.4-2a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1Z" /></svg>;
    if (name === 'user') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></svg>;
    if (name === 'more') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>;
    if (name === 'edit') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h4l10-10-4-4L4 16v4Z" /><path d="m13 7 4 4" /></svg>;
    if (name === 'folder') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>;
    if (name === 'sidebar_panel') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>;
    if (name === 'chevron_down') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6" /></svg>;
    if (name === 'chevron_right') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" /></svg>;

    return null;
  }

  function renderSectionActionCluster(section: DocSection, layout: 'sidebar' | 'header' = 'header'): ReactNode {
    const hasClipboardSection = sectionClipboard?.type === 'section';
    const className = layout === 'sidebar' ? 'section-item-actions' : 'section-head-actions';
    const isMenuOpen = openSectionActionsMenuId === section.id;

    return (
      <div className={className}>
        <button
          className="icon-button"
          type="button"
          aria-label="Копировать секцию"
          title="Копировать секцию"
          onClick={(event) => {
            event.stopPropagation();
            copySection(section.id);
          }}
        >
          <span className="ui-icon" aria-hidden>{renderUiIcon('copy')}</span>
        </button>
        <div className="section-action-menu">
          <button
            className="icon-button section-action-more-btn"
            type="button"
            aria-label="Дополнительные действия секции"
            title="Дополнительные действия"
            aria-expanded={isMenuOpen}
            onClick={(event) => {
              event.stopPropagation();
              setOpenSectionActionsMenuId((current) => (current === section.id ? null : section.id));
            }}
          >
            <span className="ui-icon" aria-hidden>{renderUiIcon('more')}</span>
          </button>
          {isMenuOpen && (
            <div className="add-block-popover section-action-popover" role="menu" aria-label="Действия секции">
              {hasClipboardSection && (
                <button
                  className="add-block-option"
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    pasteSectionRelative(section.id, 'below');
                    setOpenSectionActionsMenuId(null);
                  }}
                >
                  <span className="add-block-option-title">Вставить копию ниже</span>
                </button>
              )}
              <button
                className="add-block-option"
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  addSectionRelative(section.id, 'text', 'below');
                  setOpenSectionActionsMenuId(null);
                }}
              >
                <span className="add-block-option-title">Добавить текстовый раздел</span>
              </button>
              <button
                className="add-block-option"
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  addSectionRelative(section.id, 'request', 'below');
                  setOpenSectionActionsMenuId(null);
                }}
              >
                <span className="add-block-option-title">Добавить Request</span>
              </button>
              <button
                className="add-block-option"
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  addSectionRelative(section.id, 'response', 'below');
                  setOpenSectionActionsMenuId(null);
                }}
              >
                <span className="add-block-option-title">Добавить Response</span>
              </button>
              <button
                className="add-block-option"
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  addSectionRelative(section.id, 'diagram', 'below');
                  setOpenSectionActionsMenuId(null);
                }}
              >
                <span className="add-block-option-title">Добавить диаграмму</span>
              </button>
              <button
                className="add-block-option"
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  addSectionRelative(section.id, 'error-logic', 'below');
                  setOpenSectionActionsMenuId(null);
                }}
              >
                <span className="add-block-option-title">Добавить ошибки</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (!openSectionActionsMenuId) return;

    const handleOutsideClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setOpenSectionActionsMenuId(null);
        return;
      }

      if (target.closest('.section-action-menu')) return;
      setOpenSectionActionsMenuId(null);
    };

    document.addEventListener('mousedown', handleOutsideClick, true);
    return () => document.removeEventListener('mousedown', handleOutsideClick, true);
  }, [openSectionActionsMenuId]);

  useEffect(() => {
    if (!isAddEntityMenuOpen && !isDeleteEntityMenuOpen) return;

    const handleOutsideClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setIsAddEntityMenuOpen(false);
        setIsDeleteEntityMenuOpen(false);
        return;
      }

      if (target.closest('.add-entity-menu') || target.closest('.delete-entity-menu')) {
        return;
      }

      setIsAddEntityMenuOpen(false);
      setIsDeleteEntityMenuOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick, true);
    return () => document.removeEventListener('mousedown', handleOutsideClick, true);
  }, [isAddEntityMenuOpen, isDeleteEntityMenuOpen]);

  const onboardingEntryOptions: Array<{
    id: OnboardingEntryPath;
    title: string;
    description: string;
    action: () => void;
  }> = [
    {
      id: 'quick_start',
      title: 'Быстрый старт',
      description: 'Откроем демо с готовым примером request/response.',
      action: handleQuickStartOnboarding
    },
    {
      id: 'scratch',
      title: 'Пустой проект',
      description: 'Создадим новый проект с чистого листа.',
      action: handleScratchOnboarding
    },
    {
      id: 'import',
      title: 'Импорт JSON',
      description: 'Загрузим JSON в нужный раздел.',
      action: handleImportOnboarding
    }
  ];

  const onboardingPrimaryActionLabel = activeOnboardingHint?.actionLabel ?? 'Перейти к шагу';

  useEffect(() => {
    applyThemeToRoot(theme);
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore persistence errors for local preference.
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const mediaQuery = window.matchMedia(COMPACT_LAYOUT_MEDIA_QUERY);
    const updateCompactLayout = (event?: MediaQueryListEvent): void => {
      setIsCompactLayout(event ? event.matches : mediaQuery.matches);
    };

    updateCompactLayout();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateCompactLayout);
      return () => mediaQuery.removeEventListener('change', updateCompactLayout);
    }

    mediaQuery.addListener(updateCompactLayout);
    return () => mediaQuery.removeListener(updateCompactLayout);
  }, []);

  useEffect(() => {
    try {
      if (isSidebarHidden) {
        localStorage.setItem(SIDEBAR_HIDDEN_KEY, '1');
      } else {
        localStorage.removeItem(SIDEBAR_HIDDEN_KEY);
      }
    } catch {
      // Ignore persistence errors for local preference.
    }
  }, [isSidebarHidden]);

  useEffect(() => {
    setAutosave({ state: 'saving' });

    if (localAutosaveTimerRef.current !== null) {
      window.clearTimeout(localAutosaveTimerRef.current);
    }
    if (localAutosaveFlushRef.current !== null) {
      window.clearTimeout(localAutosaveFlushRef.current);
      localAutosaveFlushRef.current = null;
    }

    localAutosaveTimerRef.current = window.setTimeout(() => {
      localAutosaveTimerRef.current = null;
      localAutosaveFlushRef.current = window.setTimeout(() => {
        localAutosaveFlushRef.current = null;
        const workspace = asWorkspaceProjectData(
          normalizedProjectName,
          methods,
          activeMethodId,
          methodGroups,
          projectSections,
          flows
        );
        if (persistLocalWorkspace(workspace)) {
          setAutosave({ state: 'saved', at: formatTime(new Date()) });
        } else {
          setAutosave({ state: 'error' });
        }
      }, 0);
    }, LOCAL_AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (localAutosaveTimerRef.current !== null) {
        window.clearTimeout(localAutosaveTimerRef.current);
      }
      if (localAutosaveFlushRef.current !== null) {
        window.clearTimeout(localAutosaveFlushRef.current);
        localAutosaveFlushRef.current = null;
      }
    };
  }, [normalizedProjectName, methods, activeMethodId, methodGroups, projectSections, flows]);

  useEffect(() => {
    const focusedElement = document.activeElement;

    for (const section of sections) {
      if (section.kind !== 'diagram') continue;

      for (const diagram of section.diagrams) {
        const editorKey = `${section.id}:${diagram.id}`;
        const editor = diagramTextRefs.current[editorKey];
        if (!editor || editor === focusedElement) continue;

        const nextHtml = richTextToHtml(diagram.description ?? '', { editable: true });
        if (editor.innerHTML !== nextHtml) editor.innerHTML = nextHtml;
      }
    }
  }, [sections]);

  function updateSection(id: string, updater: (section: DocSection) => DocSection): void {
    setSections((prev) => prev.map((section) => (section.id === id ? updater(section) : section)));
  }

  function getExpanderKey(sectionId: string, blockId: string): string {
    return `${sectionId}:${blockId}`;
  }

  function isExpanderOpen(sectionId: string, blockId: string): boolean {
    return expanderState[getExpanderKey(sectionId, blockId)] ?? false;
  }

  function setExpanderOpen(sectionId: string, blockId: string, isOpen: boolean): void {
    const key = getExpanderKey(sectionId, blockId);
    setExpanderState((current) => ({ ...current, [key]: isOpen }));
  }

  function updateSectionTitle(id: string, title: string): void {
    updateSection(id, (section) => ({ ...section, title }));
  }

  function startTitleEditing(section: DocSection): void {
    setEditingTitle({
      sectionId: section.id,
      draft: section.title
    });
  }

  function cancelTitleEditing(): void {
    setEditingTitle(null);
  }

  function saveTitleEditing(): void {
    if (!editingTitle) return;
    updateSectionTitle(editingTitle.sectionId, resolveSectionTitle(editingTitle.draft));
    setEditingTitle(null);
  }

  function deleteSection(id: string): void {
    setSections((prev) => {
      const deletedIndex = prev.findIndex((section) => section.id === id);
      if (deletedIndex === -1) return prev;

      const next = prev.filter((section) => section.id !== id);

      if (selectedId === id) {
        const fallback = next[deletedIndex] ?? next[deletedIndex - 1] ?? next[0];
        if (fallback) setSelectedId(fallback.id);
      }

      return next;
    });
  }

  function requestDeleteSection(id: string): void {
    const section = sections.find((item) => item.id === id);
    if (!section) return;
    setPendingSectionDelete({
      sectionId: section.id,
      sectionTitle: resolveSectionTitle(section.title)
    });
  }

  function cancelDeleteSection(): void {
    setPendingSectionDelete(null);
  }

  function confirmDeleteSection(): void {
    if (!pendingSectionDelete) return;
    const { sectionId, sectionTitle } = pendingSectionDelete;
    setPendingSectionDelete(null);
    deleteSection(sectionId);
    setToastMessage(`Раздел «${sectionTitle}» удален`);
  }

  function addDiagram(sectionId: string): void {
    updateSection(sectionId, (section) => {
      if (section.kind !== 'diagram') return section;
      return { ...section, diagrams: [...section.diagrams, createDiagramItem()] };
    });
  }

  function updateDiagram(sectionId: string, diagramId: string, updater: (diagram: DiagramItem) => DiagramItem): void {
    updateSection(sectionId, (section) => {
      if (section.kind !== 'diagram') return section;
      return {
        ...section,
        diagrams: section.diagrams.map((diagram) => (diagram.id === diagramId ? updater(diagram) : diagram))
      };
    });
  }

  function deleteDiagram(sectionId: string, diagramId: string): void {
    updateSection(sectionId, (section) => {
      if (section.kind !== 'diagram') return section;
      const nextDiagrams = section.diagrams.filter((diagram) => diagram.id !== diagramId);
      return { ...section, diagrams: nextDiagrams.length > 0 ? nextDiagrams : [createDiagramItem()] };
    });
  }

  function updateErrorRow(sectionId: string, rowIndex: number, updater: (row: ErrorRow) => ErrorRow): void {
    updateSection(sectionId, (section) => {
      if (section.kind !== 'errors') return section;
      return {
        ...section,
        rows: section.rows.map((row, index) => (index === rowIndex ? updater(row) : row))
      };
    });
  }

  function updateValidationRuleRow(sectionId: string, rowIndex: number, updater: (row: ValidationRuleRow) => ValidationRuleRow): void {
    updateSection(sectionId, (section) => {
      if (section.kind !== 'errors') return section;
      return {
        ...section,
        validationRules: section.validationRules.map((row, index) => (index === rowIndex ? updater(row) : row))
      };
    });
  }

  function addErrorRow(sectionId: string): void {
    updateSection(sectionId, (section) => {
      if (section.kind !== 'errors') return section;
      return { ...section, rows: [...section.rows, createErrorRow()] };
    });
  }

  function deleteErrorRow(sectionId: string, rowIndex: number): void {
    updateSection(sectionId, (section) => {
      if (section.kind !== 'errors') return section;
      const nextRows = section.rows.filter((_, index) => index !== rowIndex);
      return { ...section, rows: nextRows.length > 0 ? nextRows : [createErrorRow()] };
    });
  }

  function addValidationRuleRow(sectionId: string): void {
    updateSection(sectionId, (section) => {
      if (section.kind !== 'errors') return section;

      const nextValidationRules = [...section.validationRules, createValidationRuleRow()];
      if (section.validationRules.length > 0) {
        return { ...section, validationRules: nextValidationRules };
      }

      const preset = ERROR_CATALOG_BY_CODE.get('100101');
      const hasValidationErrorRow = section.rows.some((row) => row.internalCode === '100101' || row.trigger.trim() === 'Ошибка валидации');

      if (hasValidationErrorRow) {
        return {
          ...section,
          validationRules: nextValidationRules,
          rows: section.rows.map((row) =>
            row.internalCode === '100101' || row.trigger.trim() === 'Ошибка валидации'
              ? {
                  ...row,
                  trigger: row.trigger.trim() || 'Ошибка валидации',
                  message: preset?.message ?? row.message,
                  responseCode: buildServerErrorResponseTemplate({
                    code: '100101',
                    message: preset?.message ?? row.message ?? 'Bad request sent to the system'
                  })
                }
              : row
          )
        };
      }

      const validationErrorRow: ErrorRow = {
        clientHttpStatus: '-',
        clientResponse: '',
        clientResponseCode: '',
        trigger: 'Ошибка валидации',
        errorType: 'BusinessException',
        serverHttpStatus: '422',
        internalCode: '100101',
        message: preset?.message ?? 'Bad request sent to the system',
        responseCode: buildServerErrorResponseTemplate({
          code: '100101',
          message: preset?.message ?? 'Bad request sent to the system'
        })
      };

      const isSingleEmptyRow =
        section.rows.length === 1 &&
        !section.rows[0].clientHttpStatus.trim() &&
        !section.rows[0].clientResponse.trim() &&
        !(section.rows[0].clientResponseCode ?? '').trim() &&
        !section.rows[0].trigger.trim() &&
        section.rows[0].errorType === '-' &&
        !section.rows[0].serverHttpStatus.trim() &&
        !section.rows[0].internalCode.trim() &&
        !section.rows[0].message.trim() &&
        !section.rows[0].responseCode.trim();

      return {
        ...section,
        validationRules: nextValidationRules,
        rows: isSingleEmptyRow ? [validationErrorRow] : [...section.rows, validationErrorRow]
      };
    });
  }

  function deleteValidationRuleRow(sectionId: string, rowIndex: number): void {
    updateSection(sectionId, (section) => {
      if (section.kind !== 'errors') return section;
      const nextRows = section.validationRules.filter((_, index) => index !== rowIndex);
      return { ...section, validationRules: nextRows.length > 0 ? nextRows : [createValidationRuleRow()] };
    });
  }

  async function autofillValidationRulesFromRequestSchema(errorsSectionId: string): Promise<void> {
    const busyKey = `build-validation-rules:${errorsSectionId}`;
    if (aiBusyKey) return;

    const requestSection = sections.find((item): item is ParsedSection => item.kind === 'parsed' && item.sectionType === 'request');
    if (!requestSection) {
      setToastMessage('Request секция не найдена');
      return;
    }

    const schemaInput = (requestSection.schemaInput ?? '').trim();
    if (!schemaInput) {
      setToastMessage('Для автозаполнения добавьте JSON Schema в Server request');
      return;
    }

    let normalizedSchemaInput = '';
    try {
      const parsedSchema = JSON.parse(schemaInput) as unknown;
      if (!parsedSchema || typeof parsedSchema !== 'object' || Array.isArray(parsedSchema)) {
        throw new Error('JSON Schema должен быть объектом');
      }
      normalizedSchemaInput = JSON.stringify(parsedSchema);
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : 'Не удалось разобрать JSON Schema');
      return;
    }

    setAiErrorMessage('');
    startAiRequestStatus('AI: формирую таблицу валидации...');
    setAiBusyKey(busyKey);

    let generatedRules: ValidationRuleRow[];
    try {
      generatedRules = await buildValidationRulesWithAi({
        schemaInput: normalizedSchemaInput,
        allowedValidationCases: [...VALIDATION_CASE_OPTIONS]
      });
    } catch (error) {
      setAiRequestStatus(null);
      setAiErrorMessage(error instanceof Error ? error.message : 'Не удалось сгенерировать правила валидации через AI');
      setAiBusyKey(null);
      return;
    }

    let usedFallback = false;
    if (generatedRules.length === 0) {
      try {
        generatedRules = buildValidationRulesFromSchemaInput(normalizedSchemaInput);
        usedFallback = generatedRules.length > 0;
      } catch {
        // Keep empty result and show original message below.
      }

      if (generatedRules.length === 0) {
        setAiRequestStatus(null);
        setAiBusyKey(null);
        setToastMessage('В JSON Schema не найдено условий для таблицы валидации');
        return;
      }
    }

    const preset = ERROR_CATALOG_BY_CODE.get('100101');
    updateSection(errorsSectionId, (section) => {
      if (section.kind !== 'errors') return section;

      const hasValidationErrorRow = section.rows.some((row) => row.internalCode === '100101' || row.trigger.trim() === 'Ошибка валидации');
      if (hasValidationErrorRow) {
        return {
          ...section,
          validationRules: generatedRules,
          rows: section.rows.map((row) =>
            row.internalCode === '100101' || row.trigger.trim() === 'Ошибка валидации'
              ? {
                  ...row,
                  trigger: row.trigger.trim() || 'Ошибка валидации',
                  message: preset?.message ?? row.message,
                  responseCode: buildServerErrorResponseTemplate({
                    code: '100101',
                    message: preset?.message ?? row.message ?? 'Bad request sent to the system'
                  })
                }
              : row
          )
        };
      }

      const validationErrorRow: ErrorRow = {
        clientHttpStatus: '-',
        clientResponse: '',
        clientResponseCode: '',
        trigger: 'Ошибка валидации',
        errorType: 'BusinessException',
        serverHttpStatus: '422',
        internalCode: '100101',
        message: preset?.message ?? 'Bad request sent to the system',
        responseCode: buildServerErrorResponseTemplate({
          code: '100101',
          message: preset?.message ?? 'Bad request sent to the system'
        })
      };

      const isSingleEmptyRow =
        section.rows.length === 1
        && !section.rows[0].clientHttpStatus.trim()
        && !section.rows[0].clientResponse.trim()
        && !(section.rows[0].clientResponseCode ?? '').trim()
        && !section.rows[0].trigger.trim()
        && section.rows[0].errorType === '-'
        && !section.rows[0].serverHttpStatus.trim()
        && !section.rows[0].internalCode.trim()
        && !section.rows[0].message.trim()
        && !section.rows[0].responseCode.trim();

      return {
        ...section,
        validationRules: generatedRules,
        rows: isSingleEmptyRow ? [validationErrorRow] : [...section.rows, validationErrorRow]
      };
    });

    if (usedFallback) {
      setToastMessage(`AI вернул пустой ответ, применен fallback-генератор: ${generatedRules.length} правил`);
      completeAiRequestStatus('AI: применен fallback для таблицы валидации');
    } else {
      setToastMessage(`Таблица валидации заполнена из JSON Schema: ${generatedRules.length} правил`);
      completeAiRequestStatus('AI: таблица валидации заполнена');
    }
    setAiBusyKey(null);
  }

  function applyInternalCode(sectionId: string, rowIndex: number, internalCode: string): void {
    updateErrorRow(sectionId, rowIndex, (row) => {
      const normalizedCode = internalCode.trim();
      const preset = ERROR_CATALOG_BY_CODE.get(normalizedCode);
      if (!preset) {
        return {
          ...row,
          internalCode: normalizedCode,
          serverHttpStatus: row.errorType === 'BusinessException' ? '422' : '',
          message: '',
          responseCode: ''
        };
      }
      return {
        ...row,
        internalCode: normalizedCode,
        serverHttpStatus: row.errorType === 'BusinessException' ? '422' : preset.httpStatus,
        message: preset.message,
        responseCode: buildServerErrorResponseTemplate({
          code: normalizedCode,
          message: preset.message
        })
      };
    });
  }

  function formatClientResponseCode(sectionId: string, rowIndex: number): void {
    updateErrorRow(sectionId, rowIndex, (row) => {
      const trimmed = (row.clientResponseCode ?? '').trim();
      if (!trimmed) return { ...row, clientResponseCode: '{\n  \n}' };

      try {
        return { ...row, clientResponseCode: JSON.stringify(JSON.parse(trimmed), null, 2) };
      } catch {
        return row;
      }
    });
  }

  function formatErrorResponseCode(sectionId: string, rowIndex: number): void {
    updateErrorRow(sectionId, rowIndex, (row) => {
      const trimmed = row.responseCode.trim();
      if (!trimmed) return { ...row, responseCode: '{\n  \n}' };

      try {
        return { ...row, responseCode: JSON.stringify(JSON.parse(trimmed), null, 2) };
      } catch {
        return row;
      }
    });
  }

  function runParser(section: ParsedSection, target: ParseTarget = 'server'): void {
    const isEditingCurrentTarget =
      Boolean(editingSource)
      && editingSource?.sectionId === section.id
      && editingSource.target === target;

    const persistedFormat = getSourceFormat(section, target);
    const persistedInput = target === 'client' ? section.clientInput ?? '' : section.input;
    const schemaInput = target === 'client' ? (section.clientSchemaInput ?? '') : (section.schemaInput ?? '');
    const draftInput = isEditingCurrentTarget ? editingSource?.draft ?? persistedInput : persistedInput;
    const detectedDraftFormat = detectSourceFormat(draftInput, isRequestSection(section));
    const format = detectedDraftFormat ?? persistedFormat;
    const input = draftInput;
    const normalizedSchema = schemaInput.trim();
    const useSchemaPriority = Boolean(normalizedSchema);

    try {
      const shouldWrap = section.sectionType === 'response' && !section.domainModelEnabled && !useSchemaPriority && format === 'json';
      const inputToParse = shouldWrap ? wrapNonDomainResponseJson(input) : input;
      const parsedRows = useSchemaPriority ? parseJsonSchemaToRows(normalizedSchema) : parseToRows(format, inputToParse);
      const rows = normalizeParsedRowsForSection(section, parsedRows);
      const curlMeta = isRequestSection(section) && !useSchemaPriority && format === 'curl' ? parseCurlMeta(input) : null;
      updateSection(section.id, (current) => {
        if (current.kind !== 'parsed') return current;
        if (target === 'client' && isDualModelSection(current)) {
          return {
            ...current,
            clientFormat: format,
            clientInput: input,
            clientRows: rows,
            clientError: '',
            clientLastSyncedFormat: format,
            externalRequestUrl: isRequestSection(current) ? curlMeta?.url ?? current.externalRequestUrl ?? '' : current.externalRequestUrl,
            externalRequestMethod: isRequestSection(current) ? curlMeta?.method ?? current.externalRequestMethod ?? 'POST' : current.externalRequestMethod
          };
        }
        return {
          ...current,
          format,
          input,
          rows,
          error: '',
          lastSyncedFormat: format,
          requestUrl: isRequestSection(current) ? curlMeta?.url ?? current.requestUrl ?? '' : current.requestUrl,
          requestMethod: isRequestSection(current) ? curlMeta?.method ?? current.requestMethod ?? 'POST' : current.requestMethod
        };
      });
      if (isEditingCurrentTarget) {
        setEditingSource(null);
        setSourceEditorError('');
      }
    } catch (error) {
      updateSection(section.id, (current) => {
        if (current.kind !== 'parsed') return current;
        const message = error instanceof Error ? error.message : 'Ошибка парсинга';
        if (target === 'client' && isDualModelSection(current)) {
          return {
            ...current,
            clientFormat: format,
            clientInput: input,
            clientRows: [],
            clientError: message
          };
        }
        return {
          ...current,
          format,
          input,
          rows: [],
          error: message
        };
      });
    }
  }

  function getLiveSourceDraft(section: ParsedSection, target: ParseTarget): string {
    const persisted = target === 'client' ? section.clientInput ?? '' : section.input;
    const isEditingCurrentTarget =
      Boolean(editingSource)
      && editingSource?.sectionId === section.id
      && editingSource.target === target;

    return isEditingCurrentTarget ? editingSource?.draft ?? persisted : persisted;
  }

  async function fixJsonSyntaxWithAi(section: ParsedSection, target: ParseTarget = 'server'): Promise<void> {
    const busyKey = `fix-json:${section.id}:${target}`;
    if (aiBusyKey) return;

    const draft = getLiveSourceDraft(section, target);
    const format = detectSourceFormat(draft, isRequestSection(section)) ?? getSourceFormat(section, target);

    if (format !== 'json') {
      setAiRequestStatus(null);
      setAiErrorMessage('AI исправление доступно только для JSON источника');
      return;
    }

    const syntaxError = validateSourceDraft('json', draft);
    if (!syntaxError) {
      setAiRequestStatus(null);
      setAiErrorMessage('JSON уже валиден, исправление не требуется');
      return;
    }

    setAiErrorMessage('');
    startAiRequestStatus('AI: исправляю JSON...');
    setAiBusyKey(busyKey);

    try {
      const fixed = await repairJsonWithAi(draft);
      const normalized = JSON.stringify(JSON.parse(fixed), null, 2);
      const shouldWrap = section.sectionType === 'response' && !section.domainModelEnabled;
      const inputToParse = shouldWrap ? wrapNonDomainResponseJson(normalized) : normalized;
      const parsedRows = parseToRows('json', inputToParse);
      const rows = normalizeParsedRowsForSection(section, parsedRows);

      if (editingSource?.sectionId === section.id && editingSource.target === target) {
        setEditingSource((current) => (current ? { ...current, draft: normalized } : current));
      }

      updateSection(section.id, (current) => {
        if (current.kind !== 'parsed') return current;
        if (target === 'client' && isDualModelSection(current)) {
          return {
            ...current,
            clientFormat: 'json',
            clientInput: normalized,
            clientRows: rows,
            clientError: '',
            clientLastSyncedFormat: 'json'
          };
        }
        return {
          ...current,
          format: 'json',
          input: normalized,
          rows,
          error: '',
          lastSyncedFormat: 'json'
        };
      });

      setSourceEditorError('');
      setToastMessage('AI исправил JSON и обновил таблицу');
      completeAiRequestStatus('AI: JSON исправлен');
    } catch (error) {
      setAiRequestStatus(null);
      setAiErrorMessage(error instanceof Error ? error.message : 'Не удалось исправить JSON через AI');
    } finally {
      setAiBusyKey(null);
    }
  }

  async function fillFieldDescriptionsWithAi(section: ParsedSection): Promise<void> {
    const busyKey = `fill-descriptions:${section.id}`;
    if (aiBusyKey) return;

    const targetRows = section.rows.filter((row) => row.field.trim() && row.source !== 'header' && row.source !== 'url');
    if (targetRows.length === 0) {
      setAiRequestStatus(null);
      setAiErrorMessage('Нет полей для автозаполнения описаний');
      return;
    }

    setAiErrorMessage('');
    startAiRequestStatus('AI: заполняю описания полей...');
    setAiBusyKey(busyKey);

    try {
      const suggestions = await fillDescriptionsWithAi({
        sectionType: section.sectionType ?? 'generic',
        rows: targetRows.map((row) => ({
          field: row.field,
          type: row.type,
          required: row.required,
          example: row.example,
          source: row.source
        }))
      });

      const descriptionByField = new Map(
        suggestions
          .map((item) => [item.field.trim().toLowerCase(), item.description.trim()] as const)
          .filter((item) => item[0] && item[1])
      );

      updateSection(section.id, (current) => {
        if (current.kind !== 'parsed') return current;

        const rows = current.rows.map((row) => {
          const suggested = descriptionByField.get(row.field.trim().toLowerCase());
          if (!suggested || row.description.trim()) return row;
          return { ...row, description: suggested };
        });

        return { ...current, rows };
      });

      setToastMessage('AI заполнил описания полей');
      completeAiRequestStatus('AI: описания заполнены');
    } catch (error) {
      setAiRequestStatus(null);
      setAiErrorMessage(error instanceof Error ? error.message : 'Не удалось заполнить описания через AI');
    } finally {
      setAiBusyKey(null);
    }
  }

  async function suggestParameterMappingsWithAi(section: ParsedSection): Promise<void> {
    const busyKey = `suggest-mappings:${section.id}`;
    if (aiBusyKey) return;

    if (!isDualModelSection(section) || !section.domainModelEnabled) {
      setAiRequestStatus(null);
      setAiErrorMessage('AI маппинг доступен только в режиме доменной модели');
      return;
    }

    const serverRows = section.rows.filter((row) => isRequestMappingRow(row) && row.field.trim());
    const clientRows = (section.clientRows ?? []).filter((row) => row.field.trim());

    if (serverRows.length === 0 || clientRows.length === 0) {
      setAiRequestStatus(null);
      setAiErrorMessage('Недостаточно данных для AI маппинга параметров');
      return;
    }

    setAiErrorMessage('');
    startAiRequestStatus('AI: подбираю маппинг параметров...');
    setAiBusyKey(busyKey);

    try {
      const suggestions = await suggestMappingsWithAi({
        serverFields: serverRows.map((row) => row.field),
        clientFields: clientRows.map((row) => row.field)
      });

      updateSection(section.id, (current) => {
        if (current.kind !== 'parsed' || !isDualModelSection(current)) return current;

        const nextMappings = { ...(current.clientMappings ?? {}) };
        const nextClientRows = current.clientRows ?? [];

        const serverByField = new Map(
          current.rows
            .filter((row) => isRequestMappingRow(row) && row.field.trim())
            .map((row) => [row.field.trim().toLowerCase(), getParsedRowKey(row)] as const)
        );

        const clientByField = new Map(
          nextClientRows
            .filter((row) => row.field.trim())
            .map((row) => [row.field.trim().toLowerCase(), getParsedRowKey(row)] as const)
        );

        for (const suggestion of suggestions) {
          const serverKey = serverByField.get(suggestion.serverField.trim().toLowerCase());
          const clientKey = clientByField.get(suggestion.clientField.trim().toLowerCase());
          if (!serverKey || !clientKey) continue;
          if (!nextMappings[serverKey]) {
            nextMappings[serverKey] = clientKey;
          }
        }

        return { ...current, clientMappings: nextMappings };
      });

      setToastMessage('AI предложил маппинг параметров');
      completeAiRequestStatus('AI: маппинг подобран');
    } catch (error) {
      setAiRequestStatus(null);
      setAiErrorMessage(error instanceof Error ? error.message : 'Не удалось подобрать маппинг через AI');
    } finally {
      setAiBusyKey(null);
    }
  }

  async function requestAiMaskFieldSet(section: ParsedSection, rows: ParsedRow[]): Promise<Set<string>> {
    const suggestions = await suggestMaskFieldsWithAi({
      sectionType: section.sectionType ?? 'generic',
      rows: rows.map((row) => ({
        field: row.field,
        type: row.type,
        description: row.description,
        example: row.example,
        source: row.source
      }))
    });

    return new Set(
      suggestions
        .map((item) => item.field.trim().toLowerCase())
        .filter(Boolean)
    );
  }

  async function maskSensitiveFieldsWithAi(section: ParsedSection, target: ParseTarget, scope: 'body' | 'headers'): Promise<number> {
    const sourceRows = target === 'client' && isDualModelSection(section) ? section.clientRows ?? [] : section.rows;
    const candidateRows = sourceRows.filter((row) => {
      if (!row.field.trim()) return false;
      if (scope === 'headers') return row.source === 'header';
      return row.source !== 'header' && row.source !== 'url';
    });

    if (candidateRows.length === 0) return 0;

    const maskFieldSet = await requestAiMaskFieldSet(section, candidateRows);
    if (maskFieldSet.size === 0) return 0;

    let updatedCount = 0;

    updateSection(section.id, (current) => {
      if (current.kind !== 'parsed') return current;

      if (target === 'client' && isDualModelSection(current)) {
        const clientRows = (current.clientRows ?? []).map((row) => {
          const inScope = scope === 'headers' ? row.source === 'header' : row.source !== 'header' && row.source !== 'url';
          const shouldMask = inScope && maskFieldSet.has(row.field.trim().toLowerCase());
          if (!shouldMask || row.maskInLogs) return row;
          updatedCount += 1;
          return { ...row, maskInLogs: true };
        });

        return { ...current, clientRows };
      }

      const rows = current.rows.map((row) => {
        const inScope = scope === 'headers' ? row.source === 'header' : row.source !== 'header' && row.source !== 'url';
        const shouldMask = inScope && maskFieldSet.has(row.field.trim().toLowerCase());
        if (!shouldMask || row.maskInLogs) return row;
        updatedCount += 1;
        return { ...row, maskInLogs: true };
      });

      return { ...current, rows };
    });

    return updatedCount;
  }

  async function runAiMasking(section: ParsedSection, options: { target: ParseTarget | 'both'; scope: 'body' | 'headers' }): Promise<void> {
    const busyKey = `mask-fields:${section.id}:${options.target}:${options.scope}`;
    if (aiBusyKey) return;

    setAiErrorMessage('');
    startAiRequestStatus('AI: определяю поля для маскирования...');
    setAiBusyKey(busyKey);

    try {
      const targets: ParseTarget[] = options.target === 'both'
        ? (isDualModelSection(section) ? ['server', 'client'] : ['server'])
        : [options.target];

      let totalUpdated = 0;
      for (const target of targets) {
        totalUpdated += await maskSensitiveFieldsWithAi(section, target, options.scope);
      }

      if (totalUpdated === 0) {
        setToastMessage('AI не нашел новых чувствительных полей для маскирования');
        completeAiRequestStatus('AI: маскирование не требуется');
        return;
      }

      setToastMessage(`AI включил маскирование для ${totalUpdated} полей`);
      completeAiRequestStatus('AI: маскирование применено');
    } catch (error) {
      setAiRequestStatus(null);
      setAiErrorMessage(error instanceof Error ? error.message : 'Не удалось определить маскируемые поля через AI');
    } finally {
      setAiBusyKey(null);
    }
  }

  function renderAiActionIcon(iconName: 'ai_describe' | 'ai_mask' | 'ai_map', isBusy: boolean): ReactNode {
    if (isBusy) {
      return <span className="ai-loader ai-loader-inline" aria-hidden="true" />;
    }
    return <span className="ui-icon" aria-hidden>{renderUiIcon(iconName)}</span>;
  }

  function exportProjectJson(): void {
    const projectSlug = slugifyMethodFileName(normalizedProjectName);
    const payload = buildWorkspaceProjectData();
    downloadText(`${projectSlug}.project.json`, JSON.stringify(payload, null, 2));
    markOnboardingExportTouched();
  }

  function exportMockServiceJson(): void {
    if (!activeMethod) return;
    const methodSlug = slugifyMethodFileName(activeMethod.name);
    const payload = buildMockServicePayload(activeMethod);
    downloadText(`${methodSlug}.mock-service.json`, JSON.stringify(payload, null, 2));
    markOnboardingExportTouched();
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Failed to convert blob to data URL'));
      reader.readAsDataURL(blob);
    });
  }

  async function buildEmbeddedMethodDiagramImageMap(): Promise<Record<string, string>> {
    const diagramSections = sections.filter((section): section is DiagramSection => section.kind === 'diagram');
    const imageMap: Record<string, string> = {};

    for (const section of diagramSections) {
      const diagrams = section.diagrams.filter((diagram) => diagram.code.trim());

      for (let index = 0; index < diagrams.length; index += 1) {
        const diagram = diagrams[index];
        const fileName = getDiagramExportFileName(resolveSectionTitle(section.title), section.id, diagram.title, index, 'svg');
        try {
          const imageUrl = getDiagramImageUrl(resolveDiagramEngine(diagram.code, diagram.engine), diagram.code, 'svg');
          const response = await fetch(imageUrl);
          if (!response.ok) continue;
          const blob = await response.blob();
          imageMap[fileName] = await blobToDataUrl(blob);
        } catch {
          // Keep fallback link behavior when image embedding fails.
        }
      }
    }

    return imageMap;
  }

  async function buildEmbeddedProjectFlowImageMap(): Promise<Record<string, string>> {
    const imageMap: Record<string, string> = {};

    for (let index = 0; index < flows.length; index += 1) {
      const flow = flows[index];
      const fileName = getFlowExportFileName(flow, index, 'svg');
      const mermaid = buildFlowMermaid(flow, methods);
      try {
        const imageUrl = getDiagramImageUrl('mermaid', mermaid, 'svg');
        const response = await fetch(imageUrl);
        if (!response.ok) continue;
        const blob = await response.blob();
        imageMap[fileName] = await blobToDataUrl(blob);
      } catch {
        // Keep fallback link behavior when image embedding fails.
      }
    }

    return imageMap;
  }

  async function handleExportHtml(): Promise<void> {
    if (!activeMethod) return;
    const methodSlug = slugifyMethodFileName(activeMethod.name);
    const diagramImageMap = await buildEmbeddedMethodDiagramImageMap();
    const htmlForExport = renderHtmlDocument(sections, theme, {
      interactive: true,
      diagramImageSource: 'remote',
      diagramImageMap
    });
    downloadText(`${methodSlug}.documentation.html`, htmlForExport);
    markOnboardingExportTouched();
  }

  function handleExportWiki(): void {
    if (!activeMethod) return;
    const methodSlug = slugifyMethodFileName(activeMethod.name);
    downloadText(`${methodSlug}.documentation.wiki.txt`, wikiOutput);
    markOnboardingExportTouched();
  }

  function openHtmlPreview(): void {
    if (!activeMethod) return;
    setWorkspaceScope('methods');
    setTab('html');
  }

  async function handleExportFullProjectHtml(): Promise<void> {
    const projectSlug = slugifyMethodFileName(normalizedProjectName);
    const flowImageMap = await buildEmbeddedProjectFlowImageMap();
    const methodDiagramImageMap: Record<string, string> = {};
    for (const method of methods) {
      const diagramSections = method.sections.filter((section): section is DiagramSection => section.kind === 'diagram' && section.enabled);
      for (const section of diagramSections) {
        const diagrams = section.diagrams.filter((diagram) => diagram.code.trim());
        for (let index = 0; index < diagrams.length; index += 1) {
          const diagram = diagrams[index];
          const fileName = getDiagramExportFileName(resolveSectionTitle(section.title), section.id, diagram.title, index, 'svg');
          if (methodDiagramImageMap[fileName]) continue;
          try {
            const imageUrl = getDiagramImageUrl(resolveDiagramEngine(diagram.code, diagram.engine), diagram.code, 'svg');
            const response = await fetch(imageUrl);
            if (!response.ok) continue;
            const blob = await response.blob();
            methodDiagramImageMap[fileName] = await blobToDataUrl(blob);
          } catch {
            // Keep remote fallback if embedding fails.
          }
        }
      }
    }

    const html = renderProjectHtmlDocument({
      projectName: normalizedProjectName,
      updatedAt: new Date().toISOString(),
      projectSections: projectSections.filter((section) => section.enabled),
      flows,
      methods: methods.map((method) => ({ ...method, sections: method.sections.filter((section) => section.enabled) })),
      theme,
      flowImageMap,
      methodDiagramImageMap
    });
    downloadText(`${projectSlug}.project.documentation.html`, html);
    markOnboardingExportTouched();
  }

  function handleExportFullProjectWiki(): void {
    const projectSlug = slugifyMethodFileName(normalizedProjectName);
    const wiki = renderProjectWikiDocument({
      projectName: normalizedProjectName,
      updatedAt: new Date().toISOString(),
      projectSections: projectSections.filter((section) => section.enabled),
      flows,
      methods: methods.map((method) => ({ ...method, sections: method.sections.filter((section) => section.enabled) }))
    });
    downloadText(`${projectSlug}.project.documentation.wiki.txt`, wiki);
    markOnboardingExportTouched();
  }

  function openWikiPreview(): void {
    if (!activeMethod) return;
    setWorkspaceScope('methods');
    setTab('wiki');
  }

  async function copyToClipboard(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }

  function processImportedText(rawText: string, fileName: string): void {
    try {
      const text = rawText.trim();
      if (!text) {
        setImportError('Вставьте JSON или cURL.');
        return;
      }

      const parsed = JSON.parse(text) as WorkspaceProjectData | ProjectData | Record<string, unknown>;

      if ('methods' in parsed && Array.isArray(parsed.methods)) {
        setWorkspaceMethodsImportRouting({
          fileName,
          workspace: parsed as WorkspaceProjectData
        });
        setImportError('');
        setProjectTextImport(null);
        return;
      }

      if ('sections' in parsed && Array.isArray(parsed.sections)) {
        const sanitizedSections = sanitizeSections((parsed as ProjectData).sections);
        setSections(sanitizedSections);
        setSelectedId(sanitizedSections[0]?.id ?? selectedId);
        setImportError('');
        setProjectTextImport(null);
        return;
      }

      const guessedType = guessJsonSampleType(parsed);
      const linkedSectionId = getParsedSectionIdByType(guessedType);
      const linkedSection = sections.find(
        (section): section is ParsedSection => section.kind === 'parsed' && section.id === linkedSectionId
      );

      const domainModelEnabled = Boolean(linkedSection?.domainModelEnabled);
      setJsonImportRouting({
        fileName,
        rawText: text,
        sampleType: guessedType,
        domainModelEnabled,
        targetSide: domainModelEnabled ? 'client' : 'server'
      });
      setImportError('');
      setProjectTextImport(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Ошибка импорта');
    }
  }

  function importProjectJson(file: File | undefined): void {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      processImportedText(String(reader.result || ''), file.name);
    };
    reader.readAsText(file);
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

  function cancelWorkspaceMethodsImportRouting(): void {
    setWorkspaceMethodsImportRouting(null);
  }

  function applyWorkspaceImportAsReplace(): void {
    if (!workspaceMethodsImportRouting) return;
    const loaded = loadWorkspaceProjectFromPayload(workspaceMethodsImportRouting.workspace);
    applyWorkspaceState({ ...loaded, groups: ENABLE_MULTI_METHODS ? loaded.groups : [] });
    setWorkspaceMethodsImportRouting(null);
    setImportError('');
    setToastMessage('Проект импортирован из JSON');
  }

  function applyWorkspaceImportAsMethodsMerge(): void {
    if (!workspaceMethodsImportRouting) return;

    const loaded = loadWorkspaceProjectFromPayload(workspaceMethodsImportRouting.workspace);
    const importedMethodsSource = loaded.methods;

    if (importedMethodsSource.length === 0) {
      setWorkspaceMethodsImportRouting(null);
      setImportError('JSON не содержит методов для импорта');
      return;
    }

    const takenNames = new Set(methods.map((method) => method.name.trim().toLowerCase()));
    const methodIdMap = new Map<string, string>();

    const importedMethods = importedMethodsSource.map((method) => {
      const originalId = method.id;
      const nextId = createMethodId();
      methodIdMap.set(originalId, nextId);

      const nextName = getUniqueMethodImportName(method.name, takenNames);
      takenNames.add(nextName.toLowerCase());

      return {
        ...method,
        id: nextId,
        name: nextName,
        updatedAt: method.updatedAt || new Date().toISOString()
      };
    });

    const importedGroups = ENABLE_MULTI_METHODS
      ? loaded.groups
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
          .filter((group): group is MethodGroup => Boolean(group))
      : [];

    setMethodsState((current) => [...current, ...importedMethods]);
    if (importedGroups.length > 0) {
      setMethodGroups((current) => [...current, ...importedGroups]);
    }

    const firstImportedMethod = importedMethods[0];
    setActiveMethodId(firstImportedMethod.id);
    setSelectedId(firstImportedMethod.sections[0]?.id ?? createInitialSections()[0].id);
    setTab('editor');

    setWorkspaceMethodsImportRouting(null);
    setImportError('');
    setToastMessage(`Импортировано методов: ${importedMethods.length}`);
  }

  function openSourceTextImport(section: ParsedSection, target: ParseTarget): void {
    setSourceTextImport({
      sectionId: section.id,
      target,
      draft: getSourceValue(section, target)
    });
    setSourceEditorError('');
  }

  function applySourceTextImport(): void {
    if (!sourceTextImport) return;

    const section = sections.find((item): item is ParsedSection => item.kind === 'parsed' && item.id === sourceTextImport.sectionId);
    if (!section) {
      setSourceTextImport(null);
      return;
    }

    const rawDraft = sourceTextImport.draft;
    const currentFormat = getSourceFormat(section, sourceTextImport.target);
    const nextFormat = applyDetectedSourceFormat(section.id, sourceTextImport.target, rawDraft, currentFormat);
    const validationError = validateSourceDraft(nextFormat, rawDraft);

    if (validationError) {
      setSourceEditorError(validationError);
      return;
    }

    updateSection(section.id, (current) => {
      if (current.kind !== 'parsed') return current;

      if (sourceTextImport.target === 'client' && isDualModelSection(current)) {
        return {
          ...current,
          clientFormat: nextFormat,
          clientInput: rawDraft,
          clientError: ''
        };
      }

      return {
        ...current,
        format: nextFormat,
        input: rawDraft,
        error: ''
      };
    });

    setSelectedId(section.id);
    setTab('editor');
    setExpanderOpen(section.id, sourceTextImport.target === 'client' ? 'source-client' : 'source-server', true);
    setEditingSource(null);
    setSourceEditorError('');
    setSourceTextImport(null);
    setToastMessage(`Текст импортирован в ${sourceTextImport.target === 'client' ? 'Client source' : 'Server source'}.`);
  }

  function loadWorkspaceProjectFromPayload(payload: WorkspaceProjectData): WorkspaceProjectData {
    const methods = payload.methods
      .filter((method) => method && Array.isArray(method.sections))
      .map((method, index) => ({
        id: method.id || createMethodId(),
        name: method.name?.trim() || `Метод ${index + 1}`,
        updatedAt: method.updatedAt || new Date().toISOString(),
        sections: sanitizeSections(method.sections).map(withSectionRowIds)
      }));

    if (methods.length === 0) return createWorkspaceSeed();

    const groups = Array.isArray(payload.groups)
      ? payload.groups.map((group) => ({
          id: group.id || `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: group.name?.trim() || 'Новая цепочка',
          methodIds: Array.isArray(group.methodIds) ? group.methodIds.filter(Boolean) : [],
          links: Array.isArray(group.links) ? group.links : []
        }))
      : [];

    const activeMethodId = payload.activeMethodId && methods.some((method) => method.id === payload.activeMethodId)
      ? payload.activeMethodId
      : methods[0].id;

    const workspace: WorkspaceProjectData = {
      version: 3,
      projectName: normalizeProjectName(payload.projectName),
      updatedAt: payload.updatedAt || new Date().toISOString(),
      methods,
      groups,
      activeMethodId,
      projectSections: sanitizeProjectSections(payload.projectSections),
      flows: sanitizeProjectFlows(payload.flows, methods)
    };

    return normalizeWorkspaceForMode(workspace);
  }

  function syncTextSectionFromEditor(sectionId: string): void {
    if (!textEditor) return;
    const nextValue = editorHtmlToWikiText(textEditor.getHTML());
    textEditorWikiSnapshotRef.current = nextValue;
    updateSection(sectionId, (current) => (current.kind === 'text' && current.value !== nextValue ? { ...current, value: nextValue } : current));
  }

  function getDiagramEditorKey(sectionId: string, diagramId: string): string {
    return `${sectionId}:${diagramId}`;
  }

  function getDiagramEditorNode(sectionId: string, diagramId: string): HTMLDivElement | null {
    return diagramTextRefs.current[getDiagramEditorKey(sectionId, diagramId)] ?? null;
  }

  function bindDiagramEditorRef(sectionId: string, diagramId: string, node: HTMLDivElement | null): void {
    diagramTextRefs.current[getDiagramEditorKey(sectionId, diagramId)] = node;
  }

  function syncDiagramDescriptionFromEditor(sectionId: string, diagramId: string): void {
    const editor = getDiagramEditorNode(sectionId, diagramId);
    if (!editor) return;
    const nextValue = editorElementToWikiText(editor);
    updateDiagram(sectionId, diagramId, (current) => ({ ...current, description: nextValue }));
  }

  function findClosestInEditor(node: Node | null, selector: string, editor: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null =
      node instanceof HTMLElement
        ? node
        : node instanceof Text
          ? node.parentElement
          : null;

    while (current) {
      if (current.matches(selector)) return current;
      if (current === editor) break;
      current = current.parentElement;
    }

    return null;
  }

  function getSelectionInEditor(editor: HTMLElement): Selection | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return null;
    return selection;
  }

  function unwrapElement(element: HTMLElement): void {
    const parent = element.parentNode;
    if (!parent) return;

    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }

    parent.removeChild(element);
  }

  function normalizeRichTextColor(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (/^#[0-9a-f]{3,8}$/i.test(normalized)) return normalized;
    if (/^rgba?\([0-9\s.,%+-]+\)$/i.test(normalized)) return normalized;
    if (/^hsla?\([0-9\s.,%+-]+\)$/i.test(normalized)) return normalized;
    if (/^[a-z][a-z-]*$/i.test(normalized)) return normalized;
    return RICH_TEXT_HIGHLIGHT_OPTIONS[0].value;
  }

  function parseNodeColor(node: HTMLElement): string {
    const inlineColor = node.dataset.highlight || node.style.backgroundColor || node.getAttribute('color') || '';
    return normalizeRichTextColor(inlineColor);
  }

  function resolveCssBackgroundColor(value: string): string {
    const probe = document.createElement('span');
    probe.style.backgroundColor = value;
    probe.style.position = 'absolute';
    probe.style.left = '-9999px';
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).backgroundColor || value;
    probe.remove();
    return resolved.toLowerCase();
  }

  function areHighlightColorsEqual(left: string, right: string): boolean {
    return resolveCssBackgroundColor(left) === resolveCssBackgroundColor(right);
  }

  function rememberSelectionForEditor(editor: HTMLElement | null): void {
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;

    richEditorSelectionRef.current = { editor, range: range.cloneRange() };
  }

  function restoreSelectionForEditor(editor: HTMLElement | null): void {
    const stored = richEditorSelectionRef.current;
    const selection = window.getSelection();
    if (!editor || !stored || !selection || stored.editor !== editor) return;

    selection.removeAllRanges();
    selection.addRange(stored.range);
    editor.focus();
  }

  function toggleFormatBlock(editor: HTMLElement, tag: 'h3' | 'blockquote'): void {
    const selection = getSelectionInEditor(editor);
    if (!selection) return;

    const anchorBlock = findClosestInEditor(selection.anchorNode, tag, editor);
    const focusBlock = findClosestInEditor(selection.focusNode, tag, editor);
    const shouldUnset = Boolean(anchorBlock && focusBlock && anchorBlock === focusBlock);

    document.execCommand('formatBlock', false, shouldUnset ? 'p' : tag);
  }

  function toggleInlineCode(editor: HTMLElement): void {
    const selection = getSelectionInEditor(editor);
    if (!selection) return;

    const anchorCode = findClosestInEditor(selection.anchorNode, 'code', editor);
    const focusCode = findClosestInEditor(selection.focusNode, 'code', editor);

    if (anchorCode && focusCode && anchorCode === focusCode) {
      unwrapElement(anchorCode);
      return;
    }

    const selectedText = selection.toString() || 'code';
    document.execCommand('insertHTML', false, `<code>${escapeRichTextHtml(selectedText)}</code>`);
  }

  function wrapSelectionWithInlineElement(editor: HTMLElement, tagName: 'em'): void {
    const selection = getSelectionInEditor(editor);
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const wrapper = document.createElement(tagName);

    if (range.collapsed) {
      const textNode = document.createTextNode('\u200b');
      wrapper.appendChild(textNode);
      range.insertNode(wrapper);

      const nextRange = document.createRange();
      nextRange.setStart(textNode, 1);
      nextRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(nextRange);
      return;
    }

    const content = range.extractContents();
    wrapper.appendChild(content);
    range.insertNode(wrapper);

    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);
    selection.removeAllRanges();
    selection.addRange(nextRange);
  }

  function toggleInlineItalic(editor: HTMLElement): void {
    const selection = getSelectionInEditor(editor);
    if (!selection) return;

    const anchorItalic = findClosestInEditor(selection.anchorNode, 'em, i', editor);
    const focusItalic = findClosestInEditor(selection.focusNode, 'em, i', editor);

    if (anchorItalic && focusItalic && anchorItalic === focusItalic) {
      unwrapElement(anchorItalic);
      return;
    }

    wrapSelectionWithInlineElement(editor, 'em');
  }

  function toggleInlineHighlight(editor: HTMLElement, color: string): void {
    const selection = getSelectionInEditor(editor);
    if (!selection) return;

    const anchorHighlight =
      findClosestInEditor(selection.anchorNode, 'mark[data-highlight]', editor) ??
      findClosestInEditor(selection.anchorNode, 'span[style*="background-color"]', editor);
    const focusHighlight =
      findClosestInEditor(selection.focusNode, 'mark[data-highlight]', editor) ??
      findClosestInEditor(selection.focusNode, 'span[style*="background-color"]', editor);
    const targetColor = normalizeRichTextColor(color);

    if (selection.isCollapsed) {
      if (anchorHighlight) {
        unwrapElement(anchorHighlight);
      }
      return;
    }

    if (
      anchorHighlight &&
      focusHighlight &&
      anchorHighlight === focusHighlight
    ) {
      const currentColor = parseNodeColor(anchorHighlight);
      if (areHighlightColorsEqual(currentColor, targetColor)) {
        unwrapElement(anchorHighlight);
      } else {
        anchorHighlight.dataset.highlight = targetColor;
        anchorHighlight.style.backgroundColor = targetColor;
      }
      return;
    }

    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('hiliteColor', false, targetColor);
  }

  function applyRichTextCommand(editor: HTMLElement, action: RichTextAction, options?: RichTextCommandOptions): void {
    editor.focus();

    if (action === 'bold') {
      document.execCommand('bold');
      return;
    }

    if (action === 'italic') {
      toggleInlineItalic(editor);
      return;
    }

    if (action === 'ul') {
      document.execCommand('insertUnorderedList');
      return;
    }

    if (action === 'ol') {
      document.execCommand('insertOrderedList');
      return;
    }

    if (action === 'h3') {
      toggleFormatBlock(editor, 'h3');
      return;
    }

    if (action === 'quote') {
      toggleFormatBlock(editor, 'blockquote');
      return;
    }

    if (action === 'code') {
      toggleInlineCode(editor);
      return;
    }

    if (action === 'highlight') {
      toggleInlineHighlight(editor, options?.color ?? DEFAULT_RICH_TEXT_HIGHLIGHT);
      return;
    }
  }

  function handleRichTextHotkeys(event: ReactKeyboardEvent<HTMLElement>, onAction: (action: RichTextAction) => void): boolean {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return false;

    const key = event.key.toLowerCase();
    if (key === 'i') {
      event.preventDefault();
      onAction('italic');
      return true;
    }

    return false;
  }

  function applyDiagramTextCommand(
    sectionId: string,
    diagramId: string,
    action: RichTextAction,
    options?: RichTextCommandOptions
  ): void {
    const editor = getDiagramEditorNode(sectionId, diagramId);
    if (!editor) return;

    restoreSelectionForEditor(editor);
    applyRichTextCommand(editor, action, options);

    syncDiagramDescriptionFromEditor(sectionId, diagramId);
  }

  function rememberTextSelection(): void {
    // Tiptap keeps selection state internally.
  }

  function applyTextEditorCommand(sectionId: string, action: RichTextAction, options?: RichTextCommandOptions): void {
    if (!textEditor) return;

    const chain = textEditor.chain().focus();
    if (action === 'bold') chain.toggleBold().run();
    else if (action === 'italic') chain.toggleItalic().run();
    else if (action === 'code') chain.toggleCode().run();
    else if (action === 'h3') chain.toggleHeading({ level: 3 }).run();
    else if (action === 'ul') chain.toggleBulletList().run();
    else if (action === 'ol') chain.toggleOrderedList().run();
    else if (action === 'quote') chain.toggleBlockquote().run();
    else if (action === 'highlight') chain.toggleHighlight({ color: options?.color ?? DEFAULT_RICH_TEXT_HIGHLIGHT }).run();

    syncTextSectionFromEditor(sectionId);
  }

  function queueDeletedRowUndo(payload: DeletedRowUndoState): void {
    if (deletedRowUndoTimerRef.current) {
      window.clearTimeout(deletedRowUndoTimerRef.current);
      deletedRowUndoTimerRef.current = null;
    }
    setDeletedRowUndo(payload);
    deletedRowUndoTimerRef.current = window.setTimeout(() => {
      setDeletedRowUndo(null);
      deletedRowUndoTimerRef.current = null;
    }, DELETE_UNDO_WINDOW_MS);
  }

  function undoDeletedRow(): void {
    if (!deletedRowUndo) return;
    const restorePayload = deletedRowUndo;

    if (deletedRowUndoTimerRef.current) {
      window.clearTimeout(deletedRowUndoTimerRef.current);
      deletedRowUndoTimerRef.current = null;
    }
    setDeletedRowUndo(null);

    updateSection(restorePayload.sectionId, (current) => {
      if (current.kind !== 'parsed') return current;

      if (restorePayload.target === 'client') {
        if (!isDualModelSection(current)) return current;
        const clientRows = [...(current.clientRows ?? [])];
        const safeIndex = Math.max(0, Math.min(restorePayload.index, clientRows.length));
        clientRows.splice(safeIndex, 0, restorePayload.row);
        return { ...current, clientRows };
      }

      const rows = [...current.rows];
      const safeIndex = Math.max(0, Math.min(restorePayload.index, rows.length));
      rows.splice(safeIndex, 0, restorePayload.row);
      return { ...current, rows };
    });
  }

  function addManualRow(section: ParsedSection, target: ParseTarget = 'server'): void {
    const nextField = `newField${Date.now()}`;
    const requestMethod = target === 'client' ? section.externalRequestMethod : section.requestMethod;
    const manualRow: ParsedRow = {
      field: nextField,
      sourceField: nextField,
      origin: 'manual',
      type: 'string',
      required: '+',
      description: '',
      example: '',
      source: isDualModelSection(section) ? (requestMethod === 'GET' ? 'query' : 'body') : 'parsed'
    };

    updateSection(section.id, (current) => {
      if (current.kind !== 'parsed') return current;
      if (target === 'client' && isDualModelSection(current)) {
        return { ...current, clientRows: [...(current.clientRows ?? []), manualRow] };
      }
      return { ...current, rows: [...current.rows, manualRow] };
    });
  }

  function addRequestHeader(section: ParsedSection): void {
    const nextField = `X-CUSTOM-${Date.now()}`;
    const manualHeader: ParsedRow = {
      field: nextField,
      sourceField: nextField,
      origin: 'manual',
      enabled: true,
      type: 'string',
      required: '+',
      description: '',
      example: '',
      source: 'header'
    };

    updateSection(section.id, (current) => {
      if (current.kind !== 'parsed' || !isRequestSection(current)) return current;
      return { ...current, rows: [...current.rows, manualHeader] };
    });
  }

  function addExternalRequestHeader(section: ParsedSection): void {
    const nextField = `X-CUSTOM-${Date.now()}`;
    const manualHeader: ParsedRow = {
      field: nextField,
      sourceField: nextField,
      origin: 'manual',
      enabled: true,
      type: 'string',
      required: '+',
      description: '',
      example: '',
      source: 'header'
    };

    updateSection(section.id, (current) => {
      if (current.kind !== 'parsed' || !isRequestSection(current)) return current;
      return { ...current, clientRows: [...(current.clientRows ?? []), manualHeader] };
    });
  }

  function updateServerRow(sectionId: string, rowKey: string, updater: (row: ParsedRow) => ParsedRow): void {
    updateSection(sectionId, (current) => {
      if (current.kind !== 'parsed') return current;

      let updated = false;
      const rows = current.rows.map((row) => {
        if (!updated && getParsedRowKey(row) === rowKey) {
          updated = true;
          return updater(row);
        }
        return row;
      });

      return updated ? { ...current, rows } : current;
    });
  }

  function updateClientRow(sectionId: string, rowKey: string, updater: (row: ParsedRow) => ParsedRow): void {
    updateSection(sectionId, (current) => {
      if (current.kind !== 'parsed' || !isDualModelSection(current)) return current;

      let updated = false;
      const clientRows = (current.clientRows ?? []).map((row) => {
        if (!updated && getParsedRowKey(row) === rowKey) {
          updated = true;
          return updater(row);
        }
        return row;
      });

      return updated ? { ...current, clientRows } : current;
    });
  }

  function deleteRequestHeader(sectionId: string, rowKey: string): void {
    let deletedRow: ParsedRow | null = null;
    let deletedIndex = -1;
    updateSection(sectionId, (current) => {
      if (current.kind !== 'parsed' || !isRequestSection(current)) return current;
      deletedIndex = current.rows.findIndex((row) => getParsedRowKey(row) === rowKey);
      if (deletedIndex < 0) return current;
      deletedRow = current.rows[deletedIndex];
      return { ...current, rows: current.rows.filter((row) => getParsedRowKey(row) !== rowKey) };
    });
    if (deletedRow && deletedIndex > -1) {
      const row = deletedRow;
      queueDeletedRowUndo({
        sectionId,
        target: 'server',
        row,
        index: deletedIndex
      });
    }
  }

  function deleteExternalRequestHeader(sectionId: string, rowKey: string): void {
    let deletedRow: ParsedRow | null = null;
    let deletedIndex = -1;
    updateSection(sectionId, (current) => {
      if (current.kind !== 'parsed' || !isRequestSection(current)) return current;
      const sourceRows = current.clientRows ?? [];
      deletedIndex = sourceRows.findIndex((row) => getParsedRowKey(row) === rowKey);
      if (deletedIndex < 0) return current;
      deletedRow = sourceRows[deletedIndex];
      return { ...current, clientRows: sourceRows.filter((row) => getParsedRowKey(row) !== rowKey) };
    });
    if (deletedRow && deletedIndex > -1) {
      const row = deletedRow;
      queueDeletedRowUndo({
        sectionId,
        target: 'client',
        row,
        index: deletedIndex
      });
    }
  }

  function deleteParsedRow(sectionId: string, rowKey: string, target: ParseTarget = 'server'): void {
    let deletedRow: ParsedRow | null = null;
    let deletedIndex = -1;
    updateSection(sectionId, (current) => {
      if (current.kind !== 'parsed') return current;

      if (target === 'client' && isDualModelSection(current)) {
        const sourceRows = current.clientRows ?? [];
        deletedIndex = sourceRows.findIndex((row) => getParsedRowKey(row) === rowKey);
        if (deletedIndex < 0) return current;
        deletedRow = sourceRows[deletedIndex];
        return { ...current, clientRows: sourceRows.filter((row) => getParsedRowKey(row) !== rowKey) };
      }

      deletedIndex = current.rows.findIndex((row) => getParsedRowKey(row) === rowKey);
      if (deletedIndex < 0) return current;
      deletedRow = current.rows[deletedIndex];
      return { ...current, rows: current.rows.filter((row) => getParsedRowKey(row) !== rowKey) };
    });
    if (deletedRow && deletedIndex > -1) {
      const row = deletedRow;
      queueDeletedRowUndo({
        sectionId,
        target,
        row,
        index: deletedIndex
      });
    }
  }

  function syncInputFromRows(section: ParsedSection, target: ParseTarget = 'server'): void {
    updateSection(section.id, (current) => {
      if (current.kind !== 'parsed') return current;

      if (target === 'client' && isDualModelSection(current)) {
        const clientRows = current.clientRows ?? [];
        return {
          ...current,
          clientInput: buildInputFromRows(current.clientFormat ?? 'json', getExternalSourceRows(current), {
            requestUrl: current.externalRequestUrl,
            requestMethod: current.externalRequestMethod
          }),
          clientLastSyncedFormat: current.clientFormat ?? 'json',
          clientRows: clientRows.map((row) =>
            row.origin === 'generated'
              ? row
              : { ...row, sourceField: row.field, origin: row.origin === 'manual' ? 'parsed' : row.origin }
          )
        };
      }

      const serverRows = isRequestSection(current)
        ? [
            ...getRequestHeaderRowsForEditor(current).filter((row) => row.enabled !== false),
            ...current.rows.filter((row) => row.source !== 'header')
          ]
        : current.rows;

      return {
        ...current,
        input: buildInputFromRows(current.format, serverRows, {
          requestUrl: current.requestUrl,
          requestMethod: current.requestMethod
        }),
        lastSyncedFormat: current.format,
        rows: current.rows.map((row) =>
          row.origin === 'generated'
            ? row
            : { ...row, sourceField: row.field, origin: row.origin === 'manual' ? 'parsed' : row.origin }
        )
      };
    });
  }

  function getSourceValue(section: ParsedSection, target: ParseTarget): string {
    return target === 'client' && isDualModelSection(section) ? section.clientInput ?? '' : section.input;
  }

  function getSourceFormat(section: ParsedSection, target: ParseTarget): ParseFormat {
    const format = target === 'client' && isDualModelSection(section) ? section.clientFormat ?? 'json' : section.format;
    if (isResponseSection(section) && format === 'curl') return 'json';
    return format;
  }

  function detectSourceFormat(draft: string, allowCurl = true): ParseFormat | null {
    const trimmed = draft.trim();
    if (!trimmed) return null;

    if (allowCurl && /^curl(?:\s|$)/i.test(trimmed)) return 'curl';

    // Treat JSON-like input as JSON even if draft is not yet valid,
    // so Request source does not fall back to persisted cURL format.
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';

    return null;
  }

  function applyDetectedSourceFormat(sectionId: string, target: ParseTarget, draft: string, currentFormat: ParseFormat): ParseFormat {
    const section = sections.find((item): item is ParsedSection => item.kind === 'parsed' && item.id === sectionId);
    const allowCurl = Boolean(section && isRequestSection(section));
    const detectedFormat = detectSourceFormat(draft, allowCurl);
    if (!detectedFormat || detectedFormat === currentFormat) return currentFormat;

    updateSection(sectionId, (current) => {
      if (current.kind !== 'parsed') return current;

      if (target === 'client' && isDualModelSection(current)) {
        return { ...current, clientFormat: detectedFormat, clientError: '' };
      }

      return { ...current, format: detectedFormat, error: '' };
    });

    return detectedFormat;
  }

  function validateSourceDraft(format: ParseFormat, draft: string): string {
    if (format !== 'json') return '';
    if (!draft.trim()) return '';

    try {
      JSON.parse(draft);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : 'Некорректный JSON';
    }
  }

  function beautifySourceDraft(format: ParseFormat, draft: string): string {
    if (format === 'json') return JSON.stringify(JSON.parse(draft), null, 2);
    return draft.trim();
  }

  function startSourceEditing(section: ParsedSection, target: ParseTarget): void {
    setEditingSource({
      sectionId: section.id,
      target,
      draft: getSourceValue(section, target)
    });
    setSourceEditorError('');
  }

  function cancelSourceEditing(): void {
    setEditingSource(null);
    setSourceEditorError('');
  }

  function saveSourceEditing(): void {
    if (!editingSource) return;

    const section = sections.find((item) => item.id === editingSource.sectionId);
    if (!section || section.kind !== 'parsed') return;

    const format = applyDetectedSourceFormat(
      editingSource.sectionId,
      editingSource.target,
      editingSource.draft,
      getSourceFormat(section, editingSource.target)
    );
    const error = validateSourceDraft(format, editingSource.draft);
    if (error) {
      setSourceEditorError(error);
      return;
    }

    updateSection(editingSource.sectionId, (current) => {
      if (current.kind !== 'parsed') return current;
      if (editingSource.target === 'client' && isDualModelSection(current)) {
        return { ...current, clientFormat: format, clientInput: editingSource.draft, clientError: '' };
      }

      return { ...current, format, input: editingSource.draft, error: '' };
    });

    cancelSourceEditing();
  }

  function beautifySourceEditing(): void {
    if (!editingSource) return;
    const section = sections.find((item) => item.id === editingSource.sectionId);
    if (!section || section.kind !== 'parsed') return;

    try {
      const nextDraft = beautifySourceDraft(getSourceFormat(section, editingSource.target), editingSource.draft);
      setEditingSource((current) => (current ? { ...current, draft: nextDraft } : current));
      setSourceEditorError('');
    } catch (error) {
      setSourceEditorError(error instanceof Error ? error.message : 'Не удалось отформатировать');
    }
  }

  function startFieldEditing(section: ParsedSection, row: ParsedRow, target: ParseTarget = 'server'): void {
    if (!row.field.trim()) return;
    setEditingField({
      sectionId: section.id,
      rowKey: getParsedRowKey(row),
      draft: row.field,
      target,
      column: 'field'
    });
  }

  function startClientFieldEditing(section: ParsedSection, row: ParsedRow): void {
    if (!row.clientField?.trim()) return;
    setEditingField({
      sectionId: section.id,
      rowKey: getParsedRowKey(row),
      draft: row.clientField,
      target: 'client',
      column: 'clientField'
    });
  }

  function startMappedClientFieldEditing(section: ParsedSection, mappedClientKey: string): void {
    if (!isDualModelSection(section)) return;

    const clientRows = section.clientRows ?? [];
    const clientRow =
      clientRows.find((item) => getParsedRowKey(item) === mappedClientKey)
      ?? clientRows.find((item) => item.sourceField?.trim() === mappedClientKey)
      ?? clientRows.find((item) => item.field.trim() === mappedClientKey)
      ?? clientRows.find((item) => item.clientField?.trim() === mappedClientKey);
    if (!clientRow) return;

    setEditingField({
      sectionId: section.id,
      rowKey: mappedClientKey,
      draft: clientRow.field ?? '',
      target: 'client',
      column: 'field'
    });
  }

  function cancelFieldEditing(): void {
    setEditingField(null);
  }

  function getRequestCellEditTarget(section: ParsedSection, row: ParsedRow): ParseTarget | null {
    if (!isDualModelSection(section)) {
      return row.field.trim() ? 'server' : null;
    }

    if (row.field.trim()) return 'server';
    if (row.clientField?.trim()) return 'client';
    return null;
  }

  function startRequestCellEditing(section: ParsedSection, row: ParsedRow, column: 'type' | 'required' | 'description' | 'example'): void {
    const target = getRequestCellEditTarget(section, row);
    if (!target) return;
    setRequestCellError('');
    setEditingRequestCell({
      sectionId: section.id,
      rowKey: getParsedRowKey(row),
      column,
      draft: row[column] || '',
      target
    });
  }

  function cancelRequestCellEditing(): void {
    setEditingRequestCell(null);
    setRequestCellError('');
  }

  function startHeaderCellEditing(
    section: ParsedSection,
    row: ParsedRow,
    target: ParseTarget,
    column: 'description' | 'example',
    value: string
  ): void {
    setEditingHeaderCell({
      sectionId: section.id,
      rowKey: getParsedRowKey(row),
      column,
      target,
      draft: value
    });
  }

  function cancelHeaderCellEditing(): void {
    setEditingHeaderCell(null);
  }

  function saveHeaderCellEditing(): void {
    if (!editingHeaderCell) return;

    const { sectionId, rowKey, column, target, draft } = editingHeaderCell;
    if (target === 'client') {
      updateSection(sectionId, (current) => {
        if (current.kind !== 'parsed' || !isRequestSection(current)) return current;
        return {
          ...current,
          clientRows: (current.clientRows ?? []).map((item) =>
            getParsedRowKey(item) === rowKey ? { ...item, [column]: draft } : item
          )
        };
      });
    } else {
      updateServerRow(sectionId, rowKey, (current) => ({ ...current, [column]: draft }));
    }

    setEditingHeaderCell(null);
  }

  function applyRequestCellValue(
    sectionId: string,
    rowKey: string,
    column: 'type' | 'required' | 'description' | 'example',
    draft: string,
    target: ParseTarget
  ): boolean {
    if (column === 'example') {
      const section = sections.find((item) => item.id === sectionId);
      const row =
        section?.kind === 'parsed'
          ? target === 'client' && isDualModelSection(section)
            ? (section.clientRows ?? []).find((item) => getParsedRowKey(item) === rowKey)
            : section.rows.find((item) => getParsedRowKey(item) === rowKey)
          : undefined;
      const message = validateExampleValue(draft, row?.type ?? 'string');
      if (message) {
        setRequestCellError(message);
        return false;
      }
    }

    const updateRow = target === 'client' ? updateClientRow : updateServerRow;
    updateRow(sectionId, rowKey, (current) => {
      if (column === 'type') {
        const nextType = draft;
        const nextExample = usesStructuredPlaceholder(nextType) && !current.example.trim() ? STRUCTURED_EXAMPLE_PLACEHOLDER : current.example;
        return {
          ...current,
          type: nextType,
          example: nextExample
        };
      }

      return {
        ...current,
        [column]: draft
      };
    });
    setRequestCellError('');
    return true;
  }

  function saveRequestCellEditing(): void {
    if (!editingRequestCell) return;

    const { sectionId, rowKey, column, draft, target } = editingRequestCell;
    const saved = applyRequestCellValue(sectionId, rowKey, column, draft, target);
    if (!saved) return;
    setEditingRequestCell(null);
  }

  function saveFieldEditing(): void {
    if (!editingField) return;

    const nextField = editingField.draft.trim();
    if (!nextField) {
      setEditingField(null);
      return;
    }

    if (editingField.target === 'client') {
      updateSection(editingField.sectionId, (current) => {
        if (current.kind !== 'parsed' || !isDualModelSection(current)) return current;

        let updated = false;
        const clientRows = (current.clientRows ?? []).map((row) => {
          if (!updated && getParsedRowKey(row) === editingField.rowKey) {
            updated = true;
            return { ...row, field: nextField };
          }
          return row;
        });

        return updated ? { ...current, clientRows } : current;
      });
    } else {
      updateSection(editingField.sectionId, (current) => {
        if (current.kind !== 'parsed') return current;

        let updated = false;
        const rows = current.rows.map((row) => {
          if (!updated && getParsedRowKey(row) === editingField.rowKey) {
            updated = true;
            return { ...row, field: nextField };
          }
          return row;
        });

        if (!updated) return current;

        return { ...current, rows };
      });
    }

    setEditingField(null);
  }

  function renderFieldName(value: string | null | undefined): ReactNode {
    if (!value) return '—';

    const parts = value.split('.');
    if (parts.length === 1) {
      return <span className="field-name-text">{value}</span>;
    }

    return (
      <span className="field-name-text">
        {parts.map((part, index) => (
          <span key={`${value}-${index}`} className="field-name-part">
            {part}
            {index < parts.length - 1 ? (
              <>
                .
                <wbr />
              </>
            ) : null}
          </span>
        ))}
      </span>
    );
  }

  function startParsedFieldColumnResize(event: ReactMouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = parsedFieldColumnWidth;
    let latestWidth = startWidth;
    document.body.classList.add('column-resizing');

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      latestWidth = clampTableFieldColumnWidth(startWidth + delta);
      setParsedFieldColumnWidth(latestWidth);
    };

    const handleMouseUp = () => {
      document.body.classList.remove('column-resizing');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      persistParsedFieldColumnWidth(latestWidth);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function resetParsedFieldColumnWidth(event: ReactMouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    setParsedFieldColumnWidth(DEFAULT_TABLE_FIELD_COLUMN_WIDTH);
    persistParsedFieldColumnWidth(DEFAULT_TABLE_FIELD_COLUMN_WIDTH);
  }

  function renderParsedFieldColumnHeader(label: string): ReactNode {
    return (
      <div className="table-header-label">
        <span>{label}</span>
        <button
          className="table-column-resizer"
          type="button"
          aria-label="Изменить ширину колонки параметра"
          title="Потяните, чтобы изменить ширину. Двойной клик сбрасывает размер."
          draggable={false}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={startParsedFieldColumnResize}
          onDoubleClick={resetParsedFieldColumnWidth}
        />
      </div>
    );
  }

  function renderParsedTableColGroup(columns: RequestColumnKey[]): ReactNode {
    return (
      <colgroup>
        {columns.map((column) => {
          const style: CSSProperties | undefined = column === 'field' ? { width: `${parsedFieldColumnWidth}px` } : undefined;
          return <col key={column} className={`table-col table-col-${column}`} style={style} />;
        })}
      </colgroup>
    );
  }

  function renderEditableFieldCell(section: ParsedSection, row: ParsedRow, options: EditableFieldOptions = {}): ReactNode {
    const allowEdit = options.allowEdit ?? true;
    const editTarget = options.editTarget ?? 'server';
    if (!row.field.trim()) return '—';

    const isEditing =
      editingField?.sectionId === section.id &&
      editingField.rowKey === getParsedRowKey(row) &&
      editingField.target === editTarget &&
      editingField.column === 'field';

    if (isEditing) {
      return (
        <div className="field-edit">
          <input
            ref={inlineFieldInputRef}
            type="text"
            value={editingField.draft}
            onChange={(e) => setEditingField((current) => (current ? { ...current, draft: e.target.value } : current))}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onBlur={saveFieldEditing}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveFieldEditing();
              if (e.key === 'Escape') cancelFieldEditing();
            }}
          />
        </div>
      );
    }

    return (
      <div
        className="field-display"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (allowEdit) startFieldEditing(section, row, editTarget);
        }}
      >
        <span className="field-name-cell">{renderFieldName(row.field)}</span>
        <span className="field-actions">
          {allowEdit && (
            <button
              className="icon-button"
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                startFieldEditing(section, row, editTarget);
              }}
              aria-label="Редактировать поле"
            >
              ✎
            </button>
          )}
          {options.onDelete && (
            <button
              className="icon-button danger"
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                options.onDelete?.();
              }}
              aria-label="Удалить поле"
            >
              ×
            </button>
          )}
        </span>
      </div>
    );
  }

  function renderEditableClientFieldCell(section: ParsedSection, row: ParsedRow): ReactNode {
    const value = row.clientField?.trim();
    if (!value) return '—';

    const isEditing =
      editingField?.sectionId === section.id &&
      editingField.rowKey === getParsedRowKey(row) &&
      editingField.target === 'client' &&
      editingField.column === 'clientField';

    if (isEditing) {
      return (
        <div className="field-edit">
          <input
            ref={inlineFieldInputRef}
            type="text"
            value={editingField.draft}
            onChange={(e) => setEditingField((current) => (current ? { ...current, draft: e.target.value } : current))}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onBlur={saveFieldEditing}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveFieldEditing();
              if (e.key === 'Escape') cancelFieldEditing();
            }}
          />
        </div>
      );
    }

    return (
      <div
        className="field-display"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          startClientFieldEditing(section, row);
        }}
      >
        <span className="field-name-cell">{renderFieldName(row.clientField)}</span>
        <span className="field-actions">
          <button
            className="icon-button"
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              startClientFieldEditing(section, row);
            }}
            aria-label="Редактировать client поле"
          >
            ✎
          </button>
          <button
            className="icon-button danger"
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              deleteParsedRow(section.id, getParsedRowKey(row), 'client');
            }}
            aria-label="Удалить client поле"
          >
            ×
          </button>
        </span>
      </div>
    );
  }

  function renderEditableRequestCell(
    section: ParsedSection,
    row: ParsedRow,
    column: 'type' | 'required' | 'description' | 'example'
  ): ReactNode {
    const isEditing =
      editingRequestCell?.sectionId === section.id &&
      editingRequestCell.rowKey === getParsedRowKey(row) &&
      editingRequestCell.column === column;

    if (isEditing) {
      if (column === 'type') {
        return (
          <div className="field-edit inline-edit type-edit">
            <select
              ref={inlineRequestCellInputRef as React.RefObject<HTMLSelectElement>}
              value={editingRequestCell.draft}
              onChange={(e) => {
                const nextValue = e.target.value;
                setEditingRequestCell((current) => (current ? { ...current, draft: nextValue } : current));
                if (applyRequestCellValue(section.id, getParsedRowKey(row), 'type', nextValue, editingRequestCell.target)) {
                  setEditingRequestCell(null);
                }
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onBlur={cancelRequestCellEditing}
            >
              <optgroup label="Частые">
                {TYPE_OPTIONS_COMMON.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Еще типы">
                {TYPE_OPTIONS_EXTENDED.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        );
      }

      if (column === 'required') {
        return (
          <div className="field-edit inline-edit">
            <select
              ref={inlineRequestCellInputRef as React.RefObject<HTMLSelectElement>}
              value={editingRequestCell.draft}
              onChange={(e) => {
                const nextValue = e.target.value;
                setEditingRequestCell((current) => (current ? { ...current, draft: nextValue } : current));
                if (applyRequestCellValue(section.id, getParsedRowKey(row), 'required', nextValue, editingRequestCell.target)) {
                  setEditingRequestCell(null);
                }
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onBlur={cancelRequestCellEditing}
            >
              {REQUIRED_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        );
      }

      return (
        <div className="field-edit inline-edit">
          <textarea
            ref={inlineRequestCellInputRef as React.RefObject<HTMLTextAreaElement>}
            value={editingRequestCell.draft}
            onChange={(e) => setEditingRequestCell((current) => (current ? { ...current, draft: e.target.value } : current))}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onBlur={saveRequestCellEditing}
            rows={getDynamicTextareaRows(editingRequestCell.draft, column === 'example' ? 3 : 1, column === 'example' ? 10 : 6)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) saveRequestCellEditing();
              if (e.key === 'Escape') cancelRequestCellEditing();
            }}
          />
        </div>
      );
    }

    const value = row[column] || '—';
    const canEdit = Boolean(getRequestCellEditTarget(section, row));

    return (
      <div
        className="field-display"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (canEdit) startRequestCellEditing(section, row, column);
        }}
      >
        <span>{value}</span>
        <span className="field-actions">
          <button
            className="icon-button"
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (canEdit) startRequestCellEditing(section, row, column);
            }}
            aria-label="Редактировать ячейку"
          >
            ✎
          </button>
        </span>
      </div>
    );
  }

  function renderEditableSectionTitle(section: DocSection): ReactNode {
    const isEditing = editingTitle?.sectionId === section.id;

    if (isEditing) {
      return (
        <div className="field-edit title-edit">
          <input
            type="text"
            autoFocus
            value={editingTitle.draft}
            onChange={(e) => setEditingTitle((current) => (current ? { ...current, draft: e.target.value } : current))}
            onBlur={saveTitleEditing}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitleEditing();
              if (e.key === 'Escape') cancelTitleEditing();
            }}
          />
        </div>
      );
    }

    return (
      <div className="field-display title-display" onDoubleClick={() => startTitleEditing(section)}>
        <span>{resolveSectionTitle(section.title)}</span>
        <button className="icon-button" type="button" onClick={() => startTitleEditing(section)} aria-label="Редактировать название блока">
          ✎
        </button>
      </div>
    );
  }

  function renderRequestCell(section: ParsedSection, row: ParsedRow, column: RequestColumnKey): ReactNode {
    const cellMap = {
      field: row.field || '—',
      clientField: row.clientField || '—',
      type: row.type || '—',
      required: row.required || '—',
      description: row.description || '—',
      maskInLogs: row.maskInLogs ? '***' : ' ',
      example: row.example || '—'
    } satisfies Record<RequestColumnKey, string>;

    if (column === 'clientField' && isRequestMappingRow(row) && section.domainModelEnabled) {
      const options = getMappingOptions(section, row.field);
      const previouslyUsedKeys = getPreviouslyUsedClientKeys(section, row);
      const primaryOptions = options.filter((option) => !previouslyUsedKeys.has(getParsedRowKey(option)));
      const previouslyUsedOptions = options.filter((option) => previouslyUsedKeys.has(getParsedRowKey(option)));
      const mappedValue = getMappedClientField(section, row);
      const rowKey = getParsedRowKey(row);
      const isEditingMappedValue =
        Boolean(mappedValue) &&
        editingField?.sectionId === section.id &&
        editingField.rowKey === mappedValue &&
        editingField.target === 'client' &&
        editingField.column === 'field';
      const isMappingEditActive = editingMappingCell?.sectionId === section.id && editingMappingCell.rowKey === rowKey;

      if (isEditingMappedValue && editingField) {
        return (
          <div className="field-edit">
            <input
              ref={inlineFieldInputRef}
              type="text"
              value={editingField.draft}
              onChange={(e) => setEditingField((current) => (current ? { ...current, draft: e.target.value } : current))}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onBlur={saveFieldEditing}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveFieldEditing();
                if (e.key === 'Escape') cancelFieldEditing();
              }}
            />
          </div>
        );
      }

      if (!isMappingEditActive) {
        return (
          <div className="field-display" onDoubleClick={() => mappedValue && startMappedClientFieldEditing(section, mappedValue)}>
            <span className="field-name-cell">{renderFieldName(mappedValue ? options.find((option) => getParsedRowKey(option) === mappedValue)?.field : '—')}</span>
            <span className="field-actions">
              <button
                className="icon-button"
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setEditingMappingCell({ sectionId: section.id, rowKey });
                }}
                aria-label="Редактировать маппинг"
              >
                ↔
              </button>
              {mappedValue && (
                <button
                  className="icon-button"
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    startMappedClientFieldEditing(section, mappedValue);
                  }}
                  aria-label="Редактировать client поле"
                >
                  ✎
                </button>
              )}
              {mappedValue && (
                <button
                  className="icon-button danger"
                  type="button"
                  aria-label="Сбросить маппинг"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    updateSection(section.id, (current) => {
                      if (current.kind !== 'parsed' || !isDualModelSection(current)) return current;
                      const nextMappings = { ...(current.clientMappings ?? {}) };
                      delete nextMappings[rowKey];
                      return { ...current, clientMappings: nextMappings };
                    });
                  }}
                >
                  ×
                </button>
              )}
            </span>
          </div>
        );
      }

      return (
        <div className="mapping-cell">
          <select
            value={mappedValue}
            onChange={(e) =>
              updateSection(section.id, (current) => {
                if (current.kind !== 'parsed' || !isDualModelSection(current)) return current;

                const nextMappings = { ...(current.clientMappings ?? {}) };
                if (e.target.value) {
                  nextMappings[getParsedRowKey(row)] = e.target.value;
                } else {
                  delete nextMappings[getParsedRowKey(row)];
                }

                return { ...current, clientMappings: nextMappings };
              })
            }
            onBlur={() => setEditingMappingCell((current) => (current && current.sectionId === section.id && current.rowKey === rowKey ? null : current))}
          >
            <option value="">—</option>
            {primaryOptions.map((option) => (
              <option key={getParsedRowKey(option)} value={getParsedRowKey(option)}>
                {option.field}
              </option>
            ))}
            {previouslyUsedOptions.length > 0 && (
              <optgroup label="Ранее использованные">
                {previouslyUsedOptions.map((option) => (
                  <option key={getParsedRowKey(option)} value={getParsedRowKey(option)}>
                    {option.field}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {mappedValue && (
            <button
              className="icon-button"
              type="button"
              aria-label="Сбросить маппинг"
              onClick={() =>
                updateSection(section.id, (current) => {
                  if (current.kind !== 'parsed' || !isDualModelSection(current)) return current;
                  const nextMappings = { ...(current.clientMappings ?? {}) };
                  delete nextMappings[rowKey];
                  return { ...current, clientMappings: nextMappings };
                })
              }
            >
              ×
            </button>
          )}
          <button
            className="icon-button"
            type="button"
            aria-label="Завершить редактирование маппинга"
            onClick={() => setEditingMappingCell(null)}
          >
            ✓
          </button>
        </div>
      );
    }

    if (column === 'clientField' && section.domainModelEnabled && !row.field.trim() && row.clientField?.trim()) {
      return renderEditableClientFieldCell(section, row);
    }

    if (column === 'field') {
      const canDelete = row.source !== 'header' && row.source !== 'url';
      return renderEditableFieldCell(section, row, canDelete ? { onDelete: () => deleteParsedRow(section.id, getParsedRowKey(row), 'server') } : {});
    }

    if (column === 'type' || column === 'required' || column === 'description' || column === 'example') {
      return renderEditableRequestCell(section, row, column);
    }

    if (column === 'maskInLogs') {
      return (
        <input
          type="checkbox"
          checked={Boolean(row.maskInLogs)}
          onChange={(e) => updateServerRow(section.id, getParsedRowKey(row), (current) => ({ ...current, maskInLogs: e.target.checked }))}
          aria-label="Маскирование в логах"
        />
      );
    }

    return cellMap[column];
  }

  function renderParsedTable(section: ParsedSection) {
    const rows = getSectionRows(section);
    const duplicateFieldSet = getDuplicateValueSet(section.rows.filter((row) => row.source !== 'header'));
    const duplicateClientFieldSet = isDualModelSection(section) ? getDuplicateValueSet(section.clientRows ?? []) : new Set<string>();
    const fillDescriptionsBusy = aiBusyKey === `fill-descriptions:${section.id}`;
    const suggestMappingsBusy = aiBusyKey === `suggest-mappings:${section.id}`;
    const maskBothBodyBusy = aiBusyKey === `mask-fields:${section.id}:both:body`;
    const maskServerBodyBusy = aiBusyKey === `mask-fields:${section.id}:server:body`;

    if (isDualModelSection(section)) {
      const columns = getRequestColumnOrder(section, rows);

      if (rows.length === 0) {
        return (
          <div className="table-wrap table-wrap-empty">
            <div className="muted">Таблица пока пустая</div>
            <div className="table-actions">
              <button className="ghost small table-action-icon" type="button" onClick={() => addManualRow(section, 'server')} aria-label="Добавить параметр" title="Добавить параметр">
                <span className="ui-icon" aria-hidden>{renderUiIcon('add_row')}</span>
              </button>
              {section.domainModelEnabled && (
                <button className="ghost small table-action-icon" type="button" onClick={() => addManualRow(section, 'client')} aria-label="Добавить client параметр" title="Добавить client параметр">
                  <span className="ui-icon" aria-hidden>{renderUiIcon('add_row')}</span>
                </button>
              )}
              <div className="table-actions-divider" aria-hidden />
              <button
                className="ghost small table-action-icon"
                type="button"
                onClick={() => void fillFieldDescriptionsWithAi(section)}
                disabled={Boolean(aiBusyKey)}
                aria-label="AI: заполнить описания"
                aria-busy={fillDescriptionsBusy}
                title={fillDescriptionsBusy ? 'AI: заполняю описания...' : 'AI: заполнить описания'}
              >
                {renderAiActionIcon('ai_describe', fillDescriptionsBusy)}
              </button>
              <button
                className="ghost small table-action-icon"
                type="button"
                onClick={() => void runAiMasking(section, { target: 'both', scope: 'body' })}
                disabled={Boolean(aiBusyKey)}
                aria-label="AI: маскирование полей"
                aria-busy={maskBothBodyBusy}
                title={maskBothBodyBusy ? 'AI: определяю поля для маскирования...' : 'AI: маскирование полей'}
              >
                {renderAiActionIcon('ai_mask', maskBothBodyBusy)}
              </button>
              {section.domainModelEnabled && (
                <button
                  className="ghost small table-action-icon"
                  type="button"
                  onClick={() => void suggestParameterMappingsWithAi(section)}
                  disabled={Boolean(aiBusyKey)}
                  aria-label="AI: подобрать маппинг"
                  aria-busy={suggestMappingsBusy}
                  title={suggestMappingsBusy ? 'AI: подбираю маппинг...' : 'AI: подобрать маппинг'}
                >
                  {renderAiActionIcon('ai_map', suggestMappingsBusy)}
                </button>
              )}
            </div>
          </div>
        );
      }

      return (
        <div className="table-wrap">
          <table className="parsed-table">
            {renderParsedTableColGroup(columns)}
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    className="draggable-column"
                    draggable
                    onDragStart={() => setDraggedColumn(column)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!draggedColumn) return;
                      updateSection(section.id, (current) => {
                        if (current.kind !== 'parsed' || !isDualModelSection(current)) return current;
                        const currentRows = getSectionRows(current);
                        const currentOrder = getRequestColumnOrder(current, currentRows);
                        return { ...current, requestColumnOrder: moveRequestColumn(currentOrder, draggedColumn, column) };
                      });
                      setDraggedColumn(null);
                    }}
                    onDragEnd={() => setDraggedColumn(null)}
                  >
                    {column === 'field' ? renderParsedFieldColumnHeader(getRequestColumnLabel(section, column)) : getRequestColumnLabel(section, column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${row.field}-${row.clientField ?? 'server'}-${index}`}
                  className={rowHasMismatch(row, duplicateFieldSet, duplicateClientFieldSet) ? 'mismatch-row' : undefined}
                >
                  {columns.map((column) => (
                    <td key={`${column}-${index}`} className={column === 'type' || column === 'example' ? 'mono' : undefined}>
                      {renderRequestCell(section, row, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-actions">
            <button className="ghost small table-action-icon" type="button" onClick={() => addManualRow(section, 'server')} aria-label="Добавить параметр" title="Добавить параметр">
              <span className="ui-icon" aria-hidden>{renderUiIcon('add_row')}</span>
            </button>
            {section.domainModelEnabled && (
              <button className="ghost small table-action-icon" type="button" onClick={() => addManualRow(section, 'client')} aria-label="Добавить client параметр" title="Добавить client параметр">
                <span className="ui-icon" aria-hidden>{renderUiIcon('add_row')}</span>
              </button>
            )}
            <div className="table-actions-divider" aria-hidden />
            <button
              className="ghost small table-action-icon"
              type="button"
              onClick={() => void fillFieldDescriptionsWithAi(section)}
              disabled={Boolean(aiBusyKey)}
              aria-label="AI: заполнить описания"
              aria-busy={fillDescriptionsBusy}
              title={fillDescriptionsBusy ? 'AI: заполняю описания...' : 'AI: заполнить описания'}
            >
              {renderAiActionIcon('ai_describe', fillDescriptionsBusy)}
            </button>
            <button
              className="ghost small table-action-icon"
              type="button"
              onClick={() => void runAiMasking(section, { target: 'both', scope: 'body' })}
              disabled={Boolean(aiBusyKey)}
              aria-label="AI: маскирование полей"
              aria-busy={maskBothBodyBusy}
              title={maskBothBodyBusy ? 'AI: определяю поля для маскирования...' : 'AI: маскирование полей'}
            >
              {renderAiActionIcon('ai_mask', maskBothBodyBusy)}
            </button>
            {section.domainModelEnabled && (
              <button
                className="ghost small table-action-icon"
                type="button"
                onClick={() => void suggestParameterMappingsWithAi(section)}
                disabled={Boolean(aiBusyKey)}
                aria-label="AI: подобрать маппинг"
                aria-busy={suggestMappingsBusy}
                title={suggestMappingsBusy ? 'AI: подбираю маппинг...' : 'AI: подобрать маппинг'}
              >
                {renderAiActionIcon('ai_map', suggestMappingsBusy)}
              </button>
            )}
          </div>
        </div>
      );
    }

    if (rows.length === 0) return <div className="muted">Нет распарсенных строк</div>;

    return (
      <div className="table-wrap">
        <table className="parsed-table">
          {renderParsedTableColGroup(['field', 'type', 'required', 'description', 'maskInLogs', 'example'])}
          <thead>
            <tr>
              <th>{renderParsedFieldColumnHeader('Поле')}</th>
              <th>Тип</th>
              <th>Обязательность</th>
              <th>Описание</th>
              <th>Маскирование в логах</th>
              <th>Пример</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.field}-${row.clientField ?? 'server'}-${index}`}
                className={rowHasMismatch(row, duplicateFieldSet, duplicateClientFieldSet) ? 'mismatch-row' : undefined}
              >
                <td>
                  {renderEditableFieldCell(
                    section,
                    row,
                    { onDelete: () => deleteParsedRow(section.id, getParsedRowKey(row)) }
                  )}
                </td>
                <td className="mono">{row.type}</td>
                <td>{row.required}</td>
                <td>{row.description || '—'}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(row.maskInLogs)}
                    onChange={(e) => updateServerRow(section.id, getParsedRowKey(row), (current) => ({ ...current, maskInLogs: e.target.checked }))}
                    aria-label="Маскирование в логах"
                  />
                </td>
                <td className="mono">{row.example || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-actions">
          <button
            className="ghost small table-action-icon"
            type="button"
            onClick={() => void fillFieldDescriptionsWithAi(section)}
            disabled={Boolean(aiBusyKey)}
            aria-label="AI: заполнить описания"
            aria-busy={fillDescriptionsBusy}
            title={fillDescriptionsBusy ? 'AI: заполняю описания...' : 'AI: заполнить описания'}
          >
            {renderAiActionIcon('ai_describe', fillDescriptionsBusy)}
          </button>
          <button
            className="ghost small table-action-icon"
            type="button"
            onClick={() => void runAiMasking(section, { target: 'server', scope: 'body' })}
            disabled={Boolean(aiBusyKey)}
            aria-label="AI: маскирование полей"
            aria-busy={maskServerBodyBusy}
            title={maskServerBodyBusy ? 'AI: определяю поля для маскирования...' : 'AI: маскирование полей'}
          >
            {renderAiActionIcon('ai_mask', maskServerBodyBusy)}
          </button>
        </div>
      </div>
    );
  }

  function renderRequestHeadersTable(section: ParsedSection, target: ParseTarget = 'server'): ReactNode {
    const isExternal = target === 'client';
    const headers = isExternal ? getExternalRequestHeaderRowsForEditor(section) : getRequestHeaderRowsForEditor(section);
    const maskHeadersBusy = aiBusyKey === `mask-fields:${section.id}:${isExternal ? 'client' : 'server'}:headers`;

    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Вкл.</th>
              <th>Header</th>
              <th>Обязательность</th>
              <th>Описание</th>
              <th>Маскирование в логах</th>
              <th>Пример</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((row, index) => {
              const rowKey = getParsedRowKey(row);
              const isDefault = isExternal ? false : isDefaultRequestHeader(row);
              const isAuto = isExternal ? false : isAuthHeader(section, row);
              const persistedRows = isExternal ? section.clientRows ?? [] : section.rows;
              const isPersisted = persistedRows.some((item) => getParsedRowKey(item) === rowKey);

              return (
                <tr key={`${rowKey}-${index}`}>
                  <td>
                    {isAuto ? (
                      <span className="chip">auto</span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={row.enabled !== false}
                        onChange={(e) => {
                          if (isPersisted) {
                            if (isExternal) {
                              updateSection(section.id, (current) => {
                                if (current.kind !== 'parsed' || !isRequestSection(current)) return current;
                                return {
                                  ...current,
                                  clientRows: (current.clientRows ?? []).map((item) =>
                                    getParsedRowKey(item) === rowKey ? { ...item, enabled: e.target.checked } : item
                                  )
                                };
                              });
                            } else {
                              updateServerRow(section.id, rowKey, (current) => ({ ...current, enabled: e.target.checked }));
                            }
                            return;
                          }

                          updateSection(section.id, (current) => {
                            if (current.kind !== 'parsed' || !isRequestSection(current)) return current;
                            return {
                              ...current,
                              [isExternal ? 'clientRows' : 'rows']: [
                                ...(isExternal ? current.clientRows ?? [] : current.rows),
                                {
                                  ...row,
                                  enabled: e.target.checked
                                }
                              ]
                            };
                          });
                        }}
                      />
                    )}
                  </td>
                  <td>
                    {renderEditableFieldCell(
                      section,
                      row,
                      isAuto || isDefault
                        ? { allowEdit: false, editTarget: isExternal ? 'client' : 'server' }
                        : {
                            editTarget: isExternal ? 'client' : 'server',
                            onDelete: () => (isExternal ? deleteExternalRequestHeader(section.id, rowKey) : deleteRequestHeader(section.id, rowKey))
                          }
                    )}
                  </td>
                  <td>{row.required || '—'}</td>
                  <td>
                    {isAuto || isDefault ? (
                      row.description || '—'
                    ) : (
                      (() => {
                        const target = isExternal ? 'client' as const : 'server' as const;
                        const value = isPersisted ? persistedRows.find((item) => getParsedRowKey(item) === rowKey)?.description ?? row.description : row.description;
                        const isEditing =
                          editingHeaderCell?.sectionId === section.id &&
                          editingHeaderCell.rowKey === rowKey &&
                          editingHeaderCell.target === target &&
                          editingHeaderCell.column === 'description';

                        if (isEditing && editingHeaderCell) {
                          return (
                            <div className="field-edit">
                              <input
                                type="text"
                                autoFocus
                                value={editingHeaderCell.draft}
                                onChange={(e) => setEditingHeaderCell((current) => (current ? { ...current, draft: e.target.value } : current))}
                                onBlur={saveHeaderCellEditing}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveHeaderCellEditing();
                                  if (e.key === 'Escape') cancelHeaderCellEditing();
                                }}
                              />
                            </div>
                          );
                        }

                        return (
                          <div className="field-display" onDoubleClick={() => startHeaderCellEditing(section, row, target, 'description', value)}>
                            <span>{value || '—'}</span>
                            <span className="field-actions">
                              <button
                                className="icon-button"
                                type="button"
                                onClick={() => startHeaderCellEditing(section, row, target, 'description', value)}
                                aria-label="Редактировать описание"
                              >
                                ✎
                              </button>
                            </span>
                          </div>
                        );
                      })()
                    )}
                  </td>
                  <td>
                    {isAuto || isDefault ? (
                      <input type="checkbox" checked={Boolean(row.maskInLogs)} disabled aria-label="Маскирование в логах" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={Boolean(
                          isPersisted
                            ? persistedRows.find((item) => getParsedRowKey(item) === rowKey)?.maskInLogs
                            : row.maskInLogs
                        )}
                        onChange={(e) =>
                          isExternal
                            ? updateSection(section.id, (current) => {
                                if (current.kind !== 'parsed' || !isRequestSection(current)) return current;
                                return {
                                  ...current,
                                  clientRows: (current.clientRows ?? []).map((item) =>
                                    getParsedRowKey(item) === rowKey ? { ...item, maskInLogs: e.target.checked } : item
                                  )
                                };
                              })
                            : updateServerRow(section.id, rowKey, (current) => ({ ...current, maskInLogs: e.target.checked }))
                        }
                        aria-label="Маскирование в логах"
                      />
                    )}
                  </td>
                  <td className="mono">
                    {isAuto || isDefault ? (
                      row.example || '—'
                    ) : (
                      (() => {
                        const target = isExternal ? 'client' as const : 'server' as const;
                        const value = isPersisted ? persistedRows.find((item) => getParsedRowKey(item) === rowKey)?.example ?? row.example : row.example;
                        const isEditing =
                          editingHeaderCell?.sectionId === section.id &&
                          editingHeaderCell.rowKey === rowKey &&
                          editingHeaderCell.target === target &&
                          editingHeaderCell.column === 'example';

                        if (isEditing && editingHeaderCell) {
                          return (
                            <div className="field-edit">
                              <input
                                type="text"
                                autoFocus
                                value={editingHeaderCell.draft}
                                onChange={(e) => setEditingHeaderCell((current) => (current ? { ...current, draft: e.target.value } : current))}
                                onBlur={saveHeaderCellEditing}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveHeaderCellEditing();
                                  if (e.key === 'Escape') cancelHeaderCellEditing();
                                }}
                              />
                            </div>
                          );
                        }

                        return (
                          <div className="field-display" onDoubleClick={() => startHeaderCellEditing(section, row, target, 'example', value)}>
                            <span>{value || '—'}</span>
                            <span className="field-actions">
                              <button
                                className="icon-button"
                                type="button"
                                onClick={() => startHeaderCellEditing(section, row, target, 'example', value)}
                                aria-label="Редактировать пример"
                              >
                                ✎
                              </button>
                            </span>
                          </div>
                        );
                      })()
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="table-actions">
          <button className="ghost small table-action-icon" type="button" onClick={() => (isExternal ? addExternalRequestHeader(section) : addRequestHeader(section))} aria-label="Добавить header" title="Добавить header">
            <span className="ui-icon" aria-hidden>{renderUiIcon('add_row')}</span>
          </button>
          <button
            className="ghost small table-action-icon"
            type="button"
            onClick={() => void runAiMasking(section, { target: isExternal ? 'client' : 'server', scope: 'headers' })}
            disabled={Boolean(aiBusyKey)}
            aria-label="AI: маскирование полей"
            aria-busy={maskHeadersBusy}
            title={maskHeadersBusy ? 'AI: определяю поля для маскирования...' : 'AI: маскирование полей'}
          >
            {renderAiActionIcon('ai_mask', maskHeadersBusy)}
          </button>
        </div>
      </div>
    );
  }

  function rowHasMismatch(row: ParsedRow, duplicateFieldSet: Set<string>, duplicateClientFieldSet: Set<string>): boolean {
    const clientSourceField = row.clientSourceField?.trim();
    const serverMismatch =
      Boolean(row.field.trim()) &&
      (row.origin === 'manual' || (row.origin === 'parsed' && row.sourceField && row.field !== row.sourceField));
    const clientMismatch =
      Boolean(row.field.trim()) &&
      (row.clientOrigin === 'manual' || (row.clientOrigin === 'parsed' && row.clientSourceField && row.clientField && row.clientField !== row.clientSourceField));
    const serverDuplicate = Boolean(row.field.trim()) && duplicateFieldSet.has(row.field.trim());
    const clientDuplicate = clientSourceField ? duplicateClientFieldSet.has(clientSourceField) : false;

    return Boolean(serverMismatch || clientMismatch || serverDuplicate || clientDuplicate);
  }

  function renderSourceAlert(
    alertKey: string,
    visible: boolean,
    rows: ParsedRow[],
    duplicateValues: string[],
    duplicateLabel: string,
    formatDrift: boolean,
    currentFormat: ParseFormat,
    onFix: () => void,
    syncedFormat?: ParseFormat,
    message = 'Параметры отличаются от исходного источника',
    fixActionLabel = 'Исправить источник'
  ): ReactNode {
    if (!visible) return null;

    const driftRows = getInputDriftRows(rows);
    const canFix = driftRows.length > 0 || formatDrift;
    const expanded = expandedDriftAlerts[alertKey] ?? false;
    const driftItems = driftRows.map((row) => (row.sourceField && row.field !== row.sourceField ? `${row.sourceField} -> ${row.field}` : row.field));
    const duplicateItems = duplicateValues.map((value) => `${duplicateLabel}: ${value}`);
    const allItems = [...driftItems, ...duplicateItems];
    const visibleRows = expanded ? allItems : allItems.slice(0, 3);

    return (
      <div className="sync-alert" role="status">
        <div className="sync-alert-title">{message}</div>
        {formatDrift && syncedFormat && (
          <div className="sync-alert-item">{`Формат: ${syncedFormat.toUpperCase()} -> ${currentFormat.toUpperCase()}`}</div>
        )}
        <div className="sync-alert-list">
          {visibleRows.map((item) => (
            <div key={item} className="sync-alert-item">
              {item}
            </div>
          ))}
        </div>
        {allItems.length > 3 && (
          <button
            className="ghost small"
            type="button"
            onClick={() => setExpandedDriftAlerts((current) => ({ ...current, [alertKey]: !expanded }))}
          >
            {expanded ? 'Свернуть' : `Показать еще ${allItems.length - 3}`}
          </button>
        )}
        {canFix && (
          <button className="ghost small" type="button" onClick={onFix}>
            {fixActionLabel}
          </button>
        )}
      </div>
    );
  }

  function renderRequestAuthEditor(section: ParsedSection, target: ParseTarget = 'server'): ReactNode {
    if (!isRequestSection(section)) return null;
    const isExternal = target === 'client';
    const authType = isExternal ? section.externalAuthType ?? 'none' : section.authType ?? 'none';
    const tokenExample = isExternal ? section.externalAuthTokenExample ?? '' : section.authTokenExample ?? '';
    const username = isExternal ? section.externalAuthUsername ?? '' : section.authUsername ?? '';
    const password = isExternal ? section.externalAuthPassword ?? '' : section.authPassword ?? '';
    const headerName = isExternal ? section.externalAuthHeaderName ?? DEFAULT_API_KEY_HEADER : section.authHeaderName ?? DEFAULT_API_KEY_HEADER;
    const apiKeyExample = isExternal ? section.externalAuthApiKeyExample ?? '' : section.authApiKeyExample ?? '';

    return (
      <section className="expander expander-static">
        <div className="expander-body">
          <label className="field">
            <div className="label input-label-strong">Способ</div>
            <select
              value={authType}
              onChange={(e) =>
                updateSection(section.id, (current) =>
                  current.kind === 'parsed' && isRequestSection(current)
                    ? {
                        ...current,
                        ...(isExternal
                          ? {
                              externalAuthType: e.target.value as RequestAuthType,
                              externalAuthHeaderName: current.externalAuthHeaderName || DEFAULT_API_KEY_HEADER,
                              externalAuthTokenExample: current.externalAuthTokenExample || DEFAULT_BEARER_TOKEN_EXAMPLE,
                              externalAuthUsername: current.externalAuthUsername || DEFAULT_BASIC_USERNAME,
                              externalAuthPassword: current.externalAuthPassword || DEFAULT_BASIC_PASSWORD,
                              externalAuthApiKeyExample: current.externalAuthApiKeyExample || DEFAULT_API_KEY_EXAMPLE
                            }
                          : {
                              authType: e.target.value as RequestAuthType,
                              authHeaderName: current.authHeaderName || DEFAULT_API_KEY_HEADER,
                              authTokenExample: current.authTokenExample || DEFAULT_BEARER_TOKEN_EXAMPLE,
                              authUsername: current.authUsername || DEFAULT_BASIC_USERNAME,
                              authPassword: current.authPassword || DEFAULT_BASIC_PASSWORD,
                              authApiKeyExample: current.authApiKeyExample || DEFAULT_API_KEY_EXAMPLE
                            })
                      }
                    : current
                )
              }
            >
              <option value="none">Без авторизации</option>
              <option value="bearer">Bearer token</option>
              <option value="basic">Basic auth</option>
              <option value="api-key">API key</option>
            </select>
          </label>

          {authType === 'bearer' && (
            <label className="field">
              <div className="label input-label-strong">Пример токена</div>
              <input
                type="text"
                value={tokenExample}
                onChange={(e) =>
                  updateSection(section.id, (current) =>
                    current.kind === 'parsed' && isRequestSection(current)
                      ? { ...current, ...(isExternal ? { externalAuthTokenExample: e.target.value } : { authTokenExample: e.target.value }) }
                      : current
                  )
                }
                placeholder={DEFAULT_BEARER_TOKEN_EXAMPLE}
              />
            </label>
          )}

          {authType === 'basic' && (
            <div className="row gap auth-grid">
              <label className="field">
                <div className="label input-label-strong">Логин</div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) =>
                    updateSection(section.id, (current) =>
                      current.kind === 'parsed' && isRequestSection(current)
                        ? { ...current, ...(isExternal ? { externalAuthUsername: e.target.value } : { authUsername: e.target.value }) }
                        : current
                    )
                  }
                  placeholder={DEFAULT_BASIC_USERNAME}
                />
              </label>
              <label className="field">
                <div className="label input-label-strong">Пароль</div>
                <input
                  type="text"
                  value={password}
                  onChange={(e) =>
                    updateSection(section.id, (current) =>
                      current.kind === 'parsed' && isRequestSection(current)
                        ? { ...current, ...(isExternal ? { externalAuthPassword: e.target.value } : { authPassword: e.target.value }) }
                        : current
                    )
                  }
                  placeholder={DEFAULT_BASIC_PASSWORD}
                />
              </label>
            </div>
          )}

          {authType === 'api-key' && (
            <div className="row gap auth-grid">
              <label className="field">
                <div className="label input-label-strong">Имя header</div>
                <input
                  type="text"
                  value={headerName}
                  onChange={(e) =>
                    updateSection(section.id, (current) =>
                      current.kind === 'parsed' && isRequestSection(current)
                        ? { ...current, ...(isExternal ? { externalAuthHeaderName: e.target.value } : { authHeaderName: e.target.value }) }
                        : current
                    )
                  }
                  placeholder={DEFAULT_API_KEY_HEADER}
                />
              </label>
              <label className="field">
                <div className="label input-label-strong">Пример API key</div>
                <input
                  type="text"
                  value={apiKeyExample}
                  onChange={(e) =>
                    updateSection(section.id, (current) =>
                      current.kind === 'parsed' && isRequestSection(current)
                        ? { ...current, ...(isExternal ? { externalAuthApiKeyExample: e.target.value } : { authApiKeyExample: e.target.value }) }
                        : current
                    )
                  }
                  placeholder={DEFAULT_API_KEY_EXAMPLE}
                />
              </label>
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderRequestMetaEditor(section: ParsedSection, target: ParseTarget = 'server'): ReactNode {
    if (!isRequestSection(section)) return null;
    const isExternal = target === 'client';
    const urlLabel = isExternal ? 'Внешний URL' : 'URL метода';

    const applyRequestMeta = (patch: Partial<Pick<ParsedSection, 'requestUrl' | 'requestMethod' | 'externalRequestUrl' | 'externalRequestMethod'>>) => {
      updateSection(section.id, (current) => {
        if (current.kind !== 'parsed' || !isRequestSection(current)) return current;

        const next = { ...current, ...patch };
        const nextRequestMethod = next.requestMethod;
        const nextExternalRequestMethod = next.externalRequestMethod;
        const normalizedServerRows = normalizeRequestRowsForMethod(next.rows, nextRequestMethod);
        const normalizedClientRows = normalizeRequestRowsForMethod(next.clientRows ?? [], nextExternalRequestMethod);
        const normalizedNext = {
          ...next,
          rows: normalizedServerRows,
          clientRows: normalizedClientRows
        };
        const targetFormat = isExternal ? next.clientFormat ?? 'json' : next.format;
        if (targetFormat !== 'curl') return normalizedNext;

        const syncRows = isExternal
          ? normalizedNext.clientRows ?? []
          : [...getRequestHeaderRowsForEditor(normalizedNext).filter((row) => row.enabled !== false), ...normalizedNext.rows.filter((row) => row.source !== 'header')];

        return {
          ...normalizedNext,
          ...(isExternal
            ? {
                clientInput: buildInputFromRows(targetFormat, getExternalSourceRows(normalizedNext), {
                  requestUrl: normalizedNext.externalRequestUrl,
                  requestMethod: normalizedNext.externalRequestMethod
                }),
                clientLastSyncedFormat: targetFormat
              }
            : {
                input: buildInputFromRows(targetFormat, syncRows, {
                  requestUrl: normalizedNext.requestUrl,
                  requestMethod: normalizedNext.requestMethod
                }),
                lastSyncedFormat: targetFormat
              })
        };
      });
    };

    return (
      <section className="expander expander-static">
        <div className="expander-body">
          <div className="row gap auth-grid">
            <label className="field">
              <div className="label input-label-strong">{urlLabel}</div>
              <input
                type="text"
                value={isExternal ? section.externalRequestUrl ?? '' : section.requestUrl ?? ''}
                onChange={(e) => applyRequestMeta(isExternal ? { externalRequestUrl: e.target.value } : { requestUrl: e.target.value })}
                placeholder="https://api.example.com/v1/method"
              />
            </label>
            <label className="field">
              <div className="label input-label-strong">Тип метода</div>
              <select
                value={isExternal ? section.externalRequestMethod ?? 'POST' : section.requestMethod ?? 'POST'}
                onChange={(e) => applyRequestMeta(isExternal ? { externalRequestMethod: e.target.value as RequestMethod } : { requestMethod: e.target.value as RequestMethod })}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </label>
            <label className="field">
              <div className="label input-label-strong">Протокол</div>
              <input type="text" value="REST" readOnly />
            </label>
          </div>
        </div>
      </section>
    );
  }

  function renderSourceEditor(section: ParsedSection, target: ParseTarget, title = 'Исходные данные'): ReactNode {
    const format = getSourceFormat(section, target);
    const value = getSourceValue(section, target);
    const schemaValue = target === 'client' ? (section.clientSchemaInput ?? '') : (section.schemaInput ?? '');
    const isEditing = editingSource?.sectionId === section.id && editingSource.target === target;
    const isSchemaEditing = editingSchema?.sectionId === section.id && editingSchema.target === target;
    const currentSchemaValue = isSchemaEditing ? editingSchema.draft : schemaValue;
    const currentValue = isEditing ? editingSource.draft : value;
    const sourcePlaceholder = isRequestSection(section) ? 'Вставьте JSON или cURL' : 'Вставьте JSON';
    const shouldOpenEmptyInput = !value.trim() && !isEditing;
    const hasSourceValue = Boolean(currentValue.trim());
    const fixJsonBusy = aiBusyKey === `fix-json:${section.id}:${target}`;

    return (
      <div className="source-panel">
        <div className="source-panel-head">
          <div className="label">{title}</div>
          <div className="source-format-status">
            <span className={`source-format-badge ${hasSourceValue ? 'active' : ''}`}>{format.toUpperCase()}</span>
          </div>
          <div className="field-actions visible">
            {!isEditing && (
              <>
                <button className="icon-button" type="button" title="Копировать" aria-label="Копировать" onClick={() => copyToClipboard(value)}>
                  ⧉
                </button>
                {format === 'json' && (
                  <button
                    className="icon-button"
                    type="button"
                    title="Beautify"
                    aria-label="Beautify"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() =>
                      updateSection(section.id, (current) => {
                        if (current.kind !== 'parsed') return current;
                        try {
                          const nextValue = beautifySourceDraft(format, value);
                          if (target === 'client' && isDualModelSection(current)) return { ...current, clientInput: nextValue, clientError: '' };
                          return { ...current, input: nextValue, error: '' };
                        } catch {
                          return current;
                        }
                      })
                    }
                  >
                    ✨
                  </button>
                )}
                {format === 'json' && (
                  <button
                    className="icon-button"
                    type="button"
                    title={fixJsonBusy ? 'AI: исправляю JSON...' : 'AI: исправить JSON'}
                    aria-label="AI: исправить JSON"
                    aria-busy={fixJsonBusy}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void fixJsonSyntaxWithAi(section, target)}
                    disabled={!currentValue.trim() || Boolean(aiBusyKey)}
                  >
                    {fixJsonBusy ? <span className="ai-loader ai-loader-inline" aria-hidden="true" /> : 'AI'}
                  </button>
                )}
                <button
                  className="icon-button"
                  type="button"
                  title="Импорт текста"
                  aria-label="Импорт текста"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => openSourceTextImport(section, target)}
                >
                  ⇣
                </button>
                <button
                  className="icon-button"
                  type="button"
                  title="Редактировать"
                  aria-label="Редактировать"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => startSourceEditing(section, target)}
                >
                  ✎
                </button>
              </>
            )}
            {isEditing && (
              <>
                {format === 'json' && (
                  <button
                    className="icon-button"
                    type="button"
                    title="Beautify"
                    aria-label="Beautify"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={beautifySourceEditing}
                  >
                    ✨
                  </button>
                )}
                {format === 'json' && (
                  <button
                    className="icon-button"
                    type="button"
                    title={fixJsonBusy ? 'AI: исправляю JSON...' : 'AI: исправить JSON'}
                    aria-label="AI: исправить JSON"
                    aria-busy={fixJsonBusy}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void fixJsonSyntaxWithAi(section, target)}
                    disabled={!currentValue.trim() || Boolean(aiBusyKey)}
                  >
                    {fixJsonBusy ? <span className="ai-loader ai-loader-inline" aria-hidden="true" /> : 'AI'}
                  </button>
                )}
                <button
                  className="icon-button"
                  type="button"
                  title="Сохранить"
                  aria-label="Сохранить"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={saveSourceEditing}
                >
                  ✓
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  title="Отменить"
                  aria-label="Отменить"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={cancelSourceEditing}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        </div>

        <div className="source-input-area">
          {shouldOpenEmptyInput && (
            <div className="source-edit-wrap">
              <textarea
                className="source-edit"
                rows={12}
                value=""
                onChange={(e) => {
                  const nextDraft = e.target.value;
                  const nextFormat = applyDetectedSourceFormat(section.id, target, nextDraft, format);
                  setEditingSource({
                    sectionId: section.id,
                    target,
                    draft: nextDraft
                  });
                  setSourceEditorError(validateSourceDraft(nextFormat, nextDraft));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') cancelSourceEditing();
                }}
                placeholder={sourcePlaceholder}
                autoFocus
              />
            </div>
          )}

          {!isEditing && !shouldOpenEmptyInput && (
            <div className={`source-code source-code-display language-${format}`} onDoubleClick={() => startSourceEditing(section, target)}>
              <pre className={`source-code language-${format}`}>
                <code dangerouslySetInnerHTML={{ __html: highlightCode(format, currentValue || '') || '&nbsp;' }} />
              </pre>
            </div>
          )}

          {isEditing && (
            <div className="source-edit-wrap">
              <textarea
                className="source-edit"
                rows={12}
                value={editingSource.draft}
                onChange={(e) => {
                  const nextDraft = e.target.value;
                  const nextFormat = applyDetectedSourceFormat(section.id, target, nextDraft, format);
                  setEditingSource((current) => (current ? { ...current, draft: nextDraft } : current));
                  setSourceEditorError(validateSourceDraft(nextFormat, nextDraft));
                }}
                onBlur={() => {
                  if (format !== 'json') saveSourceEditing();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') cancelSourceEditing();
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveSourceEditing();
                }}
                placeholder={sourcePlaceholder}
                autoFocus
              />
              {sourceEditorError && <div className="inline-error">{sourceEditorError}</div>}
            </div>
          )}

          <div className="source-edit-wrap">
            <div className="label" style={{ marginBottom: 6 }}>JSON Schema (приоритет при парсинге)</div>
            <div className="field-actions visible" style={{ marginTop: 8 }}>
              {!isSchemaEditing && (
                <button
                  className="icon-button"
                  type="button"
                  title="Редактировать JSON Schema"
                  aria-label="Редактировать JSON Schema"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setEditingSchema({ sectionId: section.id, target, draft: schemaValue });
                    setSourceEditorError('');
                  }}
                >
                  ✎
                </button>
              )}
              {isSchemaEditing && (
                <>
                  <button
                    className="icon-button"
                    type="button"
                    title="Форматировать JSON Schema"
                    aria-label="Форматировать JSON Schema"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      try {
                        const pretty = JSON.stringify(JSON.parse(currentSchemaValue || '{}'), null, 2);
                        setEditingSchema((current) => (current ? { ...current, draft: pretty } : current));
                        setSourceEditorError('');
                      } catch (error) {
                        setSourceEditorError(error instanceof Error ? error.message : 'Некорректный JSON Schema');
                      }
                    }}
                  >
                    ✨
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    title="Сохранить JSON Schema"
                    aria-label="Сохранить JSON Schema"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      const trimmedSchema = currentSchemaValue.trim();

                      let nextSchema = '';
                      if (trimmedSchema) {
                        try {
                          nextSchema = JSON.stringify(JSON.parse(trimmedSchema), null, 2);
                        } catch (error) {
                          setSourceEditorError(error instanceof Error ? error.message : 'Некорректный JSON Schema');
                          return;
                        }
                      }

                      updateSection(section.id, (current) => {
                        if (current.kind !== 'parsed') return current;
                        if (target === 'client' && isDualModelSection(current)) {
                          return { ...current, clientSchemaInput: nextSchema };
                        }
                        return { ...current, schemaInput: nextSchema };
                      });

                      setEditingSchema(null);
                      setSourceEditorError('');
                      const persisted = persistLocalWorkspace(buildWorkspaceProjectData());
                      setToastMessage(persisted ? 'JSON Schema сохранена без парсинга' : 'Не удалось сохранить JSON Schema');
                    }}
                  >
                    ✓
                  </button>
                  <button
                    className="icon-button danger"
                    type="button"
                    title="Отменить"
                    aria-label="Отменить"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setEditingSchema(null);
                      setSourceEditorError('');
                    }}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>

            {isSchemaEditing ? (
              <textarea
                className="source-edit"
                rows={8}
                value={currentSchemaValue}
                onChange={(e) => {
                  const nextSchema = e.target.value;
                  setEditingSchema((current) => (current ? { ...current, draft: nextSchema } : current));
                  if (!nextSchema.trim()) {
                    setSourceEditorError('');
                    return;
                  }
                  try {
                    JSON.parse(nextSchema);
                    setSourceEditorError('');
                  } catch (error) {
                    setSourceEditorError(error instanceof Error ? error.message : 'Некорректный JSON Schema');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEditingSchema(null);
                    setSourceEditorError('');
                  }
                }}
                placeholder="Вставьте JSON Schema. Если заполнено, парсинг идет по схеме"
                autoFocus
              />
            ) : currentSchemaValue.trim() ? (
              <div className="source-code source-code-display language-json" style={{ marginTop: 10 }}>
                <div className="source-code" onDoubleClick={() => setEditingSchema({ sectionId: section.id, target, draft: currentSchemaValue })}>
                <pre className="source-code language-json">
                  <code dangerouslySetInnerHTML={{ __html: highlightCode('json', currentSchemaValue) }} />
                </pre>
                </div>
              </div>
            ) : (
              <div className="source-code source-code-display language-json" style={{ marginTop: 10 }} onDoubleClick={() => setEditingSchema({ sectionId: section.id, target, draft: '' })}>
                <pre className="source-code language-json"><code>&nbsp;</code></pre>
              </div>
            )}
          </div>

          <button
            className="source-parse-fab"
            type="button"
            data-onboarding-anchor={target === 'server' ? 'run-parse' : undefined}
            onClick={() => runParser(section, target)}
            disabled={!currentValue.trim() && !schemaValue.trim()}
            title="Запустить парсер"
          >
            Парсить
          </button>
        </div>
      </div>
    );
  }

  function renderRequestEditor(section: ParsedSection) {
    const serverLabel = getSectionSideLabel(section, 'server');
    const clientLabel = getSectionSideLabel(section, 'client');
    const exampleLabel = isResponseSection(section) ? 'Пример ответа' : 'Пример запроса';
    return (
      <div className="stack">
        <label className="switch">
          <input
            type="checkbox"
            checked={Boolean(section.domainModelEnabled)}
            onChange={(e) =>
              updateSection(section.id, (current) => {
                if (current.kind !== 'parsed' || !isDualModelSection(current)) return current;
                if (e.target.checked) {
                  return {
                    ...current,
                    domainModelEnabled: true,
                    clientFormat: current.clientFormat ?? 'json',
                    clientInput: current.clientInput ?? '',
                    clientRows: current.clientRows ?? [],
                    clientError: current.clientError ?? '',
                    clientMappings: current.clientMappings ?? {}
                  };
                }

                return {
                  ...current,
                  domainModelEnabled: false,
                  clientFormat: 'json',
                  clientInput: '',
                  clientRows: [],
                  clientError: '',
                  clientMappings: {}
                };
              })
            }
          />
          <span>Доменная модель</span>
        </label>

        {isRequestSection(section) && (
          <>
            {renderRequestMetaEditor(section, 'server')}
            {renderRequestAuthEditor(section, 'server')}
            <div className="stack">
              <div className="label">Headers</div>
              {renderRequestHeadersTable(section, 'server')}
            </div>
          </>
        )}

        <details
          className="expander"
          data-onboarding-anchor="prepare-source"
          open={isExpanderOpen(section.id, 'source-server')}
          onToggle={(e) => setExpanderOpen(section.id, 'source-server', e.currentTarget.open)}
        >
          <summary className="expander-summary">{serverLabel}</summary>
          <div className="expander-body">
            {renderSourceEditor(section, 'server', `${exampleLabel} (${serverLabel})`)}
          </div>
        </details>

        {section.domainModelEnabled && (
          <>
            {isRequestSection(section) && (
              <>
                {renderRequestMetaEditor(section, 'client')}
                {renderRequestAuthEditor(section, 'client')}
                <div className="stack">
                  <div className="label">Внешние headers</div>
                  {renderRequestHeadersTable(section, 'client')}
                </div>
              </>
            )}
            <details
              className="expander"
              open={isExpanderOpen(section.id, 'source-client')}
              onToggle={(e) => setExpanderOpen(section.id, 'source-client', e.currentTarget.open)}
            >
              <summary className="expander-summary">{clientLabel}</summary>
              <div className="expander-body">
                {renderSourceEditor(section, 'client', `${exampleLabel} (${clientLabel})`)}
              </div>
            </details>
          </>
        )}

        {section.error && <div className="alert error">{serverLabel}: {section.error}</div>}
        {section.clientError && <div className="alert error">{clientLabel}: {section.clientError}</div>}
        {aiErrorMessage && <div className="alert error">AI: {aiErrorMessage}</div>}
        {requestCellError && <div className="alert error">{requestCellError}</div>}
        {renderParsedTable(section)}
      </div>
    );
  }

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const handleManualSave = async () => {
    setAutosave({ state: 'saving' });

    const workspace = asWorkspaceProjectData(
      normalizedProjectName,
      methods,
      activeMethodId,
      methodGroups,
      projectSections,
      flows
    );
    if (!persistLocalWorkspace(workspace)) {
      setAutosave({ state: 'error' });
      return;
    }

    if (authUser && remoteHydratedRef.current) {
      cancelPendingRemoteSave();

      if (!remoteSaveInFlightRef.current) {
        remoteSaveInFlightRef.current = true;
        const nextProjectName = normalizedProjectName;
        const history = getPersistedHistoryState();
        const workspaceHash = JSON.stringify(workspace);

        try {
          const saved = await saveServerProjectWithFallback({
            projectId: serverProjectId ?? undefined,
            name: nextProjectName,
            workspace,
            history
          });
          setServerProjectId(saved.id);
          setProjectMethodCounts((current) => ({
            ...current,
            [saved.id]: workspace.methods.length
          }));
          upsertProjectCache(saved.id, {
            workspace: deepClone(workspace),
            history: history ? deepClone(history) : null,
            loadedAt: Date.now()
          });
          upsertServerProjectListEntry({ id: saved.id, name: nextProjectName, updatedAt: saved.updatedAt });
          setServerSyncError('');
          remoteLastSavedHashRef.current = workspaceHash;
          remoteLastObservedHashRef.current = workspaceHash;
          remotePendingChangesRef.current = 0;
        } catch (error) {
          setServerSyncError(error instanceof Error ? error.message : 'Ошибка сохранения на сервер');
          setAutosave({ state: 'error' });
          return;
        } finally {
          remoteSaveInFlightRef.current = false;
        }
      }
    }

    setAutosave({ state: 'saved', at: formatTime(new Date()) });
  };

  const isOnboardingHeaderAvailable =
    ONBOARDING_FEATURES.onboardingV1
    && ONBOARDING_FEATURES.onboardingGuidedMode
    && !showOnboardingEntry;
  const toggleOnboardingHeaderNavigation = () => {
    setIsOnboardingNavVisible((current) => !current);
  };

  return (
    <div className="shell">
      {ONBOARDING_FEATURES.onboardingV1 && showOnboardingEntry && (
        <div
          className="onboarding-entry-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Старт работы"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeOnboardingEntry();
            }
          }}
        >
          <div className="onboarding-entry-card">
            <h2>Как хотите начать работу?</h2>
            <div className="onboarding-entry-options">
              {onboardingEntryOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="onboarding-entry-option"
                  onClick={option.action}
                >
                  <span className="onboarding-entry-option-icon">{renderOnboardingEntryIcon(option.id)}</span>
                  <span className="onboarding-entry-option-copy">
                    <span className="onboarding-entry-option-title">{option.title}</span>
                    <span className="onboarding-entry-option-description">{option.description}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="onboarding-entry-footer">
              <label className="onboarding-entry-pref">
                <input
                  type="checkbox"
                  checked={suppressOnboardingEntry}
                  onChange={(event) => setSuppressOnboardingEntry(event.target.checked)}
                />
                <span>Больше не показывать это окно</span>
              </label>
              <a
                href="#"
                className="onboarding-entry-skip"
                onClick={(event) => {
                  event.preventDefault();
                  closeOnboardingEntry();
                }}
              >
                Пропустить
              </a>
            </div>
          </div>
        </div>
      )}

      {showDeleteProjectDialog && (
        <div
          className="import-routing-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Подтверждение удаления проекта"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              cancelDeleteServerProject();
            }
          }}
        >
          <div className="import-routing-card" ref={deleteProjectDialogRef}>
            <h2>Удалить проект?</h2>
            <p className="import-routing-file">
              Проект «{resolveServerProjectName(pendingDeleteProjectId)}» будет удален без возможности восстановления.
            </p>
            <div className="import-routing-actions">
              <button
                ref={deleteProjectCancelButtonRef}
                type="button"
                className="ghost"
                onClick={cancelDeleteServerProject}
              >
                Отмена
              </button>
              <button type="button" onClick={() => void confirmDeleteServerProject()}>
                Удалить проект
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingMethodDelete && (
        <div
          className="import-routing-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Подтверждение удаления метода"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              cancelDeleteMethod();
            }
          }}
        >
          <div className="import-routing-card">
            <h2>Удалить метод?</h2>
            <p className="import-routing-file">
              «{pendingMethodDelete.methodName}», секций: {pendingMethodDelete.sectionCount}. Действие необратимо.
            </p>
            <div className="import-routing-actions">
              <button type="button" className="ghost" onClick={cancelDeleteMethod}>
                Отмена
              </button>
              <button type="button" onClick={confirmDeleteMethod}>
                Удалить метод
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingSectionDelete && (
        <div
          className="import-routing-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Подтверждение удаления раздела"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              cancelDeleteSection();
            }
          }}
        >
          <div className="import-routing-card">
            <h2>Удалить раздел?</h2>
            <p className="import-routing-file">
              «{pendingSectionDelete.sectionTitle}». Действие необратимо.
            </p>
            <div className="import-routing-actions">
              <button type="button" className="ghost" onClick={cancelDeleteSection}>
                Отмена
              </button>
              <button type="button" onClick={confirmDeleteSection}>
                Удалить раздел
              </button>
            </div>
          </div>
        </div>
      )}

      {authDialog && (
        <div
          className="import-routing-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={authDialog.mode === 'login' ? 'Вход в аккаунт' : 'Регистрация'}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !authDialog.isSubmitting) {
              closeAuthDialog();
            }
          }}
        >
          <div className="import-routing-card">
            <h2>{authDialog.mode === 'login' ? 'Вход' : 'Регистрация'}</h2>
            <label className="field">
              <div className="label">Логин</div>
              <input
                type="text"
                value={authDialog.login}
                onChange={(event) => updateAuthDialogField('login', event.target.value)}
                placeholder="Введите логин"
                autoFocus
              />
            </label>
            <label className="field">
              <div className="label">Пароль</div>
              <input
                type="password"
                value={authDialog.password}
                onChange={(event) => updateAuthDialogField('password', event.target.value)}
                placeholder="Введите пароль"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void submitAuthDialog();
                  }
                }}
              />
            </label>
            {authDialog.error && <div className="alert error">{authDialog.error}</div>}
            {authDialog.isSubmitting && (
              <div className="alert auth-status loading" role="status">
                <span className="ai-loader" aria-hidden="true" />
                <span>{authDialog.mode === 'login' ? 'Выполняем вход...' : 'Создаем аккаунт...'}</span>
              </div>
            )}
            <div className="import-routing-actions">
              <button type="button" className="ghost" onClick={closeAuthDialog} disabled={authDialog.isSubmitting}>
                Отмена
              </button>
              <button type="button" onClick={() => void submitAuthDialog()} disabled={authDialog.isSubmitting} aria-busy={authDialog.isSubmitting}>
                {authDialog.isSubmitting ? (
                  <>
                    <span className="ai-loader ai-loader-inline" aria-hidden="true" />
                    <span>{authDialog.mode === 'login' ? 'Входим...' : 'Регистрируем...'}</span>
                  </>
                ) : authDialog.mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
              </button>
            </div>
          </div>
        </div>
      )}

      {workspaceMethodsImportRouting && (
        <div className="import-routing-backdrop" role="dialog" aria-modal="true" aria-label="Импорт методов из JSON">
          <div className="import-routing-card">
            <h2>Импорт JSON проекта</h2>
            <p className="import-routing-file">Файл: {workspaceMethodsImportRouting.fileName}</p>
            <p className="import-routing-file">
              Обнаружен JSON вашей площадки с методами. Выберите режим импорта.
            </p>

            <div className="import-routing-actions">
              <button type="button" className="ghost" onClick={cancelWorkspaceMethodsImportRouting}>Отмена</button>
              <button type="button" className="ghost" onClick={applyWorkspaceImportAsReplace}>Заменить проект</button>
              <button type="button" onClick={applyWorkspaceImportAsMethodsMerge}>Импортировать методы</button>
            </div>
          </div>
        </div>
      )}

      {jsonImportRouting && (
        <div className="import-routing-backdrop" role="dialog" aria-modal="true" aria-label="Маршрутизация JSON импорта">
          <div className="import-routing-card">
            <h2>Куда импортировать JSON?</h2>
            <p className="import-routing-file">Файл: {jsonImportRouting.fileName}</p>

            <label className="field">
              <div className="label">Тип примера</div>
              <select
                value={jsonImportRouting.sampleType}
                onChange={(event) => {
                  const nextType = event.target.value as JsonImportSampleType;
                  const linkedId = getParsedSectionIdByType(nextType);
                  const linkedSection = sections.find(
                    (section): section is ParsedSection => section.kind === 'parsed' && section.id === linkedId
                  );
                  const domainModelEnabled = Boolean(linkedSection?.domainModelEnabled);
                  setJsonImportRouting((current) =>
                    current
                      ? {
                          ...current,
                          sampleType: nextType,
                          domainModelEnabled,
                          targetSide: domainModelEnabled ? current.targetSide : 'server'
                        }
                      : current
                  );
                }}
              >
                <option value="request">Пример запроса</option>
                <option value="response">Пример ответа</option>
              </select>
            </label>

            <label className="switch import-routing-switch">
              <input
                type="checkbox"
                checked={jsonImportRouting.domainModelEnabled}
                onChange={(event) =>
                  setJsonImportRouting((current) =>
                    current
                      ? {
                          ...current,
                          domainModelEnabled: event.target.checked,
                          targetSide: event.target.checked ? current.targetSide : 'server'
                        }
                      : current
                  )
                }
              />
              <span>Доменная модель</span>
            </label>

            {jsonImportRouting.domainModelEnabled && (
              <label className="field">
                <div className="label">Целевая сторона</div>
                <select
                  value={jsonImportRouting.targetSide}
                  onChange={(event) =>
                    setJsonImportRouting((current) =>
                      current
                        ? {
                            ...current,
                            targetSide: event.target.value as JsonImportTargetSide
                          }
                        : current
                    )
                  }
                >
                  <option value="server">Server {jsonImportRouting.sampleType === 'request' ? 'request' : 'response'}</option>
                  <option value="client">Client {jsonImportRouting.sampleType === 'request' ? 'request' : 'response'}</option>
                </select>
              </label>
            )}

            <div className="import-routing-actions">
              <button type="button" className="ghost" onClick={dismissJsonImportRouting}>Отмена</button>
              <button type="button" onClick={applyRoutedJsonImport}>Импортировать</button>
            </div>
          </div>
        </div>
      )}

      {projectTextImport && (
        <div className="import-routing-backdrop" role="dialog" aria-modal="true" aria-label="Импорт проекта из текста">
          <div className="import-routing-card">
            <h2>Импорт JSON</h2>
            <p className="import-routing-file">Вставьте JSON или cURL</p>

            <div className="row gap import-routing-actions-start">
              <button
                type="button"
                className="ghost"
                onClick={() => importInputRef.current?.click()}
              >
                Выбрать файл
              </button>
            </div>

            <label className="field">
              <div className="label">Текст для импорта</div>
              <textarea
                className="source-edit"
                rows={10}
                value={projectTextImport.rawText}
                onChange={(event) =>
                  setProjectTextImport((current) =>
                    current
                      ? {
                          ...current,
                          rawText: event.target.value
                        }
                      : current
                  )
                }
                placeholder="Вставьте JSON или cURL"
              />
            </label>

            <div className="import-routing-actions">
              <button type="button" className="ghost" onClick={closeProjectImportDialog}>Отмена</button>
              <button
                type="button"
                onClick={() => processImportedText(projectTextImport.rawText, 'Вставленный JSON')}
                disabled={!projectTextImport.rawText.trim()}
              >
                Импортировать текст
              </button>
            </div>
          </div>
        </div>
      )}

      {sourceTextImport && (
        <div className="import-routing-backdrop" role="dialog" aria-modal="true" aria-label="Импорт source текста">
          <div className="import-routing-card">
            {(() => {
              const sourceSection = sections.find(
                (item): item is ParsedSection => item.kind === 'parsed' && item.id === sourceTextImport.sectionId
              );
              const sourceImportAllowsCurl = Boolean(sourceSection && isRequestSection(sourceSection));

              return (
                <>
            <h2>Импорт в Source</h2>
            <p className="import-routing-file">{sourceImportAllowsCurl ? 'Поддерживается JSON и cURL' : 'Поддерживается только JSON'}</p>

            <label className="field">
              <div className="label">Текст source</div>
              <textarea
                className="source-edit"
                rows={10}
                value={sourceTextImport.draft}
                onChange={(event) =>
                  setSourceTextImport((current) =>
                    current
                      ? {
                          ...current,
                          draft: event.target.value
                        }
                      : current
                  )
                }
                placeholder={sourceImportAllowsCurl ? 'Вставьте JSON или cURL' : 'Вставьте JSON'}
              />
            </label>

            <div className="import-routing-actions">
              <button type="button" className="ghost" onClick={() => setSourceTextImport(null)}>Отмена</button>
              <button type="button" onClick={applySourceTextImport} disabled={!sourceTextImport.draft.trim()}>
                Импортировать текст
              </button>
            </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <AppTopbar
        topbarRef={topbarRef}
        importInputRef={importInputRef}
        canExport={Boolean(activeMethod)}
        exportTitle={exportTitle}
        authLoading={authLoading}
        authUserLogin={authUser?.login ?? null}
        canUndo={canUndo}
        canRedo={canRedo}
        isOnboardingHeaderAvailable={isOnboardingHeaderAvailable}
        isOnboardingNavVisible={isOnboardingNavVisible}
        isSidebarHidden={isSidebarHidden}
        theme={theme}
        autosaveState={autosave.state}
        autosaveAt={autosave.at ?? null}
        isLogoutBusy={authBusyKey === 'auth:logout'}
        onboardingSteps={ONBOARDING_STEPS}
        onboardingStepCompleted={onboardingStepCompleted}
        activeOnboardingStepId={activeOnboardingStep.id}
        onboardingStepHint={onboardingStepHint}
        onboardingPrimaryActionLabel={onboardingPrimaryActionLabel}
        onOpenProjectImport={() => openProjectImportDialog(false)}
        onImportProjectJson={(file) => importProjectJson(file)}
        onExportProjectJson={exportProjectJson}
        onExportMockServiceJson={exportMockServiceJson}
        onExportFullProjectHtml={() => void handleExportFullProjectHtml()}
        onExportFullProjectWiki={handleExportFullProjectWiki}
        onOpenHtmlPreview={openHtmlPreview}
        onOpenWikiPreview={openWikiPreview}
        onUndoWorkspace={undoWorkspace}
        onRedoWorkspace={redoWorkspace}
        onLogout={() => void handleLogout()}
        onOpenLogin={() => openAuthDialog('login')}
        onOpenRegister={() => openAuthDialog('register')}
        onToggleOnboardingHeaderNavigation={toggleOnboardingHeaderNavigation}
        onToggleSidebar={() => setIsSidebarHidden((current) => !current)}
        onToggleTheme={toggleTheme}
        onManualSave={() => void handleManualSave()}
        onJumpToOnboardingStep={jumpToOnboardingStep}
        onPrimaryOnboardingAction={activeOnboardingHint ? handleActiveOnboardingHintAction : focusOnboardingCurrentStep}
        canNavigateToOnboardingStep={canNavigateToOnboardingStep}
        renderUiIcon={renderUiIcon}
      />

      {importError && <div className="alert error">Ошибка импорта: {importError}</div>}
      {serverSyncError && <div className="alert error">Ошибка синхронизации: {serverSyncError}</div>}
      {toastMessage && <div className="toast-info">{toastMessage}</div>}

      {isCompactLayout && !isSidebarHidden && (
        <button
          type="button"
          className="sidebar-mobile-backdrop"
          aria-label="Закрыть боковую панель"
          onClick={() => setIsSidebarHidden(true)}
        />
      )}

      <div className="sync-alert-stack">
        {aiRequestStatus && (
          <div className={`alert ai-status ${aiRequestStatus.state}`} role="status">
            {aiRequestStatus.state === 'loading' && <span className="ai-loader" aria-hidden="true" />}
            <span>{aiRequestStatus.message}</span>
          </div>
        )}
        {authRequestStatus && (
          <div className={`alert auth-status ${authRequestStatus.state}`} role="status">
            {authRequestStatus.state === 'loading' && <span className="ai-loader" aria-hidden="true" />}
            <span>{authRequestStatus.message}</span>
          </div>
        )}
        {selectedSection?.kind === 'parsed' &&
          renderSourceAlert(
            `${selectedSection.id}-server`,
            selectedServerDriftRows.length > 0 || selectedServerFormatDrift || selectedServerDuplicateValues.length > 0,
            selectedServerSourceRows,
            selectedServerDuplicateValues,
            'Дубликат поля',
            selectedServerFormatDrift,
            selectedSection.format,
            () => syncInputFromRows(selectedSection, 'server'),
            selectedSection.lastSyncedFormat,
            'Параметры отличаются от исходного источника',
            selectedSection.sectionType === 'response' ? 'Исправить json ответа' : 'Исправить json запроса'
          )}
        {selectedSection?.kind === 'parsed' &&
          isDualModelSection(selectedSection) &&
          renderSourceAlert(
            `${selectedSection.id}-client`,
            selectedClientDriftRows.length > 0 || selectedClientFormatDrift || selectedClientDuplicateValues.length > 0,
            selectedClientSourceRows,
            selectedClientDuplicateValues,
            `Дубликат ${getSectionSideLabel(selectedSection, 'client').toLowerCase()}`,
            selectedClientFormatDrift,
            selectedSection.clientFormat ?? 'json',
            () => syncInputFromRows(selectedSection, 'client'),
            selectedSection.clientLastSyncedFormat,
            `${getSectionSideLabel(selectedSection, 'client')} отличается от источника`,
            selectedSection.sectionType === 'response' ? 'Исправить json ответа' : 'Исправить json запроса'
          )}
      </div>

      <div
        className={`layout ${isSidebarHidden ? 'sidebar-hidden' : ''}`}
        style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
      >
        {!isSidebarHidden && workspaceScope === 'methods' && (
          <MethodSectionSidebar
            enableMultiMethods={ENABLE_MULTI_METHODS}
            normalizedProjectName={normalizedProjectName}
            editingProjectName={editingProjectName}
            editingProjectNameDraft={editingProjectNameDraft}
            projectNameInputRef={projectNameInputRef}
            expandedProjectIds={expandedProjectIds}
            expandedMethodId={expandedMethodId}
            methods={methods}
            serverProjects={serverProjects}
            currentProjectId={serverProjectId}
            projectMethodCounts={projectMethodCounts}
            projectMethodPreviews={projectMethodPreviews}
            activeMethodId={activeMethod?.id}
            editingMethodId={editingMethodId}
            editingMethodNameDraft={editingMethodNameDraft}
            methodNameWarning={methodNameWarning}
            methodNameInputRef={methodNameInputRef}
            canDeleteMethod={methods.length > 1 && Boolean(activeMethod)}
            sections={sections}
            selectedSectionId={selectedSection?.id}
            validationMap={validationMap}
            draggingId={draggingId}
            isSectionPanelPulse={isSectionPanelPulse}
            isAddEntityMenuOpen={isAddEntityMenuOpen}
            isDeleteEntityMenuOpen={isDeleteEntityMenuOpen}
            isProjectSwitching={isProjectSwitching}
            switchingProjectId={switchingProjectId}
            onCreateProject={createProject}
            onSelectProject={(projectId) => {
              if (!projectId) return;
              if (projectId === serverProjectId || isProjectSwitching) return;
              void handleServerProjectSelect(projectId);
            }}
            onStartProjectRename={startProjectRename}
            onProjectNameDraftChange={setEditingProjectNameDraft}
            onFinishProjectRename={finishProjectRename}
            onCancelProjectRename={cancelProjectRename}
            onToggleProjectExpanded={(projectId) => {
              if (!projectId) return;
              setExpandedProjectIds((current) => {
                if (current[projectId]) {
                  const next = { ...current };
                  delete next[projectId];
                  return next;
                }
                return {
                  ...current,
                  [projectId]: true
                };
              });
            }}
            onSwitchMethod={switchMethod}
            onToggleMethodExpanded={toggleMethodExpanded}
            onStartMethodRename={startMethodRename}
            onMethodNameDraftChange={setEditingMethodNameDraft}
            onFinishMethodRename={finishMethodRename}
            onCancelMethodRename={cancelMethodRename}
            onCreateMethod={createMethod}
            canDeleteProject={Boolean(serverProjectId)}
            onDeleteActiveMethod={deleteActiveMethod}
            onRequestDeleteProject={requestDeleteCurrentProject}
            onDragStartSection={setDraggingId}
            onDropSection={(targetId) => {
              if (draggingId) {
                setSections((prev) => reorderSections(prev, draggingId, targetId));
              }
              setDraggingId(null);
            }}
            onSelectSection={(sectionId) => {
              setSelectedId(sectionId);
              suppressObserverSelectionUntilRef.current = Date.now() + 750;
              if (sectionJumpHighlightTimerRef.current) {
                clearTimeout(sectionJumpHighlightTimerRef.current);
              }
              setSectionJumpHighlightId(sectionId);
              sectionJumpHighlightTimerRef.current = setTimeout(() => {
                setSectionJumpHighlightId((current) => (current === sectionId ? null : current));
              }, 850);
              setTab('editor');
              const scrollToTargetSection = (): void => {
                const target = sectionAnchorRefs.current.get(sectionId);
                if (!target) return;
                if (typeof target.scrollIntoView !== 'function') return;
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              };
              if (typeof window !== 'undefined') {
                window.requestAnimationFrame(() => {
                  window.requestAnimationFrame(scrollToTargetSection);
                });
              }
              if (isCompactLayout) setIsSidebarHidden(true);
            }}
            onToggleAddEntityMenu={() => {
              setIsDeleteEntityMenuOpen(false);
              setIsAddEntityMenuOpen((current) => !current);
            }}
            onToggleDeleteEntityMenu={() => {
              setIsAddEntityMenuOpen(false);
              setIsDeleteEntityMenuOpen((current) => !current);
            }}
            onStartSidebarResize={startSidebarResize}
            renderUiIcon={renderUiIcon}
            resolveSectionTitle={resolveSectionTitle}
          />
        )}

        <main className={`workspace ${workspaceScope === 'flows' && tab === 'editor' ? 'workspace-flow-focus' : ''}`} role="main">
          {canRenderWorkspace ? (
            <>
              <WorkspaceTabs tab={tab} onOpenEditor={() => setTab('editor')} onOpenHtml={openHtmlPreview} onOpenWiki={openWikiPreview} />
              {tab === 'editor' && (
                <div className="workspace-context-tabs" role="tablist" aria-label="Контекст редактора">
                  <button
                    type="button"
                    role="tab"
                    className={`workspace-context-tab ${workspaceScope === 'methods' ? 'active' : ''}`}
                    aria-selected={workspaceScope === 'methods'}
                    onClick={() => {
                      setWorkspaceScope('methods');
                      if (isCompactLayout) setIsSidebarHidden(false);
                    }}
                  >
                    Methods
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`workspace-context-tab ${workspaceScope === 'project-docs' ? 'active' : ''}`}
                    aria-selected={workspaceScope === 'project-docs'}
                    onClick={() => {
                      setWorkspaceScope('project-docs');
                      setIsSidebarHidden(true);
                    }}
                  >
                    Project Docs
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`workspace-context-tab ${workspaceScope === 'flows' ? 'active' : ''}`}
                    aria-selected={workspaceScope === 'flows'}
                    onClick={() => {
                      setWorkspaceScope('flows');
                      setIsSidebarHidden(true);
                    }}
                  >
                    Flows
                  </button>
                </div>
              )}

              <div className="panes">
              {tab === 'editor' && workspaceScope === 'methods' && (
                <div className="editor-stream">
                  {sections.map((section) => {
                    const isActiveSection = selectedSection?.id === section.id;
                    const isJumpHighlighted = sectionJumpHighlightId === section.id;
                    return (
                      <section
                        key={section.id}
                        id={`section-${section.id}`}
                        data-section-id={section.id}
                        className={`panel editor-section ${isActiveSection ? 'editor-section-active' : ''} ${isJumpHighlighted ? 'editor-section-jump' : ''}`}
                        ref={(node) => {
                          if (node) {
                            sectionAnchorRefs.current.set(section.id, node);
                          } else {
                            sectionAnchorRefs.current.delete(section.id);
                          }
                        }}
                      >
                        <div className="panel-head">
                          <div>
                            <div className="panel-title">{renderEditableSectionTitle(section)}</div>
                          </div>
                          <div className="row gap">
                            {renderSectionActionCluster(section, 'header')}
                            {isActiveSection && (
                              <button
                                className="icon-button danger section-delete-btn"
                                type="button"
                                onClick={() => requestDeleteSection(section.id)}
                                aria-label="Удалить раздел"
                                title="Удалить раздел"
                              >
                                <span className="ui-icon" aria-hidden>{renderUiIcon('delete_section')}</span>
                              </button>
                            )}
                            <label className="switch">
                              <input
                                type="checkbox"
                                checked={section.enabled}
                                onChange={(e) => updateSection(section.id, (current) => ({ ...current, enabled: e.target.checked }))}
                              />
                              <span>Активна</span>
                            </label>
                          </div>
                        </div>

                        {section.kind === 'text' && (
                          <div className="stack">
                            {isActiveSection ? (
                              <>
                                <div className="editor-toolbar-shell" data-onboarding-anchor="refine-structure">
                                  <div className="editor-toolbar-head">
                                    <div className="editor-toolbar-title">Редактор текста</div>
                                    <div className="editor-toolbar-note">Выделите текст и примените форматирование</div>
                                  </div>
                                  <div className="text-toolbar" role="toolbar" aria-label="Форматирование текста">
                                    <div className="toolbar-group" aria-label="Базовое форматирование">
                                      <button
                                        className="ghost small toolbar-button"
                                        type="button"
                                        title="Жирный"
                                        aria-label="Жирный"
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          rememberTextSelection();
                                        }}
                                        onClick={() => applyTextEditorCommand(section.id, 'bold')}
                                      >
                                        <span className="toolbar-icon toolbar-icon-bold">B</span>
                                      </button>
                                      <button
                                        className="ghost small toolbar-button"
                                        type="button"
                                        title="Код"
                                        aria-label="Код"
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          rememberTextSelection();
                                        }}
                                        onClick={() => applyTextEditorCommand(section.id, 'code')}
                                      >
                                        <span className="toolbar-icon">&lt;/&gt;</span>
                                      </button>
                                      <button
                                        className="ghost small toolbar-button"
                                        type="button"
                                        title="Выделение цветом"
                                        aria-label="Выделение цветом"
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          rememberTextSelection();
                                        }}
                                        onClick={() => applyTextEditorCommand(section.id, 'highlight', { color: DEFAULT_RICH_TEXT_HIGHLIGHT })}
                                      >
                                        <span className="toolbar-icon">🖍</span>
                                      </button>
                                    </div>
                                    <div className="toolbar-group" aria-label="Структура текста">
                                      <button
                                        className="ghost small toolbar-button"
                                        type="button"
                                        title="Подзаголовок"
                                        aria-label="Подзаголовок"
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          rememberTextSelection();
                                        }}
                                        onClick={() => applyTextEditorCommand(section.id, 'h3')}
                                      >
                                        <span className="toolbar-heading-glyph" aria-hidden="true">
                                          <span className="toolbar-heading-main">T</span>
                                          <span className="toolbar-heading-level">3</span>
                                        </span>
                                      </button>
                                      <button
                                        className="ghost small toolbar-button"
                                        type="button"
                                        title="Цитата"
                                        aria-label="Цитата"
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          rememberTextSelection();
                                        }}
                                        onClick={() => applyTextEditorCommand(section.id, 'quote')}
                                      >
                                        <span className="toolbar-icon">❝</span>
                                      </button>
                                    </div>
                                    <div className="toolbar-group" aria-label="Списки">
                                      <button
                                        className="ghost small toolbar-button"
                                        type="button"
                                        title="Маркированный список"
                                        aria-label="Маркированный список"
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          rememberTextSelection();
                                        }}
                                        onClick={() => applyTextEditorCommand(section.id, 'ul')}
                                      >
                                        <span className="toolbar-icon">•</span>
                                      </button>
                                      <button
                                        className="ghost small toolbar-button"
                                        type="button"
                                        title="Нумерованный список"
                                        aria-label="Нумерованный список"
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          rememberTextSelection();
                                        }}
                                        onClick={() => applyTextEditorCommand(section.id, 'ol')}
                                      >
                                        <span className="toolbar-icon">1.</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                <div className="panel-sub">Поддерживаются подзаголовки, цитаты, код и вложенные списки с Tab.</div>
                                <label className="field">
                                  <div className="label">Содержимое</div>
                                  <EditorContent
                                    editor={textEditor}
                                    onKeyDown={(event) => {
                                      const handled = handleRichTextHotkeys(event, (action) => applyTextEditorCommand(section.id, action));
                                      if (handled) return;

                                      if (event.key !== 'Tab' || !textEditor) return;
                                      if (!isSelectionInsideListItem()) return;

                                      event.preventDefault();
                                      if (event.shiftKey) {
                                        textEditor.chain().focus().liftListItem('listItem').run();
                                      } else {
                                        const sunk = textEditor.chain().focus().sinkListItem('listItem').run();
                                        if (!sunk) {
                                          textEditor.chain().focus().splitListItem('listItem').sinkListItem('listItem').run();
                                        }
                                      }
                                      syncTextSectionFromEditor(section.id);
                                    }}
                                  />
                                </label>
                              </>
                            ) : (
                              <label className="field">
                                <div className="label">Содержимое</div>
                                <div className="rich-text-preview" dangerouslySetInnerHTML={{ __html: richTextToHtml(section.value, { editable: false }) }} />
                              </label>
                            )}
                          </div>
                        )}

                        {section.kind === 'parsed' && (
                          <ParsedSectionEditor
                            section={section}
                            isDualModelSection={isDualModelSection}
                            renderRequestEditor={renderRequestEditor}
                            renderSourceEditor={renderSourceEditor}
                            onAddManualRow={addManualRow}
                            renderParsedTable={renderParsedTable}
                          />
                        )}

                        {section.kind === 'diagram' && (
                          <DiagramSectionEditor
                            section={section}
                            defaultRichTextHighlight={DEFAULT_RICH_TEXT_HIGHLIGHT}
                            isExpanderOpen={isExpanderOpen}
                            setExpanderOpen={setExpanderOpen}
                            onAddDiagram={addDiagram}
                            onUpdateDiagram={updateDiagram}
                            onDeleteDiagram={deleteDiagram}
                            getDiagramEditorNode={getDiagramEditorNode}
                            onBindDiagramEditorRef={bindDiagramEditorRef}
                            syncDiagramDescriptionFromEditor={syncDiagramDescriptionFromEditor}
                            rememberSelectionForEditor={rememberSelectionForEditor}
                            applyDiagramTextCommand={applyDiagramTextCommand}
                            handleRichTextHotkeys={handleRichTextHotkeys}
                          />
                        )}

                        {section.kind === 'errors' && (
                          <ErrorsSectionEditor
                            section={section}
                            sections={sections}
                            validationCaseOptions={getValidationCaseOptionsForSection(section)}
                            openInternalCodeKey={openInternalCodeKey}
                            highlightedInternalCodeIndex={highlightedInternalCodeIndex}
                            internalCodePopoverState={internalCodePopoverState}
                            internalCodeAnchorRefs={internalCodeAnchorRefs}
                            internalCodePopoverRef={internalCodePopoverRef}
                            setOpenInternalCodeKey={setOpenInternalCodeKey}
                            setHighlightedInternalCodeIndex={setHighlightedInternalCodeIndex}
                            updateErrorRow={updateErrorRow}
                            formatClientResponseCode={formatClientResponseCode}
                            applyInternalCode={applyInternalCode}
                            formatErrorResponseCode={formatErrorResponseCode}
                            deleteErrorRow={deleteErrorRow}
                            addErrorRow={addErrorRow}
                            updateValidationRuleRow={updateValidationRuleRow}
                            deleteValidationRuleRow={deleteValidationRuleRow}
                            addValidationRuleRow={addValidationRuleRow}
                            autofillValidationRulesFromRequestSchema={autofillValidationRulesFromRequestSchema}
                            getSectionRows={getSectionRows}
                            getDynamicTextareaRows={getDynamicTextareaRows}
                            validateJsonDraft={validateJsonDraft}
                            renderUiIcon={renderUiIcon}
                          />
                        )}
                      </section>
                    );
                  })}
                </div>
              )}

              {tab === 'editor' && workspaceScope === 'project-docs' && (
                <ProjectDocsEditor
                  sections={projectSections}
                  activeSectionId={activeProjectSectionId}
                  flows={flows}
                  activeFlowId={activeFlowId}
                  methods={methods}
                  onSelectSection={setActiveProjectSectionId}
                  onSelectFlow={setActiveFlowId}
                  onOpenFlowsWorkspace={() => setWorkspaceScope('flows')}
                  onCreateSection={createProjectDocSection}
                  onDeleteSection={deleteProjectDocSection}
                  onMoveSection={moveProjectDocSection}
                  onUpdateSection={updateProjectDocSection}
                />
              )}

              {tab === 'editor' && workspaceScope === 'flows' && (
                <ProjectFlowsEditor
                  methods={methods}
                  flows={flows}
                  activeFlowId={activeFlowId}
                  issues={activeFlowIssues}
                  onCreateFlow={createProjectFlow}
                  onDeleteFlow={deleteProjectFlow}
                  onSelectFlow={setActiveFlowId}
                  onUpdateFlow={updateProjectFlow}
                />
              )}

              {tab === 'html' && workspaceScope === 'methods' && (
                <section className={tab === 'html' ? 'panel panel-html-preview' : 'panel'}>
                  <div className="panel-head">
                    <div className="panel-title">Предпросмотр HTML</div>
                    <button className="ghost small" onClick={() => void handleExportHtml()}>
                      Скачать
                    </button>
                  </div>
                  <iframe
                    className={tab === 'html' ? 'preview-frame preview-frame-full' : 'preview-frame'}
                    title="HTML preview"
                    sandbox="allow-same-origin"
                    srcDoc={htmlPreviewOutput}
                  />
                </section>
              )}

              {tab === 'wiki' && workspaceScope === 'methods' && (
                <section className="panel">
                  <div className="panel-head">
                    <div className="panel-title">Предпросмотр Wiki</div>
                    <div className="row gap">
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => {
                          void copyToClipboard(wikiOutput);
                          setToastMessage('Wiki текст скопирован в буфер обмена.');
                        }}
                      >
                        Скопировать
                      </button>
                      <button type="button" className="ghost small" onClick={handleExportWiki}>
                        Скачать
                      </button>
                    </div>
                  </div>
                  <div className="wiki-preview-wrap">
                    <button
                      type="button"
                      className="icon-button wiki-copy-btn"
                      aria-label="Скопировать Wiki"
                      title="Скопировать Wiki"
                      onClick={() => {
                        void copyToClipboard(wikiOutput);
                        setToastMessage('Wiki текст скопирован в буфер обмена.');
                      }}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <rect x="9" y="9" width="10" height="10" rx="2" />
                        <rect x="5" y="5" width="10" height="10" rx="2" />
                      </svg>
                    </button>
                    <textarea className="code wiki-preview-code" readOnly value={wikiOutput} rows={24} />
                  </div>
                </section>
              )}
              </div>
            </>
          ) : (
            <div className="muted">Секция не выбрана</div>
          )}
        </main>
      </div>
    </div>
  );
}



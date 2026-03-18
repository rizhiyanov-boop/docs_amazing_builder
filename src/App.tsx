import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './App.css';
import { parseCurlMeta, parseToRows } from './parsers';
import { getDiagramExportFileName, getDiagramImageUrl, getPlantUmlImageUrl, resolveDiagramEngine } from './diagramUtils';
import { ERROR_CATALOG, ERROR_CATALOG_BY_CODE, POPULAR_HTTP_STATUS_CODES } from './errorCatalog';
import { getRequestColumnLabel, getRequestColumnOrder, moveRequestColumn } from './requestColumns';
import {
  DEFAULT_API_KEY_EXAMPLE,
  DEFAULT_API_KEY_HEADER,
  DEFAULT_BASIC_PASSWORD,
  DEFAULT_BASIC_USERNAME,
  DEFAULT_BEARER_TOKEN_EXAMPLE,
  getEditorRequestRows,
  getInputDriftRows,
  getMappedClientField,
  getMappingOptions,
  getParsedRowKey,
  getRequestHeaderRows,
  getPreviouslyUsedClientKeys,
  isAuthHeader,
  isDefaultRequestHeader,
  isRequestMappingRow,
  OPTIONAL_MARK
} from './requestHeaders';
import { renderHtmlDocument } from './renderHtml';
import { editorElementToWikiText, escapeRichTextHtml, richTextToHtml } from './richText';
import { renderWikiDocument } from './renderWiki';
import { DEFAULT_SECTION_TITLE, resolveSectionTitle, sanitizeSections } from './sectionTitles';
import { buildInputFromRows } from './sourceSync';
import { applyThemeToRoot } from './theme';
import type { ThemeName } from './theme';
import type {
  DiagramItem,
  DiagramSection,
  DocSection,
  ErrorRow,
  ErrorsSection,
  ParsedRow,
  ParsedSection,
  ParsedSectionType,
  ParseFormat,
  ProjectData,
  RequestAuthType,
  RequestColumnKey,
  RequestMethod,
  ValidationRuleRow
} from './types';

const STORAGE_KEY = 'doc-builder-project-v2';

type TabKey = 'editor' | 'html' | 'wiki';
type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';
type ParseTarget = 'server' | 'client';

type AutosaveInfo = { state: AutosaveState; at?: string };
type TableValidation = Map<string, string>;
type EditableFieldState = {
  sectionId: string;
  rowKey: string;
  draft: string;
};
type EditableRequestCellState = {
  sectionId: string;
  rowKey: string;
  column: 'type' | 'required' | 'description' | 'example';
  draft: string;
};
type EditableSourceState = {
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
type EditableFieldOptions = {
  allowEdit?: boolean;
  onDelete?: () => void;
};

const TYPE_OPTIONS_COMMON = ['string', 'int', 'long', 'boolean', 'number', 'object', 'array', 'array_object', 'null'];
const TYPE_OPTIONS_EXTENDED = [
  'short',
  'float',
  'double',
  'decimal',
  'date',
  'datetime',
  'timestamp',
  'uuid',
  'enum',
  'map',
  'binary',
  'file',
  'array_string',
  'array_int',
  'array_long',
  'array_number',
  'array_boolean',
  'array_array',
  'array_null'
];
const REQUIRED_OPTIONS = ['+', OPTIONAL_MARK, '-'];
const STRUCTURED_EXAMPLE_PLACEHOLDER = '-';
const VALIDATION_CASE_OPTIONS = [
  'Отсутствует обязательное поле',
  'Поле не должно быть пустым',
  'Некорректный тип данных',
  'Неверный формат значения (regex)',
  'Длина строки вне допустимого диапазона',
  'Числовое значение вне допустимого диапазона',
  'Значение не входит в допустимый список',
  'Значение должно быть уникальным',
  'Некорректный формат даты/времени',
  'Неверный диапазон даты/времени',
  'Нарушена межпараметрическая валидация',
  'Нарушено бизнес-правило',
  'Неподдерживаемое значение',
  'Некорректная структура payload',
  'Ошибка проверки контрольной суммы/подписи'
];
type AddableBlockType = 'text' | 'request' | 'response' | 'error-logic' | 'diagram';

const ADDABLE_BLOCK_TYPES: Array<{ type: AddableBlockType; label: string }> = [
  { type: 'text', label: 'Текстовый блок' },
  { type: 'request', label: 'Request блок' },
  { type: 'response', label: 'Response блок' },
  { type: 'error-logic', label: 'Логика обработки ошибок' },
  { type: 'diagram', label: 'Диаграмма' }
];
const AUTO_SECTION_TITLE_BASE: Record<AddableBlockType, string> = {
  text: 'Текстовый блок',
  request: 'Request блок',
  response: 'Response блок',
  'error-logic': 'Логика обработки ошибок',
  diagram: 'Диаграмма'
};

function usesStructuredPlaceholder(type: string): boolean {
  return ['object', 'array', 'array_object'].includes(type);
}

function createAutoSectionTitle(sections: DocSection[], type: AddableBlockType): string {
  const baseTitle = AUTO_SECTION_TITLE_BASE[type];
  const escapedBase = baseTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`^${escapedBase}(?:\\s+(\\d+))?$`);

  const nextIndex =
    sections.reduce((maxValue, section) => {
      const match = resolveSectionTitle(section.title).match(matcher);
      if (!match) return maxValue;
      const index = match[1] ? Number(match[1]) : 1;
      return Math.max(maxValue, index);
    }, 0) + 1;

  return `${baseTitle} ${nextIndex}`;
}

function createTextSection(id = `custom-${Date.now()}`, title = DEFAULT_SECTION_TITLE): DocSection {
  return { id, title, enabled: true, kind: 'text', value: '' };
}

function createParsedSection(sectionType: ParsedSectionType, id = `custom-${sectionType}-${Date.now()}`): ParsedSection {
  const isRequest = sectionType === 'request';

  return {
    id,
    title: sectionType === 'request' ? 'Request' : sectionType === 'response' ? 'Response' : DEFAULT_SECTION_TITLE,
    enabled: true,
    kind: 'parsed',
    sectionType,
    format: isRequest ? 'curl' : 'json',
    lastSyncedFormat: isRequest ? 'curl' : 'json',
    input: '',
    rows: [],
    error: '',
    domainModelEnabled: sectionType !== 'generic' ? false : undefined,
    clientFormat: sectionType !== 'generic' ? 'json' : undefined,
    clientLastSyncedFormat: sectionType !== 'generic' ? 'json' : undefined,
    clientInput: sectionType !== 'generic' ? '' : undefined,
    clientRows: sectionType !== 'generic' ? [] : undefined,
    clientError: sectionType !== 'generic' ? '' : undefined,
    clientMappings: sectionType !== 'generic' ? {} : undefined,
    authType: isRequest ? 'none' : undefined,
    authHeaderName: isRequest ? DEFAULT_API_KEY_HEADER : undefined,
    authTokenExample: isRequest ? DEFAULT_BEARER_TOKEN_EXAMPLE : undefined,
    authUsername: isRequest ? DEFAULT_BASIC_USERNAME : undefined,
    authPassword: isRequest ? DEFAULT_BASIC_PASSWORD : undefined,
    authApiKeyExample: isRequest ? DEFAULT_API_KEY_EXAMPLE : undefined,
    requestUrl: isRequest ? '' : undefined,
    requestMethod: isRequest ? 'POST' : undefined,
    requestProtocol: isRequest ? 'REST' : undefined,
    externalRequestUrl: isRequest ? '' : undefined,
    externalRequestMethod: isRequest ? 'POST' : undefined,
    externalAuthType: isRequest ? 'none' : undefined,
    externalAuthHeaderName: isRequest ? DEFAULT_API_KEY_HEADER : undefined,
    externalAuthTokenExample: isRequest ? DEFAULT_BEARER_TOKEN_EXAMPLE : undefined,
    externalAuthUsername: isRequest ? DEFAULT_BASIC_USERNAME : undefined,
    externalAuthPassword: isRequest ? DEFAULT_BASIC_PASSWORD : undefined,
    externalAuthApiKeyExample: isRequest ? DEFAULT_API_KEY_EXAMPLE : undefined
  };
}

function createDiagramItem(id = `diagram-item-${Date.now()}`): DiagramItem {
  return {
    id,
    title: '',
    engine: 'mermaid',
    code: '',
    description: ''
  };
}

function createDiagramSection(id = `custom-diagram-${Date.now()}`): DiagramSection {
  return {
    id,
    title: 'Диаграмма',
    enabled: true,
    kind: 'diagram',
    diagrams: [createDiagramItem()]
  };
}

function createErrorRow(): ErrorRow {
  return {
    clientHttpStatus: '',
    clientResponse: '',
    trigger: '',
    errorType: '-',
    serverHttpStatus: '',
    internalCode: '',
    message: ''
  };
}

function createValidationRuleRow(): ValidationRuleRow {
  return {
    parameter: '',
    validationCase: VALIDATION_CASE_OPTIONS[0],
    condition: '',
    cause: ''
  };
}

function createErrorsSection(id = 'errors', title = 'Ошибки'): ErrorsSection {
  return {
    id,
    title,
    enabled: true,
    kind: 'errors',
    rows: [createErrorRow()],
    validationRules: [createValidationRuleRow()]
  };
}

function createInitialSections(): DocSection[] {
  const processDiagramSection = createDiagramSection('process-diagram');
  processDiagramSection.title = 'Диаграмма процесса';

  return [
    { id: 'goal', title: 'Цель', enabled: true, kind: 'text', value: '', required: true },
    { id: 'functional', title: 'Функциональные требования', enabled: true, kind: 'text', value: '' },
    processDiagramSection,
    createParsedSection('request', 'request'),
    createParsedSection('response', 'response'),
    createErrorsSection('errors', 'Ошибки'),
    { id: 'non-functional', title: 'Нефункциональные требования', enabled: true, kind: 'text', value: '' }
  ];
}

function isRequestSection(section: ParsedSection): boolean {
  return section.sectionType === 'request';
}

function isResponseSection(section: ParsedSection): boolean {
  return section.sectionType === 'response';
}

function isDualModelSection(section: ParsedSection): boolean {
  return isRequestSection(section) || isResponseSection(section);
}

function getSectionSideLabel(section: ParsedSection, target: ParseTarget): string {
  const kind = isResponseSection(section) ? 'response' : 'request';
  return `${target === 'client' ? 'Client' : 'Server'} ${kind}`;
}

function getSectionRows(section: ParsedSection): ParsedRow[] {
  return isDualModelSection(section) ? getEditorRequestRows(section) : section.rows;
}

function getRequestHeaderRowsForEditor(section: ParsedSection): ParsedRow[] {
  return isRequestSection(section) ? getRequestHeaderRows(section) : [];
}

function getExternalRequestHeaderRowsForEditor(section: ParsedSection): ParsedRow[] {
  if (!isRequestSection(section)) return [];
  return [...(section.clientRows ?? []).filter((row) => row.source === 'header')].sort((left, right) => left.field.localeCompare(right.field));
}

function getExternalAuthHeaderRows(section: ParsedSection): ParsedRow[] {
  if (!isRequestSection(section)) return [];

  if (section.externalAuthType === 'bearer') {
    const tokenExample = section.externalAuthTokenExample?.trim() || DEFAULT_BEARER_TOKEN_EXAMPLE;
    return [{
      field: 'Authorization',
      sourceField: 'Authorization',
      origin: 'generated',
      enabled: true,
      type: 'string',
      required: '+',
      description: 'Авторизация: Bearer token',
      example: `Bearer ${tokenExample}`,
      source: 'header'
    }];
  }

  if (section.externalAuthType === 'basic') {
    return [{
      field: 'Authorization',
      sourceField: 'Authorization',
      origin: 'generated',
      enabled: true,
      type: 'string',
      required: '+',
      description: 'Авторизация: Basic auth',
      example: 'Basic <base64(username:password)>',
      source: 'header'
    }];
  }

  if (section.externalAuthType === 'api-key') {
    const headerName = section.externalAuthHeaderName?.trim() || DEFAULT_API_KEY_HEADER;
    const apiKeyExample = section.externalAuthApiKeyExample?.trim() || DEFAULT_API_KEY_EXAMPLE;
    return [{
      field: headerName,
      sourceField: headerName,
      origin: 'generated',
      enabled: true,
      type: 'string',
      required: '+',
      description: 'Авторизация: API key',
      example: apiKeyExample,
      source: 'header'
    }];
  }

  return [];
}

function getExternalSourceRows(section: ParsedSection): ParsedRow[] {
  const clientRows = section.clientRows ?? [];
  const authRows = getExternalAuthHeaderRows(section);
  const existingHeaderNames = new Set(clientRows.filter((row) => row.source === 'header').map((row) => row.field.trim().toLowerCase()));
  const nextRows = [...clientRows];

  for (const authRow of authRows) {
    if (!existingHeaderNames.has(authRow.field.trim().toLowerCase())) {
      nextRows.unshift(authRow);
    }
  }

  return nextRows;
}

function validateSection(section: DocSection): string {
  if (section.kind === 'errors') return '';

  if (section.kind === 'diagram') {
    const hasContent = section.diagrams.some((diagram) => diagram.code.trim());
    if (!hasContent) return '';
    const invalid = section.diagrams.find((diagram) => !diagram.code.trim());
    if (invalid) return 'Заполните код всех добавленных диаграмм или удалите пустые';
    return '';
  }

  if (section.kind !== 'parsed') return '';

  if (isDualModelSection(section)) {
    const hasServerInput = Boolean(section.input.trim());
    const hasClientInput = section.domainModelEnabled ? Boolean(section.clientInput?.trim()) : false;

    if (section.error) return `Секция заблокирована: ${section.error}`;
    if (section.clientError) return `${getSectionSideLabel(section, 'client')} заблокирован: ${section.clientError}`;
    if (!hasServerInput && !hasClientInput && getSectionRows(section).length === 0) return '';
    if (getSectionRows(section).length === 0) return 'Нет распарсенных строк';
    return '';
  }

  if (!section.input.trim()) return 'Введите исходные данные для парсинга';
  if (section.error) return `Секция заблокирована: ${section.error}`;
  if (section.rows.length === 0) return 'Нет распарсенных строк';
  return '';
}

function asProjectData(sections: DocSection[]): ProjectData {
  return { version: 2, updatedAt: new Date().toISOString(), sections: sanitizeSections(sections) };
}

function loadProject(): DocSection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialSections();
    const parsed = JSON.parse(raw) as ProjectData;
    if (!parsed.sections || !Array.isArray(parsed.sections)) return createInitialSections();
    return sanitizeSections(parsed.sections);
  } catch {
    return createInitialSections();
  }
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadBlob(filename: string, blob: Blob): void {
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

function escapeCodeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function wrapCodeToken(kind: string, value: string): string {
  return `<span class="code-token ${kind}">${escapeCodeHtml(value)}</span>`;
}

function highlightJsonCode(value: string): string {
  let index = 0;
  let result = '';

  while (index < value.length) {
    const char = value[index];

    if (char === '"') {
      let end = index + 1;
      let escaped = false;
      while (end < value.length) {
        const current = value[end];
        if (current === '"' && !escaped) break;
        escaped = current === '\\' && !escaped;
        if (current !== '\\') escaped = false;
        end += 1;
      }

      const token = value.slice(index, Math.min(end + 1, value.length));
      let lookahead = end + 1;
      while (lookahead < value.length && /\s/.test(value[lookahead])) lookahead += 1;
      const kind = value[lookahead] === ':' ? 'code-key' : 'code-string';
      result += wrapCodeToken(kind, token);
      index = Math.min(end + 1, value.length);
      continue;
    }

    if ('{}[]:,'.includes(char)) {
      result += wrapCodeToken('code-punctuation', char);
      index += 1;
      continue;
    }

    const literalMatch = value.slice(index).match(/^(true|false|null)\b/);
    if (literalMatch) {
      const token = literalMatch[1];
      const kind = token === 'null' ? 'code-null' : 'code-boolean';
      result += wrapCodeToken(kind, token);
      index += token.length;
      continue;
    }

    const numberMatch = value.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (numberMatch) {
      const token = numberMatch[0];
      result += wrapCodeToken('code-number', token);
      index += token.length;
      continue;
    }

    result += escapeCodeHtml(char);
    index += 1;
  }

  return result;
}

function highlightCurlCode(value: string): string {
  return escapeCodeHtml(value)
    .replace(/\b(curl)\b/g, '<span class="code-token code-keyword">$1</span>')
    .replace(/(^|\s)(--?[A-Za-z-]+)/g, '$1<span class="code-token code-flag">$2</span>')
    .replace(/(&quot;https?:\/\/.*?&quot;)/g, '<span class="code-token code-url">$1</span>')
    .replace(/(&quot;.*?&quot;|'.*?')/g, '<span class="code-token code-string">$1</span>');
}

function highlightCode(format: ParseFormat, value: string): string {
  if (format === 'json') return highlightJsonCode(value);
  return highlightCurlCode(value);
}

function isCustomSection(section: DocSection): boolean {
  return section.id.startsWith('custom-');
}

function getDuplicateValueSet(rows: ParsedRow[]): Set<string> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const value = row.field.trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([value]) => value)
  );
}

function typeRequiresJsonExample(type: string): boolean {
  return [
    'object',
    'map',
    'array',
    'array_object',
    'array_string',
    'array_int',
    'array_long',
    'array_number',
    'array_boolean',
    'array_array',
    'array_null'
  ].includes(type);
}

function validateExampleValue(example: string, type: string): string {
  const trimmed = example.trim();
  if (!trimmed) return '';
  if (usesStructuredPlaceholder(type) && trimmed === STRUCTURED_EXAMPLE_PLACEHOLDER) return '';

  const looksLikeJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
  const mustBeJson = typeRequiresJsonExample(type) || looksLikeJson;

  if (!mustBeJson) return '';

  try {
    const parsed = JSON.parse(trimmed);
    if (type.startsWith('array') && !Array.isArray(parsed)) {
      return 'Для выбранного типа пример должен быть JSON-массивом';
    }
    if ((type === 'object' || type === 'map' || type === 'array_object') && (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object')) {
      return 'Для выбранного типа пример должен быть JSON-объектом';
    }
    return '';
  } catch {
    return 'Пример должен быть валидным JSON';
  }
}

function validateJsonDraft(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const startsLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  const endsLikeJson = trimmed.endsWith('}') || trimmed.endsWith(']');
  if (!startsLikeJson && !endsLikeJson) return '';

  try {
    JSON.parse(trimmed);
    return '';
  } catch {
    return 'Client Response похож на JSON, но содержит ошибку синтаксиса';
  }
}

function getDynamicTextareaRows(value: string, minRows = 1, maxRows = 8): number {
  const normalized = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const lines = normalized.split('\n');
  const wrappedLineEstimate = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 56)), 0);
  return Math.max(minRows, Math.min(maxRows, wrappedLineEstimate));
}

function MermaidLivePreview({ code }: { code: string }): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let isActive = true;

    async function renderDiagram(): Promise<void> {
      const host = hostRef.current;
      if (!host) return;

      const source = code.trim();
      if (!source) {
        host.innerHTML = '';
        setError('');
        return;
      }

      try {
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;
        mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
        const graphId = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const { svg } = await mermaid.render(graphId, source);
        if (!isActive) return;
        host.innerHTML = svg;
        setError('');
      } catch (diagramError) {
        if (!isActive) return;
        host.innerHTML = '';
        setError(diagramError instanceof Error ? diagramError.message : 'Ошибка Mermaid рендера');
      }
    }

    void renderDiagram();

    return () => {
      isActive = false;
    };
  }, [code]);

  return (
    <div className="diagram-preview">
      <div ref={hostRef} className="diagram-preview-canvas" />
      {error && <div className="inline-error">{error}</div>}
    </div>
  );
}

export default function App() {
  const textSectionRef = useRef<HTMLDivElement | null>(null);
  const textSelectionRef = useRef<Range | null>(null);
  const textEditorSectionRef = useRef<string | null>(null);
  const diagramTextRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [sections, setSections] = useState<DocSection[]>(() => loadProject());
  const [selectedId, setSelectedId] = useState<string>(() => createInitialSections()[0].id);
  const [tab, setTab] = useState<TabKey>('editor');
  const [theme, setTheme] = useState<ThemeName>('light');
  const [autosave, setAutosave] = useState<AutosaveInfo>({ state: 'idle' });
  const [importError, setImportError] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<RequestColumnKey | null>(null);
  const [editingField, setEditingField] = useState<EditableFieldState | null>(null);
  const [editingRequestCell, setEditingRequestCell] = useState<EditableRequestCellState | null>(null);
  const [editingSource, setEditingSource] = useState<EditableSourceState | null>(null);
  const [sourceEditorError, setSourceEditorError] = useState('');
  const [requestCellError, setRequestCellError] = useState('');
  const [editingTitle, setEditingTitle] = useState<EditableTitleState | null>(null);
  const [expandedDriftAlerts, setExpandedDriftAlerts] = useState<DriftAlertState>({});
  const [expanderState, setExpanderState] = useState<ExpanderState>({});
  const [isAddBlockMenuOpen, setIsAddBlockMenuOpen] = useState(false);

  useEffect(() => {
    if (!sections.find((section) => section.id === selectedId) && sections[0]) {
      setSelectedId(sections[0].id);
    }
  }, [sections, selectedId]);

  useEffect(() => {
    setTab('editor');
  }, [selectedId]);

  const validationMap: TableValidation = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of sections) map.set(section.id, validateSection(section));
    return map;
  }, [sections]);

  const selectedSection = sections.find((section) => section.id === selectedId) ?? sections[0];
  const selectedServerDriftRows = selectedSection?.kind === 'parsed' ? getInputDriftRows(selectedSection.rows) : [];
  const selectedClientDriftRows =
    selectedSection?.kind === 'parsed' && isDualModelSection(selectedSection) ? getInputDriftRows(selectedSection.clientRows ?? []) : [];
  const selectedServerDuplicateValues = selectedSection?.kind === 'parsed' ? Array.from(getDuplicateValueSet(selectedSection.rows)) : [];
  const selectedClientDuplicateValues =
    selectedSection?.kind === 'parsed' && isDualModelSection(selectedSection) ? Array.from(getDuplicateValueSet(selectedSection.clientRows ?? [])) : [];
  const selectedServerFormatDrift =
    selectedSection?.kind === 'parsed' ? Boolean(selectedSection.rows.length > 0 && selectedSection.lastSyncedFormat && selectedSection.lastSyncedFormat !== selectedSection.format) : false;
  const selectedClientFormatDrift =
    selectedSection?.kind === 'parsed' && isDualModelSection(selectedSection)
      ? Boolean((selectedSection.clientRows ?? []).length > 0 && selectedSection.clientLastSyncedFormat && selectedSection.clientLastSyncedFormat !== (selectedSection.clientFormat ?? 'json'))
      : false;

  const htmlPreviewOutput = useMemo(() => renderHtmlDocument(sections, theme, { interactive: false }), [sections, theme]);
  const wikiOutput = useMemo(() => renderWikiDocument(sections), [sections]);

  useEffect(() => {
    applyThemeToRoot(theme);
  }, [theme]);

  useEffect(() => {
    setAutosave({ state: 'saving' });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(asProjectData(sections)));
      setAutosave({ state: 'saved', at: formatTime(new Date()) });
    } catch {
      setAutosave({ state: 'error' });
    }
  }, [sections]);

  useEffect(() => {
    if (!selectedSection || selectedSection.kind !== 'text') {
      textEditorSectionRef.current = null;
      return;
    }

    const editor = textSectionRef.current;
    if (!editor) return;

    const nextHtml = richTextToHtml(selectedSection.value);
    const sameSection = textEditorSectionRef.current === selectedSection.id;
    const isFocused = document.activeElement === editor;

    if (!sameSection || !isFocused) {
      if (editor.innerHTML !== nextHtml) editor.innerHTML = nextHtml;
    }

    textEditorSectionRef.current = selectedSection.id;
  }, [selectedSection]);

  useEffect(() => {
    const focusedElement = document.activeElement;

    for (const section of sections) {
      if (section.kind !== 'diagram') continue;

      for (const diagram of section.diagrams) {
        const editorKey = `${section.id}:${diagram.id}`;
        const editor = diagramTextRefs.current[editorKey];
        if (!editor || editor === focusedElement) continue;

        const nextHtml = richTextToHtml(diagram.description ?? '');
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

  function addSectionByType(type: AddableBlockType): void {
    const nextSection =
      type === 'text' || type === 'error-logic'
        ? createTextSection(undefined, AUTO_SECTION_TITLE_BASE[type])
        : type === 'diagram'
          ? createDiagramSection()
        : createParsedSection(type);
    setSections((prev) => {
      nextSection.title = createAutoSectionTitle(prev, type);
      return [...prev, nextSection];
    });
    setSelectedId(nextSection.id);
    setIsAddBlockMenuOpen(false);
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
                  message: preset?.message ?? row.message
                }
              : row
          )
        };
      }

      const validationErrorRow: ErrorRow = {
        clientHttpStatus: '-',
        clientResponse: '',
        trigger: 'Ошибка валидации',
        errorType: 'BusinessException',
        serverHttpStatus: preset?.httpStatus ?? '400',
        internalCode: '100101',
        message: preset?.message ?? 'Bad request sent to the system'
      };

      const isSingleEmptyRow =
        section.rows.length === 1 &&
        !section.rows[0].clientHttpStatus.trim() &&
        !section.rows[0].clientResponse.trim() &&
        !section.rows[0].trigger.trim() &&
        section.rows[0].errorType === '-' &&
        !section.rows[0].serverHttpStatus.trim() &&
        !section.rows[0].internalCode.trim() &&
        !section.rows[0].message.trim();

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

  function applyInternalCode(sectionId: string, rowIndex: number, internalCode: string): void {
    updateErrorRow(sectionId, rowIndex, (row) => {
      const normalizedCode = internalCode.trim();
      const preset = ERROR_CATALOG_BY_CODE.get(normalizedCode);
      if (!preset) {
        return {
          ...row,
          internalCode: normalizedCode,
          serverHttpStatus: '',
          message: ''
        };
      }
      return {
        ...row,
        internalCode: normalizedCode,
        serverHttpStatus: preset.httpStatus,
        message: preset.message
      };
    });
  }

  function insertJsonResponse(sectionId: string, rowIndex: number): void {
    updateErrorRow(sectionId, rowIndex, (row) => {
      const trimmed = row.clientResponse.trim();
      if (!trimmed) return { ...row, clientResponse: '{\n  \n}' };

      try {
        return { ...row, clientResponse: JSON.stringify(JSON.parse(trimmed), null, 2) };
      } catch {
        return row;
      }
    });
  }

  function runParser(section: ParsedSection, target: ParseTarget = 'server'): void {
    const format = target === 'client' ? section.clientFormat ?? 'json' : section.format;
    const input = target === 'client' ? section.clientInput ?? '' : section.input;

    try {
      const rows = parseToRows(format, input);
      const curlMeta = isRequestSection(section) && format === 'curl' ? parseCurlMeta(input) : null;
      updateSection(section.id, (current) => {
        if (current.kind !== 'parsed') return current;
        if (target === 'client' && isDualModelSection(current)) {
          return {
            ...current,
            clientRows: rows,
            clientError: '',
            clientLastSyncedFormat: current.clientFormat ?? 'json',
            externalRequestUrl: isRequestSection(current) ? curlMeta?.url ?? current.externalRequestUrl ?? '' : current.externalRequestUrl,
            externalRequestMethod: isRequestSection(current) ? curlMeta?.method ?? current.externalRequestMethod ?? 'POST' : current.externalRequestMethod
          };
        }
        return {
          ...current,
          rows,
          error: '',
          lastSyncedFormat: current.format,
          requestUrl: isRequestSection(current) ? curlMeta?.url ?? current.requestUrl ?? '' : current.requestUrl,
          requestMethod: isRequestSection(current) ? curlMeta?.method ?? current.requestMethod ?? 'POST' : current.requestMethod
        };
      });
    } catch (error) {
      updateSection(section.id, (current) => {
        if (current.kind !== 'parsed') return current;
        const message = error instanceof Error ? error.message : 'Ошибка парсинга';
        if (target === 'client' && isDualModelSection(current)) {
          return { ...current, clientRows: [], clientError: message };
        }
        return { ...current, rows: [], error: message };
      });
    }
  }

  function exportProjectJson(): void {
    downloadText('doc-project.json', JSON.stringify(asProjectData(sections), null, 2));
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Failed to convert blob to data URL'));
      reader.readAsDataURL(blob);
    });
  }

  async function buildEmbeddedDiagramImageMap(): Promise<Record<string, string>> {
    const diagramSections = sections.filter((section): section is DiagramSection => section.kind === 'diagram');
    const imageMap: Record<string, string> = {};

    for (const section of diagramSections) {
      const diagrams = section.diagrams.filter((diagram) => diagram.code.trim());

      for (let index = 0; index < diagrams.length; index += 1) {
        const diagram = diagrams[index];
        const fileName = getDiagramExportFileName(resolveSectionTitle(section.title), section.id, diagram.title, index, 'jpeg');
        try {
          const imageUrl = getDiagramImageUrl(resolveDiagramEngine(diagram.code, diagram.engine), diagram.code, 'jpeg');
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

  async function exportDiagramJpegs(): Promise<Set<string>> {
    const diagramSections = sections.filter((section): section is DiagramSection => section.kind === 'diagram');
    const downloadedFiles = new Set<string>();

    for (const section of diagramSections) {
      const diagrams = section.diagrams.filter((diagram) => diagram.code.trim());

      for (let index = 0; index < diagrams.length; index += 1) {
        const diagram = diagrams[index];
        try {
          const imageUrl = getDiagramImageUrl(resolveDiagramEngine(diagram.code, diagram.engine), diagram.code, 'jpeg');
          const response = await fetch(imageUrl);
          if (!response.ok) continue;
          const blob = await response.blob();
          const fileName = getDiagramExportFileName(resolveSectionTitle(section.title), section.id, diagram.title, index, 'jpeg');
          downloadBlob(fileName, blob);
          downloadedFiles.add(fileName);
        } catch {
          // Skip broken diagram export and continue for remaining diagrams.
        }
      }
    }

    return downloadedFiles;
  }

  async function handleExportHtml(): Promise<void> {
    const diagramImageMap = await buildEmbeddedDiagramImageMap();
    const htmlForExport = renderHtmlDocument(sections, theme, {
      interactive: true,
      diagramImageSource: 'remote',
      diagramImageMap
    });
    downloadText('documentation.html', htmlForExport);
  }

  async function handleExportWiki(): Promise<void> {
    await exportDiagramJpegs();
    downloadText('documentation.wiki', wikiOutput);
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

  function importProjectJson(file: File | undefined): void {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const parsed = JSON.parse(text) as ProjectData;
        if (!parsed.sections || !Array.isArray(parsed.sections)) throw new Error('Неверный формат');
        const sanitizedSections = sanitizeSections(parsed.sections);
        setSections(sanitizedSections);
        setSelectedId(sanitizedSections[0]?.id ?? selectedId);
        setImportError('');
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'Ошибка импорта');
      }
    };
    reader.readAsText(file);
  }

  function resetProject(): void {
    if (!confirm('Сбросить проект? Все несохраненные данные будут потеряны.')) return;
    const seed = createInitialSections();
    setSections(seed);
    setSelectedId(seed[0].id);
    localStorage.removeItem(STORAGE_KEY);
  }

  function syncTextSectionFromEditor(sectionId: string): void {
    const editor = textSectionRef.current;
    if (!editor) return;
    const nextValue = editorElementToWikiText(editor);
    updateSection(sectionId, (current) => (current.kind === 'text' && current.value !== nextValue ? { ...current, value: nextValue } : current));
  }

  function getDiagramEditorKey(sectionId: string, diagramId: string): string {
    return `${sectionId}:${diagramId}`;
  }

  function syncDiagramDescriptionFromEditor(sectionId: string, diagramId: string): void {
    const editor = diagramTextRefs.current[getDiagramEditorKey(sectionId, diagramId)];
    if (!editor) return;
    const nextValue = editorElementToWikiText(editor);
    updateDiagram(sectionId, diagramId, (current) => ({ ...current, description: nextValue }));
  }

  function applyDiagramTextCommand(
    sectionId: string,
    diagramId: string,
    action: 'bold' | 'italic' | 'code' | 'h3' | 'ul' | 'ol' | 'quote'
  ): void {
    const editor = diagramTextRefs.current[getDiagramEditorKey(sectionId, diagramId)];
    if (!editor) return;

    editor.focus();

    if (action === 'bold') document.execCommand('bold');
    if (action === 'italic') document.execCommand('italic');
    if (action === 'ul') document.execCommand('insertUnorderedList');
    if (action === 'ol') document.execCommand('insertOrderedList');
    if (action === 'h3') document.execCommand('formatBlock', false, 'h3');
    if (action === 'quote') document.execCommand('formatBlock', false, 'blockquote');
    if (action === 'code') {
      const selection = window.getSelection()?.toString() || 'code';
      document.execCommand('insertHTML', false, `<code>${escapeRichTextHtml(selection)}</code>`);
    }

    syncDiagramDescriptionFromEditor(sectionId, diagramId);
  }

  function rememberTextSelection(): void {
    const editor = textSectionRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    textSelectionRef.current = range.cloneRange();
  }

  function restoreTextSelection(): void {
    const selection = window.getSelection();
    const range = textSelectionRef.current;
    const editor = textSectionRef.current;
    if (!selection || !range || !editor) return;

    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();
  }

  function applyTextEditorCommand(sectionId: string, action: 'bold' | 'italic' | 'code' | 'h3' | 'ul' | 'ol' | 'quote'): void {
    const editor = textSectionRef.current;
    if (!editor) return;

    restoreTextSelection();

    if (action === 'bold') document.execCommand('bold');
    if (action === 'italic') document.execCommand('italic');
    if (action === 'ul') document.execCommand('insertUnorderedList');
    if (action === 'ol') document.execCommand('insertOrderedList');
    if (action === 'h3') document.execCommand('formatBlock', false, 'h3');
    if (action === 'quote') document.execCommand('formatBlock', false, 'blockquote');
    if (action === 'code') {
      const selection = window.getSelection()?.toString() || 'code';
      document.execCommand('insertHTML', false, `<code>${escapeRichTextHtml(selection)}</code>`);
    }
    rememberTextSelection();
    syncTextSectionFromEditor(sectionId);
  }

  function addManualRow(section: ParsedSection, target: ParseTarget = 'server'): void {
    const manualRow: ParsedRow = {
      field: `newField${Date.now()}`,
      origin: 'manual',
      type: 'string',
      required: OPTIONAL_MARK,
      description: '',
      example: '',
      source: isDualModelSection(section) ? 'body' : 'parsed'
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
    const manualHeader: ParsedRow = {
      field: `X-CUSTOM-${Date.now()}`,
      origin: 'manual',
      enabled: true,
      type: 'string',
      required: '-',
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
    const manualHeader: ParsedRow = {
      field: `X-CUSTOM-${Date.now()}`,
      origin: 'manual',
      enabled: true,
      type: 'string',
      required: '-',
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

  function deleteRequestHeader(sectionId: string, rowKey: string): void {
    updateSection(sectionId, (current) => {
      if (current.kind !== 'parsed' || !isRequestSection(current)) return current;
      return { ...current, rows: current.rows.filter((row) => getParsedRowKey(row) !== rowKey) };
    });
  }

  function deleteExternalRequestHeader(sectionId: string, rowKey: string): void {
    updateSection(sectionId, (current) => {
      if (current.kind !== 'parsed' || !isRequestSection(current)) return current;
      return { ...current, clientRows: (current.clientRows ?? []).filter((row) => getParsedRowKey(row) !== rowKey) };
    });
  }

  function deleteParsedRow(sectionId: string, rowKey: string, target: ParseTarget = 'server'): void {
    updateSection(sectionId, (current) => {
      if (current.kind !== 'parsed') return current;

      if (target === 'client' && isDualModelSection(current)) {
        return { ...current, clientRows: (current.clientRows ?? []).filter((row) => getParsedRowKey(row) !== rowKey) };
      }

      return { ...current, rows: current.rows.filter((row) => getParsedRowKey(row) !== rowKey) };
    });
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
    return target === 'client' && isDualModelSection(section) ? section.clientFormat ?? 'json' : section.format;
  }

  function detectSourceFormat(draft: string): ParseFormat | null {
    const trimmed = draft.trim();
    if (!trimmed) return null;

    if (/^curl(?:\s|$)/i.test(trimmed)) return 'curl';

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {
        return null;
      }
    }

    return null;
  }

  function applyDetectedSourceFormat(sectionId: string, target: ParseTarget, draft: string, currentFormat: ParseFormat): ParseFormat {
    const detectedFormat = detectSourceFormat(draft);
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

  function startFieldEditing(section: ParsedSection, row: ParsedRow): void {
    if (!row.field.trim()) return;
    setEditingField({
      sectionId: section.id,
      rowKey: getParsedRowKey(row),
      draft: row.field
    });
  }

  function cancelFieldEditing(): void {
    setEditingField(null);
  }

  function startRequestCellEditing(section: ParsedSection, row: ParsedRow, column: 'type' | 'required' | 'description' | 'example'): void {
    if (!row.field.trim()) return;
    setRequestCellError('');
    setEditingRequestCell({
      sectionId: section.id,
      rowKey: getParsedRowKey(row),
      column,
      draft: row[column] || ''
    });
  }

  function cancelRequestCellEditing(): void {
    setEditingRequestCell(null);
    setRequestCellError('');
  }

  function applyRequestCellValue(
    sectionId: string,
    rowKey: string,
    column: 'type' | 'required' | 'description' | 'example',
    draft: string
  ): boolean {
    if (column === 'example') {
      const section = sections.find((item) => item.id === sectionId);
      const row = section?.kind === 'parsed' ? section.rows.find((item) => getParsedRowKey(item) === rowKey) : undefined;
      const message = validateExampleValue(draft, row?.type ?? 'string');
      if (message) {
        setRequestCellError(message);
        return false;
      }
    }

    updateServerRow(sectionId, rowKey, (current) => {
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

    const { sectionId, rowKey, column, draft } = editingRequestCell;
    const saved = applyRequestCellValue(sectionId, rowKey, column, draft);
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

    setEditingField(null);
  }

  function renderEditableFieldCell(section: ParsedSection, row: ParsedRow, options: EditableFieldOptions = {}): ReactNode {
    const allowEdit = options.allowEdit ?? true;
    if (!row.field.trim()) return '—';

    const isEditing =
      editingField?.sectionId === section.id &&
      editingField.rowKey === getParsedRowKey(row);

    if (isEditing) {
      return (
        <div className="field-edit">
          <input
            type="text"
            autoFocus
            value={editingField.draft}
            onChange={(e) => setEditingField((current) => (current ? { ...current, draft: e.target.value } : current))}
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
      <div className="field-display" onDoubleClick={() => allowEdit && startFieldEditing(section, row)}>
        <span>{row.field}</span>
        <span className="field-actions">
          {allowEdit && (
            <button className="icon-button" type="button" onClick={() => startFieldEditing(section, row)} aria-label="Редактировать поле">
              ✎
            </button>
          )}
          {options.onDelete && (
            <button className="icon-button danger" type="button" onClick={options.onDelete} aria-label="Удалить поле">
              ×
            </button>
          )}
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
              autoFocus
              value={editingRequestCell.draft}
              onChange={(e) => {
                const nextValue = e.target.value;
                setEditingRequestCell((current) => (current ? { ...current, draft: nextValue } : current));
                if (applyRequestCellValue(section.id, getParsedRowKey(row), 'type', nextValue)) {
                  setEditingRequestCell(null);
                }
              }}
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
              autoFocus
              value={editingRequestCell.draft}
              onChange={(e) => {
                const nextValue = e.target.value;
                setEditingRequestCell((current) => (current ? { ...current, draft: nextValue } : current));
                if (applyRequestCellValue(section.id, getParsedRowKey(row), 'required', nextValue)) {
                  setEditingRequestCell(null);
                }
              }}
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
            autoFocus
            value={editingRequestCell.draft}
            onChange={(e) => setEditingRequestCell((current) => (current ? { ...current, draft: e.target.value } : current))}
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
    const canEdit = Boolean(row.field.trim());

    return (
      <div className="field-display" onDoubleClick={() => canEdit && startRequestCellEditing(section, row, column)}>
        <span>{value}</span>
        <span className="field-actions">
          <button className="icon-button" type="button" onClick={() => startRequestCellEditing(section, row, column)} aria-label="Редактировать ячейку">
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
      example: row.example || '—'
    } satisfies Record<RequestColumnKey, string>;

    if (column === 'clientField' && isRequestMappingRow(row) && section.domainModelEnabled) {
      const options = getMappingOptions(section, row.field);
      const previouslyUsedKeys = getPreviouslyUsedClientKeys(section, row);
      const primaryOptions = options.filter((option) => !previouslyUsedKeys.has(getParsedRowKey(option)));
      const previouslyUsedOptions = options.filter((option) => previouslyUsedKeys.has(getParsedRowKey(option)));
      const mappedValue = getMappedClientField(section, row);

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
                  delete nextMappings[getParsedRowKey(row)];
                  return { ...current, clientMappings: nextMappings };
                })
              }
            >
              ×
            </button>
          )}
        </div>
      );
    }

    if (column === 'field') {
      const canDelete = row.source !== 'header' && row.source !== 'url';
      return renderEditableFieldCell(section, row, canDelete ? { onDelete: () => deleteParsedRow(section.id, getParsedRowKey(row), 'server') } : {});
    }

    if (column === 'type' || column === 'required' || column === 'description' || column === 'example') {
      return renderEditableRequestCell(section, row, column);
    }

    return cellMap[column];
  }

  function renderParsedTable(section: ParsedSection) {
    const rows = getSectionRows(section);
    const duplicateFieldSet = getDuplicateValueSet(section.rows.filter((row) => row.source !== 'header'));
    const duplicateClientFieldSet = isDualModelSection(section) ? getDuplicateValueSet(section.clientRows ?? []) : new Set<string>();

    if (isDualModelSection(section)) {
      const columns = getRequestColumnOrder(section, rows);

      if (rows.length === 0) {
        return (
          <div className="table-wrap table-wrap-empty">
            <div className="muted">Таблица пока пустая</div>
            <div className="table-actions">
              <button className="ghost small" type="button" onClick={() => addManualRow(section, 'server')}>
                + Параметр
              </button>
              {section.domainModelEnabled && (
                <button className="ghost small" type="button" onClick={() => addManualRow(section, 'client')}>
                  + Client параметр
                </button>
              )}
            </div>
          </div>
        );
      }

      return (
        <div className="table-wrap">
          <table>
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
                    {getRequestColumnLabel(section, column)}
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
            <button className="ghost small" type="button" onClick={() => addManualRow(section, 'server')}>
              + Параметр
            </button>
            {section.domainModelEnabled && (
              <button className="ghost small" type="button" onClick={() => addManualRow(section, 'client')}>
                + Client параметр
              </button>
            )}
          </div>
        </div>
      );
    }

    if (rows.length === 0) return <div className="muted">Нет распарсенных строк</div>;

    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Поле</th>
              <th>Тип</th>
              <th>Обязательность</th>
              <th>Описание</th>
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
                <td className="mono">{row.example || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderRequestHeadersTable(section: ParsedSection, target: ParseTarget = 'server'): ReactNode {
    const isExternal = target === 'client';
    const headers = isExternal ? getExternalRequestHeaderRowsForEditor(section) : getRequestHeaderRowsForEditor(section);

    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Вкл.</th>
              <th>Header</th>
              <th>Обязательность</th>
              <th>Описание</th>
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
                        ? { allowEdit: false }
                        : {
                            onDelete: () => (isExternal ? deleteExternalRequestHeader(section.id, rowKey) : deleteRequestHeader(section.id, rowKey))
                          }
                    )}
                  </td>
                  <td>{row.required || '—'}</td>
                  <td>
                    {isAuto || isDefault ? (
                      row.description || '—'
                    ) : (
                      <input
                        type="text"
                        value={isPersisted ? persistedRows.find((item) => getParsedRowKey(item) === rowKey)?.description ?? row.description : row.description}
                        onChange={(e) =>
                          isExternal
                            ? updateSection(section.id, (current) => {
                                if (current.kind !== 'parsed' || !isRequestSection(current)) return current;
                                return {
                                  ...current,
                                  clientRows: (current.clientRows ?? []).map((item) =>
                                    getParsedRowKey(item) === rowKey ? { ...item, description: e.target.value } : item
                                  )
                                };
                              })
                            : updateServerRow(section.id, rowKey, (current) => ({ ...current, description: e.target.value }))
                        }
                      />
                    )}
                  </td>
                  <td className="mono">
                    {isAuto || isDefault ? (
                      row.example || '—'
                    ) : (
                      <input
                        type="text"
                        value={isPersisted ? persistedRows.find((item) => getParsedRowKey(item) === rowKey)?.example ?? row.example : row.example}
                        onChange={(e) =>
                          isExternal
                            ? updateSection(section.id, (current) => {
                                if (current.kind !== 'parsed' || !isRequestSection(current)) return current;
                                return {
                                  ...current,
                                  clientRows: (current.clientRows ?? []).map((item) =>
                                    getParsedRowKey(item) === rowKey ? { ...item, example: e.target.value } : item
                                  )
                                };
                              })
                            : updateServerRow(section.id, rowKey, (current) => ({ ...current, example: e.target.value }))
                        }
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="table-actions">
          <button className="ghost small" type="button" onClick={() => (isExternal ? addExternalRequestHeader(section) : addRequestHeader(section))}>
            + Header
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
    message = 'Параметры отличаются от исходного источника'
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
            Исправить источник
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
    const title = isExternal ? 'Авторизация внешнего запроса' : 'Авторизация';
    const blockId = isExternal ? 'auth-client' : 'auth-server';

    return (
      <details
        className="expander"
        open={isExpanderOpen(section.id, blockId)}
        onToggle={(e) => setExpanderOpen(section.id, blockId, e.currentTarget.open)}
      >
        <summary className="expander-summary">{title}</summary>
        <div className="expander-body">
          <label className="field">
            <div className="label">Способ</div>
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
              <div className="label">Пример токена</div>
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
                <div className="label">Логин</div>
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
                <div className="label">Пароль</div>
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
                <div className="label">Имя header</div>
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
                <div className="label">Пример API key</div>
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

          <div className="muted">Настройка автоматически попадет в headers и в итоговую документацию.</div>
        </div>
      </details>
    );
  }

  function renderRequestMetaEditor(section: ParsedSection, target: ParseTarget = 'server'): ReactNode {
    if (!isRequestSection(section)) return null;
    const isExternal = target === 'client';
    const title = isExternal ? 'Внешний вызов' : 'Общее описание метода';
    const urlLabel = isExternal ? 'Внешний URL' : 'URL метода';
    const blockId = isExternal ? 'meta-client' : 'meta-server';

    const applyRequestMeta = (patch: Partial<Pick<ParsedSection, 'requestUrl' | 'requestMethod' | 'externalRequestUrl' | 'externalRequestMethod'>>) => {
      updateSection(section.id, (current) => {
        if (current.kind !== 'parsed' || !isRequestSection(current)) return current;

        const next = { ...current, ...patch };
        const targetFormat = isExternal ? next.clientFormat ?? 'json' : next.format;
        if (targetFormat !== 'curl') return next;

        const syncRows = isExternal
          ? next.clientRows ?? []
          : [...getRequestHeaderRowsForEditor(next).filter((row) => row.enabled !== false), ...next.rows.filter((row) => row.source !== 'header')];

        return {
          ...next,
          ...(isExternal
            ? {
                clientInput: buildInputFromRows(targetFormat, getExternalSourceRows(next), {
                  requestUrl: next.externalRequestUrl,
                  requestMethod: next.externalRequestMethod
                }),
                clientLastSyncedFormat: targetFormat
              }
            : {
                input: buildInputFromRows(targetFormat, syncRows, {
                  requestUrl: next.requestUrl,
                  requestMethod: next.requestMethod
                }),
                lastSyncedFormat: targetFormat
              })
        };
      });
    };

    return (
      <details
        className="expander"
        open={isExpanderOpen(section.id, blockId)}
        onToggle={(e) => setExpanderOpen(section.id, blockId, e.currentTarget.open)}
      >
        <summary className="expander-summary">{title}</summary>
        <div className="expander-body">
          <div className="row gap auth-grid">
            <label className="field">
              <div className="label">{urlLabel}</div>
              <input
                type="text"
                value={isExternal ? section.externalRequestUrl ?? '' : section.requestUrl ?? ''}
                onChange={(e) => applyRequestMeta(isExternal ? { externalRequestUrl: e.target.value } : { requestUrl: e.target.value })}
                placeholder="https://api.example.com/v1/method"
              />
            </label>
            <label className="field">
              <div className="label">Тип метода</div>
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
              <div className="label">Протокол</div>
              <input type="text" value="REST" readOnly />
            </label>
          </div>
          <div className="muted">Для MVP протокол фиксирован как REST. URL и HTTP-метод автоматически используются при генерации cURL.</div>
        </div>
      </details>
    );
  }

  function renderSourceEditor(section: ParsedSection, target: ParseTarget, title = 'Исходные данные'): ReactNode {
    const format = getSourceFormat(section, target);
    const value = getSourceValue(section, target);
    const isEditing = editingSource?.sectionId === section.id && editingSource.target === target;
    const currentValue = isEditing ? editingSource.draft : value;
    const shouldOpenEmptyInput = !value.trim() && !isEditing;
    const hasSourceValue = Boolean(currentValue.trim());

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
              placeholder="Вставьте JSON или cURL"
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
              placeholder="Вставьте JSON или cURL"
              autoFocus
            />
            {sourceEditorError && <div className="inline-error">{sourceEditorError}</div>}
          </div>
        )}
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
          open={isExpanderOpen(section.id, 'source-server')}
          onToggle={(e) => setExpanderOpen(section.id, 'source-server', e.currentTarget.open)}
        >
          <summary className="expander-summary">{serverLabel}</summary>
          <div className="expander-body">
            <div className="row gap">
              <button className="primary" type="button" onClick={() => runParser(section, 'server')}>
                Парсить
              </button>
            </div>

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
                <div className="row gap">
                  <button className="primary" type="button" onClick={() => runParser(section, 'client')}>
                    Парсить
                  </button>
                </div>

                {renderSourceEditor(section, 'client', `${exampleLabel} (${clientLabel})`)}
              </div>
            </details>
          </>
        )}

        {section.error && <div className="alert error">{serverLabel}: {section.error}</div>}
        {section.clientError && <div className="alert error">{clientLabel}: {section.clientError}</div>}
        {requestCellError && <div className="alert error">{requestCellError}</div>}
        {renderParsedTable(section)}
      </div>
    );
  }

  function renderDiagramEditor(section: DiagramSection): ReactNode {
    return (
      <div className="stack">
        <div className="row gap">
          <button className="ghost small" type="button" onClick={() => addDiagram(section.id)}>
            + Диаграмма
          </button>
        </div>

        {section.diagrams.map((diagram, index) => {
          const blockId = `diagram-item-${diagram.id}`;
          const title = diagram.title.trim() || `Диаграмма ${index + 1}`;
          const effectiveEngine = resolveDiagramEngine(diagram.code, diagram.engine);

          return (
            <details
              key={diagram.id}
              className="expander"
              open={isExpanderOpen(section.id, blockId)}
              onToggle={(e) => setExpanderOpen(section.id, blockId, e.currentTarget.open)}
            >
              <summary className="expander-summary">{title}</summary>
              <div className="expander-body">
                <div className="diagram-header-row">
                  <label className="field">
                    <div className="label">Название</div>
                    <input
                      type="text"
                      value={diagram.title}
                      onChange={(e) => updateDiagram(section.id, diagram.id, (current) => ({ ...current, title: e.target.value }))}
                      placeholder="Например: Общий процесс"
                    />
                  </label>
                  <div className="badge">{effectiveEngine === 'plantuml' ? 'PLANTUML (AUTO)' : 'MERMAID (AUTO)'}</div>
                </div>

                <label className="field">
                  <div className="label">Код диаграммы</div>
                  <textarea
                    className="source-edit"
                    rows={10}
                    value={diagram.code}
                    onChange={(e) =>
                      updateDiagram(section.id, diagram.id, (current) => ({
                        ...current,
                        code: e.target.value,
                        engine: resolveDiagramEngine(e.target.value, current.engine)
                      }))
                    }
                    placeholder={effectiveEngine === 'mermaid' ? 'sequenceDiagram\nA->>B: Hello' : '@startuml\nAlice -> Bob: Hello\n@enduml'}
                  />
                </label>

                <div className="label">Предпросмотр</div>
                {!diagram.code.trim() && <div className="muted">Вставьте код диаграммы для предпросмотра</div>}
                {diagram.code.trim() && effectiveEngine === 'mermaid' && <MermaidLivePreview code={diagram.code} />}
                {diagram.code.trim() && effectiveEngine === 'plantuml' && (
                  <div className="diagram-preview">
                    <img className="diagram-preview-image" src={getPlantUmlImageUrl(diagram.code, 'svg')} alt={title} loading="lazy" />
                  </div>
                )}

                <div className="diagram-description-block">
                  <div className="label">Текст под диаграммой</div>
                  <div className="text-toolbar" role="toolbar" aria-label="Форматирование текста под диаграммой">
                    <div className="toolbar-group" aria-label="Базовое форматирование">
                      <button
                        className="ghost small toolbar-button"
                        type="button"
                        title="Жирный"
                        aria-label="Жирный"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'bold')}
                      >
                        <span className="toolbar-icon toolbar-icon-bold">B</span>
                      </button>
                      <button
                        className="ghost small toolbar-button"
                        type="button"
                        title="Курсив"
                        aria-label="Курсив"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'italic')}
                      >
                        <span className="toolbar-icon toolbar-icon-italic">I</span>
                      </button>
                      <button
                        className="ghost small toolbar-button"
                        type="button"
                        title="Код"
                        aria-label="Код"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'code')}
                      >
                        <span className="toolbar-icon">&lt;/&gt;</span>
                      </button>
                    </div>
                    <div className="toolbar-group" aria-label="Структура текста">
                      <button
                        className="ghost small toolbar-button"
                        type="button"
                        title="Подзаголовок"
                        aria-label="Подзаголовок"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'h3')}
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
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'quote')}
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
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'ul')}
                      >
                        <span className="toolbar-icon">•</span>
                      </button>
                      <button
                        className="ghost small toolbar-button"
                        type="button"
                        title="Нумерованный список"
                        aria-label="Нумерованный список"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'ol')}
                      >
                        <span className="toolbar-icon">1.</span>
                      </button>
                    </div>
                  </div>

                  <div
                    ref={(node) => {
                      diagramTextRefs.current[getDiagramEditorKey(section.id, diagram.id)] = node;
                    }}
                    className="rich-text-editor"
                    contentEditable
                    suppressContentEditableWarning
                    onInput={() => syncDiagramDescriptionFromEditor(section.id, diagram.id)}
                  />
                </div>

                <div className="row gap">
                  <button className="ghost small" type="button" onClick={() => deleteDiagram(section.id, diagram.id)}>
                    Удалить диаграмму
                  </button>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    );
  }

  function renderErrorsEditor(section: ErrorsSection): ReactNode {
    const serverRequestParameterOptions = Array.from(
      new Set(
        sections
          .filter((item): item is ParsedSection => item.kind === 'parsed' && item.sectionType === 'request')
          .flatMap((item) => getSectionRows(item))
          .map((row) => row.field.trim())
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right));

    return (
      <div className="stack">
        <datalist id="http-status-options">
          {POPULAR_HTTP_STATUS_CODES.map((code) => (
            <option key={code} value={code} />
          ))}
          <option value="-" />
        </datalist>

        <datalist id="internal-code-options">
          {ERROR_CATALOG.map((item) => (
            <option key={item.internalCode} value={item.internalCode} label={`${item.httpStatus} - ${item.message}`} />
          ))}
        </datalist>

        <datalist id="server-request-param-options">
          {serverRequestParameterOptions.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>Client HTTP Status</th>
                <th>Client Response</th>
                <th>Trigger (условия возникновения)</th>
                <th>Error Type</th>
                <th>Server HTTP Status</th>
                <th>Полный internalCode</th>
                <th>Server Response</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row, index) => {
                const clientResponseError = validateJsonDraft(row.clientResponse);
                const normalizedCode = row.internalCode.trim();
                const hasUnknownInternalCode = Boolean(normalizedCode) && !ERROR_CATALOG_BY_CODE.has(normalizedCode);

                return (
                <tr key={`${section.id}-error-${index}`}>
                  <td>{index + 1}</td>
                  <td>
                    <input
                      type="text"
                      list="http-status-options"
                      value={row.clientHttpStatus}
                      onChange={(e) => updateErrorRow(section.id, index, (current) => ({ ...current, clientHttpStatus: e.target.value }))}
                    />
                  </td>
                  <td>
                    <div className="error-response-cell">
                      <textarea
                        className={clientResponseError ? 'input-warning' : ''}
                        rows={getDynamicTextareaRows(row.clientResponse, 3, 10)}
                        value={row.clientResponse}
                        onChange={(e) => updateErrorRow(section.id, index, (current) => ({ ...current, clientResponse: e.target.value }))}
                      />
                      <button className="ghost small" type="button" onClick={() => insertJsonResponse(section.id, index)}>
                        + JSON
                      </button>
                      {clientResponseError && <div className="inline-error">{clientResponseError}</div>}
                    </div>
                  </td>
                  <td>
                    <textarea
                      rows={getDynamicTextareaRows(row.trigger, 2, 8)}
                      value={row.trigger}
                      onChange={(e) => updateErrorRow(section.id, index, (current) => ({ ...current, trigger: e.target.value }))}
                    />
                  </td>
                  <td>
                    <select
                      value={row.errorType}
                      onChange={(e) => updateErrorRow(section.id, index, (current) => ({ ...current, errorType: e.target.value as ErrorRow['errorType'] }))}
                    >
                      <option value="-">-</option>
                      <option value="CommonException">CommonException</option>
                      <option value="BusinessException">BusinessException</option>
                      <option value="AlertException">AlertException</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      disabled
                      value={row.serverHttpStatus}
                      title="Поле заполняется автоматически по internalCode"
                    />
                  </td>
                  <td>
                    <input
                      className={hasUnknownInternalCode ? 'input-warning' : ''}
                      type="text"
                      list="internal-code-options"
                      value={row.internalCode}
                      onChange={(e) => applyInternalCode(section.id, index, e.target.value)}
                      title={hasUnknownInternalCode ? 'Код не найден в каталоге, заполните поля вручную или уточните internalCode' : ''}
                    />
                    {hasUnknownInternalCode && <div className="inline-warning">Код не найден в каталоге</div>}
                  </td>
                  <td>
                    <input
                      type="text"
                      disabled
                      value={row.message}
                      title="Поле заполняется автоматически по internalCode"
                    />
                  </td>
                  <td>
                    <button className="icon-button danger" type="button" onClick={() => deleteErrorRow(section.id, index)} aria-label="Удалить строку">
                      ×
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <div className="table-actions">
            <button className="ghost small" type="button" onClick={() => addErrorRow(section.id)}>
              + Строка ошибки
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>Параметр (server request)</th>
                <th>Кейс валидации</th>
                <th>Условие возникновения</th>
                <th>cause</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {section.validationRules.map((rule, index) => (
                <tr key={`${section.id}-validation-${index}`}>
                  <td>{index + 1}</td>
                  <td>
                    <input
                      type="text"
                      list="server-request-param-options"
                      value={rule.parameter}
                      onChange={(e) => updateValidationRuleRow(section.id, index, (current) => ({ ...current, parameter: e.target.value }))}
                      placeholder="Выберите из server request или введите вручную"
                    />
                  </td>
                  <td>
                    <select
                      value={rule.validationCase}
                      onChange={(e) =>
                        updateValidationRuleRow(section.id, index, (current) => ({
                          ...current,
                          validationCase: e.target.value
                        }))
                      }
                    >
                      {VALIDATION_CASE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <textarea
                      rows={getDynamicTextareaRows(rule.condition, 1, 6)}
                      value={rule.condition}
                      onChange={(e) => updateValidationRuleRow(section.id, index, (current) => ({ ...current, condition: e.target.value }))}
                    />
                  </td>
                  <td>
                    <textarea
                      rows={getDynamicTextareaRows(rule.cause, 1, 6)}
                      value={rule.cause}
                      onChange={(e) => updateValidationRuleRow(section.id, index, (current) => ({ ...current, cause: e.target.value }))}
                    />
                  </td>
                  <td>
                    <button
                      className="icon-button danger"
                      type="button"
                      onClick={() => deleteValidationRuleRow(section.id, index)}
                      aria-label="Удалить правило валидации"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-actions">
            <button className="ghost small" type="button" onClick={() => addValidationRuleRow(section.id)}>
              + Правило валидации
            </button>
          </div>
        </div>
      </div>
    );
  }

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            API
          </span>
          <div>
            <h1>Doc Builder</h1>
          </div>
        </div>
        <div className="actions">
          <div className="actions-main">
          <button className="ghost" onClick={resetProject}>
            Новый
          </button>
          <label className="ghost file-input" aria-label="Импортировать проект JSON">
            Импорт
            <input type="file" accept="application/json" onChange={(e) => importProjectJson(e.target.files?.[0])} />
          </label>
          <button className="ghost" onClick={exportProjectJson}>
            Экспорт JSON
          </button>
          <button onClick={() => void handleExportHtml()}>Экспорт HTML</button>
          <button onClick={() => void handleExportWiki()}>Экспорт Wiki</button>
          </div>
          <div className="actions-side">
          <button
            type="button"
            className="theme-mermaid-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить ночную тему'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            <span className="theme-mermaid-orb" aria-hidden />
            <span className="theme-mermaid-icon" aria-hidden>{theme === 'dark' ? '☾' : '☀'}</span>
          </button>
          <div className={`badge ${autosave.state}`} aria-live="polite">
            {autosave.state === 'saving' && 'Сохранение...'}
            {autosave.state === 'saved' && `Сохранено в ${autosave.at ?? ''}`}
            {autosave.state === 'error' && 'Ошибка сохранения'}
            {autosave.state === 'idle' && 'Готово'}
          </div>
          </div>
        </div>
      </header>

      {importError && <div className="alert error">Ошибка импорта: {importError}</div>}

      <div className="sync-alert-stack">
        {selectedSection?.kind === 'parsed' &&
          renderSourceAlert(
            `${selectedSection.id}-server`,
            selectedServerDriftRows.length > 0 || selectedServerFormatDrift || selectedServerDuplicateValues.length > 0,
            selectedSection.rows,
            selectedServerDuplicateValues,
            'Дубликат поля',
            selectedServerFormatDrift,
            selectedSection.format,
            () => syncInputFromRows(selectedSection, 'server'),
            selectedSection.lastSyncedFormat
          )}
        {selectedSection?.kind === 'parsed' &&
          isDualModelSection(selectedSection) &&
          renderSourceAlert(
            `${selectedSection.id}-client`,
            selectedClientDriftRows.length > 0 || selectedClientFormatDrift || selectedClientDuplicateValues.length > 0,
            selectedSection.clientRows ?? [],
            selectedClientDuplicateValues,
            `Дубликат ${getSectionSideLabel(selectedSection, 'client').toLowerCase()}`,
            selectedClientFormatDrift,
            selectedSection.clientFormat ?? 'json',
            () => syncInputFromRows(selectedSection, 'client'),
            selectedSection.clientLastSyncedFormat,
            `${getSectionSideLabel(selectedSection, 'client')} отличается от источника`
          )}
      </div>

      <div className="layout">
        <aside className="sidebar" role="listbox" aria-label="Секции">
          <div className="sidebar-head">
            <div className="muted">Секции</div>
          </div>
          <div className="section-list">
            {sections.map((section) => {
              const error = validationMap.get(section.id);
              return (
                <button
                  key={section.id}
                  role="option"
                  aria-selected={selectedSection?.id === section.id}
                  className={`section-item ${selectedSection?.id === section.id ? 'active' : ''} ${error ? 'warn' : ''} ${!section.enabled ? 'disabled' : ''}`}
                  draggable
                  onDragStart={() => setDraggingId(section.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggingId) setSections((prev) => reorderSections(prev, draggingId, section.id));
                    setDraggingId(null);
                  }}
                  onClick={() => setSelectedId(section.id)}
                >
                  <div className="section-title">{resolveSectionTitle(section.title)}</div>
                  <div className="chips">
                    {section.kind === 'parsed' && (
                      <span className="chip">
                        {section.sectionType === 'request'
                          ? 'REQUEST'
                          : section.sectionType === 'response'
                            ? 'RESPONSE'
                            : section.format.toUpperCase()}
                      </span>
                    )}
                    {section.kind === 'diagram' && <span className="chip">DIAGRAM</span>}
                    {section.kind === 'errors' && <span className="chip">ERRORS</span>}
                    {!section.enabled && <span className="chip muted">off</span>}
                    {error && <span className="chip danger">err</span>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="sidebar-footer">
            <div className="add-block-menu">
              <button className="ghost small" type="button" onClick={() => setIsAddBlockMenuOpen((current) => !current)}>
                + Добавить секцию
              </button>
              {isAddBlockMenuOpen && (
                <div className="add-block-popover" role="menu" aria-label="Тип нового блока">
                  {ADDABLE_BLOCK_TYPES.map((item) => (
                    <button
                      key={item.type}
                      className="add-block-option"
                      type="button"
                      role="menuitem"
                      onClick={() => addSectionByType(item.type)}
                    >
                      <span className="add-block-option-title">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="workspace" role="main">
          <div className="tabs" role="tablist" aria-label="Просмотр">
            {['editor', 'html', 'wiki'].map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? 'tab active' : 'tab'}
                onClick={() => setTab(key as TabKey)}
              >
                {key === 'editor' && 'Редактор'}
                {key === 'html' && 'HTML'}
                {key === 'wiki' && 'Wiki'}
              </button>
            ))}
          </div>

          {selectedSection ? (
            <div className="panes">
              {tab === 'editor' && (
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <div className="panel-title">{renderEditableSectionTitle(selectedSection)}</div>
                    </div>
                    <div className="row gap">
                      {isCustomSection(selectedSection) && (
                        <button className="ghost small" type="button" onClick={() => deleteSection(selectedSection.id)}>
                          Удалить
                        </button>
                      )}
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={selectedSection.enabled}
                          onChange={(e) => updateSection(selectedSection.id, (current) => ({ ...current, enabled: e.target.checked }))}
                        />
                        <span>Активна</span>
                      </label>
                    </div>
                  </div>

                  {selectedSection.kind === 'text' && (
                    <div className="stack">
                      <div className="editor-toolbar-shell">
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
                              onClick={() => applyTextEditorCommand(selectedSection.id, 'bold')}
                            >
                              <span className="toolbar-icon toolbar-icon-bold">B</span>
                            </button>
                            <button
                              className="ghost small toolbar-button"
                              type="button"
                              title="Курсив"
                              aria-label="Курсив"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                rememberTextSelection();
                              }}
                              onClick={() => applyTextEditorCommand(selectedSection.id, 'italic')}
                            >
                              <span className="toolbar-icon toolbar-icon-italic">I</span>
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
                              onClick={() => applyTextEditorCommand(selectedSection.id, 'code')}
                            >
                              <span className="toolbar-icon">&lt;/&gt;</span>
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
                              onClick={() => applyTextEditorCommand(selectedSection.id, 'h3')}
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
                              onClick={() => applyTextEditorCommand(selectedSection.id, 'quote')}
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
                              onClick={() => applyTextEditorCommand(selectedSection.id, 'ul')}
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
                              onClick={() => applyTextEditorCommand(selectedSection.id, 'ol')}
                            >
                              <span className="toolbar-icon">1.</span>
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="panel-sub">Поддерживаются подзаголовки, цитаты, код и вложенные списки с Tab.</div>
                      <label className="field">
                        <div className="label">Содержимое</div>
                        <div
                          ref={textSectionRef}
                          className="rich-text-editor"
                          contentEditable
                          suppressContentEditableWarning
                          onInput={() => {
                            rememberTextSelection();
                            syncTextSectionFromEditor(selectedSection.id);
                          }}
                          onMouseUp={rememberTextSelection}
                          onKeyUp={rememberTextSelection}
                          onKeyDown={(event) => {
                            if (event.key !== 'Tab') return;

                            const selection = window.getSelection();
                            const anchorNode = selection?.anchorNode;
                            const anchorElement =
                              anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
                            const listItem = anchorElement?.closest('li');

                            if (!listItem || !textSectionRef.current?.contains(listItem)) return;

                            event.preventDefault();
                            rememberTextSelection();
                            restoreTextSelection();
                            document.execCommand(event.shiftKey ? 'outdent' : 'indent');
                            rememberTextSelection();
                            syncTextSectionFromEditor(selectedSection.id);
                          }}
                        />
                      </label>
                    </div>
                  )}

                  {selectedSection.kind === 'parsed' && (
                    <>
                      {isDualModelSection(selectedSection) ? (
                        renderRequestEditor(selectedSection)
                      ) : (
                        <div className="stack">
                          <div className="row gap">
                            <button className="primary" type="button" onClick={() => runParser(selectedSection)}>
                              Парсить
                            </button>
                          </div>

                          {renderSourceEditor(selectedSection, 'server')}
                          <div className="row gap">
                            <button className="ghost small" type="button" onClick={() => addManualRow(selectedSection)}>
                              + Параметр
                            </button>
                          </div>
                          {selectedSection.error && <div className="alert error">{selectedSection.error}</div>}
                          {renderParsedTable(selectedSection)}
                        </div>
                      )}
                    </>
                  )}

                  {selectedSection.kind === 'diagram' && renderDiagramEditor(selectedSection)}
                  {selectedSection.kind === 'errors' && renderErrorsEditor(selectedSection)}
                </section>
              )}

              {tab === 'html' && (
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

              {tab === 'wiki' && (
                <section className="panel">
                  <div className="panel-head">
                    <div className="panel-title">Предпросмотр Wiki</div>
                    <button className="ghost small" onClick={() => void handleExportWiki()}>
                      Скачать
                    </button>
                  </div>
                  <textarea className="code" readOnly value={wikiOutput} rows={24} />
                </section>
              )}
            </div>
          ) : (
            <div className="muted">Секция не выбрана</div>
          )}
        </main>
      </div>
    </div>
  );
}



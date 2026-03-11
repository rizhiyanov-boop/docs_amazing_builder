import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './App.css';
import { parseCurlMeta, parseToRows } from './parsers';
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
import type { DocSection, ParsedRow, ParsedSection, ParsedSectionType, ParseFormat, ProjectData, RequestAuthType, RequestColumnKey, RequestMethod } from './types';

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
type AddableBlockType = 'text' | 'request' | 'response' | 'error-logic';

const ADDABLE_BLOCK_TYPES: Array<{ type: AddableBlockType; label: string }> = [
  { type: 'text', label: 'Текстовый блок' },
  { type: 'request', label: 'Request блок' },
  { type: 'response', label: 'Response блок' },
  { type: 'error-logic', label: 'Логика обработки ошибок' }
];
const AUTO_SECTION_TITLE_BASE: Record<AddableBlockType, string> = {
  text: 'Текстовый блок',
  request: 'Request блок',
  response: 'Response блок',
  'error-logic': 'Логика обработки ошибок'
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

function createInitialSections(): DocSection[] {
  return [
    { id: 'goal', title: 'Цель', enabled: true, kind: 'text', value: '', required: true },
    createParsedSection('request', 'request'),
    createParsedSection('response', 'response'),
    { id: 'errors', title: 'Ошибки', enabled: true, kind: 'text', value: '' },
    { id: 'non-functional', title: 'Нефункциональные требования', enabled: true, kind: 'text', value: '' },
    { id: 'future', title: 'Доработки, планирующиеся на следующих этапах', enabled: false, kind: 'text', value: '' }
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

export default function App() {
  const textSectionRef = useRef<HTMLDivElement | null>(null);
  const textSelectionRef = useRef<Range | null>(null);
  const textEditorSectionRef = useRef<string | null>(null);
  const [sections, setSections] = useState<DocSection[]>(() => loadProject());
  const [selectedId, setSelectedId] = useState<string>(() => createInitialSections()[0].id);
  const [tab, setTab] = useState<TabKey>('editor');
  const [theme, setTheme] = useState<ThemeName>('dark');
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
  const [isAddBlockMenuOpen, setIsAddBlockMenuOpen] = useState(false);

  useEffect(() => {
    if (!sections.find((section) => section.id === selectedId) && sections[0]) {
      setSelectedId(sections[0].id);
    }
  }, [sections, selectedId]);

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

  const htmlOutput = useMemo(() => renderHtmlDocument(sections, theme, { interactive: true }), [sections, theme]);
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

  function updateSection(id: string, updater: (section: DocSection) => DocSection): void {
    setSections((prev) => prev.map((section) => (section.id === id ? updater(section) : section)));
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

  function addSectionByType(type: AddableBlockType): void {
    const nextSection =
      type === 'text' || type === 'error-logic'
        ? createTextSection(undefined, AUTO_SECTION_TITLE_BASE[type])
        : createParsedSection(type);
    setSections((prev) => {
      nextSection.title = createAutoSectionTitle(prev, type);
      return [...prev, nextSection];
    });
    setSelectedId(nextSection.id);
    setIsAddBlockMenuOpen(false);
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

    const format = getSourceFormat(section, editingSource.target);
    const error = validateSourceDraft(format, editingSource.draft);
    if (error) {
      setSourceEditorError(error);
      return;
    }

    updateSection(editingSource.sectionId, (current) => {
      if (current.kind !== 'parsed') return current;
      if (editingSource.target === 'client' && isDualModelSection(current)) {
        return { ...current, clientInput: editingSource.draft, clientError: '' };
      }

      return { ...current, input: editingSource.draft, error: '' };
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
            rows={column === 'example' ? 4 : 1}
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

    return (
      <details className="expander" open>
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
      <details className="expander" open>
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

    return (
      <div className="source-panel">
        <div className="source-panel-head">
          <div className="label">{title}</div>
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

        {!isEditing && (
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
                setEditingSource((current) => (current ? { ...current, draft: nextDraft } : current));
                setSourceEditorError(validateSourceDraft(format, nextDraft));
              }}
              onBlur={saveSourceEditing}
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

        <details className="expander" open>
          <summary className="expander-summary">{serverLabel}</summary>
          <div className="expander-body">
            <div className="row gap">
              <label className="field">
                <div className="label">Формат</div>
                <select
                  value={section.format}
                  onChange={(e) =>
                    updateSection(section.id, (current) =>
                      current.kind === 'parsed'
                        ? { ...current, format: e.target.value as ParseFormat, error: '' }
                        : current
                    )
                  }
                >
                  <option value="json">JSON</option>
                  <option value="curl">cURL</option>
                </select>
              </label>
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
            <details className="expander" open>
              <summary className="expander-summary">{clientLabel}</summary>
              <div className="expander-body">
                <div className="row gap">
                  <label className="field">
                    <div className="label">Формат</div>
                    <select
                      value={section.clientFormat ?? 'json'}
                      onChange={(e) =>
                        updateSection(section.id, (current) =>
                          current.kind === 'parsed' && isDualModelSection(current)
                            ? { ...current, clientFormat: e.target.value as ParseFormat, clientError: '' }
                            : current
                        )
                      }
                    >
                      <option value="json">JSON</option>
                      <option value="curl">cURL</option>
                    </select>
                  </label>
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
          <button onClick={() => downloadText('documentation.html', htmlOutput)}>Экспорт HTML</button>
          <button onClick={() => downloadText('documentation.wiki', wikiOutput)}>Экспорт Wiki</button>
          </div>
          <div className="actions-side">
          <label className="theme-toggle" aria-label="Переключить тему">
            <input type="checkbox" checked={theme === 'light'} onChange={toggleTheme} />
            <span className="theme-toggle-icon" aria-hidden>
              ☾
            </span>
            <span className="theme-toggle-track" aria-hidden>
              <span className="theme-toggle-thumb" />
            </span>
            <span className="theme-toggle-icon" aria-hidden>
              ☀
            </span>
          </label>
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
                            <label className="field">
                              <div className="label">Формат</div>
                              <select
                                value={selectedSection.format}
                                onChange={(e) =>
                                  updateSection(selectedSection.id, (current) =>
                                    current.kind === 'parsed' ? { ...current, format: e.target.value as ParseFormat, error: '' } : current
                                  )
                                }
                              >
                                <option value="json">JSON</option>
                                <option value="curl">cURL</option>
                              </select>
                            </label>
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
                </section>
              )}

              {tab === 'html' && (
                <section className={tab === 'html' ? 'panel panel-html-preview' : 'panel'}>
                  <div className="panel-head">
                    <div className="panel-title">Предпросмотр HTML</div>
                    <button className="ghost small" onClick={() => downloadText('documentation.html', htmlOutput)}>
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
                    <button className="ghost small" onClick={() => downloadText('documentation.wiki', wikiOutput)}>
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



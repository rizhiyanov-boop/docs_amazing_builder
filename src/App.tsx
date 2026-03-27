import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import './tokens.css';
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
import { editorElementToWikiText, editorHtmlToWikiText, escapeRichTextHtml, richTextToHtml } from './richText';
import { renderWikiDocument } from './renderWiki';
import { DEFAULT_SECTION_TITLE, resolveSectionTitle, sanitizeSections } from './sectionTitles';
import { buildInputFromRows } from './sourceSync';
import { ONBOARDING_FEATURES } from './onboarding/featureFlags';
import { ONBOARDING_STEPS, evaluateOnboardingProgress, resolveOnboardingStep, type OnboardingStepId } from './onboarding/steps';
import { loadOnboardingState, markOnboardingCompleted, markOnboardingStarted, saveOnboardingState } from './onboarding/storage';
import { emitOnboardingEvent } from './onboarding/telemetry';
import type { OnboardingState } from './onboarding/types';
import { applyThemeToRoot } from './theme';
import type { ThemeName } from './theme';
import type {
  DiagramItem,
  DiagramSection,
  DocSection,
  ErrorRow,
  ErrorsSection,
  MethodDocument,
  MethodGroup,
  ParsedRow,
  ParsedSection,
  ParsedSectionType,
  ParseFormat,
  ProjectData,
  RequestAuthType,
  RequestColumnKey,
  RequestMethod,
  ValidationRuleRow,
  WorkspaceProjectData
} from './types';

const STORAGE_KEY = 'doc-builder-project-v2';
const ONBOARDING_ENTRY_SUPPRESS_KEY = 'doc-builder-onboarding-entry-suppressed-v1';
const DEFAULT_METHOD_NAME = 'Метод 1';
const DELETE_UNDO_WINDOW_MS = 8000;
const HISTORY_LIMIT = 50;
const HISTORY_COALESCE_MS = 700;
const EMPTY_SECTIONS: DocSection[] = [];
const ENABLE_MULTI_METHODS = false;
const DEFAULT_RICH_TEXT_HIGHLIGHT = '#fef08a';

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

type TabKey = 'editor' | 'html' | 'wiki';
type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';
type ParseTarget = 'server' | 'client';
type JsonImportSampleType = 'request' | 'response';
type JsonImportTargetSide = 'server' | 'client';

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
};
type DeletedRowUndoState = {
  sectionId: string;
  target: ParseTarget;
  row: ParsedRow;
  index: number;
};
type WorkspaceSnapshot = {
  methods: MethodDocument[];
  methodGroups: MethodGroup[];
  activeMethodId: string;
  selectedId: string;
};

type JsonImportRoutingState = {
  fileName: string;
  rawText: string;
  sampleType: JsonImportSampleType;
  domainModelEnabled: boolean;
  targetSide: JsonImportTargetSide;
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

type RichTextAction = 'bold' | 'italic' | 'code' | 'h3' | 'ul' | 'ol' | 'quote' | 'highlight';
type RichTextCommandOptions = {
  color?: string;
  language?: string;
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

const RICH_TEXT_HIGHLIGHT_OPTIONS = [
  { value: '#fef08a', label: 'Желтый' },
  { value: '#bbf7d0', label: 'Зеленый' },
  { value: '#fde68a', label: 'Песочный' },
  { value: '#fecdd3', label: 'Розовый' },
  { value: '#bfdbfe', label: 'Синий' }
] as const;

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
    clientResponseCode: '',
    trigger: '',
    errorType: '-',
    serverHttpStatus: '',
    internalCode: '',
    message: '',
    responseCode: ''
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

function normalizeLegacyErrorRowsInSections(sections: DocSection[]): DocSection[] {
  let changed = false;

  const nextSections = sections.map((section) => {
    if (section.kind !== 'errors') return section;

    let sectionChanged = false;
    const nextRows = section.rows.map((row) => {
      let nextRow = row;

      if (!(row.clientResponseCode ?? '').trim()) {
        const trimmedClientResponse = row.clientResponse.trim();
        const looksLikeJson =
          (trimmedClientResponse.startsWith('{') && trimmedClientResponse.endsWith('}'))
          || (trimmedClientResponse.startsWith('[') && trimmedClientResponse.endsWith(']'));

        if (looksLikeJson) {
          nextRow = {
            ...nextRow,
            clientResponse: '',
            clientResponseCode: row.clientResponse
          };
          sectionChanged = true;
        }
      }

      const legacyCode = row.internalCode.trim();
      if (legacyCode !== 'payments.transfer.validation.amount.invalid') return nextRow;

      sectionChanged = true;
      const normalizedInternalCode = '100101';
      const preset = ERROR_CATALOG_BY_CODE.get(normalizedInternalCode);

      return {
        ...nextRow,
        internalCode: normalizedInternalCode,
        serverHttpStatus: preset?.httpStatus ?? nextRow.serverHttpStatus,
        message: preset?.message ?? nextRow.message
      };
    });

    if (!sectionChanged) return section;
    changed = true;
    return {
      ...section,
      rows: nextRows
    };
  });

  return changed ? nextSections : sections;
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

function createMethodId(): string {
  return `method-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createMethodDocument(name = DEFAULT_METHOD_NAME, sections: DocSection[] = createInitialSections(), id = createMethodId()): MethodDocument {
  return {
    id,
    name,
    updatedAt: new Date().toISOString(),
    sections
  };
}

function createWorkspaceSeed(): WorkspaceProjectData {
  const method = createMethodDocument();
  return {
    version: 3,
    updatedAt: new Date().toISOString(),
    activeMethodId: method.id,
    methods: [method],
    groups: []
  };
}

function createOnboardingDemoWorkspace(): WorkspaceProjectData {
  const demoRequestInput = [
    "curl --request POST 'https://api.demo.local/v1/payments/transfer' ",
    "--header 'Authorization: Bearer <token>' ",
    "--header 'Content-Type: application/json' ",
    "--data '{",
    '  "senderAccount": "40817810000000000123",',
    '  "receiverAccount": "40817810000000000999",',
    '  "amount": 150000,',
    '  "currency": "UZS",',
    '  "comment": "Оплата по договору 42"',
    "}'"
  ].join(' ');

  const demoResponseInput = JSON.stringify(
    {
      transferId: 'trf-20260319-0001',
      status: 'ACCEPTED',
      createdAt: '2026-03-19T08:15:00Z',
      fee: {
        amount: 2500,
        currency: 'UZS'
      }
    },
    null,
    2
  );

  const baseSections = createInitialSections();
  const demoSections: DocSection[] = baseSections.map((section): DocSection => {
    if (section.kind === 'text' && section.id === 'goal') {
      return {
        ...section,
        value:
          'Документация описывает перевод между счетами внутри банка через REST endpoint.\n\nЦель: показать контракт запроса и ответа для интеграции клиентских систем.'
      };
    }

    if (section.kind === 'text' && section.id === 'functional') {
      return {
        ...section,
        value:
          '1. Проверка авторизации и прав на списание.\n2. Валидация суммы и валюты.\n3. Создание транзакции и возврат transferId.'
      };
    }

    if (section.kind === 'parsed' && section.sectionType === 'request') {
      const serverRows = parseToRows('curl', demoRequestInput);
      return {
        ...section,
        format: 'curl' as const,
        lastSyncedFormat: 'curl' as const,
        input: demoRequestInput,
        rows: serverRows,
        error: '',
        requestUrl: 'https://api.demo.local/v1/payments/transfer',
        requestMethod: 'POST' as const
      };
    }

    if (section.kind === 'parsed' && section.sectionType === 'response') {
      const serverRows = parseToRows('json', demoResponseInput);
      return {
        ...section,
        format: 'json' as const,
        lastSyncedFormat: 'json' as const,
        input: demoResponseInput,
        rows: serverRows,
        error: ''
      };
    }

    if (section.kind === 'diagram') {
      return {
        ...section,
        diagrams: [
          {
            ...section.diagrams[0],
            title: 'Основной поток перевода',
            engine: 'mermaid',
            code: [
              'sequenceDiagram',
              'participant Client',
              'participant API',
              'participant Core',
              'Client->>API: POST /payments/transfer',
              'API->>Core: Validate and reserve funds',
              'Core-->>API: transfer created',
              'API-->>Client: 200 ACCEPTED + transferId'
            ].join('\n'),
            description: 'Базовый happy-path: запрос, проверка, создание перевода, подтверждение клиенту.'
          }
        ]
      };
    }

    if (section.kind === 'errors') {
      return {
        ...section,
        rows: [
          {
            clientHttpStatus: '400',
            clientResponse: 'Некорректная сумма перевода',
            clientResponseCode: '{"code":"VAL_001","message":"Invalid amount"}',
            trigger: 'Сумма <= 0 или превышен лимит клиента',
            errorType: 'BusinessException',
            serverHttpStatus: '400',
            internalCode: '100101',
            message: ERROR_CATALOG_BY_CODE.get('100101')?.message ?? 'Bad request sent to the system',
            responseCode: '{"code":"100101","message":"Bad request sent to the system"}'
          }
        ],
        validationRules: [
          {
            parameter: 'amount',
            validationCase: 'max/min',
            condition: 'amount > 0 and amount <= dailyLimit',
            cause: 'Ограничения тарифа и антифрод политики'
          }
        ]
      };
    }

    return section;
  });

  const method = createMethodDocument('Демо: Перевод между счетами', demoSections);
  return {
    version: 3,
    updatedAt: new Date().toISOString(),
    activeMethodId: method.id,
    methods: [method],
    groups: []
  };
}

function normalizeWorkspaceForMode(workspace: WorkspaceProjectData): WorkspaceProjectData {
  if (ENABLE_MULTI_METHODS) return workspace;

  const resolvedMethod = workspace.methods.find((method) => method.id === workspace.activeMethodId) ?? workspace.methods[0] ?? createMethodDocument();
  return {
    ...workspace,
    activeMethodId: resolvedMethod.id,
    methods: [resolvedMethod],
    groups: []
  };
}

function asWorkspaceProjectData(methods: MethodDocument[], activeMethodId: string, groups: MethodGroup[] = []): WorkspaceProjectData {
  const normalizedMethods = methods.length > 0 ? methods : [createMethodDocument()];
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
      sections: sanitizeSections(method.sections)
    })),
    groups
  };

  return normalizeWorkspaceForMode(workspace);
}

function slugifyMethodFileName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'method';
}

function loadWorkspaceProject(): WorkspaceProjectData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createWorkspaceSeed();
    const parsed = JSON.parse(raw) as WorkspaceProjectData | ProjectData;

    if ('methods' in parsed && Array.isArray(parsed.methods)) {
      const sanitizedMethods = parsed.methods
        .filter((method) => method && Array.isArray(method.sections))
        .map((method, index) => ({
          id: method.id || createMethodId(),
          name: method.name?.trim() || `Метод ${index + 1}`,
          updatedAt: method.updatedAt || new Date().toISOString(),
          sections: sanitizeSections(method.sections)
        }));

      if (sanitizedMethods.length === 0) return createWorkspaceSeed();

      const groups = Array.isArray(parsed.groups)
        ? parsed.groups.map((group) => ({
            id: group.id || `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: group.name?.trim() || 'Новая цепочка',
            methodIds: Array.isArray(group.methodIds) ? group.methodIds.filter(Boolean) : [],
            links: Array.isArray(group.links) ? group.links : []
          }))
        : [];

      const activeMethodId =
        parsed.activeMethodId && sanitizedMethods.some((method) => method.id === parsed.activeMethodId)
          ? parsed.activeMethodId
          : sanitizedMethods[0].id;

      const workspace: WorkspaceProjectData = {
        version: 3,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        activeMethodId,
        methods: sanitizedMethods,
        groups
      };

      return normalizeWorkspaceForMode(workspace);
    }

    if ('sections' in parsed && Array.isArray(parsed.sections)) {
      const legacyMethod = createMethodDocument(DEFAULT_METHOD_NAME, sanitizeSections(parsed.sections));
      return {
        version: 3,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        activeMethodId: legacyMethod.id,
        methods: [legacyMethod],
        groups: []
      };
    }

    return createWorkspaceSeed();
  } catch {
    return createWorkspaceSeed();
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
  const [fallbackUrl, setFallbackUrl] = useState('');
  const [fallbackLoadFailed, setFallbackLoadFailed] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function renderDiagram(): Promise<void> {
      const host = hostRef.current;
      if (!host) return;

      const source = code.trim();
      if (!source) {
        host.innerHTML = '';
        setError('');
        setFallbackUrl('');
        setFallbackLoadFailed(false);
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

        const renderedSvg = host.querySelector('svg');
        if (renderedSvg) {
          renderedSvg.classList.add('diagram-mermaid-svg');
          const viewBox = renderedSvg.getAttribute('viewBox')?.trim();
          if (viewBox) {
            const parts = viewBox.split(/\s+/).map((part) => Number(part));
            if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3]) && parts[2] > 0 && parts[3] > 0) {
              renderedSvg.setAttribute('width', String(parts[2]));
              renderedSvg.setAttribute('height', String(parts[3]));
            }
          }
        }

        setError('');
        setFallbackUrl('');
        setFallbackLoadFailed(false);
      } catch (diagramError) {
        if (!isActive) return;
        host.innerHTML = '';
        setError(diagramError instanceof Error ? diagramError.message : 'Ошибка Mermaid рендера');
        setFallbackUrl(getDiagramImageUrl('mermaid', source, 'svg'));
        setFallbackLoadFailed(false);
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
      {fallbackUrl && !fallbackLoadFailed && (
        <img
          className="diagram-preview-image"
          src={fallbackUrl}
          alt="Mermaid preview"
          loading="lazy"
          onError={() => setFallbackLoadFailed(true)}
        />
      )}
      {error && <div className="inline-error">{error}</div>}
    </div>
  );
}

export default function App() {
  const activeTextSectionIdRef = useRef<string | null>(null);
  const richEditorSelectionRef = useRef<{ editor: HTMLElement; range: Range } | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);
  const textEditorWikiSnapshotRef = useRef<string>('');
  const diagramTextRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const methodNameInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const previousMethodIdRef = useRef<string | null>(null);
  const initialWorkspace = useMemo(() => loadWorkspaceProject(), []);
  const initialOnboarding = useMemo(() => loadOnboardingState(), []);
  const [methods, setMethodsState] = useState<MethodDocument[]>(() => initialWorkspace.methods);
  const [methodGroups, setMethodGroups] = useState<MethodGroup[]>(() => initialWorkspace.groups);
  const [activeMethodId, setActiveMethodId] = useState<string>(() => initialWorkspace.activeMethodId ?? initialWorkspace.methods[0]?.id ?? createMethodId());
  const [selectedId, setSelectedId] = useState<string>(() => initialWorkspace.methods[0]?.sections[0]?.id ?? createInitialSections()[0].id);
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
  const [openInternalCodeKey, setOpenInternalCodeKey] = useState<string | null>(null);
  const [highlightedInternalCodeIndex, setHighlightedInternalCodeIndex] = useState(0);
  const [internalCodePopoverState, setInternalCodePopoverState] = useState<InternalCodePopoverState | null>(null);
  const [isAddBlockMenuOpen, setIsAddBlockMenuOpen] = useState(false);
  const [pendingMethodNameFocus, setPendingMethodNameFocus] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [deletedRowUndo, setDeletedRowUndo] = useState<DeletedRowUndoState | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isSectionPanelPulse, setIsSectionPanelPulse] = useState(false);
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(() => initialOnboarding);
  const [suppressOnboardingEntry, setSuppressOnboardingEntry] = useState<boolean>(() => loadOnboardingEntrySuppressed());
  const [showOnboardingEntry, setShowOnboardingEntry] = useState<boolean>(
    () => ONBOARDING_FEATURES.onboardingV1 && !initialOnboarding.dismissed && !loadOnboardingEntrySuppressed()
  );
  const [showResetEndpointDialog, setShowResetEndpointDialog] = useState(false);
  const [jsonImportRouting, setJsonImportRouting] = useState<JsonImportRoutingState | null>(null);
  const [projectTextImport, setProjectTextImport] = useState<ProjectTextImportState | null>(null);
  const [sourceTextImport, setSourceTextImport] = useState<SourceTextImportState | null>(null);
  const [hasOnboardingExport, setHasOnboardingExport] = useState(false);
  const [dismissedOnboardingHints, setDismissedOnboardingHints] = useState<Record<string, true>>({});
  const [onboardingNavStep, setOnboardingNavStep] = useState<OnboardingStepId>(() => initialOnboarding.currentStep);
  const [onboardingStepHint, setOnboardingStepHint] = useState('');
  const internalCodeAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const internalCodePopoverRef = useRef<HTMLDivElement | null>(null);
  const previousOnboardingStepRef = useRef(onboardingState.currentStep);
  const onboardingStepHintTimerRef = useRef<number | null>(null);
  const onboardingSpotlightTimerRef = useRef<number | null>(null);
  const onboardingSpotlightNodeRef = useRef<HTMLElement | null>(null);
  const deletedRowUndoTimerRef = useRef<number | null>(null);
  const undoStackRef = useRef<WorkspaceSnapshot[]>([]);
  const redoStackRef = useRef<WorkspaceSnapshot[]>([]);
  const historySuspendRef = useRef(false);
  const historyLastSnapshotRef = useRef<WorkspaceSnapshot | null>(null);
  const historyLastHashRef = useRef('');
  const historyLastPushAtRef = useRef(0);
  const activeMethod = methods.find((method) => method.id === activeMethodId) ?? methods[0];
  const sections = useMemo(() => activeMethod?.sections ?? EMPTY_SECTIONS, [activeMethod]);
  const methodNameWarning = useMemo(() => {
    if (!activeMethod) return '';
    const trimmed = activeMethod.name.trim();
    if (!trimmed) return 'Название метода не может быть пустым';
    const normalized = trimmed.toLowerCase();
    const hasDuplicate = methods.some((method) => method.id !== activeMethod.id && method.name.trim().toLowerCase() === normalized);
    return hasDuplicate ? 'Метод с таким названием уже существует' : '';
  }, [methods, activeMethod]);

  const exportTitle = activeMethod ? `Экспортируется только метод "${activeMethod.name.trim() || DEFAULT_METHOD_NAME}"` : 'Выберите метод';

  function cloneSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
    return {
      methods: JSON.parse(JSON.stringify(snapshot.methods)) as MethodDocument[],
      methodGroups: JSON.parse(JSON.stringify(snapshot.methodGroups)) as MethodGroup[],
      activeMethodId: snapshot.activeMethodId,
      selectedId: snapshot.selectedId
    };
  }

  function getWorkspaceSnapshot(): WorkspaceSnapshot {
    return {
      methods,
      methodGroups,
      activeMethodId,
      selectedId
    };
  }

  function applyWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void {
    historySuspendRef.current = true;
    setMethodsState(snapshot.methods);
    setMethodGroups(snapshot.methodGroups);
    setActiveMethodId(snapshot.activeMethodId);
    setSelectedId(snapshot.selectedId);
    window.setTimeout(() => {
      historySuspendRef.current = false;
    }, 0);
  }

  function canUndoWorkspace(): boolean {
    return undoStackRef.current.length > 0;
  }

  function canRedoWorkspace(): boolean {
    return redoStackRef.current.length > 0;
  }

  function undoWorkspace(): void {
    if (!canUndoWorkspace()) return;
    const current = cloneSnapshot(getWorkspaceSnapshot());
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(current);
    applyWorkspaceSnapshot(cloneSnapshot(previous));
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }

  function redoWorkspace(): void {
    if (!canRedoWorkspace()) return;
    const current = cloneSnapshot(getWorkspaceSnapshot());
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(current);
    applyWorkspaceSnapshot(cloneSnapshot(next));
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }

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
    const shouldPush = now - historyLastPushAtRef.current > HISTORY_COALESCE_MS;
    if (shouldPush) {
      undoStackRef.current.push(cloneSnapshot(previousSnapshot));
      if (undoStackRef.current.length > HISTORY_LIMIT) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      historyLastPushAtRef.current = now;
      setCanUndo(undoStackRef.current.length > 0);
      setCanRedo(redoStackRef.current.length > 0);
    }
  }, [methods, methodGroups, activeMethodId, selectedId]);

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

  function applyWorkspaceState(workspace: WorkspaceProjectData): void {
    const resolvedActiveMethod = workspace.methods.find((method) => method.id === workspace.activeMethodId) ?? workspace.methods[0];
    setMethodsState(workspace.methods);
    setMethodGroups(workspace.groups);
    setActiveMethodId(resolvedActiveMethod?.id ?? createMethodId());
    setSelectedId(resolvedActiveMethod?.sections[0]?.id ?? createInitialSections()[0].id);
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
          parsedRows = parseToRows('json', jsonImportRouting.rawText);
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
    setActiveMethodId(method.id);
    setSelectedId(method.sections[0]?.id ?? createInitialSections()[0].id);
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
    setSelectedId(method.sections[0]?.id ?? createInitialSections()[0].id);
    setPendingMethodNameFocus(true);
    setTab('editor');
  }

  function deleteActiveMethod(): void {
    if (!activeMethod) return;
    if (methods.length <= 1) {
      alert('Нельзя удалить последний метод. Создайте еще один метод, затем удалите текущий.');
      return;
    }

    const sectionCount = activeMethod.sections.length;
    const confirmed = confirm(
      `Удалить метод "${activeMethod.name}"?\nСекций: ${sectionCount}\nДействие необратимо.`
    );
    if (!confirmed) return;

    setMethodsState((prev) => {
      const currentIndex = prev.findIndex((method) => method.id === activeMethod.id);
      if (currentIndex === -1) return prev;
      const next = prev.filter((method) => method.id !== activeMethod.id);
      const fallback = next[currentIndex] ?? next[currentIndex - 1] ?? next[0];
      if (fallback) {
        setActiveMethodId(fallback.id);
        setSelectedId(fallback.sections[0]?.id ?? createInitialSections()[0].id);
      }
      return next;
    });

    setMethodGroups((prev) =>
      prev.map((group) => ({
        ...group,
        methodIds: group.methodIds.filter((id) => id !== activeMethod.id),
        links: group.links.filter((link) => link.fromMethodId !== activeMethod.id && link.toMethodId !== activeMethod.id)
      }))
    );

    setToastMessage(`Метод "${activeMethod.name}" удален`);
  }

  function updateActiveMethodName(name: string): void {
    if (!activeMethod) return;
    setMethodsState((prev) =>
      prev.map((method) =>
        method.id === activeMethod.id
          ? {
              ...method,
              name,
              updatedAt: new Date().toISOString()
            }
          : method
      )
    );
  }

  function normalizeActiveMethodName(): void {
    if (!activeMethod) return;
    const resolved = activeMethod.name.trim() || DEFAULT_METHOD_NAME;
    if (resolved === activeMethod.name) return;
    updateActiveMethodName(resolved);
  }

  useEffect(() => {
    if (!methods.find((method) => method.id === activeMethodId) && methods[0]) {
      setActiveMethodId(methods[0].id);
    }
  }, [methods, activeMethodId]);

  useEffect(() => {
    if (!sections.find((section) => section.id === selectedId) && sections[0]) {
      setSelectedId(sections[0].id);
    }
  }, [sections, selectedId, activeMethodId]);

  useEffect(() => {
    if (!pendingMethodNameFocus || !activeMethod || activeMethod.id !== activeMethodId) return;
    if (!methodNameInputRef.current) return;
    methodNameInputRef.current.focus();
    methodNameInputRef.current.select();
    setPendingMethodNameFocus(false);
  }, [pendingMethodNameFocus, activeMethod, activeMethodId]);

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
      stepId: 'complete',
      source
    });
    setToastMessage('Онбординг завершен: первый экспорт выполнен.');
  }, [onboardingState.status, onboardingState.entryPath, onboardingState.currentStep, hasOnboardingExport]);

  const htmlPreviewOutput = useMemo(() => renderHtmlDocument(sections, theme, { interactive: false }), [sections, theme]);
  const wikiOutput = useMemo(() => renderWikiDocument(sections), [sections]);
  const onboardingResolvedStepIndex = useMemo(
    () => Math.max(0, ONBOARDING_STEPS.findIndex((step) => step.id === onboardingState.currentStep)),
    [onboardingState.currentStep]
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

    if (stepId === 'complete') {
      return {
        tab: 'editor',
        anchor: 'choose-entry',
        hintMessage: 'Онбординг пройден. Можно продолжать работу в любом режиме.'
      };
    }

    return {
      tab: 'editor',
      anchor: 'choose-entry'
    };
  }

  function canNavigateToOnboardingStep(stepId: OnboardingStepId): { allowed: boolean; reason?: string } {
    const targetIndex = ONBOARDING_STEPS.findIndex((step) => step.id === stepId);
    if (targetIndex < 0) return { allowed: false, reason: 'Шаг не найден.' };

    // Going to current or previous steps should always be allowed.
    if (targetIndex <= onboardingNavStepIndex) return { allowed: true };

    // Forward jumps are limited by completed progress.
    if (targetIndex <= onboardingResolvedStepIndex) return { allowed: true };

    const previousStep = ONBOARDING_STEPS[Math.max(0, targetIndex - 1)];
    return {
      allowed: false,
      reason: `Сначала завершите шаг: ${previousStep?.title ?? 'предыдущий шаг'}`
    };
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
    const access = canNavigateToOnboardingStep(stepId);
    if (!force && !access.allowed) {
      setOnboardingStepHintMessage(access.reason ?? 'Переход недоступен.');
      emitOnboardingEvent('onboarding_step_blocked', { stepId, source });
      return;
    }

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
        description: 'Откройте request/response и вставьте JSON или cURL в Source-блок, чтобы начать парсинг.',
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
    setAutosave({ state: 'saving' });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(asWorkspaceProjectData(methods, activeMethodId, methodGroups)));
      setAutosave({ state: 'saved', at: formatTime(new Date()) });
    } catch {
      setAutosave({ state: 'error' });
    }
  }, [methods, activeMethodId, methodGroups]);

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
        clientResponseCode: '',
        trigger: 'Ошибка валидации',
        errorType: 'BusinessException',
        serverHttpStatus: preset?.httpStatus ?? '400',
        internalCode: '100101',
        message: preset?.message ?? 'Bad request sent to the system',
        responseCode: ''
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

    const persistedFormat = target === 'client' ? section.clientFormat ?? 'json' : section.format;
    const persistedInput = target === 'client' ? section.clientInput ?? '' : section.input;
    const draftInput = isEditingCurrentTarget ? editingSource?.draft ?? persistedInput : persistedInput;
    const detectedDraftFormat = detectSourceFormat(draftInput);
    const format = detectedDraftFormat ?? persistedFormat;
    const input = draftInput;

    try {
      const rows = parseToRows(format, input);
      const curlMeta = isRequestSection(section) && format === 'curl' ? parseCurlMeta(input) : null;
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

  function exportProjectJson(): void {
    if (!activeMethod) return;
    const methodSlug = slugifyMethodFileName(activeMethod.name);
    const payload: ProjectData = {
      version: 2,
      updatedAt: new Date().toISOString(),
      sections: sanitizeSections(sections)
    };
    downloadText(`${methodSlug}.project.json`, JSON.stringify(payload, null, 2));
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
    if (!activeMethod) return;
    const methodSlug = slugifyMethodFileName(activeMethod.name);
    const diagramImageMap = await buildEmbeddedDiagramImageMap();
    const htmlForExport = renderHtmlDocument(sections, theme, {
      interactive: true,
      diagramImageSource: 'remote',
      diagramImageMap
    });
    downloadText(`${methodSlug}.documentation.html`, htmlForExport);
    markOnboardingExportTouched();
  }

  function openHtmlPreview(): void {
    if (!activeMethod) return;
    setTab('html');
  }

  function openWikiPreview(): void {
    if (!activeMethod) return;
    void copyToClipboard(wikiOutput);
    setToastMessage('Wiki текст скопирован в буфер обмена.');
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
        const loaded = loadWorkspaceProjectFromPayload(parsed as WorkspaceProjectData);
        applyWorkspaceState({ ...loaded, groups: ENABLE_MULTI_METHODS ? loaded.groups : [] });
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
        sections: sanitizeSections(method.sections)
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
      updatedAt: payload.updatedAt || new Date().toISOString(),
      methods,
      groups,
      activeMethodId
    };

    return normalizeWorkspaceForMode(workspace);
  }

  function executeResetProject(): void {
    if (ONBOARDING_FEATURES.onboardingV1) {
      setImportError('');
      setJsonImportRouting(null);
      setShowOnboardingEntry(true);
      return;
    }

    const seed = createWorkspaceSeed();
    setMethodsState(seed.methods);
    setMethodGroups(seed.groups);
    setActiveMethodId(seed.activeMethodId ?? seed.methods[0].id);
    setSelectedId(seed.methods[0].sections[0].id);
    localStorage.removeItem(STORAGE_KEY);
  }

  function resetProject(): void {
    setShowResetEndpointDialog(true);
  }

  function confirmResetProject(): void {
    setShowResetEndpointDialog(false);
    executeResetProject();
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

  function syncDiagramDescriptionFromEditor(sectionId: string, diagramId: string): void {
    const editor = diagramTextRefs.current[getDiagramEditorKey(sectionId, diagramId)];
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
    const editor = diagramTextRefs.current[getDiagramEditorKey(sectionId, diagramId)];
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
    const manualRow: ParsedRow = {
      field: `newField${Date.now()}`,
      origin: 'manual',
      type: 'string',
      required: '+',
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
    const manualHeader: ParsedRow = {
      field: `X-CUSTOM-${Date.now()}`,
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
      queueDeletedRowUndo({
        sectionId,
        target: 'server',
        row: { ...deletedRow },
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
      queueDeletedRowUndo({
        sectionId,
        target: 'client',
        row: { ...deletedRow },
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
      queueDeletedRowUndo({
        sectionId,
        target,
        row: { ...deletedRow },
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
      draft: row.field,
      target: 'server',
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

  function renderEditableFieldCell(section: ParsedSection, row: ParsedRow, options: EditableFieldOptions = {}): ReactNode {
    const allowEdit = options.allowEdit ?? true;
    if (!row.field.trim()) return '—';

    const isEditing =
      editingField?.sectionId === section.id &&
      editingField.rowKey === getParsedRowKey(row) &&
      editingField.target === 'server' &&
      editingField.column === 'field';

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
      <div className="field-display" onDoubleClick={() => startClientFieldEditing(section, row)}>
        <span>{row.clientField}</span>
        <span className="field-actions">
          <button className="icon-button" type="button" onClick={() => startClientFieldEditing(section, row)} aria-label="Редактировать client поле">
            ✎
          </button>
          <button
            className="icon-button danger"
            type="button"
            onClick={() => deleteParsedRow(section.id, getParsedRowKey(row), 'client')}
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
              autoFocus
              value={editingRequestCell.draft}
              onChange={(e) => {
                const nextValue = e.target.value;
                setEditingRequestCell((current) => (current ? { ...current, draft: nextValue } : current));
                if (applyRequestCellValue(section.id, getParsedRowKey(row), 'type', nextValue, editingRequestCell.target)) {
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
                if (applyRequestCellValue(section.id, getParsedRowKey(row), 'required', nextValue, editingRequestCell.target)) {
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
    const canEdit = Boolean(getRequestCellEditTarget(section, row));

    return (
      <div className="field-display" onDoubleClick={() => canEdit && startRequestCellEditing(section, row, column)}>
        <span>{value}</span>
        <span className="field-actions">
          <button className="icon-button" type="button" onClick={() => canEdit && startRequestCellEditing(section, row, column)} aria-label="Редактировать ячейку">
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

          <button
            className="source-parse-fab"
            type="button"
            data-onboarding-anchor={target === 'server' ? 'run-parse' : undefined}
            onClick={() => runParser(section, target)}
            disabled={!currentValue.trim()}
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
          const isOpen = isExpanderOpen(section.id, blockId);
          const hasDiagramCode = Boolean(diagram.code.trim());

          return (
            <details
              key={diagram.id}
              className="expander"
              open={isOpen}
              onToggle={(e) => setExpanderOpen(section.id, blockId, e.currentTarget.open)}
            >
              <summary className={`expander-summary ${!isOpen && hasDiagramCode ? 'with-diagram-preview' : ''}`}>
                <span className="expander-summary-title">{title}</span>
                {!isOpen && hasDiagramCode && (
                  <span className="diagram-collapsed-preview">
                    {effectiveEngine === 'mermaid' && <MermaidLivePreview code={diagram.code} />}
                    {effectiveEngine === 'plantuml' && (
                      <span className="diagram-preview">
                        <img className="diagram-preview-image" src={getPlantUmlImageUrl(diagram.code, 'svg')} alt={title} loading="lazy" />
                      </span>
                    )}
                  </span>
                )}
              </summary>
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
                {!hasDiagramCode && <div className="muted">Вставьте код диаграммы для предпросмотра</div>}
                {hasDiagramCode && effectiveEngine === 'mermaid' && <MermaidLivePreview code={diagram.code} />}
                {hasDiagramCode && effectiveEngine === 'plantuml' && (
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
                        title="Код"
                        aria-label="Код"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'code')}
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
                          const editor = diagramTextRefs.current[getDiagramEditorKey(section.id, diagram.id)];
                          rememberSelectionForEditor(editor);
                        }}
                        onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'highlight', { color: DEFAULT_RICH_TEXT_HIGHLIGHT })}
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
                    onMouseUp={() => rememberSelectionForEditor(diagramTextRefs.current[getDiagramEditorKey(section.id, diagram.id)])}
                    onKeyUp={() => rememberSelectionForEditor(diagramTextRefs.current[getDiagramEditorKey(section.id, diagram.id)])}
                    onKeyDown={(event) => {
                      const editor = diagramTextRefs.current[getDiagramEditorKey(section.id, diagram.id)];
                      if (!editor) return;

                      const handled = handleRichTextHotkeys(event, (action) => {
                        rememberSelectionForEditor(editor);
                        applyDiagramTextCommand(section.id, diagram.id, action);
                      });

                      if (handled) return;
                    }}
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
                const clientResponseError = validateJsonDraft(row.clientResponseCode ?? '');
                const normalizedCode = row.internalCode.trim();
                const hasUnknownInternalCode = Boolean(normalizedCode) && !ERROR_CATALOG_BY_CODE.has(normalizedCode);
                const internalCodeKey = `${section.id}-error-${index}`;
                const isInternalCodeOpen = openInternalCodeKey === internalCodeKey;
                const searchValue = normalizedCode.toLowerCase();
                const internalCodeOptions = ERROR_CATALOG
                  .filter((item) => {
                    if (!searchValue) return true;
                    return (
                      item.internalCode.toLowerCase().includes(searchValue)
                      || item.httpStatus.toLowerCase().includes(searchValue)
                      || item.message.toLowerCase().includes(searchValue)
                    );
                  })
                  .slice(0, 25);

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
                      <input
                        type="text"
                        value={row.clientResponse}
                        onChange={(e) => updateErrorRow(section.id, index, (current) => ({ ...current, clientResponse: e.target.value }))}
                        placeholder="Описание client response"
                      />
                      <textarea
                        className={clientResponseError ? 'input-warning' : ''}
                        rows={getDynamicTextareaRows(row.clientResponseCode ?? '', 3, 10)}
                        value={row.clientResponseCode ?? ''}
                        onChange={(e) => updateErrorRow(section.id, index, (current) => ({ ...current, clientResponseCode: e.target.value }))}
                        placeholder="Код client response для WIKI (JSON)"
                      />
                      <button className="ghost small" type="button" onClick={() => formatClientResponseCode(section.id, index)}>
                        Форматировать JSON
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
                    <div
                      className="internal-code-combobox"
                      ref={(node) => {
                        internalCodeAnchorRefs.current[internalCodeKey] = node;
                      }}
                    >
                      <div className="internal-code-cell">
                        <input
                          className={hasUnknownInternalCode ? 'input-warning' : ''}
                          type="text"
                          value={row.internalCode}
                          onFocus={() => {
                            setOpenInternalCodeKey(internalCodeKey);
                            setHighlightedInternalCodeIndex(0);
                          }}
                          onChange={(e) => {
                            applyInternalCode(section.id, index, e.target.value);
                            setOpenInternalCodeKey(internalCodeKey);
                            setHighlightedInternalCodeIndex(0);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              setOpenInternalCodeKey(null);
                              return;
                            }

                            if (event.key === 'ArrowDown') {
                              event.preventDefault();
                              if (!isInternalCodeOpen) {
                                setOpenInternalCodeKey(internalCodeKey);
                                setHighlightedInternalCodeIndex(0);
                                return;
                              }

                              setHighlightedInternalCodeIndex((current) =>
                                Math.min(current + 1, Math.max(internalCodeOptions.length - 1, 0))
                              );
                              return;
                            }

                            if (event.key === 'ArrowUp') {
                              event.preventDefault();
                              if (!isInternalCodeOpen) {
                                setOpenInternalCodeKey(internalCodeKey);
                                setHighlightedInternalCodeIndex(0);
                                return;
                              }

                              setHighlightedInternalCodeIndex((current) => Math.max(current - 1, 0));
                              return;
                            }

                            if (event.key === 'Enter' && isInternalCodeOpen && internalCodeOptions.length > 0) {
                              event.preventDefault();
                              const picked = internalCodeOptions[Math.min(highlightedInternalCodeIndex, internalCodeOptions.length - 1)];
                              if (picked) {
                                applyInternalCode(section.id, index, picked.internalCode);
                                setOpenInternalCodeKey(null);
                              }
                            }
                          }}
                          title={hasUnknownInternalCode ? 'Код не найден в каталоге, заполните поля вручную или уточните internalCode' : ''}
                          placeholder="Введите internalCode"
                          aria-label="internalCode"
                          aria-expanded={isInternalCodeOpen}
                          aria-controls={`${internalCodeKey}-options`}
                          aria-autocomplete="list"
                        />
                        <button
                          className="internal-code-toggle"
                          type="button"
                          aria-label="Показать варианты internalCode"
                          onClick={() => {
                            setOpenInternalCodeKey((current) => (current === internalCodeKey ? null : internalCodeKey));
                            setHighlightedInternalCodeIndex(0);
                          }}
                        >
                          ▾
                        </button>
                      </div>
                      {isInternalCodeOpen && internalCodePopoverState && createPortal(
                        <div
                          id={`${internalCodeKey}-options`}
                          ref={internalCodePopoverRef}
                          className={`internal-code-dropdown internal-code-dropdown-portal ${internalCodePopoverState.openUp ? 'is-top' : ''}`}
                          role="listbox"
                          style={{
                            top: `${internalCodePopoverState.top}px`,
                            left: `${internalCodePopoverState.left}px`,
                            width: `${internalCodePopoverState.width}px`,
                            maxHeight: `${internalCodePopoverState.maxHeight}px`
                          }}
                        >
                          {internalCodeOptions.length === 0 && (
                            <div className="internal-code-empty">Ничего не найдено</div>
                          )}
                          {internalCodeOptions.map((item, optionIndex) => (
                            <button
                              key={item.internalCode}
                              type="button"
                              className={`internal-code-option ${optionIndex === Math.min(highlightedInternalCodeIndex, Math.max(internalCodeOptions.length - 1, 0)) ? 'active' : ''}`}
                              onMouseDown={(event) => event.preventDefault()}
                              onMouseEnter={() => setHighlightedInternalCodeIndex(optionIndex)}
                              onClick={() => {
                                applyInternalCode(section.id, index, item.internalCode);
                                setOpenInternalCodeKey(null);
                              }}
                            >
                              <span className="internal-code-option-code">{item.internalCode}</span>
                              <span className="internal-code-option-meta">{`${item.httpStatus} - ${item.message}`}</span>
                            </button>
                          ))}
                        </div>,
                        document.body
                      )}
                    </div>
                    {hasUnknownInternalCode && <div className="inline-warning">Код не найден в каталоге</div>}
                  </td>
                  <td>
                    <div className="error-response-cell">
                      <input
                        type="text"
                        disabled
                        value={row.message}
                        title="Описание заполняется автоматически по internalCode"
                      />
                      <textarea
                        rows={getDynamicTextareaRows(row.responseCode, 3, 10)}
                        value={row.responseCode}
                        onChange={(e) => updateErrorRow(section.id, index, (current) => ({ ...current, responseCode: e.target.value }))}
                        placeholder="Код ответа для WIKI (JSON)"
                      />
                      <button className="ghost small" type="button" onClick={() => formatErrorResponseCode(section.id, index)}>
                        Форматировать JSON
                      </button>
                    </div>
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

      {showResetEndpointDialog && (
        <div
          className="import-routing-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Подтверждение создания нового эндпоинта"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowResetEndpointDialog(false);
            }
          }}
        >
          <div className="import-routing-card">
            <h2>Создать новый эндпоинт?</h2>
            <p className="import-routing-file">Текущие несохраненные данные будут потеряны.</p>
            <div className="import-routing-actions">
              <button type="button" className="ghost" onClick={() => setShowResetEndpointDialog(false)}>
                Отмена
              </button>
              <button type="button" onClick={confirmResetProject}>
                Создать новый эндпоинт
              </button>
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
            <h2>Импорт в Source</h2>
            <p className="import-routing-file">Поддерживается JSON и cURL</p>

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
                placeholder="Вставьте JSON или cURL"
              />
            </label>

            <div className="import-routing-actions">
              <button type="button" className="ghost" onClick={() => setSourceTextImport(null)}>Отмена</button>
              <button type="button" onClick={applySourceTextImport} disabled={!sourceTextImport.draft.trim()}>
                Импортировать текст
              </button>
            </div>
          </div>
        </div>
      )}

      <header ref={topbarRef} className="topbar">
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
            Новый эндпоинт
          </button>
          <button className="ghost" type="button" onClick={() => openProjectImportDialog(false)}>Импорт</button>
          <input ref={importInputRef} className="hidden-file-input" type="file" accept="application/json" onChange={(e) => importProjectJson(e.target.files?.[0])} />
          <button className="ghost" onClick={exportProjectJson} disabled={!activeMethod} title={exportTitle}>
            Экспорт JSON
          </button>
          <button data-onboarding-anchor="export-docs" onClick={openHtmlPreview} disabled={!activeMethod} title={exportTitle}>Экспорт HTML</button>
          <button onClick={openWikiPreview} disabled={!activeMethod} title={exportTitle}>Экспорт Wiki</button>
          </div>
          <div className="actions-side">
          <div className="history-controls" role="group" aria-label="История изменений">
            <button type="button" className="ghost history-btn" onClick={undoWorkspace} disabled={!canUndo} title="Отменить (Ctrl+Z)">
              ↶
            </button>
            <button type="button" className="ghost history-btn" onClick={redoWorkspace} disabled={!canRedo} title="Повторить (Ctrl+Shift+Z / Ctrl+Y)">
              ↷
            </button>
          </div>
          <div className="actions-side-divider" aria-hidden />
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
          <div className={`badge autosave-badge ${autosave.state}`} aria-live="polite" title={autosave.state === 'saved' ? 'Автосохранение выполнено' : undefined}>
            {autosave.state === 'saving' && 'Сохранение...'}
            {autosave.state === 'saved' && (
              <>
                <span className="status-icon" aria-hidden />
                <span className="status-time">{autosave.at ?? '--:--'}</span>
              </>
            )}
            {autosave.state === 'error' && 'Ошибка сохранения'}
            {autosave.state === 'idle' && 'Готово'}
          </div>
          </div>
        </div>
      </header>

      {importError && <div className="alert error">Ошибка импорта: {importError}</div>}
      {toastMessage && <div className="toast-info">{toastMessage}</div>}

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
            selectedSection.lastSyncedFormat,
            'Параметры отличаются от исходного источника',
            selectedSection.sectionType === 'response' ? 'Исправить json ответа' : 'Исправить json запроса'
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
            `${getSectionSideLabel(selectedSection, 'client')} отличается от источника`,
            selectedSection.sectionType === 'response' ? 'Исправить json ответа' : 'Исправить json запроса'
          )}
      </div>

      <div className="layout">
        <aside className="sidebar" role="region" aria-label={ENABLE_MULTI_METHODS ? 'Методы и секции' : 'Секции'}>
          {ENABLE_MULTI_METHODS && (
            <div className="sidebar-panel method-panel">
              <div className="sidebar-panel-head">
                <div className="muted">Методы</div>
              </div>
              <div className="method-list" role="listbox" aria-label="Список методов">
                {methods.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    className={`section-item method-item ${activeMethod?.id === method.id ? 'active' : ''}`}
                    onClick={() => switchMethod(method)}
                  >
                    <div className="section-title">{method.name}</div>
                    <div className="chips">
                      <span className="chip">{method.sections.length} секц.</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="method-actions">
                <button className="ghost small" type="button" onClick={createMethod}>
                  + Метод
                </button>
                <button className="ghost small" type="button" onClick={deleteActiveMethod} disabled={methods.length <= 1 || !activeMethod}>
                  Удалить метод
                </button>
              </div>
              {activeMethod && (
                <input
                  ref={methodNameInputRef}
                  className="inline-input"
                  type="text"
                  value={activeMethod.name}
                  onChange={(event) => updateActiveMethodName(event.target.value)}
                  onBlur={normalizeActiveMethodName}
                  placeholder="Название метода"
                  aria-label="Название активного метода"
                />
              )}
              {methodNameWarning && <div className="method-warning">{methodNameWarning}</div>}
            </div>
          )}

          <div className={`sidebar-panel section-panel ${isSectionPanelPulse ? 'section-panel-pulse' : ''}`}>
            <div className="section-list-head">
              <div className="muted">Секции</div>
              <div className="context-pill context-pill-transition" aria-live="polite">
                {activeMethod ? activeMethod.name : 'Метод не выбран'}
              </div>
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
              {sections.length === 0 && (
                <div className="empty-state">
                  <div>У выбранного метода пока нет секций.</div>
                  <button className="ghost small" type="button" onClick={() => addSectionByType('text')}>
                    + Добавить первую секцию
                  </button>
                </div>
              )}
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
          </div>
        </aside>

        <main className="workspace" role="main">
          {ONBOARDING_FEATURES.onboardingV1 &&
            ONBOARDING_FEATURES.onboardingGuidedMode &&
            onboardingState.status === 'active' &&
            !showOnboardingEntry && (
              <section
                className="onboarding-stepbar collapsed"
                data-onboarding-anchor="choose-entry"
                aria-live="polite"
                aria-label="Пошаговый онбординг"
              >
                <div className="onboarding-stepbar-track" role="list" aria-label="Прогресс шагов">
                  {ONBOARDING_STEPS.map((step, index) => {
                    const isDone = index < onboardingResolvedStepIndex;
                    const isCurrent = step.id === activeOnboardingStep.id;
                    const access = canNavigateToOnboardingStep(step.id);
                    return (
                      <button
                        key={step.id}
                        type="button"
                        role="listitem"
                        className={`onboarding-step-chip ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''} ${access.allowed ? 'available' : 'blocked'}`}
                        aria-current={isCurrent ? 'step' : undefined}
                        aria-disabled={!access.allowed}
                        disabled={!access.allowed}
                        title={access.allowed ? step.description : access.reason}
                        onClick={() => jumpToOnboardingStep(step.id)}
                      >
                        {step.title}
                      </button>
                    );
                  })}
                </div>
                {onboardingStepHint && <div className="onboarding-stepbar-tip">{onboardingStepHint}</div>}
                <div className="onboarding-stepbar-actions">
                  <button
                    type="button"
                    className="small onboarding-stepbar-icon-btn primary"
                    aria-label={onboardingPrimaryActionLabel}
                    title={onboardingPrimaryActionLabel}
                    onClick={activeOnboardingHint ? handleActiveOnboardingHintAction : focusOnboardingCurrentStep}
                  >
                    <svg className="onboarding-eye-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M2 12c2.4-4 5.8-6 10-6s7.6 2 10 6c-2.4 4-5.8 6-10 6s-7.6-2-10-6Z" />
                      <circle cx="12" cy="12" r="3.2" />
                    </svg>
                  </button>
                </div>
              </section>
            )}
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
                              onClick={() => applyTextEditorCommand(selectedSection.id, 'bold')}
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
                              onClick={() => applyTextEditorCommand(selectedSection.id, 'code')}
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
                              onClick={() => applyTextEditorCommand(selectedSection.id, 'highlight', { color: DEFAULT_RICH_TEXT_HIGHLIGHT })}
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
                        <EditorContent
                          editor={textEditor}
                          onKeyDown={(event) => {
                            const handled = handleRichTextHotkeys(event, (action) => applyTextEditorCommand(selectedSection.id, action));
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
          ) : (
            <div className="muted">Секция не выбрана</div>
          )}
        </main>
      </div>
    </div>
  );
}



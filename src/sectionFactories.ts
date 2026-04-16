import { ERROR_CATALOG_BY_CODE } from './errorCatalog';
import {
  DEFAULT_API_KEY_EXAMPLE,
  DEFAULT_API_KEY_HEADER,
  DEFAULT_BASIC_PASSWORD,
  DEFAULT_BASIC_USERNAME,
  DEFAULT_BEARER_TOKEN_EXAMPLE,
  OPTIONAL_MARK
} from './requestHeaders';
import { DEFAULT_SECTION_TITLE } from './sectionTitles';
import type { AddableBlockType } from './components/MethodSectionSidebar';
import type { DiagramItem, DiagramSection, DocSection, ErrorRow, ErrorsSection, ParsedSection, ParsedSectionType, ValidationRuleRow } from './types';

function deepClone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export const TYPE_OPTIONS_COMMON = ['string', 'int', 'long', 'boolean', 'number', 'object', 'array', 'array_object', 'null'];
export const TYPE_OPTIONS_EXTENDED = [
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
export const REQUIRED_OPTIONS = ['+', OPTIONAL_MARK, '-'];
export const VALIDATION_CASE_OPTIONS = [
  'NotNull',
  'NotBlank',
  'NotEmpty',
  'Size',
  'Positive',
  'Negative',
  'Past',
  'Future',
  'PastOrPresent',
  'FutureOrPresent',
  'Pattern',
  'Digits',
  'Custom'
];

export const RICH_TEXT_HIGHLIGHT_OPTIONS = [
  { value: '#fef08a', label: 'Желтый' },
  { value: '#bbf7d0', label: 'Зеленый' },
  { value: '#fde68a', label: 'Песочный' },
  { value: '#fecdd3', label: 'Розовый' },
  { value: '#bfdbfe', label: 'Синий' }
] as const;

export function createParsedSection(sectionType: ParsedSectionType, id = `custom-${sectionType}-${Date.now()}`): ParsedSection {
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
    schemaInput: '',
    rows: [],
    error: '',
    domainModelEnabled: sectionType !== 'generic' ? false : undefined,
    clientFormat: sectionType !== 'generic' ? 'json' : undefined,
    clientLastSyncedFormat: sectionType !== 'generic' ? 'json' : undefined,
    clientInput: sectionType !== 'generic' ? '' : undefined,
    clientSchemaInput: sectionType !== 'generic' ? '' : undefined,
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

export function createDiagramItem(id = `diagram-item-${Date.now()}`): DiagramItem {
  return {
    id,
    title: '',
    engine: 'mermaid',
    code: '',
    description: ''
  };
}

export function createDiagramSection(id = `custom-diagram-${Date.now()}`): DiagramSection {
  return {
    id,
    title: 'Диаграмма',
    enabled: true,
    kind: 'diagram',
    diagrams: [createDiagramItem()]
  };
}

export function createErrorRow(): ErrorRow {
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

export function createValidationRuleRow(): ValidationRuleRow {
  return {
    parameter: '',
    validationCase: VALIDATION_CASE_OPTIONS[0],
    condition: '',
    cause: ''
  };
}

export function getValidationCaseOptionsForSection(section: ErrorsSection): string[] {
  const options = new Set<string>(VALIDATION_CASE_OPTIONS);
  for (const rule of section.validationRules) {
    const value = rule.validationCase.trim();
    if (value) options.add(value);
  }
  return Array.from(options);
}

export function createErrorsSection(id = 'errors', title = 'Ошибки'): ErrorsSection {
  return {
    id,
    title,
    enabled: true,
    kind: 'errors',
    rows: [createErrorRow()],
    validationRules: [createValidationRuleRow()]
  };
}

export function createSectionId(prefix = 'section'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function cloneSectionForPaste(section: DocSection): DocSection {
  const cloned = deepClone(section);
  const nextSectionId = createSectionId(cloned.kind);

  if (cloned.kind === 'diagram') {
    return {
      ...cloned,
      id: nextSectionId,
      diagrams: cloned.diagrams.map((diagram) => ({
        ...diagram,
        id: createSectionId('diagram-item')
      }))
    };
  }

  return {
    ...cloned,
    id: nextSectionId
  };
}

export function createSectionFromBlockType(blockType: AddableBlockType): DocSection {
  if (blockType === 'request') {
    return createParsedSection('request', createSectionId('request'));
  }
  if (blockType === 'response') {
    return createParsedSection('response', createSectionId('response'));
  }
  if (blockType === 'error-logic') {
    return createErrorsSection(createSectionId('errors'), 'Ошибки');
  }
  if (blockType === 'diagram') {
    return createDiagramSection(createSectionId('diagram'));
  }

  return {
    id: createSectionId('text'),
    title: 'Новый раздел',
    enabled: true,
    kind: 'text',
    value: ''
  };
}

export function normalizeLegacyErrorRowsInSections(sections: DocSection[]): DocSection[] {
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
        serverHttpStatus: nextRow.errorType === 'BusinessException' ? '422' : (preset?.httpStatus ?? nextRow.serverHttpStatus),
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

export function createInitialSections(): DocSection[] {
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

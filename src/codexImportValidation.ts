import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import schema from './importContract/workspace-v3.schema.json';
import { validateImportedWorkspace, type ImportIssue } from './projectImportValidation';
import { sanitizeSections } from './sectionTitles';
import { parseToRows } from './parsers';
import { buildInputFromRows } from './sourceSync';
import type { ParseFormat, ParsedRow, ParsedSection, WorkspaceProjectData } from './types';

export const CODEX_IMPORT_PROFILE = schema.properties.importProfile.const;

// Conditional schemas inherit their object type and required properties from the enclosing schema.
const ajv = new Ajv({
  allErrors: true, strict: true, strictTypes: false, strictRequired: false,
  coerceTypes: false, useDefaults: false, removeAdditional: false, ownProperties: true
});
addFormats(ajv, ['date-time']);
const validateSchema = ajv.compile<WorkspaceProjectData>(schema);
const requestFields = Object.keys(schema.definitions.parsedSection.properties)
  .filter(key => /^(auth|external)|^request(?:Url|Method|Protocol)$/.test(key));

function issuePath(error: ErrorObject, payload: unknown): string {
  const parts = error.instancePath.split('/').slice(1).map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (error.keyword === 'required') parts.push(String(error.params.missingProperty));
  if (error.keyword === 'additionalProperties') parts.push(String(error.params.additionalProperty));
  let current = payload;
  let path = '';
  for (const part of parts) {
    path += Array.isArray(current) ? `[${part}]`
      : /^[A-Za-z_$][\w$]*$/.test(part) ? `${path ? '.' : ''}${part}` : `[${JSON.stringify(part)}]`;
    current = current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined;
  }
  return path || '$';
}

function schemaIssue(error: ErrorObject, payload: unknown): ImportIssue {
  const message = error.keyword === 'required' ? 'Обязательное поле профиля Codex отсутствует'
    : error.keyword === 'additionalProperties' ? 'Неизвестное поле профиля Codex'
    : error.keyword === 'const' ? `Ожидается ${JSON.stringify(error.params.allowedValue)}`
    : error.keyword === 'enum' ? `Допустимые значения: ${error.params.allowedValues.join(', ')}`
    : `Не соответствует схеме Codex: ${error.message}`;
  return { level: 'error', path: issuePath(error, payload), message };
}

function equalJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => equalJson(value, right[index]));
  if (left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
    const a = left as Record<string, unknown>;
    const b = right as Record<string, unknown>;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equalJson(a[key], b[key]));
  }
  return false;
}

function exampleError(row: ParsedRow): string | undefined {
  const value = row.example;
  if (value !== value.trim()) return 'Пример не должен содержать внешние пробелы: восстановление source их удаляет';
  if (['string', 'element', 'attribute'].includes(row.type)) return;
  if (row.type === 'boolean') return ['true', 'false'].includes(value) ? undefined : 'Для boolean нужен пример true или false';
  if (row.type === 'null') return value === 'null' ? undefined : 'Для null нужен пример null';
  if (['int', 'long', 'number'].includes(row.type)) {
    const validNumber = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value));
    if (!validNumber) return 'Нужен конечный числовой пример в синтаксисе JSON';
    if (row.type !== 'number' && !Number.isSafeInteger(Number(value))) return 'Целый пример должен точно представляться JavaScript Number';
    if (row.type === 'int' && (Number(value) < -2147483648 || Number(value) > 2147483647)) return 'int должен находиться в диапазоне signed int32';
    return;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    const array = row.type === 'array' || row.type === 'array_object';
    if (array ? !Array.isArray(parsed) : !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return array ? 'Нужен строковый JSON-массив' : 'Нужен строковый JSON-объект';
    if (row.type === 'array_object' && (parsed as unknown[]).some(item => !item || typeof item !== 'object' || Array.isArray(item))) return 'array_object должен содержать только объекты';
  } catch { return 'Пример объекта/массива должен быть валидным JSON, без placeholder «-»'; }
}

const jsonPath = /^(?:[A-Za-z_][A-Za-z0-9_-]*|\[0\])(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[0\])*$/;
const reservedKinds: Record<string, string> = { goal: 'text', functional: 'text', 'non-functional': 'text', 'process-diagram': 'diagram', request: 'parsed', response: 'parsed', errors: 'errors' };

/** Strict generation checks supplement the published JSON Schema; no data is coerced or changed. */
export function validateCodexProjectImport(payload: unknown): ImportIssue[] {
  if (!validateSchema(payload)) return (validateSchema.errors ?? []).filter(error => error.keyword !== 'if').map(error => schemaIssue(error, payload));
  const workspace = payload;
  const issues = validateImportedWorkspace(workspace).map(issue => ({ ...issue, level: 'error' as const }));
  const error = (path: string, message: string) => issues.push({ level: 'error', path, message });
  if (!workspace.methods.some(method => method.id === workspace.activeMethodId)) error('activeMethodId', 'Активный метод должен существовать');
  workspace.projectSections!.forEach((section, index) => {
    if (section.order !== index) error(`projectSections[${index}].order`, 'order должен совпадать с индексом раздела; импорт не должен менять порядок');
    if (section.type !== 'diagram' && (section.diagramEngine !== undefined || section.diagramCode !== undefined)) error(`projectSections[${index}]`, 'Поля диаграммы допустимы только для type diagram');
  });
  workspace.groups.forEach((group, index) => group.links.forEach((link, linkIndex) => {
    for (const key of ['fromMethodId', 'toMethodId'] as const) if (!group.methodIds.includes(link[key])) error(`groups[${index}].links[${linkIndex}].${key}`, 'Связанный метод должен входить в эту группу');
  }));
  workspace.methods.forEach((method, methodIndex) => {
    const base = `methods[${methodIndex}].sections`;
    for (const id of ['request', 'response']) if (!method.sections.some(section => section.id === id && section.kind === 'parsed')) error(base, `Метод должен содержать каноническую секцию ${id}`);
    const rowIds = new Set<string>();
    const normalizedSections = sanitizeSections(method.sections);
    method.sections.forEach((section, sectionIndex) => {
      const path = `${base}[${sectionIndex}]`;
      if (['body', 'external-url'].includes(section.id)) error(`${path}.id`, 'Legacy ID запрещён в профиле генерации');
      if (reservedKinds[section.id] && reservedKinds[section.id] !== section.kind) error(`${path}.kind`, 'kind не соответствует каноническому ID секции');
      if (section.kind === 'errors') {
        const normalized = normalizedSections.find(item => item.id === section.id);
        if (normalized?.kind === 'errors') section.rows.forEach((row, index) => {
          for (const field of ['internalCode', 'serverHttpStatus', 'message', 'clientResponse', 'clientResponseCode'] as const) if (row[field] !== normalized.rows[index][field]) error(`${path}.rows[${index}].${field}`, 'Значение изменится при нормализации ошибок; согласуйте его с каталогом');
          for (const field of ['clientResponseCode', 'responseCode'] as const) if (row[field]) {
            try { JSON.parse(row[field]); } catch { error(`${path}.rows[${index}].${field}`, 'Нужен JSON-пример, записанный строкой'); }
          }
        });
      }
      if (section.kind !== 'parsed') return;
      if (section.sectionType === 'generic' && ['request', 'response'].includes(section.id)) error(`${path}.sectionType`, 'Канонический ID не допускает generic');
      if (section.sectionType !== 'request') for (const field of requestFields) if (Object.hasOwn(section, field)) error(`${path}.${field}`, 'Поле допустимо только для request');
      if (!section.domainModelEnabled && section.externalRequestUrl) error(`${path}.externalRequestUrl`, 'В простом режиме нет отдельного Client endpoint');
      if (section.sectionType === 'request') validateAuth(section, path, error);
      for (const side of ['rows', 'clientRows'] as const) {
        const sideIssueCount = issues.length;
        const rows = section[side] ?? [];
        const format = side === 'rows' ? section.format : section.clientFormat!;
        const sourceKey = side === 'rows' ? 'input' : 'clientInput';
        const syncKey = side === 'rows' ? 'lastSyncedFormat' : 'clientLastSyncedFormat';
        if (section[syncKey] !== format) error(`${path}.${syncKey}`, 'Формат последней синхронизации должен совпадать с format этой стороны');
        rows.forEach((row, index) => {
          const rowPath = `${path}.${side}[${index}]`;
          if (rowIds.has(row.id!)) error(`${rowPath}.id`, 'ID строки должен быть уникален во всём методе, включая обе стороны');
          rowIds.add(row.id!);
          if (row.sourceField !== row.field) error(`${rowPath}.sourceField`, 'В профиле Codex sourceField должен точно совпадать с полным field');
          if (section.sectionType !== 'request' && row.source !== 'body') error(`${rowPath}.source`, 'У response/generic строки должны иметь source body');
          if (section.sectionType === 'request' && (side === 'rows' ? section.requestMethod : section.externalRequestMethod) === 'GET' && row.source === 'body') error(`${rowPath}.source`, 'GET не допускает body: используйте query');
          const example = exampleError(row);
          if (example) error(`${rowPath}.example`, example);
          if (format !== 'xml' && ['element', 'attribute'].includes(row.type)) error(`${rowPath}.type`, 'element/attribute допустимы только для XML');
          if (row.source === 'body' && format !== 'xml') validateJsonPath(row, rows, index, rowPath, error);
        });
        const headers = new Set<string>();
        rows.forEach((row, index) => {
          if (row.source !== 'header') return;
          const key = row.field.toLowerCase();
          if (headers.has(key)) error(`${path}.${side}[${index}].field`, 'HTTP headers должны быть уникальны без учёта регистра');
          headers.add(key);
        });
        // Never reconstruct unsupported paths or values while collecting diagnostics.
        if (issues.length === sideIssueCount) validateSource(section[sourceKey] ?? '', format, rows, `${path}.${sourceKey}`, error);
      }
    });
  });
  workspace.flows!.forEach((flow, flowIndex) => flow.edges.forEach((edge, edgeIndex) => edge.mappings!.forEach((mapping, mappingIndex) => {
    for (const side of ['source', 'target'] as const) {
      const ref = mapping[side];
      const path = `flows[${flowIndex}].edges[${edgeIndex}].mappings[${mappingIndex}].${side}`;
      if (ref.nodeId !== (side === 'source' ? edge.fromNodeId : edge.toNodeId)) error(`${path}.nodeId`, 'Источник/цель маппинга должны совпадать с концами этого ребра');
      if (ref.side === 'context') {
        if (ref.rowId !== '') error(`${path}.rowId`, 'Для context rowId должен быть пустым');
        continue;
      }
      const node = flow.nodes.find(item => item.id === ref.nodeId);
      const method = workspace.methods.find(item => item.id === node?.methodRef?.methodId);
      const rows = method?.sections.filter((item): item is ParsedSection => item.kind === 'parsed' && item.sectionType === ref.side).flatMap(item => [...item.rows, ...(item.clientRows ?? [])]) ?? [];
      if (!ref.rowId) error(`${path}.rowId`, 'Для request/response обязателен ID строки');
      else if (!rows.some(row => row.id === ref.rowId && row.sourceField === ref.fieldPath)) error(path, 'rowId и fieldPath должны указывать на одну строку указанной стороны метода');
    }
  })));
  return issues;
}

function validateAuth(section: ParsedSection, path: string, error: (path: string, message: string) => void): void {
  const properties = section as unknown as Record<string, string>;
  for (const prefix of ['auth', 'externalAuth']) {
    const type = properties[`${prefix}Type`];
    if (prefix === 'externalAuth' && !section.domainModelEnabled && type !== 'none') error(`${path}.${prefix}Type`, 'В простом режиме externalAuthType должен быть none');
    const used = type === 'bearer' ? ['TokenExample'] : type === 'basic' ? ['Username', 'Password'] : type === 'api-key' ? ['HeaderName', 'ApiKeyExample'] : [];
    for (const suffix of ['HeaderName', 'TokenExample', 'Username', 'Password', 'ApiKeyExample']) {
      const field = `${prefix}${suffix}`;
      if (used.includes(suffix)) {
        if (!properties[field].trim()) error(`${path}.${field}`, 'Укажите явный учебный placeholder вместо неявного значения авторизации по умолчанию');
      } else if (properties[field] !== '') error(`${path}.${field}`, 'Неиспользуемое поле авторизации должно быть пустым');
    }
  }
}

function validateJsonPath(row: ParsedRow, rows: ParsedRow[], index: number, path: string, error: (path: string, message: string) => void): void {
  if (row.field === '$') {
    if (!['array', 'array_object'].includes(row.type)) error(`${path}.type`, '$ обозначает только корневой массив');
    if (index !== 0) error(`${path}.field`, 'Корневой массив $ должен быть первой строкой');
    return;
  }
  if (!jsonPath.test(row.field)) { error(`${path}.field`, 'Используйте полный путь name, object.name, items[0].id или [0].id; [] и $. запрещены'); return; }
  const tokens = row.field.replaceAll('[0]', '.0').split('.').filter(Boolean);
  if (tokens.some(token => ['__proto__', 'constructor', 'prototype'].includes(token))) error(`${path}.field`, 'Путь не поддерживается текущим восстановлением JSON');
  if (row.field.startsWith('[0]') && !rows.some(item => item.field === '$' && ['array', 'array_object'].includes(item.type))) error(`${path}.field`, 'Для корневого массива нужна первая строка $');
  rows.forEach((parent, parentIndex) => {
    if (parent.source !== 'body' || parent.field === '$' || !(row.field.startsWith(`${parent.field}.`) || row.field.startsWith(`${parent.field}[`))) return;
    if (!['object', 'map', 'array', 'array_object'].includes(parent.type)) error(`${path}.field`, 'Родитель пути должен иметь тип object/map/array/array_object');
    const array = parent.type === 'array' || parent.type === 'array_object';
    if (array !== row.field.startsWith(`${parent.field}[`)) error(`${path}.field`, 'Для array используйте [0], для object/map — точку');
    if (parentIndex > index) error(`${path}.field`, 'Строки контейнеров должны находиться перед дочерними строками');
  });
}

function validateSource(input: string, format: ParseFormat, rows: ParsedRow[], path: string, error: (path: string, message: string) => void): void {
  if (!input) return;
  try {
    if (format === 'json') {
      const original: unknown = JSON.parse(input);
      const rebuilt: unknown = JSON.parse(buildInputFromRows('json', rows));
      if (!equalJson(original, rebuilt)) error(path, 'JSON source должен совпадать с body, восстановленным из канонических rows; строки не парсятся автоматически');
    } else {
      parseToRows(format, input);
    }
  } catch (cause) { error(path, `Некорректный ${format} source: ${cause instanceof Error ? cause.message : 'ошибка разбора'}`); }
}

import { getParsedRowKey, getValidClientMappings } from './requestHeaders';
import type { DocSection, ParsedSection, WorkspaceProjectData } from './types';

export type ImportIssue = { level: 'error' | 'warning'; path: string; message: string };
type Shape = Record<string, Rule>;
type Rule = {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  values?: readonly unknown[];
  shape?: Shape;
  items?: Rule;
  entries?: Rule;
};
const string: Rule = { type: 'string' };
const boolean: Rule = { type: 'boolean' };
const number: Rule = { type: 'number' };
const strings = (...keys: string[]): Shape => Object.fromEntries(keys.map(key => [key, string]));
const choice = (...values: string[]): Rule => ({ type: 'string', values });
const object = (shape: Shape, required = false): Rule => ({ type: 'object', shape, required });
const array = (items: Rule, required = false): Rule => ({ type: 'array', items, required });
const rowShape: Shape = {
  ...strings('id', 'field', 'sourceField', 'clientField', 'clientSourceField', 'type', 'required', 'validations', 'validation', 'description', 'example'),
  origin: choice('parsed', 'manual', 'generated'), clientOrigin: choice('parsed', 'manual', 'generated'),
  source: choice('header', 'body', 'query', 'url', 'parsed'), enabled: boolean, maskInLogs: boolean
};
const sectionBase: Shape = {
  id: { ...string, required: true }, title: string, enabled: boolean,
  kind: { ...choice('text', 'parsed', 'diagram', 'errors'), required: true }
};
const sectionShapes: Record<string, Shape> = {
  text: { value: string, required: boolean },
  diagram: { diagrams: array(object({ ...strings('id', 'title', 'code', 'description'), engine: choice('mermaid', 'plantuml') })) },
  errors: {
    rows: array(object({
      ...strings('clientHttpStatus', 'clientResponse', 'clientResponseCode', 'trigger', 'serverHttpStatus', 'internalCode', 'message', 'responseCode'),
      errorType: choice('CommonException', 'BusinessException', 'AlertException', '-')
    })),
    validationRules: array(object(strings('parameter', 'validationCase', 'condition', 'cause')))
  },
  parsed: {
    ...strings('input', 'schemaInput', 'error', 'clientInput', 'clientSchemaInput', 'clientError',
      'authHeaderName', 'authTokenExample', 'authUsername', 'authPassword', 'authApiKeyExample', 'requestUrl',
      'externalRequestUrl', 'externalAuthHeaderName', 'externalAuthTokenExample', 'externalAuthUsername', 'externalAuthPassword', 'externalAuthApiKeyExample'),
    sectionType: choice('request', 'response', 'generic'),
    format: choice('json', 'curl', 'xml'), lastSyncedFormat: choice('json', 'curl', 'xml'),
    clientFormat: choice('json', 'curl', 'xml'), clientLastSyncedFormat: choice('json', 'curl', 'xml'),
    domainModelEnabled: boolean, rows: array(object(rowShape)), clientRows: array(object(rowShape)),
    clientMappings: { type: 'object', entries: string },
    requestColumnOrder: array(choice('field', 'type', 'required', 'validations', 'clientField', 'description', 'maskInLogs', 'example')),
    authType: choice('none', 'bearer', 'basic', 'api-key'), externalAuthType: choice('none', 'bearer', 'basic', 'api-key'),
    requestMethod: choice('GET', 'POST', 'PUT', 'PATCH', 'DELETE'), externalRequestMethod: choice('GET', 'POST', 'PUT', 'PATCH', 'DELETE'),
    requestProtocol: choice('REST', 'SOAP')
  }
};
const methodShape: Shape = {
  ...strings('id', 'name', 'updatedAt', 'jiraTicket', 'epic', 'initiators', 'responsible', 'externalUrl'),
  status: choice('draft', 'review', 'done'), sections: array(object(sectionBase), true)
};
const fieldRef = (target = false): Rule => object({
  nodeId: { ...string, required: true }, side: { ...choice(...(target ? ['request', 'context'] : ['request', 'response', 'context'])), required: true },
  rowId: string, fieldPath: string
}, true);
const workspaceShape: Shape = {
  ...strings('projectName', 'updatedAt', 'activeMethodId'),
  methods: array(object(methodShape), true),
  groups: array(object({
    ...strings('id', 'name'), methodIds: array(string), links: array(object({
      fromMethodId: { ...string, required: true }, toMethodId: { ...string, required: true },
      relationType: choice('request-response', 'event', 'sync', 'async', 'custom'), note: string
    }))
  })),
  projectSections: array(object({
    ...strings('id', 'title', 'content', 'diagramCode'), enabled: boolean, order: number,
    type: choice('text', 'markdown', 'note', 'checklist', 'diagram'), diagramEngine: choice('mermaid', 'plantuml')
  })),
  flows: array(object({
    ...strings('id', 'name', 'description', 'createdAt', 'updatedAt'),
    nodes: array(object({
      ...strings('id', 'label', 'description', 'actor', 'noteContent'), type: choice('start', 'method', 'end', 'note'),
      position: object({ x: number, y: number }), methodRef: object({ methodId: { ...string, required: true } }),
      preconditions: array(string), postconditions: array(string)
    })),
    edges: array(object({
      ...strings('id', 'label', 'condition'), type: choice('sequence'),
      fromNodeId: { ...string, required: true }, toNodeId: { ...string, required: true },
      mappings: array(object({ ...strings('id', 'transform', 'note'), source: fieldRef(), target: fieldRef(true) }))
    }))
  }))
};

export function isImportRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function check(value: unknown, rule: Rule, path: string, issues: ImportIssue[]): void {
  const error = (message: string) => issues.push({ level: 'error', path, message });
  if (value === undefined) {
    if (rule.required) error('Обязательное поле отсутствует');
    return;
  }
  const matches = rule.type === 'array' ? Array.isArray(value)
    : rule.type === 'object' ? isImportRecord(value)
    : typeof value === rule.type && (rule.type !== 'number' || Number.isFinite(value));
  if (!matches) { error(`Ожидается ${rule.type}`); return; }
  if (rule.values && !rule.values.includes(value)) error(`Допустимые значения: ${rule.values.join(', ')}`);
  if (Array.isArray(value) && rule.items) value.forEach((item, index) => check(item, rule.items!, `${path}[${index}]`, issues));
  if (isImportRecord(value)) {
    for (const [key, child] of Object.entries(rule.shape ?? {})) check(value[key], child, path ? `${path}.${key}` : key, issues);
    if (rule.entries) for (const [key, entry] of Object.entries(value)) check(entry, rule.entries, `${path}[${JSON.stringify(key)}]`, issues);
  }
}

/** Allows omitted legacy defaults, but never coerces present values of the wrong type. */
export function validateProjectImportPayload(payload: unknown, kind: 'workspace' | 'method' | 'sections'): ImportIssue[] {
  const issues: ImportIssue[] = [];
  check(payload, object(kind === 'workspace' ? workspaceShape : methodShape), '', issues);
  if (!isImportRecord(payload)) return issues;
  if (payload.version !== undefined) check(payload.version, { ...number, values: [1, 2, 3] }, 'version', issues);
  if (kind === 'workspace' && Array.isArray(payload.methods) && payload.methods.length === 0) {
    issues.push({ level: 'error', path: 'methods', message: 'Проект должен содержать хотя бы один метод' });
  }
  const methods = kind === 'workspace' && Array.isArray(payload.methods) ? payload.methods : [payload];
  methods.forEach((method, methodIndex) => {
    if (!isImportRecord(method) || !Array.isArray(method.sections)) return;
    const path = kind === 'workspace' ? `methods[${methodIndex}].sections` : 'sections';
    method.sections.forEach((section, index) => {
      if (!isImportRecord(section)) return;
      const shape = sectionShapes[String(section.kind)];
      if (shape) check(section, object(shape), `${path}[${index}]`, issues);
      if (typeof section.id === 'string' && !section.id.trim()) issues.push({ level: 'error', path: `${path}[${index}].id`, message: 'ID секции не должен быть пустым' });
    });
  });
  return issues;
}

function uniqueIds(items: { id?: string }[], path: string, issues: ImportIssue[]): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (!item.id) return;
    if (seen.has(item.id)) issues.push({ level: 'error', path: `${path}[${index}].id`, message: `Повторяющийся ID: ${item.id}` });
    seen.add(item.id);
  });
}

export function validateImportedSections(sections: DocSection[], path = 'sections'): ImportIssue[] {
  const issues: ImportIssue[] = [];
  uniqueIds(sections, path, issues);
  sections.forEach((section, index) => {
    const base = `${path}[${index}]`;
    if (section.kind === 'diagram') uniqueIds(section.diagrams, `${base}.diagrams`, issues);
    if (section.kind !== 'parsed') return;
    uniqueIds(section.rows, `${base}.rows`, issues);
    uniqueIds(section.clientRows ?? [], `${base}.clientRows`, issues);
    const validMappings = getValidClientMappings(section);
    for (const [serverKey, clientKey] of Object.entries(section.clientMappings ?? {})) {
      if (validMappings[serverKey] !== clientKey) issues.push({
        level: 'warning', path: `${base}.clientMappings[${JSON.stringify(serverKey)}]`,
        message: 'Маппинг должен связывать существующий ключ Server с ключом Client; эта связь не будет показана'
      });
    }
    for (const side of ['rows', 'clientRows'] as const) {
      const keys = new Set<string>();
      (section[side] ?? []).forEach((row, rowIndex) => {
        const key = getParsedRowKey(row);
        if (key && keys.has(key)) issues.push({ level: 'warning', path: `${base}.${side}[${rowIndex}].sourceField`, message: `Неоднозначный ключ строки: ${key}` });
        keys.add(key);
      });
    }
    if (section.sectionType === 'request' && section.requestMethod === 'GET') section.rows.forEach((row, rowIndex) => {
      if (row.source !== 'query' && row.source !== 'header' && row.source !== 'url') issues.push({
        level: 'warning', path: `${base}.rows[${rowIndex}].source`, message: 'Основная таблица GET показывает параметры query; эта строка в ней не будет показана'
      });
    });
  });
  return issues;
}

/** Drafts may contain stale references; surface them without deleting their contents. */
export function validateImportedWorkspace(workspace: WorkspaceProjectData): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const warning = (path: string, message: string) => issues.push({ level: 'warning', path, message });
  uniqueIds(workspace.methods, 'methods', issues);
  uniqueIds(workspace.groups, 'groups', issues);
  uniqueIds(workspace.projectSections ?? [], 'projectSections', issues);
  uniqueIds(workspace.flows ?? [], 'flows', issues);
  workspace.methods.forEach((method, index) => issues.push(...validateImportedSections(method.sections, `methods[${index}].sections`)));
  const methods = new Map(workspace.methods.map(method => [method.id, method]));
  workspace.groups.forEach((group, index) => {
    group.methodIds.forEach((id, idIndex) => { if (!methods.has(id)) warning(`groups[${index}].methodIds[${idIndex}]`, 'Метод не существует'); });
    group.links.forEach((link, linkIndex) => {
      for (const field of ['fromMethodId', 'toMethodId'] as const) {
        if (!methods.has(link[field])) warning(`groups[${index}].links[${linkIndex}].${field}`, 'Метод не существует');
      }
    });
  });
  workspace.flows?.forEach((flow, flowIndex) => {
    const base = `flows[${flowIndex}]`;
    uniqueIds(flow.nodes, `${base}.nodes`, issues);
    uniqueIds(flow.edges, `${base}.edges`, issues);
    const nodes = new Map(flow.nodes.map(node => [node.id, node]));
    flow.nodes.forEach((node, index) => {
      if (node.methodRef && !methods.has(node.methodRef.methodId)) warning(`${base}.nodes[${index}].methodRef.methodId`, 'Метод не существует');
    });
    flow.edges.forEach((edge, edgeIndex) => {
      const edgePath = `${base}.edges[${edgeIndex}]`;
      for (const field of ['fromNodeId', 'toNodeId'] as const) if (!nodes.has(edge[field])) warning(`${edgePath}.${field}`, 'Узел не существует');
      uniqueIds(edge.mappings ?? [], `${edgePath}.mappings`, issues);
      edge.mappings?.forEach((mapping, mappingIndex) => {
        for (const side of ['source', 'target'] as const) {
          const ref = mapping[side];
          const path = `${edgePath}.mappings[${mappingIndex}].${side}`;
          const node = nodes.get(ref.nodeId);
          if (!node) { warning(`${path}.nodeId`, 'Узел не существует'); continue; }
          if (ref.side === 'context') continue;
          const method = node.methodRef && methods.get(node.methodRef.methodId);
          const sections = method?.sections.filter((section): section is ParsedSection => section.kind === 'parsed' && section.sectionType === ref.side) ?? [];
          const rows = sections.flatMap(section => [...section.rows, ...(section.clientRows ?? [])]);
          if (ref.rowId && !rows.some(row => row.id === ref.rowId)) warning(`${path}.rowId`, 'Строка не существует на указанной стороне метода');
          if (ref.fieldPath && !rows.some(row => row.field === ref.fieldPath || getParsedRowKey(row) === ref.fieldPath)) warning(`${path}.fieldPath`, 'Поле не существует на указанной стороне метода');
        }
      });
    });
  });
  return issues;
}

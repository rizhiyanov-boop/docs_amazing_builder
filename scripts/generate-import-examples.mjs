// Deterministic educational fixtures; no real API addresses, credentials or business rules.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import schema from '../src/importContract/workspace-v3.schema.json' with { type: 'json' };

const timestamp = '2026-10-02T00:00:00.000Z';
const columns = schema.definitions.parsedSection.properties.requestColumnOrder.const;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/ai-import-json/examples');
const row = (id, field, type, example, source = 'body') => ({
  id, field, sourceField: field, type, required: '+', validations: '', description: `Учебное поле ${field}`,
  example, origin: 'generated', source, enabled: true, maskInLogs: false, clientField: ''
});
const parsed = (id, rows, input) => ({
  id, title: id === 'request' ? 'Request' : 'Response', enabled: true, kind: 'parsed', sectionType: id,
  format: 'json', lastSyncedFormat: 'json', input, schemaInput: '', rows, error: '', domainModelEnabled: false,
  clientFormat: 'json', clientLastSyncedFormat: 'json', clientInput: '', clientSchemaInput: '', clientRows: [], clientError: '', clientMappings: {}, requestColumnOrder: [...columns],
  ...(id === 'request' ? {
    authType: 'none', authHeaderName: '', authTokenExample: '', authUsername: '', authPassword: '', authApiKeyExample: '',
    requestUrl: 'https://api.example.test/customers', requestMethod: 'POST', requestProtocol: 'REST',
    externalRequestUrl: '', externalRequestMethod: 'POST', externalAuthType: 'none', externalAuthHeaderName: '',
    externalAuthTokenExample: '', externalAuthUsername: '', externalAuthPassword: '', externalAuthApiKeyExample: ''
  } : {})
});
const text = (id, title, value = '') => ({ id, title, enabled: true, kind: 'text', value });
function method(id = 'method-create', name = 'Учебный POST') {
  return {
    id, name, updatedAt: timestamp, jiraTicket: '', epic: '', initiators: '', responsible: '', externalUrl: '', status: 'draft',
    sections: [
      text('goal', 'Цель', 'Учебный пример структуры импорта; API и правила вымышлены.'), text('functional', 'Функциональные требования'),
      { id: 'process-diagram', title: 'Диаграмма процесса', enabled: true, kind: 'diagram', diagrams: [] },
      parsed('request', [row(`${id}-customer`, 'customerId', 'string', 'demo-001'), row(`${id}-items`, 'items', 'array_object', '[]'), row(`${id}-item-id`, 'items[0].id', 'int', '1')], '{"customerId":"demo-001","items":[{"id":1}]}'),
      parsed('response', [row(`${id}-data`, 'data', 'object', '{}'), row(`${id}-result-id`, 'data.customerId', 'string', 'demo-001'), row(`${id}-tech`, 'techData', 'object', '{}'), row(`${id}-warnings`, 'warnings', 'object', '{}')], '{"data":{"customerId":"demo-001"},"techData":{},"warnings":{}}'),
      { id: 'errors', title: 'Ошибки', enabled: true, kind: 'errors', rows: [], validationRules: [] }, text('non-functional', 'Нефункциональные требования')
    ]
  };
}
const node = (id, type, x, methodId) => ({
  id, type, position: { x, y: 100 }, label: id, description: '', actor: '', noteContent: '', preconditions: [], postconditions: [],
  ...(methodId ? { methodRef: { methodId } } : {})
});
const edge = (id, fromNodeId, toNodeId, mappings = []) => ({ id, type: 'sequence', fromNodeId, toNodeId, label: '', condition: '', mappings });
function workspace(methods) {
  return {
    importProfile: 'codex-v1', version: 3, projectName: 'Учебный импорт', updatedAt: timestamp, activeMethodId: methods[0].id, methods, groups: [],
    projectSections: [{ id: 'overview', title: 'Overview', enabled: true, type: 'text', content: 'Это учебный пример, а не согласованный API-контракт.', order: 0 }],
    flows: [{
      id: 'flow-main', name: 'Учебный сценарий', description: '', createdAt: timestamp, updatedAt: timestamp,
      nodes: [node('start', 'start', 0), node('call', 'method', 200, methods[0].id), node('end', 'end', 400)],
      edges: [edge('edge-start', 'start', 'call'), edge('edge-end', 'call', 'end')]
    }]
  };
}
const simple = workspace([method()]);
const dual = workspace([method('method-adapter', 'Учебный адаптер'), method('method-next', 'Следующий вызов')]);
const request = dual.methods[0].sections.find(section => section.id === 'request');
Object.assign(request, {
  domainModelEnabled: true, externalRequestUrl: 'https://public.example.test/customers',
  rows: [row('adapter-server-id', 'externalId', 'string', 'demo-001')], input: '{"externalId":"demo-001"}',
  clientRows: [row('adapter-client-id', 'customerId', 'string', 'demo-001')], clientInput: '{"customerId":"demo-001"}', clientMappings: { externalId: 'customerId' }
});
const response = dual.methods[0].sections.find(section => section.id === 'response');
Object.assign(response, {
  domainModelEnabled: true, rows: [row('adapter-server-result', 'externalId', 'string', 'demo-001')], input: '{"externalId":"demo-001"}',
  clientRows: [row('adapter-client-data', 'data', 'object', '{}'), row('adapter-client-result', 'data.customerId', 'string', 'demo-001'), row('adapter-client-tech', 'techData', 'object', '{}'), row('adapter-client-warnings', 'warnings', 'object', '{}')],
  clientInput: '{"data":{"customerId":"demo-001"},"techData":{},"warnings":{}}', clientMappings: { externalId: 'data.customerId' }
});
dual.groups = [{ id: 'group-chain', name: 'Учебная цепочка', methodIds: ['method-adapter', 'method-next'], links: [{ fromMethodId: 'method-adapter', toMethodId: 'method-next', relationType: 'sync', note: '' }] }];
dual.flows[0].nodes = [node('start', 'start', 0), node('adapter', 'method', 200, 'method-adapter'), node('next', 'method', 400, 'method-next'), node('end', 'end', 600)];
dual.flows[0].edges = [edge('edge-start', 'start', 'adapter'), edge('edge-call', 'adapter', 'next', [{
  id: 'mapping-customer', source: { nodeId: 'adapter', side: 'response', rowId: 'adapter-client-result', fieldPath: 'data.customerId' },
  target: { nodeId: 'next', side: 'request', rowId: 'method-next-customer', fieldPath: 'customerId' }, transform: '', note: 'Передача идентификатора в следующий вызов'
}]), edge('edge-end', 'next', 'end')];
const get = workspace([method('method-get', 'Учебный GET')]);
Object.assign(get.methods[0].sections.find(section => section.id === 'request'), {
  requestMethod: 'GET', externalRequestMethod: 'GET', format: 'curl', lastSyncedFormat: 'curl',
  rows: [row('get-query-id', 'customerId', 'string', 'demo-001', 'query')],
  input: 'curl -X GET "https://api.example.test/customers?customerId=demo-001"'
});
const array = workspace([method('method-array', 'Учебный корневой массив')]);
Object.assign(array.methods[0].sections.find(section => section.id === 'request'), {
  rows: [row('array-root', '$', 'array_object', '[]'), row('array-id', '[0].id', 'int', '1')], input: '[{"id":1}]'
});
const xml = workspace([method('method-xml', 'Учебный XML')]);
Object.assign(xml.methods[0].sections.find(section => section.id === 'request'), {
  format: 'xml', lastSyncedFormat: 'xml', rows: [row('xml-id', 'request.id', 'int', '1')], input: '<request><id>1</id></request>'
});
Object.assign(xml.methods[0].sections.find(section => section.id === 'response'), {
  format: 'xml', lastSyncedFormat: 'xml', rows: [row('xml-status', 'response.status', 'string', 'ok')], input: '<response><status>ok</status></response>'
});
await mkdir(root, { recursive: true });
for (const [name, payload] of Object.entries({ 'simple-post': simple, 'orchestration': dual, 'get-query': get, 'root-array': array, xml })) {
  await writeFile(resolve(root, `${name}.json`), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Generated ${name}.json`);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createBridge, diagramMacro, insertDiagrams, nextStart, sameStorage, validateAdditionalOrigin, SESSION_TTL_MS, MAX_TIMER_DELAY } from './bridge.mjs';

const ORIGIN = 'https://docsamazingbuilder.vercel.app';
const TEST_CONFLUENCE_ORIGIN = 'https://confluence-a.example';
const SECOND_CONFLUENCE_ORIGIN = 'https://confluence-b.example';
const TEST_TOKEN = 'test-only-not-a-real-token';
const OPERATION = 'operation_000000000001';
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const closeServer = server => new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
async function waitFor(predicate) {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Test upstream did not reach the expected stage.');
    await new Promise(resolve => setImmediate(resolve));
  }
}
function json(res, status, value, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(value)); }
function page(id, title = 'Page', parentId = null, version = 1, storage = '<p>old</p>') {
  return { id, title, space: { key: 'DI' }, version: { number: version }, ancestors: parentId ? [{ id: parentId, title: 'Parent' }] : [], body: { storage: { value: storage, representation: 'storage' } } };
}
async function fixture(t, options = {}) {
  const pages = new Map([['10', page('10', 'Root')], ['20', page('20', 'Child', '10')]]);
  const state = { writes: 0, reads: 0, treeReads: 0, requests: [], mode: 'normal', release: null };
  const upstream = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    state.requests.push({ path: url.pathname, method: req.method, expand: url.searchParams.get('expand'), origin: req.headers['x-test-target-origin'], authorizationPresent: req.headers.authorization === `Bearer ${TEST_TOKEN}` });
    if (req.headers.authorization !== `Bearer ${TEST_TOKEN}`) { json(res, 401, { message: 'Rejected' }); return; }
    if (state.mode === 'redirect') { json(res, 302, { message: TEST_TOKEN }, { Location: 'https://outside.example/steal' }); return; }
    if (state.mode === 'unauthorized') { json(res, 401, { message: TEST_TOKEN }); return; }
    if (state.mode === 'forbidden') { json(res, 403, { message: TEST_TOKEN }); return; }
    if (url.pathname === '/rest/api/user/current') { json(res, 200, { type: 'known', displayName: 'Never exposed' }); return; }
    if (url.pathname === '/rest/api/space') {
      const results = state.mode === 'space-metadata'
        ? [{ key: 'DI', name: 'Integration', type: 'global', metadata: { labels: { results: [{ name: 'integration' }, { name: 'integration' }, { name: 123 }] } } }, { key: '~user', name: 'User', type: 'personal', metadata: { labels: ['personal'] } }]
        : [{ key: 'DI', name: 'Integration' }];
      json(res, 200, { results, _links: { next: '/rest/api/space?start=50&limit=50' } }); return;
    }
    if (url.pathname === '/rest/api/space/DI') { json(res, 200, { key: 'DI' }); return; }
    if (url.pathname === '/rest/api/space/DI/content/page') {
      state.treeReads += 1;
      json(res, 200, { results: [{ id: '10', title: `Root read ${state.treeReads}`, ancestors: state.mode === 'not-root' ? [{ id: '99' }] : [] }], _links: state.mode === 'bad-pagination' ? { next: 'https://outside.example/?start=50' } : {} }); return;
    }
    if (url.pathname === '/rest/api/content/10/child/page') { json(res, 200, { results: [{ id: '20', title: 'Child', ancestors: [{ id: '10' }] }], _links: { next: '/rest/api/content/10/child/page?start=50&limit=50&expand=ancestors' } }); return; }
    if (req.method === 'GET' && /^\/rest\/api\/content\/\d+$/.test(url.pathname)) {
      state.reads += 1;
      if (state.mode === 'hold-read') await new Promise(resolve => { state.release = resolve; });
      const existing = pages.get(url.pathname.split('/').at(-1));
      if (!existing) { json(res, 404, {}); return; }
      if (state.mode === 'readback-fail' && state.writes) { json(res, 503, { message: TEST_TOKEN }); return; }
      const value = structuredClone(existing);
      if (state.mode === 'readback-nbsp') value.body.storage.value = value.body.storage.value.replace(/&nbsp;/g, '\u00a0');
      if (state.mode === 'readback-changed' && state.writes) value.body.storage.value = '<p>Different</p>';
      if (state.mode === 'different-space') value.space.key = 'OTHER';
      json(res, 200, value); return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (url.pathname === '/rest/api/contentbody/convert/storage') { json(res, 200, { representation: 'storage', value: `<p>${body.value}</p>` }); return; }
    if (req.method === 'POST' && url.pathname === '/rest/api/content') {
      state.writes += 1;
      const created = page('101', body.title, body.ancestors?.at(-1)?.id ?? null, 1, body.body.storage.value);
      pages.set('101', created);
      if (state.mode === 'drop-write') { req.socket.destroy(); return; }
      if (state.mode === 'hold-write') await new Promise(resolve => { state.release = resolve; });
      json(res, 200, { id: created.id }); return;
    }
    if (req.method === 'PUT' && /^\/rest\/api\/content\/\d+$/.test(url.pathname)) {
      if (state.mode === 'put-conflict') { json(res, 409, { message: TEST_TOKEN }); return; }
      state.writes += 1;
      const existing = pages.get(body.id);
      existing.title = body.title; existing.version.number = body.version.number; existing.body.storage.value = body.body.storage.value;
      json(res, 200, { id: existing.id }); return;
    }
    json(res, 404, {});
  });
  const upstreamUrl = await listen(upstream);
  const { httpsOrigins, ...bridgeOptions } = options;
  let connectionOrigin = httpsOrigins?.[0] ?? upstreamUrl;
  const transportRequests = [];
  const bridge = createBridge(httpsOrigins ? {
    ...bridgeOptions,
    fetchImpl: (url, request) => {
      const target = new URL(url);
      transportRequests.push({ origin: target.origin, path: target.pathname, method: request.method });
      if (!httpsOrigins.includes(target.origin)) throw new Error('Test transport rejected an unconfigured origin.');
      // No DNS or remote connection: the injected transport maps fictional HTTPS origins to the local fake server.
      return fetch(upstreamUrl + target.pathname + target.search, { ...request, headers: { ...request.headers, 'X-Test-Target-Origin': target.origin } });
    },
  } : { upstream: upstreamUrl, allowTestUpstream: true, ...bridgeOptions });
  const base = await listen(bridge.server);
  t.after(async () => { state.release?.(); await bridge.close(); await closeServer(upstream); });
  const formResponse = await fetch(base);
  const html = await formResponse.text();
  const nonce = html.match(/const nonce="([a-f0-9]+)"/)?.[1];
  assert.ok(nonce);
  async function local(path, body, headers = {}) {
    const response = await fetch(base + path, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', 'X-DocBuilder-Local-Nonce': nonce, ...headers }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  async function api(path, body, headers = {}) {
    const payload = body === undefined ? undefined : ['/api/publish', '/api/prepare'].includes(path) ? { baseUrl: connectionOrigin, ...body } : body;
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: ORIGIN, 'X-DocBuilder-Request': '1', 'X-DocBuilder-Confluence-Origin': connectionOrigin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: payload === undefined ? undefined : JSON.stringify(payload) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  const connect = async (baseUrl = connectionOrigin, headers = {}) => {
    const response = await local('/local/session', { baseUrl, token: TEST_TOKEN }, headers);
    if (response.status === 200) connectionOrigin = response.body.baseUrl;
    return response;
  };
  return { state, pages, base, local, api, connect, html, formResponse, upstreamUrl, transportRequests };
}
const createRequest = (operationId = OPERATION) => ({ operationId, mode: 'create', title: 'Published', spaceKey: 'DI', parentId: '10', storage: '<p>Published content</p>' });
const updateRequest = (expectedVersion = 1) => ({ ...createRequest(), mode: 'update', parentId: undefined, pageId: '20', expectedVersion });

test('space listing expands categories and preserves global/personal type without returning other metadata', async t => {
  const f = await fixture(t); await f.connect(); f.state.mode = 'space-metadata';
  const result = await f.api('/api/spaces');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.items, [{ key: 'DI', name: 'Integration', type: 'global', categories: ['integration'] }, { key: '~user', name: 'User', type: 'personal', categories: ['personal'] }]);
  assert.ok(f.state.requests.some(request => request.expand === 'metadata.labels'));
});

test('operation journal has no remote tree/content and requires current session and page access', async t => {
  const f = await fixture(t);
  await f.connect();
  assert.equal((await f.api('/api/publish', createRequest())).status, 200);
  const saved = await f.api('/api/operation?id=' + OPERATION);
  assert.deepEqual(saved.body.page.ancestors, []);
  assert.equal(Object.hasOwn(saved.body.page, 'storage'), false);
  assert.doesNotMatch(JSON.stringify(saved.body), /Parent|Published content/);
  await f.local('/local/forget', {});
  assert.equal((await f.api('/api/operation?id=' + OPERATION)).status, 401);
  await f.connect();
  f.pages.delete('101');
  assert.equal((await f.api('/api/operation?id=' + OPERATION)).status, 404);
  assert.equal((await f.api('/api/publish', createRequest())).status, 404);
  assert.equal(f.state.writes, 1);
});

test('local form has CSP, no storage APIs, no exposed PAT; status needs a trusted Origin', async t => {
  const f = await fixture(t);
  assert.match(f.formResponse.headers.get('content-security-policy'), /default-src 'none'/);
  assert.doesNotMatch(f.html, /localStorage|sessionStorage|indexedDB|test-only-not-a-real-token/);
  assert.equal((await f.connect()).status, 200);
  const status = await f.api('/api/status');
  assert.equal(status.body.connected, true);
  assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(JSON.stringify(status.body), /test-only-not-a-real-token|displayName|Bearer/);
  const noOrigin = await fetch(f.base + '/api/status', { headers: { 'X-DocBuilder-Request': '1' } });
  assert.equal(noOrigin.status, 403);
  assert.equal((await f.api('/api/status', undefined, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.api('/api/status', undefined, { 'X-DocBuilder-Request': '' })).status, 403);
});

test('local authentication rejects foreign Origin, missing Origin, bad nonce and DNS rebinding Host', async t => {
  const f = await fixture(t);
  assert.equal((await f.local('/local/session', { token: TEST_TOKEN }, { Origin: ORIGIN })).status, 403);
  assert.equal((await f.local('/local/session', { token: TEST_TOKEN }, { Origin: '' })).status, 403);
  assert.equal((await f.local('/local/session', { token: TEST_TOKEN }, { 'X-DocBuilder-Local-Nonce': 'bad' })).status, 403);
  const response = await new Promise((resolve, reject) => {
    const request = http.get(f.base + '/health', { headers: { Host: 'evil.example' } }, result => { result.resume(); result.on('end', () => resolve(result.statusCode)); });
    request.on('error', reject);
  });
  assert.equal(response, 403);
  assert.equal(f.state.requests.length, 0);
});

test('CORS preflight grants only explicit origins, methods, headers and requested private-network access', async t => {
  const f = await fixture(t, { origins: ['https://preview.example'] });
  const headers = { Origin: 'https://preview.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-docbuilder-request,x-docbuilder-confluence-origin', 'Access-Control-Request-Private-Network': 'true' };
  const response = await fetch(f.base + '/api/publish', { method: 'OPTIONS', headers });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://preview.example');
  assert.equal(response.headers.get('access-control-allow-private-network'), 'true');
  assert.match(response.headers.get('access-control-allow-headers'), /X-DocBuilder-Confluence-Origin/i);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  assert.equal((await fetch(f.base + '/api/publish', { method: 'OPTIONS', headers: { ...headers, Origin: 'null' } })).status, 403);
  assert.equal((await fetch(f.base + '/api/publish', { method: 'OPTIONS', headers: { ...headers, 'Access-Control-Request-Headers': 'authorization' } })).status, 403);
});

test('tree is fetched for every call, roots validated, children scoped and pagination returned as an offset', async t => {
  const f = await fixture(t); await f.connect();
  const first = await f.api('/api/tree?spaceKey=DI');
  const second = await f.api('/api/tree?spaceKey=DI');
  assert.equal(first.body.items[0].title, 'Root read 1');
  assert.equal(second.body.items[0].title, 'Root read 2');
  const children = await f.api('/api/tree?spaceKey=DI&parentId=10');
  assert.deepEqual(children.body, { items: [{ id: '20', title: 'Child', parentId: '10' }], nextStart: 50 });
  const spaces = await f.api('/api/spaces');
  assert.equal(spaces.body.nextStart, 50);
  f.state.mode = 'not-root'; assert.equal((await f.api('/api/tree?spaceKey=DI')).body.code, 'UPSTREAM_INVALID');
  f.state.mode = 'different-space'; assert.equal((await f.api('/api/tree?spaceKey=DI&parentId=10')).status, 400);
});

test('upstream pagination cannot redirect requests or expose arbitrary upstream links', () => {
  assert.equal(nextStart('/rest/api/space?start=50&limit=50', '/rest/api/space?start=0', 0, TEST_CONFLUENCE_ORIGIN), 50);
  assert.throws(() => nextStart('https://evil.example/rest/api/space?start=50', '/rest/api/space', 0, TEST_CONFLUENCE_ORIGIN), /пагинацию/);
  assert.throws(() => nextStart('/rest/api/content?start=50', '/rest/api/space', 0, TEST_CONFLUENCE_ORIGIN), /пагинацию/);
  assert.throws(() => nextStart('/rest/api/space?start=0', '/rest/api/space', 0, TEST_CONFLUENCE_ORIGIN), /пагинацию/);
  assert.throws(() => nextStart('/rest/api/space?start=50&token=secret', '/rest/api/space', 0, TEST_CONFLUENCE_ORIGIN), /пагинацию/);
});

test('native diagram macros preserve CDATA terminators and reject missing/duplicate placeholders', async t => {
  const code = 'flowchart LR\nA["]]> literal"] --> B';
  const macro = diagramMacro('mermaid', code, 'test-id');
  assert.match(macro, /ac:name="mermaiddiagram"/);
  assert.match(macro, /\]\]\]\]><!\[CDATA\[>/);
  assert.match(diagramMacro('plantuml', '@startuml\nA -> B\n@enduml'), /atlassian-macro-output-type/);
  assert.throws(() => insertDiagrams('<p>none</p>', [{ placeholder: 'DOCBUILDER_DIAGRAM_A', engine: 'mermaid', code }]), /Маркер/);
  assert.throws(() => insertDiagrams('<p>DOCBUILDER_DIAGRAM_A</p><p>DOCBUILDER_DIAGRAM_A</p>', [{ placeholder: 'DOCBUILDER_DIAGRAM_A', engine: 'mermaid', code }]), /Маркер/);
  const f = await fixture(t); await f.connect();
  const converted = await f.api('/api/prepare', { wiki: 'DOCBUILDER_DIAGRAM_A', diagrams: [{ placeholder: 'DOCBUILDER_DIAGRAM_A', engine: 'mermaid', code }] });
  assert.equal(converted.status, 200);
  assert.match(converted.body.storage, /ac:name="mermaiddiagram"/);
  assert.doesNotMatch(converted.body.storage, /mermaid\.ink|plantuml\.com|DOCBUILDER_DIAGRAM/);
});

test('create validates fresh parent, reads back content and cannot duplicate a completed operation', async t => {
  const f = await fixture(t); await f.connect();
  f.state.mode = 'readback-nbsp';
  const request = { ...createRequest(), storage: '<p>Test&nbsp;document</p>' };
  const first = await f.api('/api/publish', request);
  assert.equal(first.status, 200);
  assert.equal(first.body.id, '101'); assert.equal(first.body.version, 1);
  assert.equal(first.body.storage, undefined);
  assert.equal(f.state.writes, 1); assert.equal(f.state.reads, 2);
  assert.deepEqual((await f.api('/api/publish', request)).body, first.body);
  assert.equal(f.state.writes, 1);
  assert.equal((await f.api('/api/operation?id=' + OPERATION)).body.state, 'success');
  assert.equal((await f.api('/api/publish', { ...request, title: 'Different' })).status, 400);
});

test('creation at space root is explicit, while foreign parent is rejected before writing', async t => {
  const f = await fixture(t); await f.connect();
  f.state.mode = 'different-space';
  assert.equal((await f.api('/api/publish', createRequest())).status, 400); assert.equal(f.state.writes, 0);
  f.state.mode = 'normal';
  const created = await f.api('/api/publish', { ...createRequest('operation_000000000002'), parentId: undefined });
  assert.equal(created.status, 200); assert.equal(created.body.parentId, null);
});

test('update checks current version and does not write stale requests', async t => {
  const f = await fixture(t); await f.connect();
  f.pages.get('20').version.number = 2;
  const stale = await f.api('/api/publish', updateRequest(1));
  assert.equal(stale.status, 409); assert.equal(stale.body.code, 'VERSION_CONFLICT'); assert.equal(f.state.writes, 0);
  const request = { ...updateRequest(2), operationId: 'operation_000000000002' };
  const success = await f.api('/api/publish', request);
  assert.equal(success.status, 200); assert.equal(success.body.version, 3); assert.equal(f.state.writes, 1);
});

test('Confluence optimistic-lock conflict is a known failure with no automatic PUT retry', async t => {
  const f = await fixture(t); await f.connect(); f.state.mode = 'put-conflict';
  const result = await f.api('/api/publish', updateRequest());
  assert.equal(result.body.code, 'VERSION_CONFLICT');
  assert.equal((await f.api('/api/operation?id=' + OPERATION)).body.state, 'failed');
  const puts = f.state.requests.filter(value => value.method === 'PUT').length;
  await f.api('/api/publish', updateRequest());
  assert.equal(f.state.requests.filter(value => value.method === 'PUT').length, puts);
});

test('network loss after POST is unknown, journal never leaks PAT and same operation cannot be resent', async t => {
  const f = await fixture(t); await f.connect(); f.state.mode = 'drop-write';
  const result = await f.api('/api/publish', createRequest());
  assert.equal(result.body.code, 'OUTCOME_UNKNOWN');
  assert.equal(f.state.writes, 1); assert.ok(f.pages.has('101'));
  const operation = await f.api('/api/operation?id=' + OPERATION);
  assert.equal(operation.body.state, 'unknown'); assert.doesNotMatch(JSON.stringify(operation.body), /test-only-not-a-real-token|Bearer|storage/);
  await f.api('/api/publish', createRequest()); assert.equal(f.state.writes, 1);
  const repeated = await f.api('/api/publish', createRequest('operation_000000000002'));
  assert.equal(repeated.body.code, 'OUTCOME_UNKNOWN'); assert.equal(repeated.body.operationId, OPERATION); assert.equal(f.state.writes, 1);
});

test('readback failure or content mismatch is unknown and retains a page link for manual reconciliation', async t => {
  for (const mode of ['readback-fail', 'readback-changed']) {
    const f = await fixture(t); await f.connect(); f.state.mode = mode;
    const result = await f.api('/api/publish', createRequest()); assert.equal(result.body.code, 'OUTCOME_UNKNOWN');
    const operation = await f.api('/api/operation?id=' + OPERATION);
    assert.equal(operation.body.page.id, '101'); assert.equal(operation.body.state, 'unknown');
    assert.doesNotMatch(JSON.stringify(result.body), /test-only-not-a-real-token/);
  }
});

test('pending operation is visible and parallel repeat cannot start another write', async t => {
  const f = await fixture(t); await f.connect(); f.state.mode = 'hold-read';
  const publishing = f.api('/api/publish', createRequest());
  await waitFor(() => f.state.release);
  assert.equal((await f.api('/api/operation?id=' + OPERATION)).body.state, 'pending');
  assert.equal((await f.api('/api/publish', createRequest())).body.code, 'OPERATION_PENDING');
  const otherId = await f.api('/api/publish', createRequest('operation_000000000002'));
  assert.equal(otherId.body.code, 'OPERATION_PENDING'); assert.equal(otherId.body.operationId, OPERATION);
  f.state.mode = 'normal'; f.state.release();
  assert.equal((await publishing).status, 200); assert.equal(f.state.writes, 1);
});

test('forget token stops subsequent writes in an operation waiting for its parent', async t => {
  const f = await fixture(t); await f.connect(); f.state.mode = 'hold-read';
  const publishing = f.api('/api/publish', createRequest());
  await waitFor(() => f.state.release);
  assert.equal((await f.local('/local/forget', {})).body.connected, false);
  f.state.mode = 'normal'; f.state.release();
  assert.equal((await publishing).body.code, 'NOT_CONNECTED'); assert.equal(f.state.writes, 0);
});

test('30-day session caps timer, slides on successful Confluence request and expires without persistence', async t => {
  let currentTime = Date.UTC(2026, 9, 2);
  const timers = [];
  const f = await fixture(t, { now: () => currentTime, setTimeoutImpl: (callback, delay) => { const timer = { callback, delay, unref() {} }; timers.push(timer); return timer; }, clearTimeoutImpl: () => {} });
  await f.connect(); assert.equal(timers.at(-1).delay, MAX_TIMER_DELAY);
  currentTime += 1_000;
  await f.api('/api/spaces');
  assert.equal((await f.api('/api/status')).body.expiresAt, new Date(currentTime + SESSION_TTL_MS).toISOString());
  currentTime += SESSION_TTL_MS + 1;
  timers.at(-1).callback();
  assert.equal((await f.api('/api/status')).body.connected, false);
  assert.equal((await f.api('/api/tree?spaceKey=DI')).body.code, 'NOT_CONNECTED');
});

test('redirect is never followed, remote error bodies discarded, revoked PAT cleared', async t => {
  const f = await fixture(t); await f.connect();
  f.state.mode = 'redirect';
  const redirected = await f.api('/api/spaces');
  assert.equal(redirected.body.code, 'UPSTREAM_REDIRECT'); assert.doesNotMatch(JSON.stringify(redirected.body), /outside\.example|test-only-not-a-real-token/);
  assert.equal(f.state.requests.filter(value => value.path === '/steal').length, 0);
  f.state.mode = 'unauthorized';
  assert.equal((await f.api('/api/spaces')).body.code, 'AUTH_EXPIRED');
  assert.equal((await f.api('/api/status')).body.connected, false);
});

test('strict origins and upstream seam reject arbitrary egress destinations', () => {
  assert.equal(validateAdditionalOrigin('https://preview.example'), 'https://preview.example');
  for (const origin of ['http://example.com', 'https://example.com/', 'https://example.com/path', 'https://user@example.com', 'null', '*']) assert.throws(() => validateAdditionalOrigin(origin));
  assert.throws(() => createBridge({ upstream: 'https://evil.example', allowTestUpstream: true }));
  assert.throws(() => createBridge({ upstream: 'http://127.0.0.1:12345' }));
});

test('body confirmation normalizes generated macro ids and nbsp, preserves diagram text', () => {
  assert.ok(sameStorage('<p>x</p>\r\n', '<p>x</p>\n'));
  assert.ok(sameStorage(diagramMacro('mermaid', 'A --> B', 'one'), diagramMacro('mermaid', 'A --> B', 'two')));
  assert.equal(sameStorage(diagramMacro('mermaid', 'literal ac:macro-id="one"', 'one'), diagramMacro('mermaid', 'literal ac:macro-id="two"', 'two')), false);
  assert.equal(sameStorage('<p>one</p>', '<p>two</p>'), false);
  assert.ok(sameStorage('<p>&nbsp;</p>', '<p>\u00a0</p>'));
  assert.equal(sameStorage('<p>&nbsp;</p>', '<p> </p>'), false);
  assert.equal(sameStorage(diagramMacro('mermaid', 'A &nbsp; B', 'one'), diagramMacro('mermaid', 'A \u00a0 B', 'two')), false);
});

test('GET operation reconciles a known page after readback recovers without another write', async t => {
  const f = await fixture(t); await f.connect(); f.state.mode = 'readback-fail';
  assert.equal((await f.api('/api/publish', createRequest())).body.code, 'OUTCOME_UNKNOWN');
  f.state.mode = 'normal';
  const operation = await f.api('/api/operation?id=' + OPERATION);
  assert.equal(operation.body.state, 'success'); assert.equal(operation.body.page.id, '101'); assert.equal(f.state.writes, 1);
});

test('manual confirmation verifies supplied page, title, parent, version and content with GET only', async t => {
  const f = await fixture(t); await f.connect(); f.state.mode = 'drop-write';
  await f.api('/api/publish', createRequest()); f.state.mode = 'normal';
  const wrongPage = await f.api('/api/operation/confirm', { operationId: OPERATION, pageId: '20' });
  assert.equal(wrongPage.body.code, 'VERIFICATION_MISMATCH');
  for (const mutate of [
    value => { value.title = 'Wrong'; },
    value => { value.space.key = 'OTHER'; },
    value => { value.ancestors = []; },
    value => { value.version.number = 2; },
    value => { value.body.storage.value = '<p>wrong</p>'; },
  ]) {
    const value = f.pages.get('101');
    const original = structuredClone(value); mutate(value);
    assert.equal((await f.api('/api/operation/confirm', { operationId: OPERATION, pageId: '101' })).body.code, 'VERIFICATION_MISMATCH');
    f.pages.set('101', original);
  }
  const confirmed = await f.api('/api/operation/confirm', { operationId: OPERATION, pageId: '101' });
  assert.equal(confirmed.status, 200); assert.equal(confirmed.body.id, '101'); assert.equal(confirmed.body.storage, undefined);
  assert.equal(f.state.writes, 1); assert.equal((await f.api('/api/operation?id=' + OPERATION)).body.state, 'success');
});

test('uncertain native diagram publication is also blocked with newly generated macro ids', async t => {
  const f = await fixture(t); await f.connect(); f.state.mode = 'drop-write';
  const first = { ...createRequest(), storage: diagramMacro('mermaid', 'A --> B', 'first') };
  await f.api('/api/publish', first);
  const second = { ...first, operationId: 'operation_000000000002', storage: diagramMacro('mermaid', 'A --> B', 'second') };
  const result = await f.api('/api/publish', second);
  assert.equal(result.body.code, 'OUTCOME_UNKNOWN'); assert.equal(result.body.operationId, OPERATION); assert.equal(f.state.writes, 1);
});

test('literal marker-like user text is preserved; only provided placeholders are replaced', () => {
  const storage = '<p>DOCBUILDER_DIAGRAM_LITERAL</p><p>DOCBUILDER_DIAGRAM_A</p>';
  const prepared = insertDiagrams(storage, [{ placeholder: 'DOCBUILDER_DIAGRAM_A', engine: 'mermaid', code: 'A --> B' }]);
  assert.match(prepared, /<p>DOCBUILDER_DIAGRAM_LITERAL<\/p>/);
  assert.match(prepared, /ac:name="mermaiddiagram"/);
});

test('bounded journal evicts completed entries but never pending or unknown entries', async t => {
  const f = await fixture(t, { maxOperations: 2 }); await f.connect();
  await f.api('/api/publish', createRequest());
  f.state.mode = 'drop-write';
  await f.api('/api/publish', { ...createRequest('operation_000000000002'), title: 'Unknown 1' });
  await f.api('/api/publish', { ...createRequest('operation_000000000003'), title: 'Unknown 2' });
  assert.equal((await f.api('/api/operation?id=' + OPERATION)).status, 404);
  assert.equal((await f.api('/api/operation?id=operation_000000000002')).body.state, 'unknown');
  const blocked = await f.api('/api/publish', { ...createRequest('operation_000000000004'), title: 'Unknown 3' });
  assert.equal(blocked.body.code, 'OPERATION_LIMIT'); assert.equal(f.state.writes, 3);
});

test('before local connection no Confluence origin is exposed or selected implicitly', async t => {
  const f = await fixture(t);
  const disconnected = await f.api('/api/status');
  assert.equal(disconnected.status, 200); assert.equal(disconnected.body.connected, false);
  assert.ok(disconnected.body.baseUrl === null || disconnected.body.baseUrl === '');
  assert.equal(f.state.requests.length, 0);
  assert.doesNotMatch(f.html, /https:\/\/confluence-a\.example/);
});

test('unsafe local Confluence URLs are rejected before the PAT reaches any upstream', async t => {
  const f = await fixture(t, { httpsOrigins: [TEST_CONFLUENCE_ORIGIN] });
  for (const baseUrl of [
    'http://confluence-a.example', 'ftp://confluence-a.example', 'javascript:alert(1)',
    'https://user:password@confluence-a.example', 'https://confluence-a.example/wiki',
    'https://confluence-a.example?token=secret', 'https://confluence-a.example#fragment',
    '//confluence-a.example', '',
  ]) {
    const result = await f.connect(baseUrl);
    assert.equal(result.status, 400); assert.equal(result.body.code, 'INVALID_REQUEST');
  }
  assert.equal(f.transportRequests.length, 0); assert.equal(f.state.requests.length, 0);
  assert.equal((await f.connect()).status, 200);
  assert.deepEqual([...new Set(f.transportRequests.map(value => value.origin))], [TEST_CONFLUENCE_ORIGIN]);
  assert.ok(f.state.requests.every(value => value.authorizationPresent));
});

test('hosted API requires the captured Confluence origin and payload cannot override it', async t => {
  const f = await fixture(t, { httpsOrigins: [TEST_CONFLUENCE_ORIGIN, SECOND_CONFLUENCE_ORIGIN] }); await f.connect();
  const count = f.transportRequests.length;
  const missing = await f.api('/api/spaces', undefined, { 'X-DocBuilder-Confluence-Origin': '' });
  assert.ok(['INVALID_REQUEST', 'SESSION_CHANGED'].includes(missing.body.code));
  assert.ok([400, 409].includes(missing.status));
  const wrong = await f.api('/api/spaces', undefined, { 'X-DocBuilder-Confluence-Origin': SECOND_CONFLUENCE_ORIGIN });
  assert.equal(wrong.body.code, 'SESSION_CHANGED');
  const bodyOverride = await f.api('/api/publish', { ...createRequest(), baseUrl: SECOND_CONFLUENCE_ORIGIN });
  assert.equal(bodyOverride.body.code, 'SESSION_CHANGED');
  const prepareOverride = await f.api('/api/prepare', { baseUrl: SECOND_CONFLUENCE_ORIGIN, wiki: 'Text', diagrams: [] });
  assert.equal(prepareOverride.body.code, 'SESSION_CHANGED');
  assert.equal(f.transportRequests.length, count); assert.equal(f.state.writes, 0);
});

test('switching the same PAT between origins while a read is held prevents the following write', async t => {
  const f = await fixture(t, { httpsOrigins: [TEST_CONFLUENCE_ORIGIN, SECOND_CONFLUENCE_ORIGIN] }); await f.connect();
  f.state.mode = 'hold-read';
  const publishing = f.api('/api/publish', createRequest());
  await waitFor(() => f.state.release);
  assert.equal((await f.connect(SECOND_CONFLUENCE_ORIGIN)).status, 200);
  f.state.mode = 'normal'; f.state.release();
  const result = await publishing;
  assert.equal(result.body.code, 'SESSION_CHANGED'); assert.equal(f.state.writes, 0);
  assert.equal(f.transportRequests.filter(value => ['POST', 'PUT'].includes(value.method) && value.path === '/rest/api/content').length, 0);
  const reads = f.transportRequests.length;
  assert.equal((await f.api('/api/operation?id=' + OPERATION)).body.code, 'SESSION_CHANGED');
  assert.equal(f.transportRequests.length, reads);
});

test('unknown operation cannot be inspected or confirmed under a different Confluence origin', async t => {
  const f = await fixture(t, { httpsOrigins: [TEST_CONFLUENCE_ORIGIN, SECOND_CONFLUENCE_ORIGIN] }); await f.connect();
  f.state.mode = 'drop-write'; await f.api('/api/publish', createRequest());
  f.state.mode = 'normal'; await f.connect(SECOND_CONFLUENCE_ORIGIN);
  const count = f.transportRequests.length;
  assert.equal((await f.api('/api/operation?id=' + OPERATION)).body.code, 'SESSION_CHANGED');
  assert.equal((await f.api('/api/operation/confirm', { operationId: OPERATION, pageId: '101' })).body.code, 'SESSION_CHANGED');
  assert.equal(f.transportRequests.length, count); assert.equal(f.state.writes, 1);
  await f.connect(TEST_CONFLUENCE_ORIGIN);
  assert.equal((await f.api('/api/operation/confirm', { operationId: OPERATION, pageId: '101' })).status, 200);
  assert.equal(f.state.writes, 1);
});

test('known-page unknown journal never discloses cached metadata after current PAT loses access', async t => {
  for (const [mode, status, code] of [['unauthorized', 401, 'AUTH_EXPIRED'], ['forbidden', 403, 'ACCESS_DENIED']]) {
    const f = await fixture(t); await f.connect(); f.state.mode = 'readback-fail';
    assert.equal((await f.api('/api/publish', createRequest())).body.code, 'OUTCOME_UNKNOWN');
    f.state.mode = mode;
    const result = await f.api('/api/operation?id=' + OPERATION);
    assert.equal(result.status, status); assert.equal(result.body.code, code); assert.equal(result.body.page, undefined);
    assert.doesNotMatch(JSON.stringify(result.body), /Published|test-only-not-a-real-token/);
  }
});

test('origin switch while unknown-result readback is held returns SESSION_CHANGED without cached page data', async t => {
  const f = await fixture(t, { httpsOrigins: [TEST_CONFLUENCE_ORIGIN, SECOND_CONFLUENCE_ORIGIN] }); await f.connect();
  f.state.mode = 'readback-fail'; await f.api('/api/publish', createRequest());
  f.state.mode = 'hold-read';
  const checking = f.api('/api/operation?id=' + OPERATION);
  await waitFor(() => f.state.release);
  assert.equal((await f.connect(SECOND_CONFLUENCE_ORIGIN)).status, 200);
  f.state.mode = 'normal'; f.state.release();
  const result = await checking;
  assert.equal(result.body.code, 'SESSION_CHANGED'); assert.equal(result.body.page, undefined); assert.equal(f.state.writes, 1);
});

test('origin switch after POST starts preserves unknown on the original origin with no retry or mixed token target', async t => {
  const f = await fixture(t, { httpsOrigins: [TEST_CONFLUENCE_ORIGIN, SECOND_CONFLUENCE_ORIGIN] }); await f.connect();
  f.state.mode = 'hold-write';
  const publishing = f.api('/api/publish', createRequest());
  await waitFor(() => f.state.release);
  assert.equal(f.state.writes, 1);
  await f.connect(SECOND_CONFLUENCE_ORIGIN);
  f.state.mode = 'normal'; f.state.release();
  const result = await publishing;
  assert.equal(result.body.code, 'OUTCOME_UNKNOWN'); assert.equal(result.body.operationId, OPERATION);
  assert.equal((await f.api('/api/operation?id=' + OPERATION)).body.code, 'SESSION_CHANGED');
  const writes = f.state.requests.filter(value => ['POST', 'PUT'].includes(value.method) && value.path === '/rest/api/content');
  assert.deepEqual(writes.map(value => [value.origin, value.authorizationPresent]), [[TEST_CONFLUENCE_ORIGIN, true]]);
  await f.connect(TEST_CONFLUENCE_ORIGIN);
  assert.equal((await f.api('/api/operation/confirm', { operationId: OPERATION, pageId: '101' })).status, 200);
  assert.equal(f.state.writes, 1);
});

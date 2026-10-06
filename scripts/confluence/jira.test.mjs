import test from 'node:test';
import assert from 'node:assert/strict';
import { createJira, parseJiraLink } from './jira.mjs';
import { createBridge } from './bridge.mjs';

const baseUrl = 'https://jira.example';
const project = { id: '101', key: 'IN', name: 'Interns', issueTypes: [{ id: '7', name: 'User Story' }, { id: '8', name: 'Epic' }] };
function fixture(options = {}) {
  let saved = null; const calls = []; let postCount = 0;
  const store = { load: async () => structuredClone(saved), save: async value => { saved = structuredClone(value); }, clear: async () => { saved = null; } };
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init }); const path = new URL(url).pathname;
    if (options.respond) { const response = await options.respond(url, init); if (response) return response; }
    let result;
    if (path.endsWith('/myself')) result = { name: 'synthetic-user' };
    else if (path.endsWith('/project/101') || path.endsWith('/project/IN')) result = options.project ?? project;
    else if (path.endsWith('/issue/OLD-3')) result = { fields: { project: { id: '101' } } };
    else if (path.endsWith('/field')) result = [{ id: 'customfield_10203', schema: { custom: 'com.pyxis.greenhopper.jira:gh-epic-link' } }];
    else if (path.includes('/createmeta/')) result = { total: 4, values: [{ fieldId: 'summary', required: true, name: 'Summary' }, { fieldId: 'reporter', required: true, hasDefaultValue: false, name: 'Reporter' }, { fieldId: 'customfield_10203', name: 'Epic Link' }, { fieldId: 'description', name: 'Description' }] };
    else if (path.endsWith('/issue/DI-5')) result = { fields: { issuetype: { name: 'Epic' } } };
    else if (path.endsWith('/issue') && init.method === 'POST') { postCount++; if (options.unknown) throw Error('network'); result = { id: '555', key: 'IN-17' }; }
    else if (path.endsWith('/remotelink')) { if (options.linkFailure) return new Response('{}', { status: 403 }); result = { id: 99 }; }
    else if (path.endsWith('/issue/IN-17')) result = { id: '555', fields: { project: { id: '101' }, issuetype: { id: '7' }, summary: 'Story', customfield_10203: 'DI-5' } };
    else if (path.endsWith('/search')) result = { total: 1, issues: [{ key: 'DI-5', fields: { summary: 'Epic' } }] };
    else throw Error(`Unexpected route ${path}`);
    return Response.json(result);
  };
  const jira = createJira({ store, fetchImpl });
  const handle = (manager, path, method = 'GET', body = null, query = new URLSearchParams()) => manager.handle(`/api/jira/${path}`, method, query, body, baseUrl, '101');
  const connect = () => jira.connect({ link: `${baseUrl}/browse/OLD-3`, token: 'synthetic-jira-token', remember: true });
  const create = manager => handle(manager, 'create', 'POST', { methodId: 'method-1', summary: 'Story', description: 'Description', epic: 'DI-5', confluenceUrl: 'https://confluence.example/pages/viewpage.action?pageId=123' });
  return { jira, store, fetchImpl, calls, connect, create, handle, saved: () => saved, postCount: () => postCount };
}

test('Jira links resolve issue, project and board without accepting credentials or HTTP', () => {
  assert.deepEqual(parseJiraLink(`${baseUrl}/browse/IN-3?x=1#comment`), { baseUrl, issue: 'IN-3' });
  assert.deepEqual(parseJiraLink(`${baseUrl}/projects/IN/issues/IN-3?selectedIssue=DI-8`), { baseUrl, issue: 'DI-8' });
  assert.deepEqual(parseJiraLink(`${baseUrl}/secure/RapidBoard.jspa?rapidView=530&projectKey=IN#`), { baseUrl, project: 'IN' });
  assert.deepEqual(parseJiraLink(`${baseUrl}/projects/IN/summary`), { baseUrl, project: 'IN' });
  for (const link of ['http://jira.example/browse/IN-3', 'https://user:pat@jira.example/browse/IN-3', `${baseUrl}/`, `${baseUrl}/browse/IN-0`]) assert.throws(() => parseJiraLink(link));
});
test('issue project is verified by Jira and persisted; public status never returns a PAT', async () => {
  const f = fixture(); const status = await f.connect();
  assert.equal(status.project.key, 'IN'); assert.equal(status.project.url, `${baseUrl}/projects/IN`);
  assert.equal(f.saved().project.id, '101'); assert.equal(JSON.stringify(status).includes('synthetic-jira-token'), false);
  assert.ok(f.calls.some(call => call.url.includes('/issue/OLD-3?fields=project')));
  assert.ok(f.calls.every(call => new URL(call.url).origin === baseUrl && call.headers.Authorization === 'Bearer synthetic-jira-token' && call.redirect === 'manual'));
  const count = f.calls.length;
  await assert.rejects(f.jira.connect({ link: 'https://other.example/projects/IN', token: '', remember: true }));
  assert.equal(f.calls.length, count);
  const restored = createJira({ store: f.store, fetchImpl: f.fetchImpl }); await restored.restore(); assert.equal(restored.status().project.id, '101');
});
test('User Story uses discovered Epic Link, current reporter and one POST across restarts', async () => {
  const f = fixture(); await f.connect(); const result = await f.create(f.jira);
  assert.equal(result.issue.key, 'IN-17'); assert.ok(result.linkedUrl);
  const fields = JSON.parse(f.calls.find(call => call.url === `${baseUrl}/rest/api/2/issue`).body).fields;
  assert.deepEqual(fields.project, { id: '101' }); assert.deepEqual(fields.issuetype, { id: '7' }); assert.equal(fields.customfield_10203, 'DI-5'); assert.deepEqual(fields.reporter, { name: 'synthetic-user' });
  const restored = createJira({ store: f.store, fetchImpl: f.fetchImpl }); await restored.restore(); await f.create(restored); assert.equal(f.postCount(), 1);
});
test('unknown POST remains blocked after restart and can be explicitly reconciled', async () => {
  const f = fixture({ unknown: true }); await f.connect(); await assert.rejects(f.create(f.jira), error => error.code === 'OUTCOME_UNKNOWN');
  assert.equal(f.saved().operations[0].state, 'unknown');
  const restored = createJira({ store: f.store, fetchImpl: f.fetchImpl }); await restored.restore(); await assert.rejects(f.create(restored), error => error.code === 'OUTCOME_UNKNOWN'); assert.equal(f.postCount(), 1);
  const result = await f.handle(restored, 'confirm', 'POST', { methodId: 'method-1', link: `${baseUrl}/browse/IN-17` }); assert.equal(result.state, 'success');
  await f.create(restored); assert.equal(f.postCount(), 1);
});
test('missing User Story blocks task substitution; stale project blocks all requests', async () => {
  const f = fixture({ project: { ...project, issueTypes: [{ id: '1', name: 'Task' }] } }); await f.connect();
  assert.equal((await f.handle(f.jira, 'metadata')).story, null);
  await assert.rejects(f.create(f.jira), error => error.code === 'PROJECT_NOT_READY'); assert.equal(f.postCount(), 0);
  await assert.rejects(f.jira.handle('/api/jira/create', 'POST', new URLSearchParams(), {}, baseUrl, '999'), error => error.code === 'SESSION_CHANGED');
});
test('remote link failure cannot cause a second issue creation', async () => {
  const f = fixture({ linkFailure: true }); await f.connect(); const result = await f.create(f.jira); assert.equal(result.state, 'success'); assert.equal(result.linkedUrl, null);
  await assert.rejects(f.handle(f.jira, 'link', 'POST', { methodId: 'method-1', confluenceUrl: 'https://confluence.example/pages/viewpage.action?pageId=123' }), error => error.code === 'ACCESS_DENIED');
  await f.create(f.jira); assert.equal(f.postCount(), 1);
});
test('upstream errors and redirects never echo PATs or forward them', async () => {
  const f = fixture({ respond: async () => new Response('synthetic-jira-token', { status: 302, headers: { Location: 'https://other.example' } }) });
  await assert.rejects(f.connect(), error => error.code === 'REDIRECT_DENIED' && !error.message.includes('synthetic-jira-token')); assert.equal(f.calls.length, 1);
});
test('shared bridge form and Jira APIs retain nonce, origin and CORS protections', async t => {
  const f = fixture(); const bridge = createBridge({ jiraCredentialStore: f.store, fetchImpl: f.fetchImpl });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve)); t.after(() => bridge.close());
  const local = `http://127.0.0.1:${bridge.server.address().port}`;
  const html = await (await fetch(local)).text(); assert.ok(html.includes('jira-form')); const nonce = html.match(/const nonce="([a-f0-9]+)"/)[1];
  const post = (origin, localNonce) => fetch(`${local}/local/jira/session`, { method: 'POST', headers: { Origin: origin, 'X-DocBuilder-Local-Nonce': localNonce, 'Content-Type': 'application/json' }, body: JSON.stringify({ link: `${baseUrl}/projects/IN`, token: 'synthetic-jira-token', remember: true }) });
  assert.equal((await post('https://other.example', nonce)).status, 403); assert.equal((await post(local, 'wrong')).status, 403); assert.equal((await post(local, nonce)).status, 200);
  const headers = { Origin: 'http://localhost:5173', 'X-DocBuilder-Request': '1' };
  const status = await (await fetch(`${local}/api/jira/status`, { headers })).json(); assert.equal(status.connected, true); assert.equal(JSON.stringify(status).includes('synthetic-jira-token'), false);
  assert.equal((await (await fetch(`${local}/api/status`, { headers })).json()).connected, false);
  const preflight = await fetch(`${local}/api/jira/metadata`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-docbuilder-jira-project,x-docbuilder-jira-origin,x-docbuilder-request' } }); assert.equal(preflight.status, 204);
});

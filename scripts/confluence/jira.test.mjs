import test from 'node:test';
import assert from 'node:assert/strict';
import { createJira, parseJiraLink } from './jira.mjs';
import { createBridge } from './bridge.mjs';
import { jiraForm, jiraProjectLink } from './jira-form.mjs';
import { JSDOM } from 'jsdom';

const baseUrl = 'https://jira.example';
test('connection field trims issue, project and board links to the project', () => {
  assert.equal(jiraProjectLink(`${baseUrl}/browse/IN-123?x=1#comment`), `${baseUrl}/projects/IN`);
  assert.equal(jiraProjectLink(`${baseUrl}/projects/IN/issues/IN-3?selectedIssue=IN-3`), `${baseUrl}/projects/IN`);
  assert.equal(jiraProjectLink(`${baseUrl}/secure/RapidBoard.jspa?rapidView=530&projectKey=IN`), `${baseUrl}/projects/IN`);
  for (const url of ['http://jira.example/browse/IN-3', 'https://user:password@jira.example/browse/IN-3', 'invalid']) assert.equal(jiraProjectLink(url), url);
});
test('connection form verifies the original issue link even after a failed attempt', async () => {
  const requests = [];
  const dom = new JSDOM(`<script>const nonce='synthetic';</script>${jiraForm('synthetic', { available: true })}`, {
    url: 'http://localhost:18771/', runScripts: 'dangerously',
    beforeParse(window) { window.fetch = async (_path, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: requests.length > 1, json: async () => requests.length > 1 ? { remembered: true, connected: true, project: { key: 'NEW', name: 'Moved issue project', url: `${baseUrl}/projects/NEW` } } : { message: 'Synthetic failure' } };
    }; }
  });
  try {
    const { document, Event } = dom.window;
    const link = document.getElementById('jira-link');
    link.value = `${baseUrl}/browse/OLD-3?x=1#comment`;
    link.dispatchEvent(new Event('input')); link.dispatchEvent(new Event('blur'));
    assert.equal(link.value, `${baseUrl}/projects/OLD`);
    for (let attempt = 0; attempt < 2; attempt++) {
      document.getElementById('jira-pat').value = 'synthetic-token';
      document.getElementById('jira-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(requests[0].link, `${baseUrl}/browse/OLD-3?x=1#comment`);
    assert.equal(requests[1].link, requests[0].link);
    assert.equal(link.value, `${baseUrl}/projects/NEW`);
    assert.equal(document.getElementById('jira-pat').value, '');
  } finally { dom.window.close(); }
});
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
    else if (path.includes('/createmeta/')) result = { total: 5, values: [{ fieldId: 'summary', required: true, name: 'Summary' }, { fieldId: 'reporter', required: true, hasDefaultValue: false, name: 'Reporter' }, { fieldId: 'customfield_10203', name: 'Epic Link' }, { fieldId: 'description', name: 'Description' }, { fieldId: 'labels' }] };
    else if (path.endsWith('/issue/DI-5')) result = { fields: { issuetype: { name: 'Epic' }, project: { id: '101' } } };
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
  const create = manager => handle(manager, 'create', 'POST', { methodId: 'method-1', summary: 'Story', description: 'Description', epic: 'DI-5', labels: ['business'], confluenceUrl: 'https://confluence.example/pages/viewpage.action?pageId=123' });
  return { jira, store, fetchImpl, calls, connect, create, handle, saved: () => saved, postCount: () => postCount };
}

function editableFixture(options = {}) {
  const fields = { project: { id: '101' }, issuetype: { id: '7', name: 'User Story' }, summary: 'Original story', description: 'Original description', labels: ['business', 'existing-custom-tag'], priority: { id: '3' }, customfield_10203: null, updated: '2026-10-07T10:00:00.000+0500' };
  const f = fixture({ respond: async (url, init) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/IN-17/editmeta')) return Response.json({ fields: Object.fromEntries(['summary', 'description', 'labels', 'customfield_10203', 'priority'].filter(key => key !== options.readonly).map(key => [key, { operations: ['set'], ...(key === 'priority' ? { allowedValues: [{ id: '3', name: 'Medium' }] } : {}) }])) });
    if (path.endsWith('/issue/IN-17')) {
      if (init.method === 'PUT') { Object.assign(fields, JSON.parse(init.body).fields, { updated: '2026-10-07T11:00:00.000+0500' }); if (options.unknown) throw Error('lost response'); return new Response(null, { status: 204 }); }
      return Response.json({ id: '555', key: 'IN-17', fields });
    }
  } });
  const load = manager => f.handle(manager, 'issue', 'GET', null, new URLSearchParams({ methodId: 'bound-method', link: `${baseUrl}/browse/IN-17` }));
  const body = issue => ({ methodId: 'bound-method', link: issue.url, fingerprint: issue.fingerprint, summary: issue.summary, description: 'Edited description', epic: issue.epic, labels: issue.labels, priorityId: issue.priorityId });
  return { ...f, fields, load, body };
}

test('existing issue binding loads Jira fields and edits only changed fields without another create', async () => {
  const f = editableFixture(); await f.connect(); const loaded = await f.load(f.jira);
  assert.equal(loaded.issue.description, 'Original description'); assert.equal(loaded.metadata.issueKind, 'story'); assert.equal(loaded.operation.state, 'success');
  assert.equal(f.saved().operations[0].issue.key, 'IN-17'); assert.equal(JSON.stringify(loaded).includes('synthetic-jira-token'), false);
  const result = await f.handle(f.jira, 'update', 'POST', f.body(loaded.issue));
  assert.equal(result.issue.description, 'Edited description');
  const put = f.calls.find(call => call.method === 'PUT'); assert.deepEqual(JSON.parse(put.body), { fields: { description: 'Edited description' } });
  assert.deepEqual(result.issue.labels, ['business', 'existing-custom-tag']); assert.equal(f.postCount(), 0);
  await f.handle(f.jira, 'create', 'POST', { methodId: 'bound-method' }); assert.equal(f.postCount(), 0);
});
test('stale Jira snapshot, different project, and noneditable field block PUT', async () => {
  const f = editableFixture(); await f.connect(); const loaded = await f.load(f.jira);
  f.fields.description = 'External change';
  await assert.rejects(f.handle(f.jira, 'update', 'POST', f.body(loaded.issue)), error => error.code === 'ISSUE_CHANGED');
  f.fields.project.id = 'other'; await assert.rejects(f.load(f.jira), error => error.code === 'PROJECT_MISMATCH');
  assert.equal(f.calls.filter(call => call.method === 'PUT').length, 0);
  const readonly = editableFixture({ readonly: 'description' }); await readonly.connect(); const locked = await readonly.load(readonly.jira);
  await assert.rejects(readonly.handle(readonly.jira, 'update', 'POST', readonly.body(locked.issue)), error => error.code === 'ACCESS_DENIED');
  assert.equal(readonly.calls.filter(call => call.method === 'PUT').length, 0);
});
test('lost PUT response persists the update journal and reconciles by reading Jira after restart', async () => {
  const f = editableFixture({ unknown: true }); await f.connect(); const loaded = await f.load(f.jira);
  await assert.rejects(f.handle(f.jira, 'update', 'POST', f.body(loaded.issue)), error => error.code === 'OUTCOME_UNKNOWN');
  assert.equal(f.saved().operations[0].update.state, 'unknown');
  const restored = createJira({ store: f.store, fetchImpl: f.fetchImpl }); await restored.restore(); const current = await f.load(restored);
  assert.equal(current.operation.updateState, undefined); assert.equal(current.issue.description, 'Edited description');
  assert.equal(f.saved().operations[0].update, undefined); assert.equal(f.calls.filter(call => call.method === 'PUT').length, 1); assert.equal(f.postCount(), 0);
});

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

test('creation without an epic omits Epic Link and reconciliation retains duplicate protection', async () => {
  let returnedEpic = null;
  const f = fixture({ unknown: true, respond: async url => {
    if (new URL(url).pathname.endsWith('/issue/IN-17')) return Response.json({ id: '555', key: 'IN-17', fields: { project: { id: '101' }, issuetype: { id: '7' }, summary: 'Story', customfield_10203: returnedEpic } });
  } });
  await f.connect();
  const body = { methodId: 'without-epic', summary: 'Story', description: 'Description', labels: ['business'] };
  const meta = await f.handle(f.jira, 'metadata'); assert.equal(meta.epicRequired, false);
  await assert.rejects(f.handle(f.jira, 'create', 'POST', body), error => error.code === 'OUTCOME_UNKNOWN');
  const fields = JSON.parse(f.calls.find(call => call.url === `${baseUrl}/rest/api/2/issue`).body).fields;
  assert.equal('customfield_10203' in fields, false);
  assert.equal(f.calls.some(call => call.url.includes('/issue/DI-5')), false);
  assert.equal(f.saved().operations[0].epic, null);
  const restored = createJira({ store: f.store, fetchImpl: f.fetchImpl }); await restored.restore();
  await assert.rejects(f.handle(restored, 'create', 'POST', body), error => error.code === 'OUTCOME_UNKNOWN');
  returnedEpic = 'DI-5';
  await assert.rejects(f.handle(restored, 'confirm', 'POST', { methodId: body.methodId, link: `${baseUrl}/browse/IN-17` }), error => error.code === 'INVALID_REQUEST');
  returnedEpic = null;
  const confirmed = await f.handle(restored, 'confirm', 'POST', { methodId: body.methodId, link: `${baseUrl}/browse/IN-17` }); assert.equal(confirmed.state, 'success');
  await f.handle(restored, 'create', 'POST', body); assert.equal(f.postCount(), 1);
});

test('no Epic Link field permits unlinked creation, while a required Epic Link blocks omission', async () => {
  for (const required of [false, true]) {
    const f = fixture({ respond: async url => {
      if (new URL(url).pathname.includes('/createmeta/')) return Response.json({ values: [{ fieldId: 'summary', required: true, name: 'Summary' }, { fieldId: 'labels' }, ...(required ? [{ fieldId: 'customfield_10203', required: true, name: 'Epic Link' }] : [])] });
    } });
    await f.connect(); const body = { methodId: 'without-epic', summary: 'Story', description: 'Description', epic: '', labels: ['business'] };
    const meta = await f.handle(f.jira, 'metadata'); assert.equal(meta.epicRequired, required);
    if (required) { await assert.rejects(f.handle(f.jira, 'create', 'POST', body), error => error.code === 'INVALID_REQUEST'); assert.equal(f.postCount(), 0); }
    else { assert.equal(meta.epicField, null); assert.equal((await f.handle(f.jira, 'create', 'POST', body)).state, 'success'); }
  }
});
test('missing User Story blocks task substitution; stale project blocks all requests', async () => {
  const f = fixture({ project: { ...project, issueTypes: [{ id: '1', name: 'Task' }] } }); await f.connect();
  assert.equal((await f.handle(f.jira, 'metadata')).story, null);
  await assert.rejects(f.create(f.jira), error => error.code === 'PROJECT_NOT_READY'); assert.equal(f.postCount(), 0);
  await assert.rejects(f.jira.handle('/api/jira/create', 'POST', new URLSearchParams(), {}, baseUrl, '999'), error => error.code === 'SESSION_CHANGED');
});
test('a primary label is required before writing; additional-only labels leave no operation to recover', async () => {
  const f = fixture(); await f.connect();
  const body = { methodId: 'primary-label', summary: 'Story', description: 'Description' };
  for (const labels of [[], ['qaa'], ['hold', 'bss_corp'], ['playwright']]) {
    await assert.rejects(f.handle(f.jira, 'create', 'POST', { ...body, labels }), error => error.code === 'INVALID_REQUEST' && error.message.includes('основной тег'));
    assert.equal(f.postCount(), 0); assert.equal(f.saved().operations.length, 0);
  }
  const result = await f.handle(f.jira, 'create', 'POST', { ...body, labels: ['platform', 'qaa'] });
  assert.equal(result.state, 'success'); assert.equal(f.postCount(), 1);
  assert.deepEqual(JSON.parse(f.calls.find(call => call.url === `${baseUrl}/rest/api/2/issue`).body).fields.labels, ['platform', 'qaa']);
});
test('explicit Task mode uses project Task metadata, labels and priority; another project epic is rejected', async () => {
  const f = fixture({ project: { ...project, issueTypes: [{ id: '1', name: 'Задача' }] }, respond: async (url) => {
    if (new URL(url).pathname.includes('/createmeta/')) return Response.json({ values: [{ fieldId: 'summary', required: true, name: 'Summary' }, { fieldId: 'description' }, { fieldId: 'customfield_10203' }, { fieldId: 'labels' }, { fieldId: 'priority', allowedValues: [{ id: '3', name: 'Medium' }] }] });
    if (new URL(url).pathname.endsWith('/issue/OTHER-1')) return Response.json({ fields: { issuetype: { name: 'Epic' }, project: { id: '999' } } });
  } });
  await f.connect();
  const query = new URLSearchParams({ issueKind: 'task' });
  assert.equal((await f.handle(f.jira, 'metadata', 'GET', null, query)).story.name, 'Задача');
  const body = { methodId: 'task-method', issueKind: 'task', summary: 'Implement integration', description: 'Short description', epic: 'OTHER-1', labels: ['business', 'qaa'], priorityId: '3' };
  await assert.rejects(f.handle(f.jira, 'create', 'POST', body), error => error.code === 'INVALID_REQUEST');
  assert.equal(f.postCount(), 0);
  const result = await f.handle(f.jira, 'create', 'POST', { ...body, epic: 'DI-5' });
  assert.equal(result.state, 'success');
  const fields = JSON.parse(f.calls.find(call => call.url === `${baseUrl}/rest/api/2/issue`).body).fields;
  assert.deepEqual(fields.issuetype, { id: '1' }); assert.deepEqual(fields.labels, ['business', 'qaa']); assert.deepEqual(fields.priority, { id: '3' });
  await f.handle(f.jira, 'create', 'POST', { ...body, epic: 'DI-5', issueKind: 'story' }); assert.equal(f.postCount(), 1);
  await f.handle(f.jira, 'epics');
  const search = new URL(f.calls.find(call => call.url.includes('/search?')).url);
  assert.match(search.searchParams.get('jql'), /^project = 101 AND issuetype = Epic/);
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

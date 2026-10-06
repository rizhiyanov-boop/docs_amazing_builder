import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createWindowsCredentialStore } from './credential-store.mjs';

test('Windows Jira store restores project and write journal encrypted, isolated from Confluence', { skip: process.platform !== 'win32' }, async t => {
  const root = resolve(tmpdir()); const directory = await mkdtemp(join(root, 'docbuilder-jira-'));
  t.after(async () => { if (!resolve(directory).startsWith(root + sep)) throw Error('Invalid cleanup'); await rm(directory, { recursive: true, force: true }); });
  const connection = { baseUrl: 'https://jira.example', token: 'synthetic-jira-only-token', project: { id: '101', key: 'IN', name: 'Interns', url: 'https://jira.example/projects/IN', issueTypes: [{ id: '7', name: 'User Story' }] }, operations: [{ id: 'a'.repeat(64), projectId: '101', storyId: '7', summary: 'Synthetic Story', epic: 'DI-5', epicField: 'customfield_10203', state: 'unknown' }] };
  const store = createWindowsCredentialStore({ directory, service: 'Jira' }); await store.save(connection);
  const encrypted = await readFile(join(directory, 'connection.dpapi'));
  assert.equal(encrypted.includes(Buffer.from(connection.token)), false); assert.equal(encrypted.includes(Buffer.from('Synthetic Story')), false);
  assert.deepEqual(await createWindowsCredentialStore({ directory, service: 'Jira' }).load(), connection);
  await assert.rejects(createWindowsCredentialStore({ directory, service: 'Confluence' }).load());
});

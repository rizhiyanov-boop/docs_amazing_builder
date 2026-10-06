import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createWindowsCredentialStore } from './credential-store.mjs';

const connection = { baseUrl: 'https://confluence.example', token: 'test-only-not-a-real-token' };
async function temporaryDirectory(t) {
  const root = resolve(tmpdir());
  const directory = await mkdtemp(join(root, 'docbuilder-credentials-'));
  t.after(async () => {
    if (!resolve(directory).startsWith(root + sep)) throw new Error('Unexpected cleanup directory');
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test('Windows DPAPI persists a synthetic connection encrypted, restores it and rejects ciphertext tampering', { skip: process.platform !== 'win32' }, async t => {
  const directory = await temporaryDirectory(t);
  const store = createWindowsCredentialStore({ directory });
  assert.equal(await store.load(), null);
  await store.save(connection);
  const file = join(directory, 'connection.dpapi');
  const encrypted = await readFile(file);
  assert.equal(encrypted.includes(Buffer.from(connection.token)), false);
  assert.equal(encrypted.includes(Buffer.from(connection.baseUrl)), false);
  assert.deepEqual(await createWindowsCredentialStore({ directory }).load(), connection);
  await store.save({ ...connection, token: 'second-test-token' });
  assert.equal((await store.load()).token, 'second-test-token');
  const changed = await readFile(file); changed[changed.length - 1] ^= 1;
  await writeFile(file, changed);
  await assert.rejects(store.load(), /защищённое хранилище недоступно/);
  await store.clear(); await store.clear();
  assert.equal(await store.load(), null); assert.deepEqual(await readdir(directory), []);
});

test('protection failure cannot write plaintext or replace previously saved credentials', { skip: process.platform !== 'win32' }, async t => {
  const directory = await temporaryDirectory(t);
  const store = createWindowsCredentialStore({ directory, protect: async () => { throw new Error(connection.token); } });
  await assert.rejects(store.save(connection), /защищённое хранилище недоступно/);
  assert.deepEqual(await readdir(directory), []);
  await assert.rejects(store.save({ ...connection, baseUrl: 'http://outside.example' }), /защищённое хранилище недоступно/);
  const file = join(directory, 'connection.dpapi');
  await writeFile(file, 'existing-encrypted-data');
  await assert.rejects(store.save(connection), /защищённое хранилище недоступно/);
  assert.equal(await readFile(file, 'utf8'), 'existing-encrypted-data');
});

test('forget queued during protection deletes the completed encrypted write', { skip: process.platform !== 'win32' }, async t => {
  let release;
  t.after(() => release?.());
  const directory = await temporaryDirectory(t);
  let markStarted;
  const started = new Promise(resolveStarted => { markStarted = resolveStarted; });
  const protect = async () => { markStarted(); await new Promise(resolveRelease => { release = resolveRelease; }); return Buffer.from('synthetic-ciphertext').toString('base64'); };
  const store = createWindowsCredentialStore({ directory, protect });
  const saving = store.save(connection);
  await started;
  const clearing = store.clear(); release();
  await saving; await clearing;
  assert.equal(await store.load(), null);
  assert.deepEqual(await readdir(directory), []);
});

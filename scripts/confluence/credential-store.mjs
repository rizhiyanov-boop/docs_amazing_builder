import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_FILE = 512 * 1024;
const storageError = () => new Error('Локальное защищённое хранилище недоступно.');

function validateConnection(value) {
  if (!value || value.version !== 1 || typeof value.baseUrl !== 'string' || value.baseUrl.length > 512
    || typeof value.token !== 'string' || !value.token || value.token.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(value.token)) throw storageError();
  const url = new URL(value.baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.origin !== value.baseUrl) throw storageError();
  const extra = {};
  if (value.project !== undefined) {
    const project = value.project;
    if (!project || !/^\d{1,20}$/.test(project.id) || !/^[A-Z][A-Z0-9_]{0,63}$/.test(project.key) || typeof project.name !== 'string' || project.name.length > 255 || !Array.isArray(project.issueTypes) || project.issueTypes.length > 200 || !Array.isArray(value.operations) || value.operations.length > 256) throw storageError();
    extra.project = { id: project.id, key: project.key, name: project.name, url: `${value.baseUrl}/projects/${project.key}`, issueTypes: project.issueTypes.map(type => {
      if (!/^\d{1,20}$/.test(type.id) || typeof type.name !== 'string' || type.name.length > 255) throw storageError();
      return { id: type.id, name: type.name, ...(type.subtask !== undefined ? { subtask: type.subtask === true } : {}) };
    }) };
    extra.operations = value.operations.map(item => {
      if (!item || !/^[a-f0-9]{64}$/.test(item.id) || !/^\d{1,20}$/.test(item.projectId) || typeof item.summary !== 'string' || item.summary.length > 255 || !/^[A-Z][A-Z0-9_]*-[1-9]\d*$/.test(item.epic) || !/^customfield_\d+$/.test(item.epicField) || !['unknown', 'success'].includes(item.state)) throw storageError();
      if (!/^\d{1,20}$/.test(item.storyId)) throw storageError();
      const result = { id: item.id, projectId: item.projectId, storyId: item.storyId, summary: item.summary, epic: item.epic, epicField: item.epicField, state: item.state };
      if (item.issue) {
        if (!/^\d{1,20}$/.test(item.issue.id) || !/^[A-Z][A-Z0-9_]*-[1-9]\d*$/.test(item.issue.key)) throw storageError();
        result.issue = { id: item.issue.id, key: item.issue.key, url: `${value.baseUrl}/browse/${item.issue.key}` };
      }
      if (item.state === 'success' && !result.issue) throw storageError();
      if (item.linkedUrl) { const linked = new URL(item.linkedUrl); if (linked.protocol !== 'https:' || linked.username || linked.password || item.linkedUrl.length > 2048) throw storageError(); result.linkedUrl = linked.href; }
      return result;
    });
  }
  return { baseUrl: value.baseUrl, token: value.token, ...extra };
}

/** Secret input travels through stdin only. The fixed command contains no user data. */
function dpapi(operation, input, service) {
  const action = operation === 'protect'
    ? '$bytes = [Text.Encoding]::UTF8.GetBytes($inputText); $result = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($result))'
    : '$bytes = [Convert]::FromBase64String($inputText); $result = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Text.Encoding]::UTF8.GetString($result))';
  const command = `$ErrorActionPreference = 'Stop'; try { Add-Type -AssemblyName System.Security; [Console]::InputEncoding = New-Object Text.UTF8Encoding($false); [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false); $inputText = [Console]::In.ReadToEnd(); $entropy = [Text.Encoding]::UTF8.GetBytes('DocBuilder.${service}.Connection.v1'); ${action} } catch { [Console]::Error.Write('Local protected storage failed.'); exit 1 }`;
  return new Promise((resolve, reject) => {
    const child = execFile(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 15_000, maxBuffer: MAX_FILE, encoding: 'utf8' },
      (error, stdout) => error ? reject(storageError()) : resolve(stdout));
    child.stdin.on('error', () => {});
    child.stdin.end(input, 'utf8');
  });
}

/** No plaintext fallback, package dependencies, or files beside the application. */
export function createWindowsCredentialStore({ directory, service = 'Confluence', protect = value => dpapi('protect', value, service), unprotect = value => dpapi('unprotect', value, service) } = {}) {
  if (process.platform !== 'win32') return null;
  const localRoot = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
  if (!['Confluence', 'Jira'].includes(service)) throw storageError();
  const folder = directory ?? join(localRoot, 'DocBuilder', service);
  if (!isAbsolute(folder)) throw storageError();
  const file = join(folder, 'connection.dpapi');
  let queue = Promise.resolve();
  const serial = action => { const result = queue.then(action); queue = result.catch(() => {}); return result; };
  return {
    load: () => serial(async () => {
      let encrypted;
      try { encrypted = await readFile(file); }
      catch (error) { if (error.code === 'ENOENT') return null; throw storageError(); }
      try {
        if (!encrypted.length || encrypted.length > MAX_FILE) throw storageError();
        const plaintext = await unprotect(encrypted.toString('base64'));
        return validateConnection(JSON.parse(plaintext));
      } catch { throw storageError(); }
    }),
    save: connection => serial(async () => {
      const temporary = join(folder, `connection-${randomUUID()}.tmp`);
      try {
        const record = { version: 1, ...validateConnection({ version: 1, ...connection }) };
        const protectedText = await protect(JSON.stringify(record));
        if (typeof protectedText !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(protectedText) || protectedText.length > MAX_FILE) throw storageError();
        const encrypted = Buffer.from(protectedText, 'base64');
        await mkdir(folder, { recursive: true });
        await writeFile(temporary, encrypted, { flag: 'wx', mode: 0o600 });
        await rename(temporary, file);
      } catch { throw storageError(); }
      finally { await unlink(temporary).catch(() => {}); }
    }),
    clear: () => serial(async () => {
      try { await unlink(file); }
      catch (error) { if (error.code !== 'ENOENT') throw storageError(); }
    })
  };
}

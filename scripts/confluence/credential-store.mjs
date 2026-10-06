import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_FILE = 64 * 1024;
const storageError = () => new Error('Локальное защищённое хранилище недоступно.');

function validateConnection(value) {
  if (!value || value.version !== 1 || typeof value.baseUrl !== 'string' || value.baseUrl.length > 512
    || typeof value.token !== 'string' || !value.token || value.token.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(value.token)) throw storageError();
  const url = new URL(value.baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.origin !== value.baseUrl) throw storageError();
  return { baseUrl: value.baseUrl, token: value.token };
}

/** Secret input travels through stdin only. The fixed command contains no user data. */
function dpapi(operation, input) {
  const action = operation === 'protect'
    ? '$bytes = [Text.Encoding]::UTF8.GetBytes($inputText); $result = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($result))'
    : '$bytes = [Convert]::FromBase64String($inputText); $result = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Text.Encoding]::UTF8.GetString($result))';
  const command = `$ErrorActionPreference = 'Stop'; try { Add-Type -AssemblyName System.Security; [Console]::InputEncoding = New-Object Text.UTF8Encoding($false); [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false); $inputText = [Console]::In.ReadToEnd(); $entropy = [Text.Encoding]::UTF8.GetBytes('DocBuilder.Confluence.Connection.v1'); ${action} } catch { [Console]::Error.Write('Local protected storage failed.'); exit 1 }`;
  return new Promise((resolve, reject) => {
    const child = execFile(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 15_000, maxBuffer: MAX_FILE, encoding: 'utf8' },
      (error, stdout) => error ? reject(storageError()) : resolve(stdout));
    child.stdin.on('error', () => {});
    child.stdin.end(input, 'utf8');
  });
}

/** No plaintext fallback, package dependencies, or files beside the application. */
export function createWindowsCredentialStore({ directory, protect = value => dpapi('protect', value), unprotect = value => dpapi('unprotect', value) } = {}) {
  if (process.platform !== 'win32') return null;
  const localRoot = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
  const folder = directory ?? join(localRoot, 'DocBuilder', 'Confluence');
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

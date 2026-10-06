import http from 'node:http';
import { createJira, JiraError } from './jira.mjs';
import { jiraForm } from './jira-form.mjs';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const BRIDGE_VERSION = '1.3.1';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_TIMER_DELAY = 2_147_483_647;
export const DEFAULT_ORIGINS = ['https://docsamazingbuilder.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173'];
const MAX_BODY = 2_500_000;
const MAX_RESPONSE = 5_000_000;
const MAX_OPERATIONS = 256;

export class BridgeError extends Error {
  constructor(status, code, message, details = {}) { super(message); this.status = status; this.code = code; this.details = details; }
}
const invalid = (message = 'Некорректный запрос.') => new BridgeError(400, 'INVALID_REQUEST', message);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function text(value, max, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw invalid(`Некорректное поле ${field}.`);
  return value;
}
function pageId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,19}$/.test(value)) throw invalid('Некорректный идентификатор страницы.');
  return value;
}
function spaceKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9~_.-]{1,255}$/.test(value)) throw invalid('Некорректный ключ пространства.');
  return value;
}
function integer(value, fallback, min, max) {
  if (value === null || value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) throw invalid('Некорректные параметры пагинации.');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) throw invalid('Некорректные параметры пагинации.');
  return result;
}
function requireRecord(value) { if (!isRecord(value)) throw invalid(); return value; }
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function validateAdditionalOrigin(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Origin должен быть полным HTTPS origin без пути.'); }
  if (parsed.protocol !== 'https:' || parsed.origin !== value || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('Origin должен быть полным HTTPS origin без пути.');
  return value;
}
function connectionToken(value) {
  const token = text(value, 4096, 'token').trim();
  if (/[\s\u007f]/.test(token)) throw invalid('Некорректный токен.');
  return token;
}

export function validateConfluenceBaseUrl(value) {
  let parsed;
  try { parsed = new URL(text(value, 512, 'baseUrl')); } catch { throw invalid('Укажите HTTPS адрес Confluence без пути, параметров и учётных данных.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw invalid('Укажите HTTPS адрес Confluence без пути, параметров и учётных данных.');
  return parsed.origin;
}

/** Read only the pagination offset; never follow an upstream supplied URL. */
export function nextStart(next, path, currentStart, baseUrl) {
  if (!next) return null;
  const failure = () => new BridgeError(502, 'UPSTREAM_INVALID', 'Confluence вернул некорректную пагинацию.');
  let parsed;
  try { parsed = new URL(next, baseUrl); } catch { throw failure(); }
  const expected = new URL(path, baseUrl);
  if (parsed.origin !== new URL(baseUrl).origin || parsed.pathname !== expected.pathname || parsed.username || parsed.password || parsed.hash) throw failure();
  for (const key of parsed.searchParams.keys()) if (!['start', 'limit', 'depth', 'expand'].includes(key)) throw failure();
  const raw = parsed.searchParams.get('start');
  if (raw === null || !/^\d+$/.test(raw)) throw failure();
  const result = Number(raw);
  if (!Number.isSafeInteger(result) || result <= currentStart) throw failure();
  return result;
}
export function diagramMacro(engine, code, id = randomUUID()) {
  if (engine !== 'plantuml' && engine !== 'mermaid') throw invalid('Неизвестный движок диаграммы.');
  text(code, 150_000, 'diagram.code');
  const name = engine === 'plantuml' ? 'plantuml' : 'mermaiddiagram';
  const parameters = engine === 'plantuml' ? '<ac:parameter ac:name="atlassian-macro-output-type">INLINE</ac:parameter>' : '<ac:parameter ac:name="" />';
  return `<ac:structured-macro ac:name="${name}" ac:schema-version="1" ac:macro-id="${id}">${parameters}<ac:plain-text-body><![CDATA[${code.replaceAll(']]>', ']]]]><![CDATA[>')}]]></ac:plain-text-body></ac:structured-macro>`;
}
export function insertDiagrams(storage, diagrams) {
  if (typeof storage !== 'string') throw new BridgeError(502, 'UPSTREAM_INVALID', 'Confluence не вернул storage-документ.');
  if (!Array.isArray(diagrams) || diagrams.length > 100) throw invalid('Некорректный список диаграмм.');
  const placeholders = new Set(); let result = storage;
  for (const value of diagrams) {
    const diagram = requireRecord(value);
    if (typeof diagram.placeholder !== 'string' || !/^DOCBUILDER_DIAGRAM_[A-Za-z0-9_]{1,100}$/.test(diagram.placeholder) || placeholders.has(diagram.placeholder)) throw invalid('Некорректный или повторяющийся маркер диаграммы.');
    placeholders.add(diagram.placeholder);
    const expression = new RegExp(`<p(?:\\s+[^>]*)?>\\s*${diagram.placeholder}\\s*</p>`, 'g');
    if ([...result.matchAll(expression)].length !== 1) throw new BridgeError(502, 'UPSTREAM_INVALID', 'Маркер диаграммы не сохранился при конвертации Wiki.');
    result = result.replace(expression, () => diagramMacro(diagram.engine, diagram.code));
  }
  return result;
}
/** Conservative: XML differences remain uncertain rather than reporting a false success. */
export function sameStorage(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  return storageDigest(expected) === storageDigest(actual);
}
function storageDigest(value) {
  const normalized = value.replace(/\r\n?/g, '\n').replace(/<!\[CDATA\[[\s\S]*?\]\]>|<ac:structured-macro\b[^>]*>|&nbsp;/g, tag => tag.startsWith('<![CDATA[') ? tag : tag.replace(/\s+ac:macro-id="[^"]*"/g, '').replace(/&nbsp;/g, '\u00a0')).trim();
  return createHash('sha256').update(normalized).digest('hex');
}
function summary(value, parentId = undefined) {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^[1-9]\d{0,19}$/.test(value.id) || typeof value.title !== 'string') throw new BridgeError(502, 'UPSTREAM_INVALID', 'Confluence вернул некорректную страницу.');
  const ancestors = Array.isArray(value.ancestors) ? value.ancestors : [];
  return { id: value.id, title: value.title.slice(0, 500), parentId: parentId ?? ancestors.at(-1)?.id ?? null };
}
function fullPage(value, baseUrl) {
  const page = summary(value);
  if (!isRecord(value.space) || typeof value.space.key !== 'string' || !Number.isSafeInteger(value.version?.number) || value.version.number < 1 || !Array.isArray(value.ancestors) || typeof value.body?.storage?.value !== 'string') throw new BridgeError(502, 'UPSTREAM_INVALID', 'Confluence вернул неполные данные страницы.');
  return { ...page, spaceKey: value.space.key, version: value.version.number, url: `${baseUrl}/pages/viewpage.action?pageId=${page.id}`, ancestors: value.ancestors.map(value => summary(value)), storage: value.body.storage.value,
    ...(typeof value.body?.view?.value === 'string' ? { view: value.body.view.value } : {}) };
}
/** A complete successful POST/PUT response acknowledges the write without comparing rewritten storage. */
function writeConfirmation(value, baseUrl) {
  if ((value.type !== undefined && value.type !== 'page') || (value.status !== undefined && value.status !== 'current')) {
    throw new BridgeError(502, 'UPSTREAM_INVALID', 'Confluence не подтвердил сохранение актуальной страницы.');
  }
  if (value.type !== 'page' || value.status !== 'current' || !isRecord(value.space) || typeof value.space.key !== 'string'
    || !Number.isSafeInteger(value.version?.number) || value.version.number < 1 || !Array.isArray(value.ancestors)
    || value.ancestors.some(ancestor => !isRecord(ancestor) || typeof ancestor.id !== 'string' || !/^[1-9]\d{0,19}$/.test(ancestor.id))) return null;
  const page = summary(value);
  return { ...page, spaceKey: value.space.key, version: value.version.number, url: `${baseUrl}/pages/viewpage.action?pageId=${page.id}`, ancestors: [] };
}
const pageWithoutStorage = page => {
  return { id: page.id, title: page.title, spaceKey: page.spaceKey, version: page.version,
    url: page.url, parentId: page.parentId ?? null, ancestors: [] };
};
async function readJsonBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new BridgeError(415, 'INVALID_REQUEST', 'Нужен JSON-запрос.');
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY) throw new BridgeError(413, 'INVALID_REQUEST', 'Документ превышает допустимый размер.');
    chunks.push(chunk);
  }
  try { return requireRecord(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch (error) { if (error instanceof BridgeError) throw error; throw invalid('Некорректный JSON.'); }
}
function connectionHtml(nonce, origin, connection, preferences, jira) {
  const cspNonce = randomBytes(24).toString('base64');
  const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  let html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DocBuilder — подключение Confluence и Jira</title>
<style nonce="${cspNonce}">body{margin:48px auto;padding:0 24px;max-width:720px;font:16px/1.6 system-ui;color:#292e35;background:#f9f8f6}h1{font-size:28px}label{display:block;margin-top:24px}input{box-sizing:border-box;width:100%;padding:12px;font:inherit;border:1px solid #c7c4be;border-radius:8px}input[type=checkbox]{width:auto;margin-right:8px}button{margin:16px 12px 0 0;padding:10px 16px;font:inherit;border:1px solid #b9b2a7;border-radius:8px;background:#fff;cursor:pointer}button[type=submit]{background:#255b51;color:#fff;border-color:#255b51}.note{color:#5e6470}#status{padding:16px;background:#fff;border-radius:8px;overflow-wrap:anywhere}</style></head>
<body><h1>Подключение Confluence</h1><p class="note">Локальный сервис · версия ${BRIDGE_VERSION}</p><p>Введите адрес своего Confluence. Токен отправляется только этому локальному сервису и на указанный HTTPS адрес. DocBuilder получает состояние подключения, дерево и страницы; токен в него не передаётся.</p>
<p class="note">Сессия действует 30 дней после последнего успешного обращения к Confluence. Сохранённое подключение восстанавливается после перезапуска сервиса. «Забыть токен» удаляет подключение из памяти и с этого компьютера. Дерево страниц не сохраняется.</p>
<form id="form"><label for="base-url">Адрес Confluence</label><input id="base-url" name="baseUrl" type="url" value="${escapeHtml(connection?.baseUrl ?? preferences.baseUrl)}" placeholder="https://confluence.example" autocomplete="off" spellcheck="false" required maxlength="512">
<label for="pat">Личный токен доступа (PAT)</label><input id="pat" name="pat" type="password" autocomplete="off" spellcheck="false" ${preferences.remembered ? 'placeholder="Оставьте пустым, чтобы использовать сохранённый PAT"' : 'required'} maxlength="4096">
<label><input id="remember" type="checkbox" ${preferences.available ? (preferences.remembered || !connection ? 'checked' : '') : 'disabled'}>Запомнить на этом компьютере</label><p class="note">${preferences.available ? 'Адрес и PAT сохраняются зашифрованными для вашего пользователя Windows.' : 'Защищённое сохранение доступно в Windows. Подключение будет храниться только в памяти.'}</p>
<button type="submit" id="connect">Подключить</button><button type="button" id="forget">Забыть токен</button></form>
<p id="status" role="status">${connection ? `Подключено. Сессия до ${new Date(connection.expiresAt).toISOString()}.${preferences.remembered ? ' Подключение сохранено на этом компьютере.' : ''}` : escapeHtml(preferences.message || (preferences.remembered ? 'Подключение сохранено. Нажмите «Подключить», чтобы повторить проверку без ввода PAT.' : 'Введите адрес Confluence и PAT в этой локальной форме.'))}</p><p class="note">После подключения вернитесь в DocBuilder и нажмите «Проверить подключение». Эта страница ничего не публикует.</p>
<script nonce="${cspNonce}">const nonce=${JSON.stringify(nonce)};
const form=document.getElementById('form');const baseUrl=document.getElementById('base-url');const pat=document.getElementById('pat');const remember=document.getElementById('remember');const status=document.getElementById('status');const connect=document.getElementById('connect');const forget=document.getElementById('forget');
async function request(path,body){connect.disabled=forget.disabled=true;status.textContent='Проверяем подключение…';try{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-DocBuilder-Local-Nonce':nonce},body:JSON.stringify(body),credentials:'omit',cache:'no-store'});const result=await response.json();if(response.ok)pat.required=!result.remembered;status.textContent=response.ok?(result.connected?'Подключено. Сессия до '+result.expiresAt+'.'+(result.remembered?' Подключение сохранено на этом компьютере.':' Подключение хранится только в памяти.'):'Подключение удалено из памяти и с этого компьютера.'):(result.message||'Не удалось подключиться.');}catch{status.textContent='Локальный сервис недоступен. Откройте его повторно.';}finally{connect.disabled=forget.disabled=false;}}
form.addEventListener('submit',event=>{event.preventDefault();const token=pat.value;pat.value='';request('/local/session',{baseUrl:baseUrl.value.trim(),token,remember:remember.checked});});forget.addEventListener('click',()=>{pat.value='';baseUrl.value='';request('/local/forget',{});});</script></body></html>`;
  html = html.replace('</body>', `${jiraForm(cspNonce, jira)}</body>`);
  return { html, csp: `default-src 'none'; script-src 'nonce-${cspNonce}'; style-src 'nonce-${cspNonce}'; connect-src ${origin}; form-action 'self'; frame-ancestors 'none'; base-uri 'none'` };
}

/** The upstream is selected only by the authenticated local form; test seams never expose a CLI override. */
export function createBridge(options = {}) {
  const testBaseUrl = options.upstream;
  if (testBaseUrl !== undefined) {
    const testUrl = new URL(testBaseUrl);
    if (!options.allowTestUpstream || testUrl.protocol !== 'http:' || testUrl.hostname !== '127.0.0.1' || testUrl.username || testUrl.password || testUrl.pathname !== '/' || testUrl.search || testUrl.hash) throw new Error('Тестовый upstream допускается только на HTTP 127.0.0.1.');
  }
  const connectionBaseUrl = value => testBaseUrl && value === testBaseUrl ? testBaseUrl : validateConfluenceBaseUrl(value);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimeoutImpl ?? setTimeout;
  const clearTimer = options.clearTimeoutImpl ?? clearTimeout;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxOperations = options.maxOperations ?? MAX_OPERATIONS;
  if (!Number.isInteger(maxOperations) || maxOperations < 1 || maxOperations > MAX_OPERATIONS) throw new Error('Некорректный размер журнала операций.');
  const origins = new Set(DEFAULT_ORIGINS);
  for (const origin of options.origins ?? []) origins.add(validateAdditionalOrigin(origin));
  const nonce = randomBytes(32).toString('hex');
  const credentialStore = options.credentialStore ?? null;
  const jira = createJira({ store: options.jiraCredentialStore, fetchImpl, now, timeoutMs });
  const operations = new Map();
  const operationByDocument = new Map();
  let session = null;
  let expiryTimer = null;
  let sessionGeneration = 0;
  let authenticating = false;
  let remembered = false;
  let lastBaseUrl = '';
  let persistenceMessage = '';
  function forgetSession() { session = null; sessionGeneration += 1; clearTimer(expiryTimer); expiryTimer = null; }
  function activeSession() { if (session && session.expiresAt <= now()) forgetSession(); return session; }
  function scheduleExpiry() {
    clearTimer(expiryTimer);
    if (!session) { expiryTimer = null; return; }
    const remaining = session.expiresAt - now();
    if (remaining <= 0) { forgetSession(); return; }
    expiryTimer = setTimer(() => { if (activeSession()) scheduleExpiry(); }, Math.min(remaining, MAX_TIMER_DELAY));
    expiryTimer?.unref?.();
  }
  function renewSession(connection) { if (session === connection) { session.expiresAt = now() + SESSION_TTL_MS; scheduleExpiry(); } }
  function status() { const current = activeSession(); return { connected: Boolean(current), baseUrl: current?.baseUrl ?? '', expiresAt: current ? new Date(current.expiresAt).toISOString() : null, bridgeVersion: BRIDGE_VERSION, remembered }; }
  async function clearSavedConnection() {
    if (credentialStore) await credentialStore.clear();
    remembered = false;
  }
  function requiredConnection(expectedBaseUrl) {
    const current = activeSession();
    if (!current) throw new BridgeError(401, 'NOT_CONNECTED', 'Подключите Confluence через локальную форму.');
    if (typeof expectedBaseUrl !== 'string' || !expectedBaseUrl) throw invalid('Укажите ожидаемый адрес Confluence.');
    if (current.baseUrl !== expectedBaseUrl) throw new BridgeError(409, 'SESSION_CHANGED', 'Подключение Confluence изменилось. Проверьте адрес и загрузите данные заново.');
    return current;
  }
  function assertConnection(connection) {
    if (!activeSession()) throw new BridgeError(401, 'NOT_CONNECTED', 'Локальная сессия завершена. Подключитесь заново.');
    if (session !== connection) throw new BridgeError(409, 'SESSION_CHANGED', 'Подключение Confluence изменилось во время запроса.');
  }
  function assertOperationOrigin(operation, connection) {
    assertConnection(connection);
    if (operation.baseUrl !== connection.baseUrl) throw new BridgeError(409, 'SESSION_CHANGED', 'Для проверки операции подключитесь к тому Confluence, куда отправлялась публикация.');
  }

  async function upstream(path, { method = 'GET', body, connection, authenticatingConnection = false } = {}) {
    if (!connection) throw invalid();
    if (!authenticatingConnection) assertConnection(connection);
    const url = new URL(path, connection.baseUrl);
    if (url.origin !== connection.baseUrl || url.username || url.password || !url.pathname.startsWith('/rest/api/')) throw invalid();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs); timer.unref();
    try {
      const response = await fetchImpl(url, { method, headers: { Accept: 'application/json', Authorization: `Bearer ${connection.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: controller.signal });
      if (!response.ok) void response.body?.cancel().catch(() => {});
      if (response.status === 401) {
        if (session === connection) {
          forgetSession();
          if (connection.persisted) await clearSavedConnection().catch(() => { persistenceMessage = 'Не удалось удалить сохранённый PAT. Нажмите «Забыть токен» в локальной форме.'; });
        }
        throw new BridgeError(401, 'AUTH_EXPIRED', 'Confluence отклонил токен. Подключитесь заново.');
      }
      if (response.status === 403) throw new BridgeError(403, 'ACCESS_DENIED', 'Confluence не разрешает это действие.');
      if (response.status === 404) throw new BridgeError(404, 'NOT_FOUND', 'Страница или пространство не найдены либо недоступны.');
      if (response.status === 409) throw new BridgeError(409, 'VERSION_CONFLICT', 'Страница изменилась в Confluence. Загрузите актуальную версию.');
      if (response.status >= 300 && response.status < 400) throw new BridgeError(502, 'UPSTREAM_REDIRECT', 'Confluence перенаправил запрос. Перенаправления отключены.');
      if (!response.ok) {
        if (response.status >= 500) throw new BridgeError(502, 'UPSTREAM_UNAVAILABLE', 'Confluence не завершил запрос.');
        throw new BridgeError(response.status === 429 ? 429 : 400, 'UPSTREAM_REJECTED', response.status === 429 ? 'Confluence ограничил частоту запросов. Попробуйте позже.' : 'Confluence отклонил запрос. Проверьте название, содержимое и права.');
      }
      let bytes = 0; const chunks = [];
      if (response.body) for await (const chunk of response.body) { bytes += chunk.length; if (bytes > MAX_RESPONSE) { controller.abort(); throw new BridgeError(502, 'UPSTREAM_INVALID', 'Ответ Confluence превышает допустимый размер.'); } chunks.push(Buffer.from(chunk)); }
      let result;
      try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new BridgeError(502, 'UPSTREAM_INVALID', 'Confluence не вернул ожидаемый JSON.'); }
      if (!isRecord(result)) throw new BridgeError(502, 'UPSTREAM_INVALID', 'Confluence вернул некорректный ответ.');
      if (!authenticatingConnection) assertConnection(connection);
      renewSession(connection); return result;
    } catch (error) { if (error instanceof BridgeError) throw error; throw new BridgeError(502, 'UPSTREAM_UNAVAILABLE', 'Не удалось завершить запрос к Confluence. Проверьте сеть и VPN.'); }
    finally { clearTimeout(timer); }
  }
  const readPage = async (id, connection, withView = false) => fullPage(await upstream(`/rest/api/content/${pageId(id)}?expand=space,version,ancestors,body.storage${withView ? ',body.view' : ''}`, { connection }), connection.baseUrl);
  async function verifyConnection(connection, generation) {
    const identity = await upstream('/rest/api/user/current', { connection, authenticatingConnection: true });
    if (identity.type !== 'known') throw new BridgeError(401, 'AUTH_EXPIRED', 'Confluence не подтвердил авторизацию.');
    if (generation !== sessionGeneration) throw new BridgeError(409, 'SESSION_CHANGED', 'Сессия была завершена во время проверки.');
  }
  function acceptConnection(connection) {
    connection.expiresAt = now() + SESSION_TTL_MS;
    session = connection; sessionGeneration += 1; lastBaseUrl = connection.baseUrl; persistenceMessage = ''; scheduleExpiry();
  }
  async function restoreConnection() {
    if (!credentialStore || authenticating || activeSession()) return Boolean(activeSession());
    authenticating = true; const generation = sessionGeneration;
    try {
      const saved = await credentialStore.load();
      if (!saved || generation !== sessionGeneration) return false;
      const connection = { baseUrl: connectionBaseUrl(saved.baseUrl), token: connectionToken(saved.token), expiresAt: now() + SESSION_TTL_MS, persisted: true };
      lastBaseUrl = connection.baseUrl; remembered = true;
      await verifyConnection(connection, generation);
      acceptConnection(connection); return true;
    } catch (error) {
      if (generation !== sessionGeneration) return false;
      if (error instanceof BridgeError && error.code === 'AUTH_EXPIRED') {
        await clearSavedConnection().catch(() => {});
        persistenceMessage = 'Сохранённый PAT отклонён Confluence. Введите новый токен.';
      } else persistenceMessage = remembered ? 'Не удалось восстановить подключение. Проверьте сеть и нажмите «Подключить» без повторного ввода PAT.' : 'Сохранённое подключение недоступно. Введите адрес и PAT заново.';
      return false;
    } finally { authenticating = false; }
  }
  function collection(data, path, start, map, connection) { assertConnection(connection); if (!Array.isArray(data.results)) throw new BridgeError(502, 'UPSTREAM_INVALID', 'Confluence не вернул список.'); return { items: data.results.map(map), nextStart: nextStart(data._links?.next, path, start, connection.baseUrl) }; }
  async function prepare(body, connection) {
    if (body.baseUrl !== connection.baseUrl) throw new BridgeError(409, 'SESSION_CHANGED', 'Подготовка относится к другому подключению Confluence.');
    const wiki = text(body.wiki, 1_500_000, 'wiki');
    if (!Array.isArray(body.diagrams) || body.diagrams.length > 100) throw invalid('Некорректный список диаграмм.');
    const seen = new Set();
    for (const diagram of body.diagrams) { requireRecord(diagram); if (!/^DOCBUILDER_DIAGRAM_[A-Za-z0-9_]{1,100}$/.test(diagram.placeholder ?? '') || seen.has(diagram.placeholder)) throw invalid('Некорректный маркер диаграммы.'); seen.add(diagram.placeholder); diagramMacro(diagram.engine, diagram.code); }
    const converted = await upstream('/rest/api/contentbody/convert/storage', { method: 'POST', body: { representation: 'wiki', value: wiki }, connection });
    return { storage: insertDiagrams(converted.value, body.diagrams) };
  }
  function matchesDestination(operation, page) {
    const expected = operation.expected;
    return page.spaceKey === expected.spaceKey && page.title === expected.title && page.version === expected.version
      && (expected.mode === 'update' ? page.id === expected.pageId : (page.parentId ?? null) === expected.parentId);
  }
  function matchesOperation(operation, page) {
    return matchesDestination(operation, page) && storageDigest(page.storage) === operation.expected.storageDigest;
  }
  async function reconcileOperation(operation, id, connection, explicit = false) {
    assertOperationOrigin(operation, connection);
    if (operation.state === 'success') {
      if (operation.page.id !== id) throw invalid('Операция уже подтверждена для другой страницы.');
      await readPage(id, connection);
      return operation.page;
    }
    if (operation.state !== 'unknown') throw new BridgeError(409, 'OPERATION_PENDING', 'Подтверждать можно только операцию с неопределённым результатом.');
    if (operation.page?.id && operation.page.id !== id) throw invalid('У операции уже известен другой идентификатор страницы.');
    if (operation.reconciling) {
      const result = await operation.reconciling;
      assertConnection(connection);
      if (operation.state === 'success' && operation.page.id !== id) throw invalid('Операция подтверждена для другой страницы.');
      return result;
    }
    operation.reconciling = (async () => {
      const page = await readPage(id, connection);
      if (!matchesOperation(operation, page)) throw new BridgeError(409, 'VERIFICATION_MISMATCH', 'Страница не совпадает с отправленной публикацией. Проверьте адрес, родителя, версию и содержимое.');
      operation.page = pageWithoutStorage(page);
      operation.state = 'success';
      delete operation.message;
      return operation.page;
    })();
    try { return await operation.reconciling; }
    catch (error) {
      if (explicit || (error instanceof BridgeError && ['AUTH_EXPIRED', 'ACCESS_DENIED', 'NOT_CONNECTED', 'SESSION_CHANGED', 'NOT_FOUND'].includes(error.code))) throw error;
      return null;
    }
    finally { delete operation.reconciling; }
  }
  function publicationIntent(body, connection) {
    requireRecord(body);
    if (body.baseUrl !== connection.baseUrl) throw new BridgeError(409, 'SESSION_CHANGED', 'Публикация относится к другому подключению Confluence.');
    const id = text(body.operationId, 128, 'operationId');
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(id)) throw invalid('Некорректный идентификатор операции.');
    const mode = body.mode;
    if (mode !== 'create' && mode !== 'update') throw invalid('Некорректный режим публикации.');
    const title = text(body.title, 255, 'title').trim();
    if (/[\r\n\t]/.test(title)) throw invalid('Название страницы должно быть одной строкой.');
    const key = spaceKey(body.spaceKey); const storage = text(body.storage, 2_000_000, 'storage');
    const targetId = mode === 'update' ? pageId(body.pageId) : null;
    const parentId = mode === 'create' && body.parentId !== undefined ? pageId(body.parentId) : null;
    if (mode === 'update' && (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1 || body.expectedVersion >= Number.MAX_SAFE_INTEGER)) throw invalid('Укажите ожидаемую версию страницы.');
    const contentDigest = storageDigest(storage);
    const digest = createHash('sha256').update(JSON.stringify({ baseUrl: connection.baseUrl, mode, title, key, contentDigest, targetId, parentId, expectedVersion: body.expectedVersion })).digest('hex');
    return { id, mode, title, key, storage, targetId, parentId, digest,
      expected: { mode, title, spaceKey: key, pageId: targetId, parentId, version: mode === 'update' ? body.expectedVersion + 1 : 1, storageDigest: contentDigest } };
  }
  async function publish(body, connection) {
    assertConnection(connection);
    const { id, mode, title, key, storage, targetId, parentId, digest, expected } = publicationIntent(body, connection);
    const previous = operations.get(id);
    if (previous) {
      assertOperationOrigin(previous, connection);
      if (previous.digest !== digest) throw invalid('Идентификатор операции уже использован для другого содержимого.');
      if (previous.state === 'success') { await readPage(previous.page.id, connection); return previous.page; }
      if (previous.state === 'pending') throw new BridgeError(409, 'OPERATION_PENDING', 'Публикация ещё выполняется. Проверьте результат операции.', { operationId: id });
      if (previous.state === 'unknown') throw new BridgeError(409, 'OUTCOME_UNKNOWN', previous.message, { operationId: id });
      throw new BridgeError(previous.error.status, previous.error.code, previous.message);
    }
    const existingId = operationByDocument.get(digest);
    const existing = operations.get(existingId);
    if (existing && ['pending', 'unknown'].includes(existing.state)) throw new BridgeError(409, existing.state === 'pending' ? 'OPERATION_PENDING' : 'OUTCOME_UNKNOWN', existing.message ?? 'Такая публикация уже выполняется. Проверьте исходную операцию.', { operationId: existingId });
    if (operations.size >= maxOperations) {
      const evictable = [...operations.entries()].find(([, operation]) => ['success', 'failed'].includes(operation.state) && !operation.reconciling);
      if (!evictable) throw new BridgeError(429, 'OPERATION_LIMIT', 'Журнал заполнен выполняющимися и неопределёнными публикациями. Сначала проверьте их результаты.');
      const [expiredId, expired] = evictable;
      operations.delete(expiredId);
      if (operationByDocument.get(expired.digest) === expiredId) operationByDocument.delete(expired.digest);
    }
    const operation = { state: 'pending', baseUrl: connection.baseUrl, digest, expected };
    operations.set(id, operation); operationByDocument.set(digest, id);
    let writeStarted = false; let knownPage = null;
    try {
      let version;
      if (mode === 'update') {
        const current = await readPage(targetId, connection);
        if (current.spaceKey !== key) throw invalid('Страница находится в другом пространстве.');
        if (current.version !== body.expectedVersion) throw new BridgeError(409, 'VERSION_CONFLICT', 'Страница изменилась в Confluence. Загрузите актуальную версию.');
        version = current.version + 1;
      } else if (parentId) { const parent = await readPage(parentId, connection); if (parent.spaceKey !== key) throw invalid('Родитель находится в другом пространстве.'); }
      else { const space = await upstream(`/rest/api/space/${encodeURIComponent(key)}`, { connection }); if (space.key !== key) throw new BridgeError(502, 'UPSTREAM_INVALID', 'Confluence вернул другое пространство.'); }
      const payload = { type: 'page', title, body: { storage: { value: storage, representation: 'storage' } } };
      if (mode === 'create') { payload.space = { key }; if (parentId) payload.ancestors = [{ id: parentId }]; }
      else { payload.id = targetId; payload.version = { number: version, message: 'Опубликовано из DocBuilder' }; }
      assertConnection(connection); writeStarted = true;
      const writePath = mode === 'create' ? '/rest/api/content' : `/rest/api/content/${targetId}`;
      const written = await upstream(`${writePath}?expand=space,version,ancestors`, { method: mode === 'create' ? 'POST' : 'PUT', body: payload, connection });
      if (typeof written.id !== 'string' || !/^[1-9]\d{0,19}$/.test(written.id) || (mode === 'update' && written.id !== targetId)) throw new BridgeError(502, 'UPSTREAM_INVALID', 'Confluence не подтвердил идентификатор опубликованной страницы.');
      knownPage = { id: written.id, title, spaceKey: key, version: mode === 'update' ? version : 1, url: `${connection.baseUrl}/pages/viewpage.action?pageId=${written.id}`, parentId, ancestors: [] };
      const confirmed = writeConfirmation(written, connection.baseUrl);
      if (confirmed) {
        if (!matchesDestination(operation, confirmed)) throw new BridgeError(502, 'UPSTREAM_INVALID', 'Ответ Confluence не подтвердил назначение и версию публикации.');
        knownPage = confirmed;
      } else {
        const verified = await readPage(written.id, connection); knownPage = pageWithoutStorage(verified);
        if (!matchesOperation(operation, verified)) throw new BridgeError(502, 'UPSTREAM_INVALID', 'Неполный ответ Confluence и повторное чтение не подтвердили публикацию.');
      }
      operation.state = 'success'; operation.page = knownPage; return knownPage;
    } catch (error) {
      const failure = error instanceof BridgeError ? error : new BridgeError(502, 'UPSTREAM_UNAVAILABLE', 'Публикацию не удалось завершить.');
      const uncertain = writeStarted && (knownPage !== null || failure.status >= 500 || ['SESSION_CHANGED', 'NOT_CONNECTED'].includes(failure.code));
      operation.state = uncertain ? 'unknown' : 'failed';
      operation.message = uncertain ? 'Результат публикации неизвестен. Проверьте страницу в Confluence перед новой попыткой; автоматический повтор отключён.' : failure.message;
      if (knownPage) operation.page = knownPage;
      operation.error = { status: failure.status, code: failure.code };
      if (uncertain) throw new BridgeError(409, 'OUTCOME_UNKNOWN', operation.message, { operationId: id });
      throw failure;
    }
  }
  const server = http.createServer(async (req, res) => {
    const port = server.address()?.port;
    const localHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    const origin = req.headers.origin; const localOrigin = `http://${req.headers.host}`;
    function send(statusCode, value) { res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); }
    try {
      if (!localHosts.has(req.headers.host)) throw new BridgeError(403, 'HOST_DENIED', 'Недопустимый адрес локального сервиса.');
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) throw invalid();
      const url = new URL(req.url, localOrigin);
      if (url.pathname === '/health' && req.method === 'GET') {
        if (origin && origin !== localOrigin && !origins.has(origin)) throw new BridgeError(403, 'ORIGIN_DENIED', 'Недопустимый источник запроса.');
        if (origins.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
        send(200, { service: 'docbuilder-confluence', running: true, apiVersion: 1 }); return;
      }
      if (url.pathname === '/' && req.method === 'GET') {
        if (origin && origin !== localOrigin) throw new BridgeError(403, 'ORIGIN_DENIED', 'Откройте форму напрямую на локальном адресе.');
        const current = activeSession(); const page = connectionHtml(nonce, localOrigin, current, { available: Boolean(credentialStore), remembered, baseUrl: lastBaseUrl, message: persistenceMessage }, jira.status());
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': page.csp, 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }); res.end(page.html); return;
      }
      if (url.pathname.startsWith('/local/')) {
        if (origin !== localOrigin || !safeEqual(req.headers['x-docbuilder-local-nonce'], nonce)) throw new BridgeError(403, 'CSRF_DENIED', 'Запрос должен исходить из локальной формы подключения.');
        if (req.method !== 'POST') throw new BridgeError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается.');
        const body = await readJsonBody(req);
        if (url.pathname === '/local/jira/session') { send(200, await jira.connect(body)); return; }
        if (url.pathname === '/local/jira/forget') { send(200, await jira.forget()); return; }
        if (url.pathname === '/local/forget') {
          forgetSession(); lastBaseUrl = ''; persistenceMessage = '';
          try { await clearSavedConnection(); }
          catch { throw new BridgeError(500, 'LOCAL_FAILURE', 'Сессия завершена, но сохранённое подключение удалить не удалось. Повторите «Забыть токен».'); }
          send(200, status()); return;
        }
        if (url.pathname !== '/local/session') throw new BridgeError(404, 'NOT_FOUND', 'Маршрут не найден.');
        if (authenticating) throw new BridgeError(409, 'OPERATION_PENDING', 'Проверка подключения ещё выполняется.');
        if (body.remember !== undefined && typeof body.remember !== 'boolean') throw invalid('Некорректный признак сохранения подключения.');
        const remember = body.remember === true;
        if (remember && !credentialStore) throw new BridgeError(500, 'LOCAL_FAILURE', 'Защищённое сохранение недоступно. Снимите «Запомнить на этом компьютере».');
        authenticating = true; const generation = sessionGeneration;
        let fromStorage = false;
        try {
          const baseUrl = connectionBaseUrl(body.baseUrl);
          let token;
          if (body.token === '') {
            const saved = credentialStore && remembered ? await credentialStore.load() : null;
            if (!saved || saved.baseUrl !== baseUrl) throw invalid('Для этого адреса введите PAT. Сохранённый токен нельзя использовать для другого Confluence.');
            token = connectionToken(saved.token); fromStorage = true;
          } else token = connectionToken(body.token);
          if (generation !== sessionGeneration) throw new BridgeError(409, 'SESSION_CHANGED', 'Сессия была завершена во время проверки.');
          const connection = { token, baseUrl, expiresAt: now() + SESSION_TTL_MS, persisted: remember };
          await verifyConnection(connection, generation);
          if (remember) await credentialStore.save({ baseUrl, token });
          else await clearSavedConnection();
          if (generation !== sessionGeneration) throw new BridgeError(409, 'SESSION_CHANGED', 'Сессия была завершена во время сохранения.');
          remembered = remember; acceptConnection(connection); send(200, status());
        } catch (error) {
          if (fromStorage && generation === sessionGeneration && error instanceof BridgeError && error.code === 'AUTH_EXPIRED') { forgetSession(); await clearSavedConnection().catch(() => {}); }
          if (error instanceof BridgeError) throw error;
          throw new BridgeError(500, 'LOCAL_FAILURE', 'Не удалось сохранить или прочитать защищённое подключение. Введите PAT заново или снимите «Запомнить на этом компьютере».');
        } finally { authenticating = false; }
        return;
      }
      if (!url.pathname.startsWith('/api/')) throw new BridgeError(404, 'NOT_FOUND', 'Маршрут не найден.');
      if (!origins.has(origin)) throw new BridgeError(403, 'ORIGIN_DENIED', 'Источник DocBuilder отсутствует в списке разрешённых.');
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Access-Control-Request-Private-Network');
      if (req.method === 'OPTIONS') {
        if (!['GET', 'POST'].includes(req.headers['access-control-request-method'])) throw new BridgeError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается.');
        const headers = String(req.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
        if (headers.some(value => !['content-type', 'x-docbuilder-request', 'x-docbuilder-confluence-origin', 'x-docbuilder-jira-origin', 'x-docbuilder-jira-project'].includes(value))) throw new BridgeError(403, 'CSRF_DENIED', 'Заголовок не разрешён.');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-DocBuilder-Request, X-DocBuilder-Confluence-Origin, X-DocBuilder-Jira-Origin, X-DocBuilder-Jira-Project');
        if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true');
        res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end(); return;
      }
      if (req.headers['x-docbuilder-request'] !== '1') throw new BridgeError(403, 'CSRF_DENIED', 'Нужен заголовок запроса DocBuilder.');
      if (url.pathname === '/api/status' && req.method === 'GET') { send(200, status()); return; }
      if (url.pathname.startsWith('/api/jira/')) { send(200, await jira.handle(url.pathname, req.method, url.searchParams, req.method === 'POST' ? await readJsonBody(req) : null, req.headers['x-docbuilder-jira-origin'], req.headers['x-docbuilder-jira-project'])); return; }
      const connection = requiredConnection(req.headers['x-docbuilder-confluence-origin']);
      if (url.pathname === '/api/operation' && req.method === 'GET') {
        const id = text(url.searchParams.get('id'), 128, 'id'); const operation = operations.get(id);
        if (!operation) throw new BridgeError(404, 'NOT_FOUND', 'Операция не найдена. После перезапуска проверяйте результат в Confluence.');
        assertOperationOrigin(operation, connection);
        if (operation.state === 'success' && operation.page?.id) await readPage(operation.page.id, connection);
        if (operation.state === 'unknown' && operation.page?.id) await reconcileOperation(operation, operation.page.id, connection);
        assertConnection(connection);
        send(200, { state: operation.state, ...(operation.page ? { page: operation.page } : {}), ...(operation.message ? { message: operation.message } : {}) }); return;
      }
      if (url.pathname === '/api/operation/confirm' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const operationId = text(body.operationId, 128, 'operationId');
        const operation = operations.get(operationId);
        if (!operation) {
          if (!body.publication) throw new BridgeError(404, 'NOT_FOUND', 'Операция не найдена. После перезапуска проверяйте результат в Confluence.');
          const intent = publicationIntent(body.publication, connection);
          if (intent.id !== operationId) throw invalid('Снимок относится к другой операции.');
          const recovered = { state: 'unknown', baseUrl: connection.baseUrl, expected: intent.expected };
          send(200, await reconcileOperation(recovered, pageId(body.pageId), connection, true)); return;
        }
        send(200, await reconcileOperation(operation, pageId(body.pageId), connection, true)); return;
      }
      if (url.pathname === '/api/spaces' && req.method === 'GET') {
        const start = integer(url.searchParams.get('start'), 0, 0, Number.MAX_SAFE_INTEGER); const limit = integer(url.searchParams.get('limit'), 50, 1, 100);
        const path = `/rest/api/space?start=${start}&limit=${limit}&expand=metadata.labels`;
        send(200, collection(await upstream(path, { connection }), path, start, value => {
          if (!isRecord(value) || typeof value.key !== 'string' || typeof value.name !== 'string') throw new BridgeError(502, 'UPSTREAM_INVALID', 'Confluence вернул некорректное пространство.');
          const labels = value.metadata?.labels;
          const entries = Array.isArray(labels) ? labels : Array.isArray(labels?.results) ? labels.results : [];
          const categories = [...new Set(entries.map(label => typeof label === 'string' ? label : label?.name).filter(name => typeof name === 'string' && name.length > 0 && name.length <= 255))].slice(0, 100);
          return { key: value.key, name: value.name.slice(0, 500), ...(value.type === 'global' || value.type === 'personal' ? { type: value.type } : {}), ...(labels !== undefined ? { categories } : {}) };
        }, connection)); return;
      }
      if (url.pathname === '/api/tree' && req.method === 'GET') {
        const key = spaceKey(url.searchParams.get('spaceKey')); const parent = url.searchParams.get('parentId');
        const start = integer(url.searchParams.get('start'), 0, 0, Number.MAX_SAFE_INTEGER); const limit = integer(url.searchParams.get('limit'), 50, 1, 100);
        if (parent !== null && (await readPage(pageId(parent), connection)).spaceKey !== key) throw invalid('Родитель находится в другом пространстве.');
        const path = parent === null ? `/rest/api/space/${encodeURIComponent(key)}/content/page?depth=root&expand=ancestors&start=${start}&limit=${limit}` : `/rest/api/content/${parent}/child/page?expand=ancestors&start=${start}&limit=${limit}`;
        send(200, collection(await upstream(path, { connection }), path, start, value => { if (parent === null && (!isRecord(value) || !Array.isArray(value.ancestors) || value.ancestors.length !== 0)) throw new BridgeError(502, 'UPSTREAM_INVALID', 'Confluence не подтвердил корневые страницы пространства.'); return summary(value, parent); }, connection)); return;
      }
      if (url.pathname === '/api/page' && req.method === 'GET') { send(200, await readPage(pageId(url.searchParams.get('id')), connection, true)); return; }
      if (url.pathname === '/api/prepare' && req.method === 'POST') { send(200, await prepare(await readJsonBody(req), connection)); return; }
      if (url.pathname === '/api/publish' && req.method === 'POST') { send(200, await publish(await readJsonBody(req), connection)); return; }
      throw new BridgeError(404, 'NOT_FOUND', 'Маршрут не найден.');
    } catch (error) {
      const failure = error instanceof BridgeError || error instanceof JiraError ? error : new BridgeError(500, 'LOCAL_FAILURE', 'Локальный сервис не завершил запрос.');
      if (!res.writableEnded) send(failure.status, { code: failure.code, message: failure.message, ...failure.details });
    }
  });
  server.requestTimeout = 30_000; server.headersTimeout = 10_000; server.maxHeadersCount = 32;
  server.on('close', () => { forgetSession(); jira.close(); operations.clear(); operationByDocument.clear(); });
  return { server, restoreConnection: async () => { await restoreConnection(); await jira.restore(); }, close: () => new Promise((resolve, reject) => { forgetSession(); jira.close(); server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); }) };
}

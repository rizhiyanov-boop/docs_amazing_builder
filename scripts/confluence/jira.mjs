import { createHash } from 'node:crypto';

const TTL = 30 * 24 * 60 * 60 * 1000;
const keyPattern = /^[A-Z][A-Z0-9_]{0,63}$/;
const issuePattern = /^[A-Z][A-Z0-9_]{0,63}-[1-9]\d{0,19}$/;
const storyNames = new Set(['story', 'user story', 'userstory', 'user-story', 'история', 'пользовательская история', 'юзерстори', 'юзер стори']);
const taskNames = new Set(['task', 'задача']);
const labelNames = new Set(['regulatory', 'business', 'cbs', 'improvement', 'qaa', 'prd', 'tst', 'platform', 'hotfix', 'technical_debt', 'hold', 'automation', 'playwright', 'bss_corp']);
export class JiraError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = message => new JiraError(400, 'INVALID_REQUEST', message);
function text(value, max = 255) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw fail('Некорректные данные Jira.');
  return value.trim();
}
export function parseJiraLink(value) {
  let url;
  try { url = new URL(text(value, 2048)); } catch { throw fail('Укажите HTTPS ссылку на проект или задачу Jira.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw fail('Нужна HTTPS ссылка без учётных данных.');
  const issue = url.pathname.match(/^\/browse\/([A-Z][A-Z0-9_]*-[1-9]\d*)\/?$/)?.[1]
    ?? (url.searchParams.get('selectedIssue') || undefined)
    ?? (url.pathname === '/secure/ViewIssue.jspa' ? url.searchParams.get('id') : undefined);
  const project = url.pathname.match(/^\/(?:projects|browse)\/([A-Z][A-Z0-9_]*)(?:\/.*)?$/)?.[1]
    ?? (['/secure/RapidBoard.jspa', '/secure/project/ViewProject.jspa'].includes(url.pathname) ? url.searchParams.get('projectKey') : undefined);
  if (issue && (issuePattern.test(issue) || /^[1-9]\d{0,19}$/.test(issue))) return { baseUrl: url.origin, issue };
  if (project && keyPattern.test(project)) return { baseUrl: url.origin, project };
  throw fail('В ссылке не найден проект или ключ задачи Jira.');
}
const projectLink = (baseUrl, key) => `${baseUrl}/projects/${key}`;
function normalizeProject(value, baseUrl) {
  const id = text(value?.id, 20); const key = text(value?.key, 64);
  if (!/^\d+$/.test(id) || !keyPattern.test(key) || !Array.isArray(value.issueTypes)) throw new JiraError(502, 'UPSTREAM_INVALID', 'Jira не вернула данные проекта.');
  const issueTypes = value.issueTypes.filter(type => type && typeof type.id === 'string' && /^\d+$/.test(type.id) && typeof type.name === 'string').map(type => ({ id: type.id, name: type.name.slice(0, 255), subtask: type.subtask === true }));
  return { id, key, name: text(value.name), url: projectLink(baseUrl, key), issueTypes };
}

/** PATs and the operation journal stay inside this local process / encrypted Windows store. */
export function createJira({ store = null, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 15_000 } = {}) {
  let saved = null; let session = null; let generation = 0; let busy = false; let message = '';
  const status = () => {
    if (session && session.expiresAt <= now()) { session = null; generation++; }
    return { connected: Boolean(session), remembered: Boolean(saved), available: Boolean(store), baseUrl: session?.baseUrl ?? saved?.baseUrl ?? '', project: session?.project ?? saved?.project ?? null, expiresAt: session ? new Date(session.expiresAt).toISOString() : null, message };
  };
  function required(expected, expectedProject) {
    status();
    if (!session) throw new JiraError(401, 'NOT_CONNECTED', 'Подключите Jira в локальной форме.');
    if (expected !== session.baseUrl || expectedProject !== session.project.id) throw new JiraError(409, 'SESSION_CHANGED', 'Подключение или проект Jira изменились. Обновите экран.');
    return session;
  }
  async function api(connection, path, { method = 'GET', body } = {}) {
    const currentGeneration = generation;
    const target = new URL(path, connection.baseUrl);
    if (!path.startsWith('/rest/api/2/') || target.origin !== connection.baseUrl) throw fail('Недопустимый адрес API Jira.');
    let response;
    try {
      response = await fetchImpl(target.href, { method, headers: { Authorization: `Bearer ${connection.token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    } catch { throw new JiraError(502, method === 'POST' ? 'OUTCOME_UNKNOWN' : 'UPSTREAM_UNAVAILABLE', method === 'POST' ? 'Jira могла сохранить задачу. Повторное создание заблокировано; проверьте результат.' : 'Jira недоступна. Проверьте сеть.'); }
    if (currentGeneration !== generation) { await response.body?.cancel(); throw new JiraError(409, 'SESSION_CHANGED', 'Подключение Jira изменилось.'); }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401) {
        if (session === connection) session = null;
        // Retain the operation journal: an expired PAT must not enable duplicate writes.
        throw new JiraError(401, 'AUTH_EXPIRED', 'PAT Jira истёк или отклонён. Введите новый PAT в локальной форме.');
      }
      if (response.status === 403) throw new JiraError(403, 'ACCESS_DENIED', 'Недостаточно прав в Jira.');
      if (response.status === 404) throw new JiraError(404, 'NOT_FOUND', 'Проект, задача или REST метод Jira недоступны.');
      if (response.status >= 300 && response.status < 400) throw new JiraError(502, 'REDIRECT_DENIED', 'Jira перенаправляет запрос. Проверьте адрес и PAT.');
      if (response.status === 400) throw new JiraError(400, 'JIRA_VALIDATION', 'Jira отклонила поля. Проверьте настройки выбранного типа задачи, эпика и обязательных полей.');
      throw new JiraError(502, method === 'POST' ? 'OUTCOME_UNKNOWN' : 'UPSTREAM_UNAVAILABLE', 'Jira не подтвердила результат запроса.');
    }
    if (response.status === 204) return {};
    try {
      const reader = response.body.getReader(); const chunks = []; let size = 0;
      for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 2_000_000) { await reader.cancel(); throw Error(); } chunks.push(value); }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!result || typeof result !== 'object') throw Error();
      if (currentGeneration !== generation) throw new JiraError(409, 'SESSION_CHANGED', 'Подключение Jira изменилось.');
      if (session === connection) session.expiresAt = now() + TTL;
      return result;
    } catch (error) { if (error instanceof JiraError) throw error; throw new JiraError(502, method === 'POST' ? 'OUTCOME_UNKNOWN' : 'UPSTREAM_INVALID', 'Jira вернула неполный ответ.'); }
  }
  async function persist(connection) {
    if (!store || !saved) throw new JiraError(409, 'PERSISTENCE_REQUIRED', 'Для создания задач включите «Запомнить на этом компьютере»: журнал защищает от повторного создания после перезапуска.');
    try { await store.save({ baseUrl: connection.baseUrl, token: connection.token, project: connection.project, operations: connection.operations }); }
    catch { throw new JiraError(500, 'LOCAL_FAILURE', 'Не удалось сохранить локальный журнал Jira.'); }
    saved = { baseUrl: connection.baseUrl, token: connection.token, project: connection.project, operations: connection.operations };
  }
  async function connect(body) {
    if (busy) throw new JiraError(409, 'OPERATION_PENDING', 'Дождитесь текущей операции Jira.');
    const selected = parseJiraLink(body.link);
    if (saved?.baseUrl !== selected.baseUrl && saved?.operations?.length) throw fail('На этом компьютере сохранён журнал другого Jira. Сначала завершите операции; «Забыть подключение» удаляет журнал и привязки.');
    if (typeof body.remember !== 'boolean') throw fail('Некорректный признак сохранения.');
    let token = body.token === '' && saved?.baseUrl === selected.baseUrl ? saved.token : text(body.token, 4096);
    if (/\s/.test(token)) throw fail('Некорректный PAT Jira.');
    if (body.remember && !store) throw new JiraError(500, 'LOCAL_FAILURE', 'Защищённое сохранение доступно только в Windows.');
    busy = true; const currentGeneration = generation;
    try {
      const connection = { baseUrl: selected.baseUrl, token, expiresAt: now() + TTL, operations: saved?.baseUrl === selected.baseUrl ? saved.operations ?? [] : [] };
      const user = await api(connection, '/rest/api/2/myself'); text(user.name);
      const projectId = selected.issue ? (await api(connection, `/rest/api/2/issue/${selected.issue}?fields=project`)).fields?.project?.id : selected.project;
      if (typeof projectId !== 'string' || !/^[A-Za-z0-9_]+$/.test(projectId)) throw new JiraError(502, 'UPSTREAM_INVALID', 'Jira не определила проект задачи.');
      connection.project = normalizeProject(await api(connection, `/rest/api/2/project/${projectId}`), connection.baseUrl);
      if (currentGeneration !== generation) throw new JiraError(409, 'SESSION_CHANGED', 'Подключение изменилось.');
      if (body.remember) { await store.save(connection); saved = connection; }
      else {
        if (saved?.operations?.length) throw fail('Сначала завершите сохранённые операции Jira. Для смены подключения используйте «Забыть подключение».');
        await store?.clear(); saved = null;
      }
      session = connection; message = ''; return status();
    } finally { busy = false; }
  }
  async function restore() {
    try { saved = await store?.load() ?? null; if (!saved?.project) return; const connection = { ...saved, operations: saved.operations ?? [], expiresAt: now() + TTL }; text((await api(connection, '/rest/api/2/myself')).name); session = connection; }
    catch { message = 'Не удалось восстановить Jira. Проверьте сеть или введите новый PAT.'; }
  }
  async function metadata(connection, issueKind = 'story') {
    if (!['story', 'task'].includes(issueKind)) throw fail('Выберите тип Задача или User Story.');
    const project = normalizeProject(await api(connection, `/rest/api/2/project/${connection.project.id}`), connection.baseUrl);
    const names = issueKind === 'task' ? taskNames : storyNames;
    const story = project.issueTypes.find(type => !type.subtask && names.has(type.name.trim().toLowerCase()));
    if (!story) return { project, issueKind, story: null, epicField: null, requiredFields: [], priorities: [], labelsSupported: false, message: `В этом проекте нет типа ${issueKind === 'task' ? 'Задача' : 'User Story'}. Добавьте его в Jira или выберите другой проект.` };
    const allFields = await api(connection, '/rest/api/2/field');
    const epicField = Array.isArray(allFields) ? allFields.find(field => field.schema?.custom === 'com.pyxis.greenhopper.jira:gh-epic-link')?.id : null;
    if (!/^customfield_\d+$/.test(epicField ?? '')) throw new JiraError(409, 'EPIC_FIELD_MISSING', 'Jira не предоставила поле Epic Link.');
    const meta = await api(connection, `/rest/api/2/issue/createmeta/${project.id}/issuetypes/${story.id}?startAt=0&maxResults=1000`);
    if (!Array.isArray(meta.values) || meta.values.length < (meta.total ?? meta.values.length)) throw new JiraError(502, 'UPSTREAM_INVALID', 'Jira не вернула все поля создания задачи.');
    const fields = meta.values;
    if (!fields.some(field => (field.fieldId ?? field.key) === epicField)) throw new JiraError(409, 'EPIC_FIELD_MISSING', 'Epic Link недоступен для создания выбранного типа задачи.');
    const labelsField = fields.find(field => (field.fieldId ?? field.key) === 'labels');
    const priorityField = fields.find(field => (field.fieldId ?? field.key) === 'priority');
    const priorityValues = priorityField ? (Array.isArray(priorityField.allowedValues) && priorityField.allowedValues.length ? priorityField.allowedValues : await api(connection, '/rest/api/2/priority')) : [];
    if (!Array.isArray(priorityValues)) throw new JiraError(502, 'UPSTREAM_INVALID', 'Jira не вернула приоритеты.');
    const priorities = priorityValues.map(priority => ({ id: text(priority.id, 20), name: text(priority.name) }));
    const requiredFields = fields.filter(field => field.required && !field.hasDefaultValue && !['project', 'issuetype', 'summary', 'description', 'reporter', 'labels', ...(priorities.length ? ['priority'] : []), epicField].includes(field.fieldId ?? field.key)).map(field => text(field.name));
    const reporterRequired = fields.some(field => (field.fieldId ?? field.key) === 'reporter' && field.required && !field.hasDefaultValue);
    return { project, issueKind, story, epicField, requiredFields, reporterRequired, priorities, labelsSupported: Boolean(labelsField), labelsRequired: Boolean(labelsField?.required && !labelsField.hasDefaultValue), priorityRequired: Boolean(priorityField?.required && !priorityField.hasDefaultValue), defaultPriorityId: priorityField?.defaultValue?.id ?? '', message: requiredFields.length ? `В Jira настроены дополнительные обязательные поля: ${requiredFields.join(', ')}.` : '' };
  }
  function operationId(connection, methodId) { return createHash('sha256').update(`${connection.project.id}:${text(methodId, 128)}`).digest('hex'); }
  function operation(connection, methodId) { return connection.operations.find(item => item.id === operationId(connection, methodId)) ?? null; }
  function publicOperation(item) { return item ? { state: item.state, issue: item.issue ?? null, linkedUrl: item.linkedUrl ?? null, message: item.message ?? '' } : { state: 'none', issue: null, linkedUrl: null }; }
  async function link(connection, item, value) {
    if (!item.issue) throw fail('Сначала подтвердите созданную задачу.');
    let url; try { url = new URL(value); } catch { throw fail('Некорректная ссылка Confluence.'); }
    if (url.protocol !== 'https:' || url.username || url.password || value.length > 2048) throw fail('Некорректная ссылка Confluence.');
    url.hash = '';
    await api(connection, `/rest/api/2/issue/${item.issue.key}/remotelink`, { method: 'POST', body: { globalId: `docbuilder-confluence:${url.href}`, object: { url: url.href, title: 'Документация Confluence' } } });
    item.linkedUrl = url.href; item.message = ''; await persist(connection);
  }
  async function create(connection, body) {
    const id = operationId(connection, body.methodId); let item = operation(connection, body.methodId);
    if (item) {
      if (item.state !== 'success') throw new JiraError(409, 'OUTCOME_UNKNOWN', 'Результат предыдущего создания не подтверждён. Укажите ссылку на созданную задачу.');
      return publicOperation(item);
    }
    const summary = text(body.summary); const description = text(body.description, 100_000); const epic = text(body.epic);
    if (!issuePattern.test(epic)) throw fail('Некорректный ключ эпика.');
    const config = await metadata(connection, body.issueKind ?? 'story');
    if (!config.story || config.requiredFields.length) throw new JiraError(409, 'PROJECT_NOT_READY', config.message);
    const labels = body.labels ?? [];
    if (!Array.isArray(labels) || labels.length > labelNames.size || labels.some(label => !labelNames.has(label)) || new Set(labels).size !== labels.length) throw fail('Некорректные теги Jira.');
    if (labels.length && !config.labelsSupported || config.labelsRequired && !labels.length) throw fail('Проверьте теги, разрешённые для этого типа задачи.');
    const priority = body.priorityId === undefined || body.priorityId === '' ? null : config.priorities.find(value => value.id === body.priorityId);
    if (body.priorityId && !priority || config.priorityRequired && !priority) throw fail('Выберите доступный приоритет Jira.');
    const reporter = config.reporterRequired ? { name: text((await api(connection, '/rest/api/2/myself')).name) } : undefined;
    const epicValue = await api(connection, `/rest/api/2/issue/${epic}?fields=issuetype,summary,project`);
    if (epicValue.fields?.issuetype?.name?.toLowerCase() !== 'epic' && epicValue.fields?.issuetype?.name?.toLowerCase() !== 'эпик') throw fail('Выбранная задача не является эпиком.');
    if (epicValue.fields?.project?.id !== connection.project.id) throw fail('Эпик должен принадлежать выбранному проекту Jira.');
    if (connection.operations.length >= 256) throw new JiraError(409, 'JOURNAL_FULL', 'Локальный журнал Jira заполнен.');
    item = { id, projectId: connection.project.id, storyId: config.story.id, summary, epic, epicField: config.epicField, state: 'unknown' };
    connection.operations.push(item);
    try { await persist(connection); } catch (error) { connection.operations.pop(); throw error; }
    try {
      const result = await api(connection, '/rest/api/2/issue', { method: 'POST', body: { fields: { project: { id: connection.project.id }, issuetype: { id: config.story.id }, summary, description, ...(reporter ? { reporter } : {}), ...(labels.length ? { labels } : {}), ...(priority ? { priority: { id: priority.id } } : {}), [config.epicField]: epic } } });
      if (!issuePattern.test(result.key ?? '') || !result.key.startsWith(`${config.project.key}-`) || !/^\d+$/.test(result.id ?? '')) throw new JiraError(502, 'OUTCOME_UNKNOWN', 'Jira не вернула ключ задачи выбранного проекта.');
      item.issue = { id: result.id, key: result.key, url: `${connection.baseUrl}/browse/${result.key}` }; item.state = 'success';
      await persist(connection);
    } catch (error) {
      if (error instanceof JiraError && ['JIRA_VALIDATION', 'ACCESS_DENIED', 'AUTH_EXPIRED', 'NOT_FOUND', 'REDIRECT_DENIED'].includes(error.code)) { connection.operations.splice(connection.operations.indexOf(item), 1); await persist(connection); }
      throw error;
    }
    if (body.confluenceUrl) { try { await link(connection, item, body.confluenceUrl); } catch { item.message = 'Задача создана. Ссылка Confluence не подтверждена; повторите только добавление ссылки.'; } }
    return publicOperation(item);
  }
  async function handle(path, method, query, body, expected, expectedProject) {
    if (path === '/api/jira/status' && method === 'GET') return status();
    const connection = required(expected, expectedProject);
    if (method === 'GET' && path === '/api/jira/operation') return publicOperation(operation(connection, query.get('methodId')));
    if (busy) throw new JiraError(409, 'OPERATION_PENDING', 'Дождитесь текущей операции Jira.');
    busy = true;
    try {
      if (method === 'GET' && path === '/api/jira/metadata') return await metadata(connection, query.get('issueKind') ?? 'story');
      if (method === 'GET' && path === '/api/jira/epics') {
        const search = query.get('q') ?? ''; if (search.length > 255) throw fail('Слишком длинный поиск.');
        const start = Number(query.get('start') ?? 0); if (!Number.isSafeInteger(start) || start < 0) throw fail('Некорректная пагинация.');
        const escaped = search.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
        const jql = `project = ${connection.project.id} AND issuetype = Epic${search ? ` AND (summary ~ "${escaped}"${issuePattern.test(search) ? ` OR key = "${search}"` : ''})` : ''} ORDER BY updated DESC`;
        const result = await api(connection, `/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=summary&startAt=${start}&maxResults=50`);
        if (!Array.isArray(result.issues) || !Number.isSafeInteger(result.total)) throw new JiraError(502, 'UPSTREAM_INVALID', 'Jira не вернула список эпиков.');
        return { items: result.issues.map(issue => ({ key: text(issue.key), name: text(issue.fields?.summary) })), nextStart: start + result.issues.length < result.total ? start + result.issues.length : null };
      }
      if (method === 'POST' && path === '/api/jira/create') return await create(connection, body);
      const item = operation(connection, body?.methodId);
      if (!item) throw new JiraError(404, 'NOT_FOUND', 'Операция Jira не найдена.');
      if (method === 'POST' && path === '/api/jira/link') { await link(connection, item, body.confluenceUrl); return publicOperation(item); }
      if (method === 'POST' && path === '/api/jira/confirm') {
        const selected = parseJiraLink(body.link);
        if (selected.baseUrl !== connection.baseUrl || !selected.issue || item.state !== 'unknown') throw fail('Укажите задачу текущей операции Jira.');
        const result = await api(connection, `/rest/api/2/issue/${selected.issue}?fields=project,issuetype,summary,${item.epicField}`);
        if (result.fields?.project?.id !== item.projectId || result.fields?.issuetype?.id !== item.storyId || result.fields?.summary !== item.summary || result.fields?.[item.epicField] !== item.epic) throw fail('Проект, тип, тема или эпик задачи не совпадают с операцией.');
        if (!issuePattern.test(result.key ?? selected.issue)) throw new JiraError(502, 'UPSTREAM_INVALID', 'Jira не вернула ключ задачи.');
        const key = result.key ?? selected.issue;
        item.issue = { id: text(result.id), key, url: `${connection.baseUrl}/browse/${key}` }; item.state = 'success'; await persist(connection); return publicOperation(item);
      }
      throw new JiraError(404, 'NOT_FOUND', 'Маршрут Jira не найден.');
    } finally { busy = false; }
  }
  return { status, connect, restore, handle,
    forget: async () => { if (busy) throw new JiraError(409, 'OPERATION_PENDING', 'Дождитесь операции Jira.'); await store?.clear(); saved = session = null; generation++; return status(); },
    close: () => { session = saved = null; generation++; }
  };
}

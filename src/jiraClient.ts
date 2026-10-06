import { CONFLUENCE_BRIDGE_URL } from './confluenceClient';

export type JiraProject = { id: string; key: string; name: string; url: string; issueTypes: { id: string; name: string }[] };
export type JiraStatus = { connected: boolean; remembered: boolean; baseUrl: string; project: JiraProject | null; expiresAt: string | null };
export type JiraMetadata = { project: JiraProject; story: { id: string; name: string } | null; epicField: string | null; requiredFields: string[]; message: string };
export type JiraOperation = { state: 'none' | 'unknown' | 'success'; issue: { id: string; key: string; url: string } | null; linkedUrl: string | null; message?: string };
export type JiraEpics = { items: { key: string; name: string }[]; nextStart: number | null };
export class JiraClientError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
export type JiraScope = { baseUrl: string; projectId: string };
async function request<T>(path: string, scope?: JiraScope, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${CONFLUENCE_BRIDGE_URL}/api/jira/${path}`, { method: body ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store', headers: { 'X-DocBuilder-Request': '1', ...(scope ? { 'X-DocBuilder-Jira-Origin': scope.baseUrl, 'X-DocBuilder-Jira-Project': scope.projectId } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(body ? 90_000 : 45_000) });
  } catch { throw new JiraClientError(body ? 'OUTCOME_UNKNOWN' : 'LOCAL_UNAVAILABLE', body ? 'Ответ локального сервиса не получен. Проверьте состояние операции перед повторным созданием.' : 'Локальный сервис недоступен. Запустите обновлённое приложение подключения.'); }
  let result;
  try { result = await response.json(); }
  catch { throw new JiraClientError(body ? 'OUTCOME_UNKNOWN' : 'LOCAL_FAILURE', 'Локальный сервис вернул неполный ответ. Проверьте состояние операции.'); }
  if (!response.ok) throw new JiraClientError(result.code ?? 'LOCAL_FAILURE', result.message ?? 'Не удалось выполнить операцию Jira.');
  return result as T;
}
export const jiraClient = {
  status: () => request<JiraStatus>('status'),
  metadata: (scope: JiraScope) => request<JiraMetadata>('metadata', scope),
  epics: (scope: JiraScope, q = '', start = 0) => request<JiraEpics>(`epics?q=${encodeURIComponent(q)}&start=${start}`, scope),
  operation: (scope: JiraScope, methodId: string) => request<JiraOperation>(`operation?methodId=${encodeURIComponent(methodId)}`, scope),
  create: (scope: JiraScope, body: { methodId: string; summary: string; description: string; epic: string; confluenceUrl?: string }) => request<JiraOperation>('create', scope, body),
  link: (scope: JiraScope, methodId: string, confluenceUrl: string) => request<JiraOperation>('link', scope, { methodId, confluenceUrl }),
  confirm: (scope: JiraScope, methodId: string, link: string) => request<JiraOperation>('confirm', scope, { methodId, link })
};
export type JiraClient = typeof jiraClient;

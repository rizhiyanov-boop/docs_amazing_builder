import type {
  ConfluenceCollection, ConfluenceDiagram, ConfluenceOperation, ConfluencePage,
  ConfluencePageSummary, ConfluencePublishRequest, ConfluenceSpace, ConfluenceStatus
} from './confluenceTypes';

export const CONFLUENCE_BRIDGE_URL = 'http://127.0.0.1:18771';

export class ConfluenceClientError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly operationId?: string;
  constructor(code: string, message: string, status?: number, operationId?: string) {
    super(message);
    this.name = 'ConfluenceClientError';
    this.code = code;
    this.status = status;
    this.operationId = operationId;
  }
}

export interface ConfluenceClient {
  getStatus(): Promise<ConfluenceStatus>;
  getSpaces(start: number, baseUrl: string): Promise<ConfluenceCollection<ConfluenceSpace>>;
  getTree(spaceKey: string, parentId: string | undefined, start: number, baseUrl: string): Promise<ConfluenceCollection<ConfluencePageSummary>>;
  getPage(id: string, baseUrl: string): Promise<ConfluencePage>;
  prepare(wiki: string, diagrams: ConfluenceDiagram[], baseUrl: string): Promise<{ storage: string }>;
  publish(request: ConfluencePublishRequest): Promise<ConfluencePage>;
  getOperation(id: string, baseUrl: string): Promise<ConfluenceOperation>;
  confirmOperation(operationId: string, pageId: string, baseUrl: string): Promise<ConfluencePage>;
}

export function confluenceOrigin(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new ConfluenceClientError('INVALID_ORIGIN', 'Укажите HTTPS-адрес Confluence в локальном подключении.'); }
}

async function request<T>(path: string, body?: unknown, isWrite = false, baseUrl?: string): Promise<T> {
  const origin = baseUrl === undefined ? undefined : confluenceOrigin(baseUrl);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), isWrite ? 90_000 : 45_000);
  try {
    const response = await fetch(`${CONFLUENCE_BRIDGE_URL}/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'omit', cache: 'no-store', signal: controller.signal,
      headers: { 'X-DocBuilder-Request': '1', ...(origin ? { 'X-DocBuilder-Confluence-Origin': origin } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new ConfluenceClientError(isWrite ? 'OUTCOME_UNKNOWN' : 'INVALID_RESPONSE', 'Не удалось подтвердить ответ локального приложения.'); }
    if (!response.ok) {
      const error = payload as { code?: unknown; message?: unknown; operationId?: unknown };
      throw new ConfluenceClientError(
        typeof error?.code === 'string' ? error.code : isWrite ? 'OUTCOME_UNKNOWN' : 'REQUEST_FAILED',
        typeof error?.message === 'string' ? error.message : 'Не удалось выполнить запрос к Confluence.',
        response.status,
        typeof error?.operationId === 'string' ? error.operationId : undefined
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ConfluenceClientError) throw error;
    throw new ConfluenceClientError(
      isWrite ? 'OUTCOME_UNKNOWN' : 'LOCAL_UNAVAILABLE',
      isWrite ? 'Ответ после публикации не получен. Сначала проверьте результат операции.' : 'Локальное приложение недоступно или браузер не разрешил соединение. Запустите приложение и проверьте подключение.'
    );
  } finally { window.clearTimeout(timeout); }
}

export const confluenceClient: ConfluenceClient = {
  getStatus: () => request('status'),
  getSpaces: (start, baseUrl) => request(`spaces?${new URLSearchParams({ start: String(start), limit: '100' })}`, undefined, false, baseUrl),
  getTree: (spaceKey, parentId, start, baseUrl) => request(`tree?${new URLSearchParams({ spaceKey, start: String(start), limit: '25', ...(parentId ? { parentId } : {}) })}`, undefined, false, baseUrl),
  getPage: (id, baseUrl) => request(`page?${new URLSearchParams({ id })}`, undefined, false, baseUrl),
  prepare: async (wiki, diagrams, baseUrl) => request('prepare', { wiki, diagrams, baseUrl: confluenceOrigin(baseUrl) }, false, baseUrl),
  publish: value => request('publish', value, true, value.baseUrl),
  getOperation: (id, baseUrl) => request(`operation?${new URLSearchParams({ id })}`, undefined, false, baseUrl),
  confirmOperation: (operationId, pageId, baseUrl) => request('operation/confirm', { operationId, pageId }, false, baseUrl)
};

export function confluencePageIdFromLink(value: string, baseUrl: string): string {
  try {
    const url = new URL(value.trim());
    if (url.origin !== confluenceOrigin(baseUrl) || url.username || url.password) throw new Error();
    const id = url.pathname.match(/^\/spaces\/[^/]+\/pages\/(\d+)(?:\/|$)/)?.[1]
      ?? (url.pathname === '/pages/viewpage.action' ? url.searchParams.get('pageId') : null);
    if (!id || !/^\d+$/.test(id)) throw new Error();
    return id;
  } catch { throw new ConfluenceClientError('INVALID_LINK', 'Вставьте ссылку на страницу вашего Confluence с идентификатором страницы.'); }
}

export function confluencePageUrl(id: string, baseUrl: string): string {
  const origin = confluenceOrigin(baseUrl);
  if (!/^\d+$/.test(id)) return origin;
  return `${origin}/pages/viewpage.action?pageId=${id}`;
}

/** Parse XML in a detached document; never mount upstream HTML or fetch its assets. */
export function confluenceContentText(storage: string): string {
  const document = new DOMParser().parseFromString(`<root xmlns:ac="http://atlassian.com/content" xmlns:ri="http://atlassian.com/resource">${storage}</root>`, 'application/xml');
  if (document.querySelector('parsererror')) return 'Не удалось отобразить текст страницы. Откройте её в Confluence.';
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) return node.textContent ?? '';
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return '';
    const name = (node as Element).localName ?? '';
    if (['script', 'style', 'iframe', 'object', 'embed', 'link', 'img', 'image'].includes(name)) return '';
    if (name === 'br') return '\n';
    const text = Array.from(node.childNodes).map(walk).join('');
    return /^(p|div|h[1-6]|tr|li|plain-text-body)$/.test(name) ? `${text}\n\n` : /^(td|th)$/.test(name) ? `${text}\t` : text;
  };
  return walk(document.documentElement).trim() || 'Страница не содержит доступного для просмотра текста.';
}

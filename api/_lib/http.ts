type VercelRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
};

declare const process: {
  env: Record<string, string | undefined>;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
};

const SESSION_COOKIE_NAME = 'doc_builder_session';
const OAUTH_STATE_COOKIE_NAME = 'doc_builder_oauth_state';

function getHeaderValue(headers: VercelRequest['headers'], name: string): string {
  if (!headers) return '';
  const direct = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  if (Array.isArray(direct)) return direct.join('; ');
  return direct ?? '';
}

export function readCookies(req: VercelRequest): Record<string, string> {
  const cookieHeader = getHeaderValue(req.headers, 'cookie');
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, pair) => {
    const index = pair.indexOf('=');
    if (index <= 0) return acc;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function getProto(req: VercelRequest): string {
  const fromHeader = getHeaderValue(req.headers, 'x-forwarded-proto');
  if (fromHeader) return fromHeader.split(',')[0].trim();
  return 'http';
}

function getHost(req: VercelRequest): string {
  const fromHeader = getHeaderValue(req.headers, 'x-forwarded-host') || getHeaderValue(req.headers, 'host');
  return fromHeader || 'localhost:5173';
}

export function buildAppBaseUrl(req: VercelRequest): string {
  return `${getProto(req)}://${getHost(req)}`;
}

function appendSetCookie(res: VercelResponse, cookieValue: string): void {
  const bag = res as unknown as { __cookies?: string[] };
  const next = [...(bag.__cookies ?? []), cookieValue];
  bag.__cookies = next;
  res.setHeader('Set-Cookie', next);
}

export function setSessionCookie(res: VercelResponse, token: string, expiresAt: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  appendSetCookie(
    res,
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure}`
  );
}

export function clearSessionCookie(res: VercelResponse): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  appendSetCookie(res, `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export function getSessionToken(req: VercelRequest): string | undefined {
  const cookies = readCookies(req);
  return cookies[SESSION_COOKIE_NAME];
}

export function setOauthStateCookie(res: VercelResponse, state: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  appendSetCookie(res, `${OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
}

export function getOauthState(req: VercelRequest): string | undefined {
  return readCookies(req)[OAUTH_STATE_COOKIE_NAME];
}

export function clearOauthStateCookie(res: VercelResponse): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  appendSetCookie(res, `${OAUTH_STATE_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export function redirect(res: VercelResponse, location: string): void {
  res.setHeader('Location', location);
  res.status(302).json({ ok: true, redirect: location });
}

export function readQueryString(req: VercelRequest, key: string): string | undefined {
  const value = req.query?.[key];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

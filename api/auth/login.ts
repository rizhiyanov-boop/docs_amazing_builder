import { createSession, verifyUser } from '../_lib/db.js';
import { setSessionCookie } from '../_lib/http.js';

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
};

type LoginBody = {
  login?: string;
  password?: string;
};

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10;
const loginAttemptsByIp = new Map<string, { count: number; firstAttemptAt: number }>();

function getClientIp(req: VercelRequest): string {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return raw?.split(',')[0]?.trim() || 'unknown';
}

function getRateLimitRetryAfterSeconds(firstAttemptAt: number): number {
  return Math.max(1, Math.ceil((firstAttemptAt + LOGIN_RATE_LIMIT_WINDOW_MS - Date.now()) / 1000));
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const body = (req.body ?? {}) as LoginBody;
  const login = body.login?.trim();
  const password = body.password?.trim();

  if (!login || !password) {
    res.status(400).json({ error: 'Логин и пароль обязательны' });
    return;
  }

  const clientIp = getClientIp(req);
  const now = Date.now();
  const currentAttempts = loginAttemptsByIp.get(clientIp);
  const attempts = currentAttempts && now - currentAttempts.firstAttemptAt < LOGIN_RATE_LIMIT_WINDOW_MS
    ? currentAttempts
    : { count: 0, firstAttemptAt: now };

  if (attempts.count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    res.setHeader('Retry-After', String(getRateLimitRetryAfterSeconds(attempts.firstAttemptAt)));
    res.status(429).json({ error: 'Слишком много попыток входа. Попробуйте позже.' });
    return;
  }

  const user = await verifyUser({ login, password });
  if (!user) {
    loginAttemptsByIp.set(clientIp, { ...attempts, count: attempts.count + 1 });
    res.status(401).json({ error: 'Неверный логин или пароль' });
    return;
  }

  loginAttemptsByIp.delete(clientIp);
  const session = await createSession(user.id);
  setSessionCookie(res, session.token, session.expiresAt);
  res.status(200).json({ data: { user } });
}

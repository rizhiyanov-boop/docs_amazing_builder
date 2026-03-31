import { createSession, registerUser } from '../_lib/db.js';
import { setSessionCookie } from '../_lib/http.js';

type VercelRequest = {
  method?: string;
  body?: unknown;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
};

type RegisterBody = {
  login?: string;
  password?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const body = (req.body ?? {}) as RegisterBody;
  const login = body.login?.trim();
  const password = body.password?.trim();

  if (!login || !password) {
    res.status(400).json({ error: 'Логин и пароль обязательны' });
    return;
  }

  try {
    const user = await registerUser({ login, password });
    const session = await createSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);
    res.status(200).json({ data: { user } });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось зарегистрироваться' });
  }
}

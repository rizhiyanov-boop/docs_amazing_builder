import { revokeSession } from '../_lib/db';
import { clearSessionCookie, getSessionToken } from '../_lib/http';

type VercelRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const sessionToken = getSessionToken(req);
  await revokeSession(sessionToken);
  clearSessionCookie(res);
  res.status(200).json({ data: { ok: true } });
}

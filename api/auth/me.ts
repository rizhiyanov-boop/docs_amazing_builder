import { getUserBySessionToken } from '../_lib/db.js';
import { getSessionToken } from '../_lib/http.js';

type VercelRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const sessionToken = getSessionToken(req);
  const user = await getUserBySessionToken(sessionToken);
  res.status(200).json({ data: { user } });
}

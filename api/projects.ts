import { deleteProject, getProjectById, getProjectsByUser, getUserBySessionToken, saveProject } from './_lib/db.js';
import { getSessionToken, readQueryString } from './_lib/http.js';

type VercelRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

type SaveBody = {
  projectId?: string;
  name?: string;
  workspace?: unknown;
  history?: unknown;
};

const MAX_PROJECT_NAME_LENGTH = 160;
const MAX_SAVE_PAYLOAD_BYTES = 2 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getJsonSizeBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');

  const user = await getUserBySessionToken(getSessionToken(req));
  if (!user) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }

  if (req.method === 'GET') {
    const projectId = readQueryString(req, 'id');
    if (projectId) {
      const project = await getProjectById(user.id, projectId);
      if (!project) {
        res.status(404).json({ error: 'Проект не найден' });
        return;
      }
      res.status(200).json({ data: { project } });
      return;
    }

    const projects = await getProjectsByUser(user.id);
    res.status(200).json({ data: { projects } });
    return;
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as SaveBody;

    if (body.projectId !== undefined && (typeof body.projectId !== 'string' || !body.projectId.trim())) {
      res.status(400).json({ error: 'Некорректный projectId' });
      return;
    }

    if (body.name !== undefined && typeof body.name !== 'string') {
      res.status(400).json({ error: 'Некорректное имя проекта' });
      return;
    }

    const resolvedName = (body.name?.trim() || 'Документ API').slice(0, MAX_PROJECT_NAME_LENGTH);

    if (!body.workspace || !isRecord(body.workspace)) {
      res.status(400).json({ error: 'Не передан workspace' });
      return;
    }

    if (body.history !== undefined && body.history !== null && !isRecord(body.history)) {
      res.status(400).json({ error: 'Некорректный history' });
      return;
    }

    const payloadSize = getJsonSizeBytes({ workspace: body.workspace, history: body.history ?? null });
    if (payloadSize > MAX_SAVE_PAYLOAD_BYTES) {
      res.status(413).json({ error: 'Слишком большой объем данных для сохранения' });
      return;
    }

    const saved = await saveProject({
      userId: user.id,
      projectId: body.projectId,
      name: resolvedName,
      workspace: body.workspace,
      history: body.history ?? null
    });

    res.status(200).json({ data: saved });
    return;
  }

  if (req.method === 'DELETE') {
    const projectId = readQueryString(req, 'id');
    if (!projectId) {
      res.status(400).json({ error: 'Не передан id проекта' });
      return;
    }

    const deleted = await deleteProject(user.id, projectId);
    if (!deleted) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }

    res.status(200).json({ data: { ok: true } });
    return;
  }

  res.status(405).json({ error: 'Method Not Allowed' });
}

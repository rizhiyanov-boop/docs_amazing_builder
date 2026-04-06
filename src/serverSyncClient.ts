import type { WorkspaceProjectData } from './types';

export type AuthUser = {
  id: string;
  login: string;
};

export type WorkspaceSnapshot = {
  projectName?: string;
  methods: unknown[];
  methodGroups: unknown[];
  projectSections?: unknown[];
  flows?: unknown[];
  activeMethodId: string;
  selectedId: string;
};

export type PersistedHistoryState = {
  undoStack: WorkspaceSnapshot[];
  redoStack: WorkspaceSnapshot[];
  lastSnapshot: WorkspaceSnapshot | null;
  lastHash: string;
  lastPushAt: number;
};

type ApiEnvelope<T> = {
  data?: T;
  error?: string;
};

const API_MODE_HINT =
  'Для auth/синхронизации запустите full-stack режим через `npx vercel dev` и откройте http://localhost:3001 (не только Vite на http://localhost:5173).';

function isLikelyHtmlResponse(body: string, contentType: string): boolean {
  if (contentType.toLowerCase().includes('text/html')) return true;
  const head = body.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

function isApiUnavailableErrorMessage(message: string): boolean {
  return message.includes('вернул некорректный ответ') || message.includes('вернул пустой ответ');
}

export type ProjectListItem = {
  id: string;
  name: string;
  updatedAt: string;
};

export type LoadedProject = {
  id: string;
  name: string;
  workspace: WorkspaceProjectData;
  history: PersistedHistoryState | null;
  updatedAt: string;
};

async function parseResponse<T>(response: Response): Promise<T> {
  let payload: ApiEnvelope<T> | null = null;
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (text.trim() && isLikelyHtmlResponse(text, contentType)) {
    throw new Error(`Сервер вернул HTML вместо JSON (HTTP ${response.status}). ${API_MODE_HINT}`);
  }

  try {
    if (text.trim()) {
      payload = JSON.parse(text) as ApiEnvelope<T>;
    }
  } catch {
    throw new Error(`Сервер вернул некорректный ответ (HTTP ${response.status}). ${API_MODE_HINT}`);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Ошибка серверного запроса (HTTP 404). Проверьте, что открыт проект через Vercel Dev (обычно http://localhost:3001), а не только Vite.');
    }
    throw new Error(payload?.error || `Ошибка серверного запроса (HTTP ${response.status})`);
  }

  if (!payload?.data) {
    throw new Error(`Сервер вернул пустой ответ (HTTP ${response.status}). ${API_MODE_HINT}`);
  }

  return payload.data;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include'
    });

    const payload = await parseResponse<{ user: AuthUser | null }>(response);
    return payload.user;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (isApiUnavailableErrorMessage(message) || message.includes('HTML вместо JSON')) {
      return null;
    }
    throw error;
  }
}

export async function registerWithPassword(payload: { login: string; password: string }): Promise<AuthUser> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const payloadResponse = await parseResponse<{ user: AuthUser }>(response);
  return payloadResponse.user;
}

export async function loginWithPassword(payload: { login: string; password: string }): Promise<AuthUser> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const payloadResponse = await parseResponse<{ user: AuthUser }>(response);
  return payloadResponse.user;
}

export async function logoutFromServer(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include'
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function listServerProjects(): Promise<ProjectListItem[]> {
  const response = await fetch('/api/projects', {
    method: 'GET',
    credentials: 'include'
  });

  const payload = await parseResponse<{ projects: ProjectListItem[] }>(response);
  return payload.projects;
}

export async function loadServerProject(projectId: string): Promise<LoadedProject> {
  const response = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, {
    method: 'GET',
    credentials: 'include'
  });

  const payload = await parseResponse<{ project: LoadedProject }>(response);
  return payload.project;
}

export async function saveServerProject(params: {
  projectId?: string;
  name: string;
  workspace: WorkspaceProjectData;
  history?: PersistedHistoryState;
}): Promise<{ id: string; updatedAt: string }> {
  const response = await fetch('/api/projects', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });

  return parseResponse<{ id: string; updatedAt: string }>(response);
}

export async function deleteServerProject(projectId: string): Promise<void> {
  const response = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
    credentials: 'include'
  });

  await parseResponse<{ ok: boolean }>(response);
}

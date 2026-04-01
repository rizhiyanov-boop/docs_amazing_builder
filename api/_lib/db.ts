import { neon } from '@neondatabase/serverless';

declare const crypto: Crypto;
declare const process: {
  env: Record<string, string | undefined>;
};

export type AuthUser = {
  id: string;
  login: string;
};

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
let schemaReady = false;

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || '');

function randomHex(size: number): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function makeId(prefix: string): string {
  return `${prefix}_${randomHex(9)}`;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashProjectPayload(payload: { name: string; workspace: unknown; history: unknown }): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;

  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    throw new Error('Не настроен DATABASE_URL или POSTGRES_URL для подключения к Neon');
  }

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      workspace JSONB NOT NULL,
      history JSONB,
      payload_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS payload_hash TEXT`;

  await sql`CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at)`;
  schemaReady = true;
}

async function cleanupExpiredSessions(): Promise<void> {
  await ensureSchema();
  await sql`DELETE FROM sessions WHERE expires_at <= now()`;
}

export async function registerUser(payload: { login: string; password: string }): Promise<AuthUser> {
  await ensureSchema();
  await cleanupExpiredSessions();

  const login = payload.login.trim().toLowerCase();
  const existing = await sql`SELECT id FROM users WHERE login = ${login} LIMIT 1`;
  const existingRow = (existing[0] as { id: string } | undefined) ?? null;
  if (existingRow) {
    throw new Error('Пользователь с таким логином уже существует');
  }

  const salt = randomHex(12);
  const hash = await hashPassword(payload.password, salt);
  const created = await sql`
    INSERT INTO users (id, login, password_hash, password_salt)
    VALUES (${makeId('usr')}, ${login}, ${hash}, ${salt})
    RETURNING id, login
  `;
  const createdRow = created[0] as { id: string; login: string };
  return { id: createdRow.id, login: createdRow.login };
}

export async function verifyUser(payload: { login: string; password: string }): Promise<AuthUser | null> {
  await ensureSchema();
  await cleanupExpiredSessions();

  const login = payload.login.trim().toLowerCase();
  const result = await sql`
    SELECT id, login, password_hash, password_salt
    FROM users
    WHERE login = ${login}
    LIMIT 1
  `;

  const user = result[0] as { id: string; login: string; password_hash: string; password_salt: string } | undefined;
  if (!user) return null;

  const hash = await hashPassword(payload.password, user.password_salt);
  if (hash !== user.password_hash) return null;

  return { id: user.id, login: user.login };
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  await ensureSchema();
  await cleanupExpiredSessions();

  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await sql`
    INSERT INTO sessions (id, user_id, token, expires_at)
    VALUES (${makeId('ses')}, ${userId}, ${token}, ${expiresAt})
  `;

  return { token, expiresAt };
}

export async function getUserBySessionToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;

  await ensureSchema();
  await cleanupExpiredSessions();

  const result = await sql`
    SELECT users.id, users.login
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ${token}
    LIMIT 1
  `;

  const row = result[0] as { id: string; login: string } | undefined;
  if (!row) return null;

  return {
    id: row.id,
    login: row.login
  };
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;

  await ensureSchema();
  await cleanupExpiredSessions();
  await sql`DELETE FROM sessions WHERE token = ${token}`;
}

export async function saveProject(payload: {
  userId: string;
  projectId?: string;
  name: string;
  workspace: unknown;
  history?: unknown;
  includeHistory?: boolean;
}): Promise<{ id: string; updatedAt: string }> {
  await ensureSchema();
  await cleanupExpiredSessions();

  const payloadHash = await hashProjectPayload({
    name: payload.name,
    workspace: payload.workspace,
    history: payload.history ?? null
  });

  const projectId = payload.projectId?.trim();
  if (projectId) {
    const updated = payload.includeHistory === false
      ? await sql`
          UPDATE projects
          SET name = ${payload.name},
              workspace = ${JSON.stringify(payload.workspace)}::jsonb,
              payload_hash = ${payloadHash},
              updated_at = now()
          WHERE id = ${projectId} AND user_id = ${payload.userId}
          RETURNING id, updated_at
        `
      : await sql`
          UPDATE projects
          SET name = ${payload.name},
              workspace = ${JSON.stringify(payload.workspace)}::jsonb,
              history = ${payload.history ? JSON.stringify(payload.history) : null}::jsonb,
              payload_hash = ${payloadHash},
              updated_at = now()
          WHERE id = ${projectId} AND user_id = ${payload.userId}
          RETURNING id, updated_at
        `;
    const updatedRow = updated[0] as { id: string; updated_at: string } | undefined;
    if (updatedRow) {
      return { id: updatedRow.id, updatedAt: updatedRow.updated_at };
    }
  }

  const duplicate = await sql`
    SELECT id, updated_at
    FROM projects
    WHERE user_id = ${payload.userId}
      AND payload_hash = ${payloadHash}
      AND name = ${payload.name}
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  const duplicateRow = duplicate[0] as { id: string; updated_at: string } | undefined;
  if (duplicateRow) {
    return { id: duplicateRow.id, updatedAt: duplicateRow.updated_at };
  }

  const created = await sql`
    INSERT INTO projects (id, user_id, name, workspace, history, payload_hash)
    VALUES (
      ${makeId('prj')},
      ${payload.userId},
      ${payload.name},
      ${JSON.stringify(payload.workspace)}::jsonb,
      ${payload.history ? JSON.stringify(payload.history) : null}::jsonb,
      ${payloadHash}
    )
    RETURNING id, updated_at
  `;
  const createdRow = created[0] as { id: string; updated_at: string };
  return { id: createdRow.id, updatedAt: createdRow.updated_at };
}

export async function getProjectsByUser(userId: string): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
  await ensureSchema();
  await cleanupExpiredSessions();

  const result = await sql`
    SELECT id, name, updated_at
    FROM projects
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;
  return (result as Array<{ id: string; name: string; updated_at: string }>).map((project) => ({
    id: project.id,
    name: project.name,
    updatedAt: project.updated_at
  }));
}

export async function getProjectById(userId: string, projectId: string): Promise<{ id: string; name: string; workspace: unknown; history: unknown; updatedAt: string } | null> {
  await ensureSchema();
  await cleanupExpiredSessions();

  const result = await sql`
    SELECT id, name, workspace, history, updated_at
    FROM projects
    WHERE user_id = ${userId} AND id = ${projectId}
    LIMIT 1
  `;

  const project = result[0] as {
    id: string;
    name: string;
    workspace: unknown;
    history: unknown | null;
    updated_at: string;
  } | undefined;
  if (!project) return null;

  return {
    id: project.id,
    name: project.name,
    workspace: project.workspace,
    history: project.history,
    updatedAt: project.updated_at
  };
}

export async function deleteProject(userId: string, projectId: string): Promise<boolean> {
  await ensureSchema();
  await cleanupExpiredSessions();

  const result = await sql`
    DELETE FROM projects
    WHERE user_id = ${userId} AND id = ${projectId}
    RETURNING id
  `;

  return result.length > 0;
}

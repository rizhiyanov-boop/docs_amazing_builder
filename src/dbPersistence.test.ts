import { beforeEach, describe, expect, it, vi } from 'vitest';

const sqlMock = vi.hoisted(() => vi.fn());
const bcryptMock = vi.hoisted(() => ({
  hash: vi.fn(),
  compare: vi.fn()
}));

vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => sqlMock)
}));
vi.mock('bcryptjs', () => ({
  default: bcryptMock
}));

function queryText(strings: TemplateStringsArray): string {
  return strings.join('?').replace(/\s+/g, ' ').trim();
}

async function legacySha256(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('saveProject', () => {
  beforeEach(() => {
    vi.resetModules();
    sqlMock.mockReset();
    bcryptMock.hash.mockReset();
    bcryptMock.compare.mockReset();
    process.env.DATABASE_URL = 'postgres://test';
  });

  it('throws ProjectNotFoundError when projectId update affects no rows', async () => {
    const { ProjectNotFoundError, saveProject } = await import('../api/_lib/db');
    const selectByHashQueries: string[] = [];

    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = queryText(strings);
      if (text.startsWith('UPDATE projects')) return [];
      if (text.includes('FROM projects') && text.includes('payload_hash')) {
        selectByHashQueries.push(text);
      }
      return [];
    });

    await expect(saveProject({
      userId: 'usr_1',
      projectId: 'prj_missing',
      name: 'Project',
      workspace: { version: 3 },
      history: null
    })).rejects.toBeInstanceOf(ProjectNotFoundError);
    expect(selectByHashQueries).toHaveLength(0);
  });
});

describe('user password persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    sqlMock.mockReset();
    bcryptMock.hash.mockReset();
    bcryptMock.compare.mockReset();
    process.env.DATABASE_URL = 'postgres://test';
  });

  it('stores new user registrations with bcrypt', async () => {
    const { registerUser } = await import('../api/_lib/db');
    bcryptMock.hash.mockResolvedValue('bcrypt-hash');

    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = queryText(strings);
      if (text.startsWith('SELECT id FROM users')) return [];
      if (text.startsWith('INSERT INTO users')) return [{ id: 'usr_1', login: 'user' }];
      return [];
    });

    await expect(registerUser({ login: 'User', password: 'strong-password' })).resolves.toEqual({
      id: 'usr_1',
      login: 'user'
    });
    expect(bcryptMock.hash).toHaveBeenCalledWith('strong-password', 12);

    const insertCall = sqlMock.mock.calls.find(([strings]) => queryText(strings as TemplateStringsArray).startsWith('INSERT INTO users'));
    expect(insertCall?.[1]).toMatch(/^usr_/);
    expect(insertCall?.[3]).toBe('bcrypt-hash');
    expect(insertCall?.[4]).toBe('');
    expect(insertCall?.[5]).toBe('bcrypt');
  });

  it('returns null for an invalid bcrypt password', async () => {
    const { verifyUser } = await import('../api/_lib/db');
    bcryptMock.compare.mockResolvedValue(false);

    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = queryText(strings);
      if (text.startsWith('SELECT id, login, password_hash')) {
        return [{
          id: 'usr_1',
          login: 'user',
          password_hash: 'bcrypt-hash',
          password_salt: '',
          password_algorithm: 'bcrypt'
        }];
      }
      return [];
    });

    await expect(verifyUser({ login: 'user', password: 'wrong-password' })).resolves.toBeNull();
    expect(bcryptMock.compare).toHaveBeenCalledWith('wrong-password', 'bcrypt-hash');
    expect(sqlMock.mock.calls.some(([strings]) => queryText(strings as TemplateStringsArray).startsWith('UPDATE users'))).toBe(false);
  });

  it('migrates a valid legacy SHA-256 password to bcrypt on login', async () => {
    const { verifyUser } = await import('../api/_lib/db');
    const legacyHash = await legacySha256('correct-password', 'legacy-salt');
    bcryptMock.hash.mockResolvedValue('migrated-bcrypt-hash');

    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = queryText(strings);
      if (text.startsWith('SELECT id, login, password_hash')) {
        return [{
          id: 'usr_legacy',
          login: 'legacy',
          password_hash: legacyHash,
          password_salt: 'legacy-salt',
          password_algorithm: 'sha256'
        }];
      }
      return [];
    });

    await expect(verifyUser({ login: 'legacy', password: 'correct-password' })).resolves.toEqual({
      id: 'usr_legacy',
      login: 'legacy'
    });
    expect(bcryptMock.hash).toHaveBeenCalledWith('correct-password', 12);

    const updateCall = sqlMock.mock.calls.find(([strings]) => queryText(strings as TemplateStringsArray).startsWith('UPDATE users'));
    expect(updateCall?.[1]).toBe('migrated-bcrypt-hash');
    expect(updateCall?.[2]).toBe('');
    expect(updateCall?.[3]).toBe('bcrypt');
    expect(updateCall?.[4]).toBe('usr_legacy');
  });
});

describe('session cleanup side effects', () => {
  beforeEach(() => {
    vi.resetModules();
    sqlMock.mockReset();
    process.env.DATABASE_URL = 'postgres://test';
  });

  it('does not delete expired sessions during project read operations', async () => {
    const { getProjectById, getProjectsByUser } = await import('../api/_lib/db');

    sqlMock.mockResolvedValue([]);

    await getProjectsByUser('usr_1');
    await getProjectById('usr_1', 'prj_1');

    const deleteQueries = sqlMock.mock.calls
      .map(([strings]) => queryText(strings as TemplateStringsArray))
      .filter((text) => text.startsWith('DELETE FROM sessions'));
    expect(deleteQueries).toHaveLength(0);
  });

  it('still deletes expired sessions during write operations', async () => {
    vi.setSystemTime(new Date('2026-04-29T00:00:00Z'));
    const { createSession } = await import('../api/_lib/db');

    sqlMock.mockResolvedValue([]);

    await createSession('usr_1');

    const deleteQueries = sqlMock.mock.calls
      .map(([strings]) => queryText(strings as TemplateStringsArray))
      .filter((text) => text.startsWith('DELETE FROM sessions'));
    expect(deleteQueries).toHaveLength(1);
    vi.useRealTimers();
  });

  it('checks session expiry when loading user by token', async () => {
    const { getUserBySessionToken } = await import('../api/_lib/db');
    sqlMock.mockResolvedValue([{ id: 'usr_1', login: 'user' }]);

    await getUserBySessionToken('token-1');

    const sessionQuery = sqlMock.mock.calls
      .map(([strings]) => queryText(strings as TemplateStringsArray))
      .find((text) => text.startsWith('SELECT users.id, users.login'));
    expect(sessionQuery).toContain('sessions.expires_at > now()');
  });
});

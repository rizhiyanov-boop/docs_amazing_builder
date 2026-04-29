import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
  createSession: vi.fn(),
  registerUser: vi.fn(),
  verifyUser: vi.fn()
}));

vi.mock('../api/_lib/db.js', () => dbMock);
vi.mock('../api/_lib/http.js', () => ({
  setSessionCookie: vi.fn()
}));

type TestResponse = {
  statusCode: number;
  payload: unknown;
  headers: Record<string, string | string[]>;
  status: (code: number) => TestResponse;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
};

function createResponse(): TestResponse {
  return {
    statusCode: 0,
    payload: null,
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
    },
    setHeader(name: string, value: string | string[]) {
      this.headers[name] = value;
    }
  };
}

describe('auth endpoints', () => {
  beforeEach(() => {
    vi.resetModules();
    dbMock.createSession.mockReset();
    dbMock.registerUser.mockReset();
    dbMock.verifyUser.mockReset();
  });

  it('rejects registration passwords shorter than 8 characters', async () => {
    const { default: registerHandler } = await import('../api/auth/register');
    const res = createResponse();

    await registerHandler({ method: 'POST', body: { login: 'user', password: 'short' } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ error: 'Пароль должен быть не менее 8 символов' });
    expect(dbMock.registerUser).not.toHaveBeenCalled();
  });

  it('returns 429 on the 11th failed login attempt from one IP', async () => {
    const { default: loginHandler } = await import('../api/auth/login');
    dbMock.verifyUser.mockResolvedValue(null);

    for (let index = 0; index < 10; index += 1) {
      const res = createResponse();
      await loginHandler({
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.7' },
        body: { login: 'user', password: 'wrong-password' }
      }, res);
      expect(res.statusCode).toBe(401);
    }

    const limitedResponse = createResponse();
    await loginHandler({
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.7' },
      body: { login: 'user', password: 'wrong-password' }
    }, limitedResponse);

    expect(limitedResponse.statusCode).toBe(429);
    expect(limitedResponse.headers['Retry-After']).toBeDefined();
  });

  it('resets login attempts after a successful login', async () => {
    const { default: loginHandler } = await import('../api/auth/login');
    dbMock.createSession.mockResolvedValue({ token: 'token', expiresAt: '2026-05-29T00:00:00Z' });
    dbMock.verifyUser
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'usr_1', login: 'user' })
      .mockResolvedValue(null);

    for (let index = 0; index < 2; index += 1) {
      const res = createResponse();
      await loginHandler({
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.8' },
        body: { login: 'user', password: 'wrong-password' }
      }, res);
      expect(res.statusCode).toBe(401);
    }

    const successResponse = createResponse();
    await loginHandler({
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.8' },
      body: { login: 'user', password: 'correct-password' }
    }, successResponse);
    expect(successResponse.statusCode).toBe(200);

    for (let index = 0; index < 10; index += 1) {
      const res = createResponse();
      await loginHandler({
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.8' },
        body: { login: 'user', password: 'wrong-password' }
      }, res);
      expect(res.statusCode).toBe(401);
    }
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
  getUserBySessionToken: vi.fn()
}));

const httpMock = vi.hoisted(() => ({
  getSessionToken: vi.fn()
}));

vi.mock('../api/_lib/db.js', () => dbMock);
vi.mock('../api/_lib/http.js', () => httpMock);

type TestResponse = {
  statusCode: number;
  payload: unknown;
  status: (code: number) => TestResponse;
  json: (payload: unknown) => void;
  setHeader: (_name: string, _value: string) => void;
};

function createResponse(): TestResponse {
  return {
    statusCode: 0,
    payload: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
    },
    setHeader() {}
  };
}

describe('ai endpoint auth', () => {
  beforeEach(() => {
    vi.resetModules();
    dbMock.getUserBySessionToken.mockReset();
    httpMock.getSessionToken.mockReset();
    httpMock.getSessionToken.mockReturnValue(undefined);
  });

  it('returns 401 when session is missing or invalid', async () => {
    const { default: aiHandler } = await import('../api/ai');
    dbMock.getUserBySessionToken.mockResolvedValue(null);
    const res = createResponse();

    await aiHandler({ method: 'POST', body: { task: 'repair-json', payload: { input: '{}' } } }, res);

    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: 'Unauthorized' });
  });

  it('keeps OPTIONS preflight public', async () => {
    const { default: aiHandler } = await import('../api/ai');
    const res = createResponse();

    await aiHandler({ method: 'OPTIONS' }, res);

    expect(res.statusCode).toBe(204);
  });
});

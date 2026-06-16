import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
  deleteProject: vi.fn(),
  getProjectById: vi.fn(),
  getProjectsByUser: vi.fn(),
  getUserBySessionToken: vi.fn(),
  saveProject: vi.fn(),
  ProjectNotFoundError: class ProjectNotFoundError extends Error {}
}));

const httpMock = vi.hoisted(() => ({
  getSessionToken: vi.fn(),
  readQueryString: vi.fn(),
  sendInternalServerError: vi.fn((res: TestResponse) => {
    res.status(500).json({ error: 'internal' });
  })
}));

vi.mock('../api/_lib/db.js', () => dbMock);
vi.mock('../api/_lib/http.js', () => httpMock);

type TestResponse = {
  statusCode: number;
  payload: unknown;
  headers: Record<string, string>;
  status: (code: number) => TestResponse;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string) => void;
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
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    }
  };
}

describe('projects endpoint cache headers', () => {
  beforeEach(() => {
    vi.resetModules();
    dbMock.getUserBySessionToken.mockReset();
    dbMock.getProjectsByUser.mockReset();
    httpMock.getSessionToken.mockReset();
    httpMock.readQueryString.mockReset();
    httpMock.sendInternalServerError.mockClear();
    httpMock.readQueryString.mockReturnValue(undefined);
    dbMock.getUserBySessionToken.mockResolvedValue({ id: 'usr_1', login: 'user' });
  });

  it('sets edge cache headers for GET /api/projects', async () => {
    const { default: projectsHandler } = await import('../api/projects');
    dbMock.getProjectsByUser.mockResolvedValue([]);
    const res = createResponse();

    await projectsHandler({ method: 'GET' }, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toContain('s-maxage=30');
    expect(res.headers.Vary).toBe('Cookie');
  });

  it('keeps no-store for POST /api/projects', async () => {
    const { default: projectsHandler } = await import('../api/projects');
    dbMock.saveProject.mockResolvedValue({ id: 'prj_1', updatedAt: '2026-05-07T00:00:00.000Z' });
    const res = createResponse();

    await projectsHandler({
      method: 'POST',
      body: {
        name: 'Test',
        workspace: {
          version: 3,
          updatedAt: '2026-05-07T00:00:00.000Z',
          methods: [],
          groups: []
        }
      }
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('returns JSON 500 when project persistence fails', async () => {
    const { default: projectsHandler } = await import('../api/projects');
    dbMock.getProjectsByUser.mockRejectedValue(new Error('database down'));
    const res = createResponse();

    await projectsHandler({ method: 'GET' }, res);

    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ error: 'internal' });
    expect(httpMock.sendInternalServerError).toHaveBeenCalledWith(res, 'projects', expect.any(Error));
  });
});

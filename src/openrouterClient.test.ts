import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareJiraTaskWithAi, suggestMappingsWithAi } from './openrouterClient';

function makeJsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(payload)
  } as Response;
}

describe('openrouterClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('includes auth cookies when calling AI API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeJsonResponse(200, { data: { mappings: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(suggestMappingsWithAi({ serverFields: ['id'], clientFields: ['clientId'] })).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include'
      })
    );
  });

  it('shows a login-specific error for unauthorized AI requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeJsonResponse(401, { error: 'Unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(suggestMappingsWithAi({ serverFields: ['id'], clientFields: ['clientId'] }))
      .rejects
      .toThrow('AI доступен только после входа в аккаунт');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('prepares a Jira draft without DocBuilder cookies', async () => {
    const output = { summary: 'Fix search', descriptionRu: 'Исправить поиск.', descriptionEn: 'Fix search.', descriptionUz: 'Qidiruvni tuzatish.' };
    const fetchMock = vi.fn().mockResolvedValue(makeJsonResponse(200, { data: output }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(prepareJiraTaskWithAi({
      source: { kind: 'freeform', description: 'Исправить поиск' },
      method: { name: '', context: '' },
      project: { key: 'IN', name: 'Integration' },
      issueType: 'Task',
      epics: [],
      priorities: []
    })).resolves.toMatchObject(output);
    expect(fetchMock).toHaveBeenCalledWith('/api/ai', expect.objectContaining({ credentials: 'omit' }));
  });
});

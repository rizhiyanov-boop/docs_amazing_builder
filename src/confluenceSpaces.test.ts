import { afterEach, expect, it, vi } from 'vitest';
import { loadConfluenceSpaces, readRecentSpaces, recentSpacesStorageKey, rememberSpace } from './confluenceSpaces';
import type { ConfluenceClient } from './confluenceClient';

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

it('loads later spaces with current names without persisting directory data', async () => {
  const getSpaces = vi.fn().mockResolvedValueOnce({ items: [{ key: '~user', name: 'User' }], nextStart: 100 }).mockResolvedValueOnce({ items: [{ key: 'DI', name: 'Тестовое пространство интеграции' }], nextStart: null });
  const write = vi.spyOn(Storage.prototype, 'setItem');
  const spaces = await loadConfluenceSpaces({ getSpaces } as unknown as ConfluenceClient, 'https://confluence.example', () => true);
  expect(spaces.find(space => space.key === 'DI')?.name).toBe('Тестовое пространство интеграции');
  expect(getSpaces).toHaveBeenLastCalledWith(100, 'https://confluence.example');
  expect(write).not.toHaveBeenCalled();
});

it('stops reading later pages after a connection generation change', async () => {
  let active = true;
  const getSpaces = vi.fn(async () => { active = false; return { items: [], nextStart: 100 }; });
  expect(await loadConfluenceSpaces({ getSpaces } as unknown as ConfluenceClient, 'https://confluence.example', () => active)).toEqual([]);
  expect(getSpaces).toHaveBeenCalledOnce();
});

it('rejects repeated pagination instead of looping forever', async () => {
  const getSpaces = vi.fn(async () => ({ items: [], nextStart: 0 }));
  await expect(loadConfluenceSpaces({ getSpaces } as unknown as ConfluenceClient, 'https://confluence.example', () => true)).rejects.toThrow('полный список');
  expect(getSpaces).toHaveBeenCalledOnce();
});

it('stores only three distinct keys per connection and tolerates malformed storage', () => {
  const origin = 'https://confluence.example';
  for (let i = 0; i < 10; i++) rememberSpace(origin, `SPACE${i}`);
  rememberSpace(origin, 'SPACE5');
  expect(readRecentSpaces(origin)).toEqual(['SPACE5', 'SPACE9', 'SPACE8']);
  expect(readRecentSpaces('https://other.example')).toEqual([]);
  expect(JSON.parse(localStorage.getItem(recentSpacesStorageKey(origin))!)).toEqual(readRecentSpaces(origin));
  localStorage.setItem(recentSpacesStorageKey(origin), 'invalid json');
  expect(readRecentSpaces(origin)).toEqual([]);
});

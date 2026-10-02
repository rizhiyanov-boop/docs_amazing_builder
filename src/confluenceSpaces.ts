import type { ConfluenceClient } from './confluenceClient';
import type { ConfluenceSpace } from './confluenceTypes';

export function isPersonalSpace(space: ConfluenceSpace): boolean {
  return space.type === 'personal' || space.key.startsWith('~');
}

/** Exhaust pagination in RAM so search never silently omits later spaces. */
export async function loadConfluenceSpaces(client: ConfluenceClient, origin: string, active: () => boolean): Promise<ConfluenceSpace[]> {
  const spaces = new Map<string, ConfluenceSpace>();
  const visited = new Set<number>();
  let start: number | null = 0;
  while (start !== null) {
    if (!active()) return [];
    if (visited.has(start) || visited.size >= 1000) throw new Error('Не удалось загрузить полный список пространств. Проверьте подключение.');
    visited.add(start);
    const page = await client.getSpaces(start, origin);
    if (!active()) return [];
    for (const space of page.items) spaces.set(space.key, space);
    start = page.nextStart;
  }
  return [...spaces.values()];
}

export function recentSpacesStorageKey(origin: string): string {
  return `docbuilder.confluence.recent-spaces:${origin}`;
}

export function readRecentSpaces(origin: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(recentSpacesStorageKey(origin)) ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((key): key is string => typeof key === 'string' && /^[~A-Za-z0-9_.-]{1,255}$/.test(key)))].slice(0, 3) : [];
  } catch { return []; }
}

export function rememberSpace(origin: string, key: string): string[] {
  const keys = [key, ...readRecentSpaces(origin).filter(previous => previous !== key)].slice(0, 3);
  try { localStorage.setItem(recentSpacesStorageKey(origin), JSON.stringify(keys)); } catch { /* Selection still works with storage disabled. */ }
  return keys;
}

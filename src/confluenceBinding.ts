import type { ConfluenceBinding } from './confluenceTypes';

/** Persist only publication metadata; never retain remote content or credentials. */
export function normalizeConfluenceBinding(value: unknown): ConfluenceBinding | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  if (typeof source.baseUrl !== 'string' || typeof source.spaceKey !== 'string'
    || typeof source.pageId !== 'string' || typeof source.publishedFingerprint !== 'string'
    || typeof source.publishedAt !== 'string' || !Number.isSafeInteger(source.lastPublishedVersion)
    || Number(source.lastPublishedVersion) < 1 || !/^\d+$/.test(source.pageId)
    || !/^[\w.~-]{1,128}$/.test(source.spaceKey)
    || !/^(?:[a-f0-9]{8,64}|docbuilder-v1-[a-f0-9]{16})$/.test(source.publishedFingerprint)
    || !Number.isFinite(Date.parse(source.publishedAt))) return undefined;
  try {
    const url = new URL(source.baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/'
      || url.search || url.hash) return undefined;
    return {
      baseUrl: url.origin,
      spaceKey: source.spaceKey,
      pageId: source.pageId,
      lastPublishedVersion: Number(source.lastPublishedVersion),
      publishedFingerprint: source.publishedFingerprint,
      publishedAt: new Date(source.publishedAt).toISOString()
    };
  } catch { return undefined; }
}

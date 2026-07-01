export const DOCUMENTATION_BASE_URL_TEST_NAME = 'BASE_URL_TEST';
export const DOCUMENTATION_BASE_URL_TEST_VALUE = 'https://api-internal-tst.ipotekabank.uz/api';

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    return stripBaseApiPath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
  } catch {
    return stripBaseApiPath(trimmed);
  }
}

function stripBaseApiPath(value: string): string {
  if (value === '/api') return '';
  return value.replace(/^\/api(?=\/|\?|#|$)/, '');
}

export function formatDocumentationUrl(value: string | null | undefined): string {
  const normalizedPath = normalizePath(value ?? '');
  if (!normalizedPath) return DOCUMENTATION_BASE_URL_TEST_VALUE;

  if (normalizedPath.startsWith('?') || normalizedPath.startsWith('#')) {
    return `${DOCUMENTATION_BASE_URL_TEST_VALUE}${normalizedPath}`;
  }

  return `${DOCUMENTATION_BASE_URL_TEST_VALUE}/${normalizedPath.replace(/^\/+/, '')}`;
}

export function replaceDocumentationUrls(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>]+/, (url) => formatDocumentationUrl(url));
}

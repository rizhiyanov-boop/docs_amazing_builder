import type { ParseFormat, ParsedRow, RequestMethod } from './types';

type BuildInputOptions = {
  requestUrl?: string;
  requestMethod?: RequestMethod;
};

type JsonContainer = Record<string, unknown> | unknown[];

function tokenizePath(path: string): string[] {
  return path
    .replaceAll(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
}

function isIndexToken(token: string): boolean {
  return /^\d+$/.test(token);
}

function getDefaultValue(type: string): unknown {
  if (type === 'int' || type === 'long' || type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'object' || type === 'map') return {};
  if (type === 'array' || type === 'array_object') return [];
  if (type === 'null') return null;
  return '';
}

function parseExampleValue(row: ParsedRow): unknown {
  const trimmed = row.example.trim();
  if (!trimmed) return getDefaultValue(row.type);
  if (trimmed === '-' && (row.type === 'object' || row.type === 'map' || row.type === 'array' || row.type === 'array_object')) {
    return getDefaultValue(row.type);
  }

  if (row.type === 'string' || row.type === 'element' || row.type === 'attribute') {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  if (row.type === 'boolean') return trimmed.toLowerCase() === 'true';
  if (row.type === 'int' || row.type === 'long' || row.type === 'number') return Number(trimmed);
  if (row.type === 'null') return null;
  if (row.type === 'array' || row.type === 'array_object') {
    try {
      return JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function ensureContainer(parent: JsonContainer, token: string, nextToken?: string): JsonContainer {
  if (Array.isArray(parent)) {
    const index = Number(token);
    const existing = parent[index];
    if (existing && typeof existing === 'object') return existing as JsonContainer;
    const nextValue: JsonContainer = isIndexToken(nextToken ?? '') ? [] : {};
    parent[index] = nextValue;
    return nextValue;
  }

  const existing = parent[token];
  if (existing && typeof existing === 'object') return existing as JsonContainer;
  const nextValue: JsonContainer = isIndexToken(nextToken ?? '') ? [] : {};
  parent[token] = nextValue;
  return nextValue;
}

function setJsonPath(root: JsonContainer, path: string, value: unknown): void {
  const tokens = tokenizePath(path);
  if (tokens.length === 0) return;

  let current: JsonContainer = root;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    current = ensureContainer(current, tokens[index], tokens[index + 1]);
  }

  const lastToken = tokens[tokens.length - 1];
  if (Array.isArray(current)) {
    current[Number(lastToken)] = value;
  } else {
    current[lastToken] = value;
  }
}

function buildJsonObject(rows: ParsedRow[]): unknown {
  const bodyRows = rows.filter((row) => row.field.trim() && row.source !== 'header' && row.source !== 'url');
  const root: Record<string, unknown> = {};

  for (const row of bodyRows) {
    setJsonPath(root, row.field, parseExampleValue(row));
  }

  return root;
}

function buildCurl(rows: ParsedRow[], options?: BuildInputOptions): string {
  const url = options?.requestUrl?.trim() || rows.find((row) => row.source === 'url')?.example.trim() || 'https://example.com';
  const method = options?.requestMethod?.trim() || 'POST';
  const headers = rows
    .filter((row) => row.source === 'header')
    .map((row) => `-H "${row.field}: ${row.example.trim()}"`);
  const bodyRows = rows.filter((row) => row.source !== 'header' && row.source !== 'url' && row.field.trim());
  const body = bodyRows.length > 0 ? JSON.stringify(buildJsonObject(bodyRows), null, 2) : '';

  return ['curl', '-X', method, `"${url}"`, ...headers, ...(body ? [`--data-raw '${body}'`] : [])].join(' ');
}

export function buildInputFromRows(format: ParseFormat, rows: ParsedRow[], options?: BuildInputOptions): string {
  if (format === 'json') return JSON.stringify(buildJsonObject(rows), null, 2);
  return buildCurl(rows, options);
}

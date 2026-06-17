import type { ParseFormat, ParsedRow, RequestMethod } from './types';

type BuildInputOptions = {
  requestUrl?: string;
  requestMethod?: RequestMethod;
  bodyJson?: string;
  bodyText?: string;
};

function toQueryParamValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function buildUrlWithQuery(baseUrl: string, queryRows: ParsedRow[]): string {
  const trimmedBaseUrl = baseUrl.trim() || 'https://example.com';
  const [basePath, existingQuery = ''] = trimmedBaseUrl.split('?');
  const searchParams = new URLSearchParams(existingQuery);

  for (const row of queryRows) {
    const key = row.field.trim();
    if (!key) continue;
    searchParams.set(key, toQueryParamValue(parseExampleValue(row)));
  }

  const queryString = searchParams.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

type JsonContainer = Record<string, unknown> | unknown[];

function tokenizePath(path: string): string[] {
  return path
    .replaceAll(/\[(\d+)\]/g, '.$1')
    .replace(/^\$\./, '')
    .replace(/^\$/, '')
    .replace(/^\./, '')
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
    return trimmed;
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

function shouldUseArrayRoot(rows: ParsedRow[]): boolean {
  return rows.some((row) => {
    const field = row.field.trim();
    if (!field) return false;
    if (field === '$') return row.type === 'array' || row.type === 'array_object';
    return field.startsWith('$[') || field.startsWith('[');
  });
}

function buildJsonObject(rows: ParsedRow[]): unknown {
  const bodyRows = rows.filter((row) => row.field.trim() && row.source !== 'header' && row.source !== 'url' && row.source !== 'query');
  let root: JsonContainer = shouldUseArrayRoot(bodyRows) ? [] : {};

  for (const row of bodyRows) {
    const field = row.field.trim();
    if (field === '$') {
      const nextRoot = parseExampleValue(row);
      if (Array.isArray(nextRoot) || (nextRoot && typeof nextRoot === 'object')) {
        root = nextRoot as JsonContainer;
      }
      continue;
    }
    setJsonPath(root, row.field, parseExampleValue(row));
  }

  return root;
}

type XmlNode = {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeXmlName(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z_][\w.-]*$/.test(trimmed)) return trimmed;
  return 'field';
}

function tokenizeXmlPath(path: string): string[] {
  return path
    .replace(/^\$\./, '')
    .replace(/^\$/, '')
    .replace(/^\./, '')
    .split('.')
    .filter(Boolean);
}

function parseXmlPathToken(token: string): { name: string; index: number } {
  const match = token.match(/^(.+?)\[(\d+)\]$/);
  if (!match) return { name: token, index: 0 };
  return { name: match[1], index: Number(match[2]) };
}

function ensureXmlChild(parent: XmlNode, token: string): XmlNode {
  const { name, index } = parseXmlPathToken(token);
  const sanitizedName = sanitizeXmlName(name);
  const existingChildren = parent.children.filter((child) => child.name === sanitizedName);
  const existing = existingChildren[index];
  if (existing) return existing;
  let child: XmlNode = { name: sanitizedName, attributes: {}, children: [], text: '' };
  for (let childIndex = existingChildren.length; childIndex <= index; childIndex += 1) {
    child = { name: sanitizedName, attributes: {}, children: [], text: '' };
    parent.children.push(child);
  }
  return child;
}

function setXmlPath(root: XmlNode, path: string, value: string): void {
  const tokens = tokenizeXmlPath(path);
  if (tokens.length === 0) return;

  const startsWithRoot = parseXmlPathToken(tokens[0]).name === root.name;
  let current = root;
  const startIndex = startsWithRoot ? 1 : 0;

  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith('@')) {
      current.attributes[sanitizeXmlName(token.slice(1))] = value;
      return;
    }
    if (token === '#text') {
      current.text = value;
      return;
    }
    if (index === tokens.length - 1) {
      const child = ensureXmlChild(current, token);
      child.text = value;
      return;
    }
    current = ensureXmlChild(current, token);
  }
}

function renderXmlNode(node: XmlNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  const attributes = Object.entries(node.attributes)
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join('');

  if (node.children.length === 0) {
    return `${pad}<${node.name}${attributes}>${escapeXml(node.text)}</${node.name}>`;
  }

  const textLine = node.text ? [`${'  '.repeat(indent + 1)}${escapeXml(node.text)}`] : [];
  const childLines = node.children.map((child) => renderXmlNode(child, indent + 1));
  return [`${pad}<${node.name}${attributes}>`, ...textLine, ...childLines, `${pad}</${node.name}>`].join('\n');
}

function buildXmlDocument(rows: ParsedRow[]): string {
  const getXmlRowPath = (row: ParsedRow): string => row.sourceField?.trim() || row.field.trim();
  const bodyRows = rows.filter((row) => getXmlRowPath(row) && row.source !== 'header' && row.source !== 'url' && row.source !== 'query');
  const firstField = bodyRows[0] ? getXmlRowPath(bodyRows[0]) : 'root';
  const rootName = sanitizeXmlName(parseXmlPathToken(tokenizeXmlPath(firstField)[0] || 'root').name);
  const root: XmlNode = { name: rootName, attributes: {}, children: [], text: '' };

  for (const row of bodyRows) {
    const field = getXmlRowPath(row);
    if (!field || row.type === 'object' || row.type === 'array' || row.type === 'array_object') continue;
    setXmlPath(root, field, String(parseExampleValue(row)));
  }

  return renderXmlNode(root);
}

function buildCurl(rows: ParsedRow[], options?: BuildInputOptions): string {
  const baseUrl = options?.requestUrl?.trim() || rows.find((row) => row.source === 'url')?.example.trim() || 'https://example.com';
  const method = options?.requestMethod?.trim() || 'POST';
  const normalizedMethod = method.toUpperCase();
  const queryRows = rows.filter((row) => row.source === 'query' && row.field.trim());
  const url = buildUrlWithQuery(baseUrl, queryRows);
  const headers = rows
    .filter((row) => row.source === 'header')
    .map((row) => `-H "${row.field}: ${row.example.trim()}"`);
  const bodyRows = rows.filter((row) => row.source !== 'header' && row.source !== 'url' && row.source !== 'query' && row.field.trim());
  const bodyFromExample = options?.bodyText?.trim() || options?.bodyJson?.trim() || '';
  let body = '';

  if (bodyFromExample && normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    try {
      body = JSON.stringify(JSON.parse(bodyFromExample), null, 2);
    } catch {
      body = bodyFromExample;
    }
  } else if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    body = bodyRows.length > 0 ? JSON.stringify(buildJsonObject(bodyRows), null, 2) : '';
  }

  const escapedBody = body.replace(/'/g, "'\"'\"'");

  return ['curl', '-X', method, `"${url}"`, ...headers, ...(body ? [`--data-raw '${escapedBody}'`] : [])].join(' ');
}

export function buildInputFromRows(format: ParseFormat, rows: ParsedRow[], options?: BuildInputOptions): string {
  if (format === 'json') return JSON.stringify(buildJsonObject(rows), null, 2);
  if (format === 'xml') return buildXmlDocument(rows);
  return buildCurl(rows, options);
}

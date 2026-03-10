import type { ParseFormat, ParsedRow } from './types';

type JsonContainer = Record<string, unknown> | unknown[];
type XmlNode = {
  name: string;
  attributes: Record<string, string>;
  children: Map<string, XmlNode>;
  text?: string;
};

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
  if (type === 'array' || type === 'array_object') return [];
  if (type === 'null') return null;
  return '';
}

function parseExampleValue(row: ParsedRow): unknown {
  const trimmed = row.example.trim();
  if (!trimmed) return getDefaultValue(row.type);

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

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function getOrCreateNode(root: XmlNode, path: string): XmlNode {
  const tokens = path.split('.').filter(Boolean);
  let current = root;

  for (const token of tokens) {
    const existing = current.children.get(token);
    if (existing) {
      current = existing;
      continue;
    }

    const nextNode: XmlNode = { name: token, attributes: {}, children: new Map() };
    current.children.set(token, nextNode);
    current = nextNode;
  }

  return current;
}

function renderXmlNode(node: XmlNode): string {
  const attributes = Object.entries(node.attributes)
    .map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
    .join('');
  const children = Array.from(node.children.values()).map(renderXmlNode).join('');
  const text = node.text ? escapeXml(node.text) : '';
  return `<${node.name}${attributes}>${text}${children}</${node.name}>`;
}

function buildXmlDocument(rows: ParsedRow[]): string {
  const sortedRows = rows.filter((row) => row.field.trim()).sort((left, right) => left.field.localeCompare(right.field));
  const firstElementRow = sortedRows.find((row) => !row.field.includes('.@'));
  const rootName = firstElementRow?.field.split('.')[0] ?? 'root';
  const root: XmlNode = { name: rootName, attributes: {}, children: new Map() };

  for (const row of sortedRows) {
    if (row.field.includes('.@')) {
      const [elementPath, attrName] = row.field.split('.@');
      const node = elementPath === rootName ? root : getOrCreateNode(root, elementPath.replace(`${rootName}.`, ''));
      node.attributes[attrName] = String(parseExampleValue(row));
      continue;
    }

    const relativePath = row.field === rootName ? '' : row.field.replace(`${rootName}.`, '');
    const node = relativePath ? getOrCreateNode(root, relativePath) : root;
    const hasChildren = sortedRows.some((candidate) => candidate.field.startsWith(`${row.field}.`) && candidate.field !== row.field);
    if (!hasChildren) {
      const value = parseExampleValue(row);
      node.text = value == null ? '' : String(value);
    }
  }

  return renderXmlNode(root);
}

function buildCurl(rows: ParsedRow[]): string {
  const url = rows.find((row) => row.source === 'url')?.example.trim() || 'https://example.com';
  const headers = rows
    .filter((row) => row.source === 'header')
    .map((row) => `-H "${row.field}: ${row.example.trim()}"`);
  const bodyRows = rows.filter((row) => row.source !== 'header' && row.source !== 'url' && row.field.trim());
  const body = bodyRows.length > 0 ? JSON.stringify(buildJsonObject(bodyRows), null, 2) : '';

  return ['curl', `"${url}"`, ...headers, ...(body ? [`--data-raw '${body}'`] : [])].join(' ');
}

export function buildInputFromRows(format: ParseFormat, rows: ParsedRow[]): string {
  if (format === 'json') return JSON.stringify(buildJsonObject(rows), null, 2);
  if (format === 'xml') return buildXmlDocument(rows);
  return buildCurl(rows);
}

import { OPTIONAL_MARK } from './requestHeaders';
import type { ParseFormat, ParsedRow } from './types';

function inferType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return value >= -2147483648 && value <= 2147483647 ? 'int' : 'long';
    }
    return 'number';
  }

  if (typeof value === 'string') {
    const s = value.trim();
    if (/^-?\d+$/.test(s)) {
      try {
        const bi = BigInt(s);
        const min = BigInt(-2147483648);
        const max = BigInt(2147483647);
        return bi >= min && bi <= max ? 'int' : 'long';
      } catch {
        return 'long';
      }
    }
    if (!Number.isNaN(Number(s)) && /[.eE]/.test(s)) return 'number';
    if (/^(true|false)$/i.test(s)) return 'boolean';
    return 'string';
  }

  return typeof value;
}

function flattenJson(value: unknown, basePath = ''): ParsedRow[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [
        {
          field: basePath || '$',
          type: 'array',
          required: OPTIONAL_MARK,
          description: '',
          example: '[]'
        }
      ];
    }

    const first = value[0];
    const isArrayOfObjects = first && typeof first === 'object' && !Array.isArray(first);
    const rows: ParsedRow[] = [
      {
        field: basePath || '$',
        type: isArrayOfObjects ? 'array_object' : 'array',
        required: OPTIONAL_MARK,
        description: '',
        example: JSON.stringify(first).slice(0, 120)
      }
    ];

    rows.push(...flattenJson(first, `${basePath}[0]`));
    return rows;
  }

  if (typeof value === 'object') {
    const rows: ParsedRow[] = [];
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [key, nested] of entries) {
      const nextPath = basePath ? `${basePath}.${key}` : key;
      if (nested && typeof nested === 'object') {
        rows.push(...flattenJson(nested, nextPath));
      } else {
        rows.push({
          field: nextPath,
          type: inferType(nested),
          required: OPTIONAL_MARK,
          description: '',
          example: nested === undefined ? '' : JSON.stringify(nested).slice(0, 120)
        });
      }
    }
    return rows;
  }

  return [
    {
      field: basePath || '$',
      type: inferType(value),
      required: OPTIONAL_MARK,
      description: '',
      example: String(value)
    }
  ];
}

function parseJson(input: string): ParsedRow[] {
  return flattenJson(JSON.parse(input));
}

function parseXml(input: string): ParsedRow[] {
  const xml = new DOMParser().parseFromString(input, 'application/xml');
  const parserError = xml.querySelector('parsererror');
  if (parserError) {
    throw new Error('Некорректный XML');
  }

  const rows: ParsedRow[] = [];

  function walk(element: Element, path = element.tagName): void {
    rows.push({
      field: path,
      type: 'element',
      required: OPTIONAL_MARK,
      description: '',
      example: element.textContent?.trim().slice(0, 120) ?? ''
    });

    for (const attr of Array.from(element.attributes)) {
      rows.push({
        field: `${path}.@${attr.name}`,
        type: 'attribute',
        required: OPTIONAL_MARK,
        description: '',
        example: attr.value
      });
    }

    for (const child of Array.from(element.children)) {
      walk(child, `${path}.${child.tagName}`);
    }
  }

  const root = xml.documentElement;
  if (!root) {
    throw new Error('Пустой XML');
  }

  walk(root);
  return rows;
}

function parseCurl(input: string): ParsedRow[] {
  const normalized = input.replace(/\r\n/g, ' ').replace(/\n/g, ' ');
  const rows: ParsedRow[] = [];
  let extractedAny = false;

  let bodyPayload: string | null = null;
  const dataMatch = normalized.match(/(?:--data-raw|--data|-d)\s+(['"])([\s\S]*?)\1/);
  let remaining = normalized;
  if (dataMatch) {
    extractedAny = true;
    bodyPayload = dataMatch[2].trim();
    remaining = normalized.replace(dataMatch[0], '');

    try {
      const payloadRows = flattenJson(JSON.parse(bodyPayload));
      rows.push(
        ...payloadRows.map(
          (row): ParsedRow => ({
            ...row,
            description: row.description || 'Тело запроса из cURL (JSON)',
            source: 'body'
          })
        )
      );
    } catch {
      rows.push({
        field: 'body',
        type: 'string',
        required: OPTIONAL_MARK,
        description: 'Тело запроса из cURL (не JSON)',
        example: bodyPayload.slice(0, 120),
        source: 'body'
      });
    }
  }

  const headerMatches = Array.from(remaining.matchAll(/(?:-H|--header)\s+['"]([^'"]+)['"]/g));
  if (headerMatches.length > 0) {
    extractedAny = true;
  }

  for (const match of headerMatches) {
    const headerValue = match[1];
    const separatorIndex = headerValue.indexOf(':');
    const name = separatorIndex > -1 ? headerValue.slice(0, separatorIndex).trim() : headerValue.trim();
    const value = separatorIndex > -1 ? headerValue.slice(separatorIndex + 1).trim() : '';

    let pushed = false;
    if (value) {
      const trimmedValue = value.trim();
      const looksLikeJson =
        (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) ||
        (trimmedValue.startsWith('[') && trimmedValue.endsWith(']'));

      if (looksLikeJson) {
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed === 'object' && parsed !== null) {
            const nested = flattenJson(parsed, name);
            rows.push(
              ...nested.map(
                (row): ParsedRow => ({
                  ...row,
                  description: `Заголовок ${name} (распарсено)`,
                  source: 'header'
                })
              )
            );
            pushed = true;
          }
        } catch {
          // fall through to scalar handling
        }
      }

      if (!pushed) {
        const low = value.toLowerCase();
        if (low === 'true' || low === 'false') {
          rows.push({ field: name, type: 'boolean', required: '-', description: `Заголовок ${name}`, example: low, source: 'header' });
          pushed = true;
        } else if (/^-?\d+$/.test(value)) {
          try {
            const bi = BigInt(value);
            const min = BigInt(-2147483648);
            const max = BigInt(2147483647);
            rows.push({ field: name, type: bi >= min && bi <= max ? 'int' : 'long', required: '-', description: `Заголовок ${name}`, example: value, source: 'header' });
            pushed = true;
          } catch {
            rows.push({ field: name, type: 'long', required: '-', description: `Заголовок ${name}`, example: value, source: 'header' });
            pushed = true;
          }
        } else if (!Number.isNaN(Number(value))) {
          rows.push({ field: name, type: 'number', required: '-', description: `Заголовок ${name}`, example: value, source: 'header' });
          pushed = true;
        }
      }
    }

    if (!pushed) {
      rows.push({ field: name, type: 'string', required: '-', description: `Заголовок ${name}`, example: value, source: 'header' });
    }
  }

  const urlMatch = normalized.match(/curl\s+(?:-X\s+\w+\s+)?['"]?(https?:\/\/[^'"\s]+)['"]?/i);
  if (urlMatch) {
    extractedAny = true;
    rows.push({
      field: 'request.url',
      type: 'string',
      required: '+',
      description: 'URL запроса',
      example: urlMatch[1],
      source: 'url'
    });
  }

  if (!extractedAny) {
    throw new Error('Не удалось извлечь данные из cURL. Проверьте формат команды.');
  }

  return rows;
}

export function parseToRows(format: ParseFormat, input: string): ParsedRow[] {
  if (!input.trim()) {
    throw new Error('Поле ввода пустое');
  }

  if (format === 'json') return parseJson(input);
  if (format === 'xml') return parseXml(input);
  return parseCurl(input);
}

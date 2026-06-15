import type { ParseFormat, ParsedRow, RequestMethod } from './types';

export type ParsedCurlMeta = {
  url?: string;
  method?: RequestMethod;
};

const STRUCTURED_EXAMPLE_PLACEHOLDER = '-';
const OPTIONAL_MARK = '-';

function createParsedRow(row: Omit<ParsedRow, 'sourceField' | 'origin'>): ParsedRow {
  return {
    ...row,
    sourceField: row.field,
    origin: 'parsed'
  };
}

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
        createParsedRow({
          field: basePath || '$',
          type: 'array',
          required: '+',
          description: '',
          example: STRUCTURED_EXAMPLE_PLACEHOLDER
        })
      ];
    }

    const first = value[0];
    const isArrayOfObjects = first && typeof first === 'object' && !Array.isArray(first);
    const rows: ParsedRow[] = [
      createParsedRow({
        field: basePath || '$',
        type: isArrayOfObjects ? 'array_object' : 'array',
        required: '+',
        description: '',
        example: STRUCTURED_EXAMPLE_PLACEHOLDER
      })
    ];

    rows.push(...flattenJson(first, `${basePath}[0]`));
    return rows;
  }

  if (typeof value === 'object') {
    const rows: ParsedRow[] = [];
    if (basePath) {
      rows.push(
        createParsedRow({
          field: basePath,
          type: 'object',
          required: '+',
          description: '',
          example: STRUCTURED_EXAMPLE_PLACEHOLDER
        })
      );
    }
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [key, nested] of entries) {
      const nextPath = basePath ? `${basePath}.${key}` : key;
      if (nested && typeof nested === 'object') {
        rows.push(...flattenJson(nested, nextPath));
      } else {
        rows.push(
          createParsedRow({
            field: nextPath,
            type: inferType(nested),
            required: '+',
            description: '',
            example: nested === undefined ? '' : JSON.stringify(nested).slice(0, 120)
          })
        );
      }
    }
    return rows;
  }

  return [
    createParsedRow({
      field: basePath || '$',
      type: inferType(value),
      required: '+',
      description: '',
      example: String(value)
    })
  ];
}

function parseJson(input: string): ParsedRow[] {
  return flattenJson(JSON.parse(input));
}

type JsonSchema = {
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  definitions?: Record<string, JsonSchema>;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  enum?: unknown[];
  example?: unknown;
  examples?: unknown[];
  default?: unknown;
  format?: string;
  description?: string;
};

type SchemaExampleValue = {
  found: boolean;
  value: unknown;
};

type JsonSchemaContext = {
  root: JsonSchema;
};

const NO_SCHEMA_EXAMPLE: SchemaExampleValue = { found: false, value: undefined };

function hasOwnProperty(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function decodeJsonPointerSegment(segment: string): string {
  return decodeURIComponent(segment).replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolveLocalSchemaRef(root: JsonSchema, ref: string): JsonSchema {
  if (ref === '#') return root;
  if (!ref.startsWith('#/')) {
    throw new Error(`Unsupported JSON Schema $ref: ${ref}`);
  }

  let current: unknown = root;
  const segments = ref.slice(2).split('/').map(decodeJsonPointerSegment);
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current) || !hasOwnProperty(current, segment)) {
      throw new Error(`Unresolved JSON Schema $ref: ${ref}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }

  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    throw new Error(`JSON Schema $ref does not point to an object: ${ref}`);
  }

  return current as JsonSchema;
}

function resolveSchemaRef(schema: JsonSchema, context: JsonSchemaContext, seenRefs = new Set<string>()): JsonSchema {
  if (!schema.$ref) return schema;
  if (seenRefs.has(schema.$ref)) {
    throw new Error(`Circular JSON Schema $ref: ${schema.$ref}`);
  }

  const nextSeenRefs = new Set(seenRefs);
  nextSeenRefs.add(schema.$ref);
  const targetSchema = resolveSchemaRef(resolveLocalSchemaRef(context.root, schema.$ref), context, nextSeenRefs);
  const { $ref: _ref, ...siblingSchema } = schema;
  return { ...targetSchema, ...siblingSchema };
}

function resolveSchemaVariant(schema: JsonSchema, context: JsonSchemaContext): JsonSchema {
  const resolvedSchema = resolveSchemaRef(schema, context);
  const variants = [...(resolvedSchema.oneOf ?? []), ...(resolvedSchema.anyOf ?? [])].map((variant) => resolveSchemaRef(variant, context));
  if (variants.length === 0) return resolvedSchema;

  const priorities = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
  for (const typeName of priorities) {
    const matched = variants.find((candidate) => {
      const candidateType = Array.isArray(candidate.type) ? candidate.type[0] : candidate.type;
      if (candidateType === typeName) return true;
      if (!candidateType && typeName === 'object' && candidate.properties && typeof candidate.properties === 'object') return true;
      if (!candidateType && typeName === 'array' && candidate.items) return true;
      return false;
    });
    if (matched) return matched;
  }

  return variants[0];
}

function normalizeSchemaType(schema: JsonSchema, context: JsonSchemaContext): string {
  const resolvedSchema = resolveSchemaVariant(schema, context);
  const schemaType = Array.isArray(resolvedSchema.type) ? resolvedSchema.type[0] : resolvedSchema.type;

  if (!schemaType) {
    if (resolvedSchema.properties && typeof resolvedSchema.properties === 'object') return 'object';
    if (resolvedSchema.items) return 'array';
    return 'string';
  }

  if (schemaType === 'integer') return resolvedSchema.format === 'int64' ? 'long' : 'int';
  if (schemaType === 'number') return 'number';
  if (schemaType === 'boolean') return 'boolean';
  if (schemaType === 'object') return 'object';
  if (schemaType === 'array') return 'array';
  if (schemaType === 'string') {
    if (resolvedSchema.format === 'date-time') return 'datetime';
    if (resolvedSchema.format === 'date') return 'date';
    return 'string';
  }

  return 'string';
}

function getOwnSchemaExample(schema: JsonSchema, context: JsonSchemaContext): SchemaExampleValue {
  const resolvedSchema = resolveSchemaVariant(schema, context);
  if (hasOwnProperty(resolvedSchema, 'example')) return { found: true, value: resolvedSchema.example };
  if (Array.isArray(resolvedSchema.examples) && resolvedSchema.examples.length > 0) return { found: true, value: resolvedSchema.examples[0] };
  if (hasOwnProperty(resolvedSchema, 'default')) return { found: true, value: resolvedSchema.default };
  if (Array.isArray(resolvedSchema.enum) && resolvedSchema.enum.length > 0) return { found: true, value: resolvedSchema.enum[0] };
  return NO_SCHEMA_EXAMPLE;
}

function getSchemaExample(schema: JsonSchema, context: JsonSchemaContext, fallback = NO_SCHEMA_EXAMPLE): SchemaExampleValue {
  const ownExample = getOwnSchemaExample(schema, context);
  return ownExample.found ? ownExample : fallback;
}

function getObjectChildExample(parentExample: SchemaExampleValue, key: string): SchemaExampleValue {
  if (!parentExample.found || !parentExample.value || typeof parentExample.value !== 'object' || Array.isArray(parentExample.value)) {
    return NO_SCHEMA_EXAMPLE;
  }

  const record = parentExample.value as Record<string, unknown>;
  if (!hasOwnProperty(record, key)) return NO_SCHEMA_EXAMPLE;
  return { found: true, value: record[key] };
}

function getArrayItemExample(parentExample: SchemaExampleValue): SchemaExampleValue {
  if (!parentExample.found || !Array.isArray(parentExample.value) || parentExample.value.length === 0) {
    return NO_SCHEMA_EXAMPLE;
  }

  return { found: true, value: parentExample.value[0] };
}

function schemaExample(schema: JsonSchema, context: JsonSchemaContext, resolvedType: string, fallback = NO_SCHEMA_EXAMPLE): string {
  const explicit = getSchemaExample(schema, context, fallback);

  if (explicit.found) {
    if (typeof explicit.value === 'string') return explicit.value;
    if (typeof explicit.value === 'number' || typeof explicit.value === 'boolean') return String(explicit.value);
    try {
      const serialized = JSON.stringify(explicit.value);
      return typeof serialized === 'string' ? serialized : STRUCTURED_EXAMPLE_PLACEHOLDER;
    } catch {
      return STRUCTURED_EXAMPLE_PLACEHOLDER;
    }
  }

  if (resolvedType === 'array' || resolvedType === 'array_object' || resolvedType === 'object') return STRUCTURED_EXAMPLE_PLACEHOLDER;
  return '';
}

function flattenJsonSchemaNode(
  schema: JsonSchema,
  context: JsonSchemaContext,
  basePath: string,
  required: boolean,
  fallbackExample = NO_SCHEMA_EXAMPLE
): ParsedRow[] {
  const resolvedSchema = resolveSchemaVariant(schema, context);
  const rows: ParsedRow[] = [];
  const normalizedType = normalizeSchemaType(resolvedSchema, context);
  const requiredMark = required ? '+' : OPTIONAL_MARK;
  const nodeExample = getSchemaExample(resolvedSchema, context, fallbackExample);

  if (normalizedType === 'array') {
    const itemType = resolvedSchema.items ? normalizeSchemaType(resolvedSchema.items, context) : 'string';
    rows.push(
      createParsedRow({
        field: basePath || '$',
        type: itemType === 'object' ? 'array_object' : 'array',
        required: requiredMark,
        description: resolvedSchema.description ?? '',
        example: schemaExample(resolvedSchema, context, itemType === 'object' ? 'array_object' : 'array', fallbackExample)
      })
    );

    if (resolvedSchema.items) {
      rows.push(...flattenJsonSchemaNode(resolvedSchema.items, context, `${basePath || '$'}[0]`, true, getArrayItemExample(nodeExample)));
    }
    return rows;
  }

  if (normalizedType === 'object') {
    if (basePath) {
      rows.push(
        createParsedRow({
          field: basePath,
          type: 'object',
          required: requiredMark,
          description: resolvedSchema.description ?? '',
          example: schemaExample(resolvedSchema, context, 'object', fallbackExample)
        })
      );
    }

    const requiredProps = new Set(resolvedSchema.required ?? []);
    const properties = resolvedSchema.properties ?? {};

    for (const [key, childSchema] of Object.entries(properties)) {
      const childPath = basePath ? `${basePath}.${key}` : key;
      rows.push(...flattenJsonSchemaNode(childSchema, context, childPath, requiredProps.has(key), getObjectChildExample(nodeExample, key)));
    }

    return rows;
  }

  rows.push(
    createParsedRow({
      field: basePath || '$',
      type: normalizedType,
      required: requiredMark,
      description: resolvedSchema.description ?? '',
      example: schemaExample(resolvedSchema, context, normalizedType, fallbackExample)
    })
  );

  return rows;
}

export function parseJsonSchemaToRows(input: string): ParsedRow[] {
  const parsed = JSON.parse(input) as JsonSchema;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON Schema должен быть объектом');
  }

  return flattenJsonSchemaNode(parsed, { root: parsed }, '', true);
}

function inferPrimitiveType(value: string): string {
  if (value === 'true' || value === 'false') return 'boolean';
  if (/^-?\d+$/.test(value)) return 'int';
  if (!Number.isNaN(Number(value))) return 'number';
  return 'string';
}

function splitUrlAndQuery(rawUrl: string): { baseUrl: string; queryRows: ParsedRow[] } {
  try {
    const url = new URL(rawUrl);
    const queryRows: ParsedRow[] = [];

    for (const [key, value] of url.searchParams.entries()) {
      queryRows.push(
        createParsedRow({
          field: key,
          type: inferPrimitiveType(value),
          required: '+',
          description: '',
          example: value,
          source: 'query'
        })
      );
    }

    url.search = '';
    return { baseUrl: url.toString(), queryRows };
  } catch {
    return { baseUrl: rawUrl, queryRows: [] };
  }
}

function parseCurl(input: string): ParsedRow[] {
  const normalized = input.replace(/\\\r?\n/g, ' ').replace(/\r\n/g, ' ').replace(/\n/g, ' ');
  const rows: ParsedRow[] = [];
  let extractedAny = false;

  const dataMatch = normalized.match(/(?:--data-raw|--data|-d)\s+(['"])([\s\S]*?)\1/);
  let remaining = normalized;
  if (dataMatch) {
    extractedAny = true;
    const bodyPayload = dataMatch[2].trim();
    remaining = normalized.replace(dataMatch[0], '');

    try {
      const payloadRows = flattenJson(JSON.parse(bodyPayload));
      rows.push(
        ...payloadRows.map((row) => ({
          ...row,
          description: '',
          source: 'body' as const
        }))
      );
    } catch {
      rows.push(
        createParsedRow({
          field: 'body',
          type: 'string',
          required: '+',
          description: '',
          example: bodyPayload.slice(0, 120),
          source: 'body'
        })
      );
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
              ...nested.map((row) => ({
                ...row,
                description: '',
                source: 'header' as const
              }))
            );
            pushed = true;
          }
        } catch {
          // fall through
        }
      }

      if (!pushed) {
        const lowerValue = value.toLowerCase();
        if (lowerValue === 'true' || lowerValue === 'false') {
          rows.push(
            createParsedRow({
              field: name,
              type: 'boolean',
              required: '+',
              description: '',
              example: lowerValue,
              source: 'header'
            })
          );
          pushed = true;
        } else if (/^-?\d+$/.test(value)) {
          try {
            const bigIntValue = BigInt(value);
            const min = BigInt(-2147483648);
            const max = BigInt(2147483647);
            rows.push(
              createParsedRow({
                field: name,
                type: bigIntValue >= min && bigIntValue <= max ? 'int' : 'long',
                required: '+',
                description: '',
                example: value,
                source: 'header'
              })
            );
            pushed = true;
          } catch {
            rows.push(
              createParsedRow({
                field: name,
                type: 'long',
                required: '+',
                description: '',
                example: value,
                source: 'header'
              })
            );
            pushed = true;
          }
        } else if (!Number.isNaN(Number(value))) {
          rows.push(
            createParsedRow({
              field: name,
              type: 'number',
              required: '+',
              description: '',
              example: value,
              source: 'header'
            })
          );
          pushed = true;
        }
      }
    }

    if (!pushed) {
      rows.push(
        createParsedRow({
          field: name,
          type: 'string',
          required: '+',
          description: '',
          example: value,
          source: 'header'
        })
      );
    }
  }

  const urlMatch = normalized.match(/curl\s+(?:-X\s+\w+\s+)?['"]?(https?:\/\/[^'"\s]+)['"]?/i);
  if (urlMatch) {
    extractedAny = true;
    const { baseUrl, queryRows } = splitUrlAndQuery(urlMatch[1]);
    rows.push(
      createParsedRow({
        field: 'request.url',
        type: 'string',
        required: '+',
        description: '',
        example: baseUrl,
        source: 'url'
      })
    );
    rows.push(...queryRows);
  }

  if (!extractedAny) {
    throw new Error('Не удалось извлечь данные из cURL. Проверьте формат команды.');
  }

  return rows;
}

export function parseCurlMeta(input: string): ParsedCurlMeta {
  const normalized = input.replace(/\\\r?\n/g, ' ').replace(/\r\n/g, ' ').replace(/\n/g, ' ');
  const methodMatch = normalized.match(/(?:^|\s)(?:-X|--request)\s+(GET|POST|PUT|PATCH|DELETE)\b/i);
  const urlMatch = normalized.match(/curl\s+(?:-X\s+\w+\s+)?['"]?(https?:\/\/[^'"\s]+)['"]?/i);
  const parsedUrl = urlMatch?.[1] ? splitUrlAndQuery(urlMatch[1]).baseUrl : undefined;
  const hasBody = /(?:^|\s)(?:--data-raw|--data|-d)\s+/i.test(normalized);
  const defaultMethod = urlMatch ? (hasBody ? 'POST' : 'GET') : undefined;

  return {
    method: (methodMatch?.[1]?.toUpperCase() as RequestMethod | undefined) ?? defaultMethod,
    url: parsedUrl
  };
}

export function wrapNonDomainResponseJson(input: string): string {
  try {
    const parsed = JSON.parse(input);
    if (
      parsed
      && typeof parsed === 'object'
      && !Array.isArray(parsed)
      && 'data' in parsed
      && 'techData' in parsed
      && 'warnings' in parsed
    ) {
      return JSON.stringify(parsed, null, 2);
    }

    return JSON.stringify({
      data: parsed,
      techData: {
        traceId: '95892214c3ad0ab7897f802847358a92',
        spanId: 'c8603abc45ca02e6',
        appVersion: '1.2.0',
        appTag: '3'
      },
      warnings: {
        clientId: 'X-CLIENT-ID is missing in the request headers',
        bpName: 'X-BP-NAME is missing in the request headers',
        sourceSystem: 'X-SOURCE-SYSTEM is missing in the request headers',
        bpId: 'X-BP-ID is missing in the request headers',
        traceparent: 'traceparent is missing in the request headers',
        userId: 'X-USER-ID is missing in the request headers'
      }
    }, null, 2);
  } catch {
    return input;
  }
}

export function parseToRows(format: ParseFormat, input: string): ParsedRow[] {
  if (!input.trim()) {
    throw new Error('Поле ввода пустое');
  }

  if (format === 'json') return parseJson(input);
  return parseCurl(input);
}

import { normalizeArrayFieldPath } from './fieldPath';
import { getRequestHeaderRows, getRequestRows } from './requestHeaders';
import type { ErrorRow, ErrorsSection, MethodDocument, ParsedRow, ParsedSection, ValidationRuleRow } from './types';

type MockRule = {
  comparator: string;
  errResponse: {
    type: 'json';
    status: number;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
  errorParams: Record<string, string[]>;
  value: string | number | boolean;
  pairs: Array<Record<string, unknown>>;
};

function toScalarExample(row: ParsedRow): string | number | boolean {
  const example = row.example.trim();
  if (example) {
    const looksLikeJson = (example.startsWith('{') && example.endsWith('}')) || (example.startsWith('[') && example.endsWith(']'));
    if (!looksLikeJson) {
      if (example === 'true') return true;
      if (example === 'false') return false;
      const asNumber = Number(example);
      if (!Number.isNaN(asNumber) && String(asNumber) === example) return asNumber;
      return example;
    }
  }

  const normalizedType = row.type.trim().toLowerCase();
  if (normalizedType === 'boolean' || normalizedType === 'array_boolean') return true;
  if (['int', 'long', 'float', 'double', 'decimal', 'number', 'array_int', 'array_long', 'array_number'].includes(normalizedType)) return 1;
  return 'string';
}

function toExampleValue(row: ParsedRow): unknown {
  const example = row.example.trim();
  if (example && example !== '-') {
    const looksLikeJson = (example.startsWith('{') && example.endsWith('}')) || (example.startsWith('[') && example.endsWith(']'));
    if (looksLikeJson) {
      try {
        return JSON.parse(example) as unknown;
      } catch {
        // Keep fallback by type when JSON parse fails.
      }
    } else {
      return toScalarExample(row);
    }
  }

  const normalizedType = row.type.trim().toLowerCase();
  if (normalizedType === 'object' || normalizedType === 'map' || normalizedType === 'array_object') return {};
  if (normalizedType.startsWith('array')) return [];
  return toScalarExample(row);
}

function splitPath(input: string): string[] {
  const normalized = normalizeArrayFieldPath(input.trim())
    .replace(/^\$\.?/, '')
    .replaceAll('[].', '.')
    .replaceAll('[]', '');

  return normalized.split('.').map((segment) => segment.trim()).filter(Boolean);
}

function setDeepValue(target: Record<string, unknown>, fieldPath: string, value: unknown): void {
  const segments = splitPath(fieldPath);
  if (segments.length === 0) return;

  let current: Record<string, unknown> = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const existing = current[segment];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  current[segments[segments.length - 1]] = value;
}

function toMockType(rowType: string): string {
  const normalized = rowType.trim().toLowerCase();
  if (normalized.includes('bool')) return 'boolean';
  if (normalized.includes('int') || normalized.includes('long') || normalized.includes('number') || normalized.includes('double') || normalized.includes('float') || normalized.includes('decimal')) return 'number';
  if (normalized.includes('object') || normalized === 'map') return 'object';
  if (normalized.startsWith('array')) return 'array';
  if (normalized === 'null') return 'null';
  return 'string';
}

function defaultErrorParams(): Record<string, string[]> {
  return {
    null: ['Invalid input for field ${field}'],
    boolean: ['Invalid input for field ${field}'],
    object: ['Invalid input for field ${field}'],
    array: ['Invalid input for field ${field}'],
    number: ['Invalid input for field ${field}'],
    string: ['Invalid input for field ${field}']
  };
}

function parseRuleValue(condition: string, fallback: string | number | boolean): string | number | boolean {
  const trimmed = condition.trim();
  if (!trimmed) return fallback;

  const firstNumber = trimmed.match(/-?\d+(?:[.,]\d+)?/);
  if (firstNumber) {
    const numericValue = Number(firstNumber[0].replace(',', '.'));
    if (!Number.isNaN(numericValue)) return numericValue;
  }

  const regexLiteral = trimmed.match(/^\/(.+)\/[gimsuy]*$/);
  if (regexLiteral) return regexLiteral[1];

  return trimmed;
}

function responseFromErrorRow(row: ErrorRow | undefined): { status: number; body: Record<string, unknown> } {
  if (!row) return { status: 400, body: {} };

  const status = Number(row.serverHttpStatus.trim()) || Number(row.clientHttpStatus.trim()) || 400;
  const json = row.responseCode.trim();
  if (!json) return { status, body: {} };

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { status, body: parsed };
    }
  } catch {
    // Keep empty body fallback when stored JSON is invalid.
  }

  return { status, body: {} };
}

function buildFieldRules(
  row: ParsedRow,
  relatedValidation: ValidationRuleRow[],
  validationErrorResponse: { status: number; body: Record<string, unknown> },
  requiredErrorResponse: { status: number; body: Record<string, unknown> }
): { required: boolean; rules: MockRule[]; errorRequire: MockRule['errResponse'] } {
  const normalizedType = toMockType(row.type);
  const baseErrResponse: MockRule['errResponse'] = {
    type: 'json',
    status: validationErrorResponse.status,
    headers: { 'content-Type': 'application/json' },
    body: validationErrorResponse.body
  };

  const rules: MockRule[] = [
    {
      comparator: 'type',
      errResponse: baseErrResponse,
      errorParams: defaultErrorParams(),
      value: normalizedType,
      pairs: []
    }
  ];

  for (const validation of relatedValidation) {
    const caseName = validation.validationCase.trim().toLowerCase();
    if (!caseName) continue;

    if (caseName.includes('pattern') || caseName.includes('regex') || caseName.includes('формат')) {
      rules.push({
        comparator: 'regex',
        errResponse: baseErrResponse,
        errorParams: defaultErrorParams(),
        value: String(parseRuleValue(validation.condition, '.*')),
        pairs: []
      });
      continue;
    }

    if (caseName.includes('size') || caseName.includes('длина')) {
      rules.push({
        comparator: 'minLength',
        errResponse: baseErrResponse,
        errorParams: defaultErrorParams(),
        value: Number(parseRuleValue(validation.condition, 1)) || 1,
        pairs: []
      });
      continue;
    }

    if (caseName.includes('empty') || caseName.includes('blank') || caseName.includes('пуст')) {
      rules.push({
        comparator: 'notEmpty',
        errResponse: baseErrResponse,
        errorParams: defaultErrorParams(),
        value: true,
        pairs: []
      });
    }
  }

  return {
    required: row.required === '+',
    rules,
    errorRequire: {
      type: 'json',
      status: requiredErrorResponse.status,
      headers: { 'content-Type': 'application/json' },
      body: requiredErrorResponse.body
    }
  };
}

function normalizeFieldName(value: string): string {
  const path = normalizeArrayFieldPath(value).trim();
  if (!path) return '';
  const withoutRoot = path.replace(/^\$\.?/, '');
  return withoutRoot;
}

function fieldKey(value: string): string {
  return normalizeFieldName(value).toLowerCase();
}

function findRelatedValidationRules(fieldPath: string, validationRules: ValidationRuleRow[]): ValidationRuleRow[] {
  const key = fieldKey(fieldPath);
  if (!key) return [];

  return validationRules.filter((rule) => {
    const ruleKey = fieldKey(rule.parameter);
    return Boolean(ruleKey) && (ruleKey === key || ruleKey.endsWith(`.${key}`) || key.endsWith(`.${ruleKey}`));
  });
}

function findRequestSection(method: MethodDocument): ParsedSection | null {
  return method.sections.find((section): section is ParsedSection => section.kind === 'parsed' && section.sectionType === 'request') ?? null;
}

function findResponseSection(method: MethodDocument): ParsedSection | null {
  return method.sections.find((section): section is ParsedSection => section.kind === 'parsed' && section.sectionType === 'response') ?? null;
}

function findErrorsSection(method: MethodDocument): ErrorsSection | null {
  return method.sections.find((section): section is ErrorsSection => section.kind === 'errors') ?? null;
}

export function buildMockServicePayload(method: MethodDocument): Record<string, unknown> {
  const requestSection = findRequestSection(method);
  const responseSection = findResponseSection(method);
  const errorsSection = findErrorsSection(method);

  const validationRules = errorsSection?.validationRules ?? [];
  const errorRows = errorsSection?.rows ?? [];

  const validationErrorRow = errorRows.find((row) => row.internalCode.trim() === '100101') ?? errorRows[0];
  const requiredErrorRow = errorRows.find((row) => row.trigger.toLowerCase().includes('обяз')) ?? validationErrorRow;
  const defaultFailRow = errorRows.find((row) => row.serverHttpStatus.trim() === '400') ?? errorRows[0];

  const validationErrorResponse = responseFromErrorRow(validationErrorRow);
  const requiredErrorResponse = responseFromErrorRow(requiredErrorRow);
  const failResponse = responseFromErrorRow(defaultFailRow);

  const exampleHeaders: Record<string, unknown> = {};
  const exampleBody: Record<string, unknown> = {};
  const bodyRules: Record<string, unknown> = {};
  const headerRules: Record<string, unknown> = {};

  if (requestSection) {
    const headers = getRequestHeaderRows(requestSection);
    const rows = getRequestRows(requestSection);

    for (const row of headers) {
      const headerName = row.field.trim();
      if (!headerName) continue;
      exampleHeaders[headerName.toLowerCase()] = toExampleValue(row);
      headerRules[headerName.toLowerCase()] = buildFieldRules(
        row,
        findRelatedValidationRules(row.field, validationRules),
        validationErrorResponse,
        requiredErrorResponse
      );
    }

    const bodyRows = rows.filter((row) => row.source !== 'header' && row.source !== 'url');
    for (const row of bodyRows) {
      const field = normalizeFieldName(row.field);
      if (!field) continue;

      setDeepValue(exampleBody, field, toExampleValue(row));
      bodyRules[field] = buildFieldRules(
        row,
        findRelatedValidationRules(field, validationRules),
        validationErrorResponse,
        requiredErrorResponse
      );
    }
  }

  const responseRows = responseSection ? getRequestRows(responseSection).filter((row) => row.source !== 'header' && row.source !== 'url') : [];
  const firstResponseRow = responseRows[0];
  const firstBodyRuleField = Object.keys(bodyRules)[0] ?? 'globId';
  const firstBodyRuleType = requestSection
    ? toMockType((getRequestRows(requestSection).find((row) => normalizeFieldName(row.field) === firstBodyRuleField)?.type ?? 'string'))
    : 'string';

  const successBody: Record<string, unknown> = {};
  if (responseRows.length > 0) {
    for (const row of responseRows) {
      const field = normalizeFieldName(row.field);
      if (!field) continue;
      setDeepValue(successBody, field, toExampleValue(row));
    }
  }

  const responseOkBody = Object.keys(successBody).length > 0
    ? successBody
    : (firstResponseRow ? { code: toExampleValue(firstResponseRow) } : { code: 'Success' });

  return {
    example: {
      headers: exampleHeaders,
      body: exampleBody
    },
    bodyRules,
    headerRules,
    rules: [
      {
        when: {
          match: {
            scope: 'body',
            tests: [
              {
                path: `$.${firstBodyRuleField}`,
                type: firstBodyRuleType
              }
            ]
          },
          meta: {
            errorTag: ''
          }
        },
        response: {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            ok: true,
            echo: '$inps'
          }
        }
      },
      {
        response: {
          status: failResponse.status,
          headers: {
            'Content-Type': 'application/json'
          },
          body: failResponse.body
        }
      }
    ],
    responseOK: {
      status: 200,
      headers: {},
      body: responseOkBody
    },
    responseFail: {
      status: failResponse.status,
      headers: {},
      body: failResponse.body
    }
  };
}

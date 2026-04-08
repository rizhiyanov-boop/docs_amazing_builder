import type { ValidationRuleRow } from './types';
import { normalizeArrayFieldPath } from './fieldPath';
import { buildValidationCause } from './validationCause';

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minItems?: number;
  maxItems?: number;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
};

type RuleOptions = {
  causeCondition?: string;
};

function resolveSchemaType(schema: JsonSchema): string {
  const schemaType = Array.isArray(schema.type) ? schema.type.find((item) => item !== 'null') : schema.type;
  if (schemaType) return schemaType;
  if (schema.properties) return 'object';
  if (schema.items) return 'array';
  return 'string';
}

function normalizeCauseType(schemaType: string): string {
  if (schemaType === 'string') return 'string';
  if (schemaType === 'array') return 'list';
  if (schemaType === 'integer' || schemaType === 'number') return 'long';
  return schemaType;
}

function mergeCompositeSchema(schema: JsonSchema): JsonSchema {
  const fragments = [
    ...(schema.allOf ?? []),
    ...(schema.anyOf ?? []),
    ...(schema.oneOf ?? [])
  ];

  if (fragments.length === 0) return schema;

  return fragments.reduce<JsonSchema>((acc, fragment) => ({
    ...acc,
    ...fragment,
    properties: {
      ...(acc.properties ?? {}),
      ...(fragment.properties ?? {})
    },
    required: [...new Set([...(acc.required ?? []), ...(fragment.required ?? [])])]
  }), { ...schema });
}

function stringifyEnumValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeRegexSource(pattern: string): string {
  return pattern
    .trim()
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replaceAll('\\/', '/');
}

function isPinflPattern(pattern: string): boolean {
  const source = normalizeRegexSource(pattern);
  const has14Digits = /(?:\\d|\[0-9\])\{14\}/.test(source);
  const hasNotAllZero = source.includes('0{14}') && (source.includes('?!') || source.includes('?!00000000000000'));
  return has14Digits && hasNotAllZero;
}

type RegexUnit = {
  single: string;
  few: string;
  many: string;
};

function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function unitForClass(charClass: string): RegexUnit | null {
  if (charClass === 'A-Z') return { single: 'заглавная латинская буква', few: 'заглавные латинские буквы', many: 'заглавных латинских букв' };
  if (charClass === 'a-z') return { single: 'строчная латинская буква', few: 'строчные латинские буквы', many: 'строчных латинских букв' };
  if (charClass === '0-9') return { single: 'цифра', few: 'цифры', many: 'цифр' };
  if (charClass === 'A-Za-z') return { single: 'латинская буква', few: 'латинские буквы', many: 'латинских букв' };
  if (charClass === 'A-Za-z0-9') return { single: 'латинская буква или цифра', few: 'латинские буквы или цифры', many: 'латинских букв или цифр' };
  return null;
}

function readQuantifier(source: string, index: number): { quantifier: string | null; nextIndex: number } {
  const current = source[index];
  if (!current) return { quantifier: null, nextIndex: index };
  if (current === '+' || current === '*' || current === '?') return { quantifier: current, nextIndex: index + 1 };
  if (current === '{') {
    const end = source.indexOf('}', index + 1);
    if (end !== -1) {
      const q = source.slice(index, end + 1);
      if (/^\{\d+(,\d+)?\}$/.test(q)) return { quantifier: q, nextIndex: end + 1 };
    }
  }
  return { quantifier: null, nextIndex: index };
}

function quantify(unit: RegexUnit, quantifier: string | null): string {
  if (!quantifier) return unit.single;

  const exact = quantifier.match(/^\{(\d+)\}$/);
  if (exact) {
    const count = Number(exact[1]);
    return `${count} ${pluralRu(count, unit.single, unit.few, unit.many)}`;
  }

  const range = quantifier.match(/^\{(\d+),(\d+)\}$/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return `от ${min} до ${max} ${unit.many}`;
  }

  if (quantifier === '+') return `одна или более ${unit.many}`;
  if (quantifier === '*') return `ноль или более ${unit.many}`;
  if (quantifier === '?') return `ноль или одна ${unit.single}`;
  return unit.single;
}

function describeRegexAsSequence(pattern: string): string | null {
  const source = normalizeRegexSource(pattern);
  if (!source) return null;

  const parts: string[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];

    if (ch === '[') {
      const close = source.indexOf(']', i + 1);
      if (close === -1) return null;
      const cls = source.slice(i + 1, close);
      const unit = unitForClass(cls);
      if (!unit) return null;
      const { quantifier, nextIndex } = readQuantifier(source, close + 1);
      parts.push(quantify(unit, quantifier));
      i = nextIndex;
      continue;
    }

    if (ch === '\\') {
      const token = source[i + 1];
      if (!token) return null;

      let unit: RegexUnit | null = null;
      if (token === 'd') unit = { single: 'цифра', few: 'цифры', many: 'цифр' };
      if (token === 'w') unit = { single: 'буква, цифра или _', few: 'буквы, цифры или _', many: 'букв, цифр или _' };
      if (token === 's') unit = { single: 'пробельный символ', few: 'пробельных символа', many: 'пробельных символов' };
      if (!unit) unit = { single: `символ "${token}"`, few: `символа "${token}"`, many: `символов "${token}"` };

      const { quantifier, nextIndex } = readQuantifier(source, i + 2);
      parts.push(quantify(unit, quantifier));
      i = nextIndex;
      continue;
    }

    if ('()|'.includes(ch)) {
      // Handle simple alternation group like (A|B|C) as human readable list.
      if (ch === '(') {
        const close = source.indexOf(')', i + 1);
        if (close !== -1) {
          const inside = source.slice(i + 1, close);
          if (/^[^()]+\|[^()]+$/.test(inside)) {
            parts.push(`одно из значений: ${inside.split('|').join(', ')}`);
            i = close + 1;
            continue;
          }
        }
      }
      return null;
    }

    const unit: RegexUnit = { single: `символ "${ch}"`, few: `символа "${ch}"`, many: `символов "${ch}"` };
    const { quantifier, nextIndex } = readQuantifier(source, i + 1);
    parts.push(quantify(unit, quantifier));
    i = nextIndex;
  }

  if (parts.length === 0) return null;
  return `Значение должно содержать последовательно: ${parts.join(', затем ')}`;
}

function describeRegexPattern(pattern: string, parameter: string): string {
  if (pattern === '^(NEW|ACTIVE|BLOCKED)$') {
    return 'Одно из значений: NEW, ACTIVE, BLOCKED';
  }

  if (isPinflPattern(pattern) || /pinfl/i.test(parameter)) {
    return 'Только 14 цифр, и значение не может состоять из одних нулей';
  }
  if (pattern === '^998[1-9]\\d{8}$') {
    return 'Телефон в формате 998XXXXXXXXX';
  }

  const formatLike = pattern.match(/(yyyy[-/.]mm[-/.]dd)/i);
  if (formatLike) return `Дата в формате ${formatLike[1].toLowerCase()}`;

  const sequence = describeRegexAsSequence(pattern);
  if (sequence) return sequence;

  // Fallback: keep it readable and avoid leaking raw regex to users.
  return 'Значение должно соответствовать согласованному формату';
}

function buildPatternCause(parameter: string, condition: string): string {
  const field = parameter.trim() || '<field>';
  const normalized = condition.toLowerCase();

  const enumMatch = condition.match(/^Одно из значений:\s*(.+)$/i);
  if (enumMatch) return `${field} must be one of: ${enumMatch[1]}`;

  const formatMatch = condition.match(/^Значение даты\/времени в формате:\s*(.+)$/i);
  if (formatMatch) return `${field} format must be "${formatMatch[1]}"`;

  if (normalized.includes('14 цифр') && normalized.includes('не может состоять из одних нулей')) {
    return `${field} must be 14 digits and all digits must not be 0`;
  }

  if (normalized.includes('телефон')) {
    return `${field} must be valid phone number`;
  }

  if (normalized.includes('дата') || normalized.includes('время')) {
    return `${field} has invalid date/time format`;
  }

  if (normalized.includes('только цифры')) {
    return `${field} must contain digits in expected format`;
  }

  if (normalized.includes('латинские буквы')) {
    return `${field} must contain latin letters in expected format`;
  }

  if (/(date|time|timestamp)/i.test(field)) {
    return `${field} has invalid date/time format`;
  }
  if (/(phone|mobile|tel)/i.test(field)) {
    return `${field} must be valid phone number`;
  }
  if (/(email|mail)/i.test(field)) {
    return `${field} must be valid email format`;
  }

  return `${field} has invalid format`;
}

function conditionForFormat(format: string): string {
  switch (format) {
    case 'date':
      return 'yyyy-mm-dd';
    case 'date-time':
      return 'yyyy-mm-ddThh:mm:ss';
    case 'time':
      return 'hh:mm:ss';
    case 'email':
      return 'email';
    case 'uuid':
      return 'uuid';
    case 'uri':
    case 'url':
      return 'url';
    default:
      return `format:${format}`;
  }
}

function conditionForSize(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined) return `min=${min}, max=${max}`;
  if (min !== undefined) return `min=${min}`;
  if (max !== undefined) return `max=${max}`;
  return '';
}

function formatConditionBrackets(value: string): string {
  return value.replace(/\[\s*([^\]]*?)\s*\]/g, (_match, inner: string) => {
    const normalizedInner = inner.trim();
    if (!normalizedInner) return '[]';
    return `( ${normalizedInner} )`;
  });
}

function addRule(
  rules: ValidationRuleRow[],
  dedupe: Set<string>,
  parameter: string,
  schemaType: string,
  validationCase: string,
  condition: string,
  options?: RuleOptions
): void {
  const normalizedParameter = normalizeArrayFieldPath(parameter.trim());
  if (!normalizedParameter) return;

  const normalizedCondition = formatConditionBrackets(condition.trim());
  const dedupeKey = `${normalizedParameter.toLowerCase()}|${validationCase}|${normalizedCondition.toLowerCase()}`;
  if (dedupe.has(dedupeKey)) return;
  dedupe.add(dedupeKey);

  const causeSource = validationCase === 'Pattern'
    ? buildPatternCause(normalizedParameter, normalizedCondition)
    : buildValidationCause({
      parameter: normalizedParameter,
      validationCase,
      condition: options?.causeCondition ?? normalizedCondition,
      parameterType: normalizeCauseType(schemaType)
    });
  const cause = normalizeArrayFieldPath(causeSource);

  rules.push({
    parameter: normalizedParameter,
    validationCase,
    condition: normalizedCondition,
    cause
  });
}

function addRequiredRule(rules: ValidationRuleRow[], dedupe: Set<string>, parameter: string, schemaType: string): void {
  if (schemaType === 'string') {
    addRule(rules, dedupe, parameter, schemaType, 'NotBlank', 'Значение не должно быть null или пустым.');
    return;
  }
  if (schemaType === 'array') {
    addRule(rules, dedupe, parameter, schemaType, 'NotEmpty', 'Значение не должно быть пустым.');
    return;
  }
  addRule(rules, dedupe, parameter, schemaType, 'NotNull', 'Значение не должно быть null.');
}

function collectRules(schema: JsonSchema, path: string, isRequired: boolean, rules: ValidationRuleRow[], dedupe: Set<string>): void {
  const merged = mergeCompositeSchema(schema);
  const schemaType = resolveSchemaType(merged);

  if (isRequired) {
    addRequiredRule(rules, dedupe, path, schemaType);
  }

  if (Array.isArray(merged.enum) && merged.enum.length > 0) {
    const values = merged.enum.map((value) => stringifyEnumValue(value));
    const regex = `^(${values.join('|')})$`;
    addRule(rules, dedupe, path, schemaType, 'Pattern', `Одно из значений: ${values.join(', ')}`, { causeCondition: regex });
  }

  if (schemaType === 'string') {
    if (merged.minLength !== undefined || merged.maxLength !== undefined) {
      addRule(rules, dedupe, path, schemaType, 'Size', conditionForSize(merged.minLength, merged.maxLength));
    }

    if (merged.format) {
      const formatCondition = conditionForFormat(merged.format);
      addRule(rules, dedupe, path, schemaType, 'Pattern', `Значение даты/времени в формате: ${formatCondition}`, { causeCondition: formatCondition });
    }

    if (merged.pattern) {
      const digitsLimit = merged.pattern.match(/^\^\\d\{1,(\d+)\}\$$/);
      if (digitsLimit) {
        addRule(rules, dedupe, path, schemaType, 'Digits', `integer=${digitsLimit[1]}`);
      } else {
        const readablePatternCondition = describeRegexPattern(merged.pattern, path);
        addRule(rules, dedupe, path, schemaType, 'Pattern', readablePatternCondition, { causeCondition: readablePatternCondition });
      }
    }
  }

  if (schemaType === 'integer' || schemaType === 'number') {
    const min = merged.minimum ?? merged.exclusiveMinimum;
    const max = merged.maximum ?? merged.exclusiveMaximum;

    if (min !== undefined || max !== undefined) {
      addRule(rules, dedupe, path, schemaType, 'Size', conditionForSize(min, max));
    }

    if (merged.minimum !== undefined && merged.minimum > 0 && merged.maximum === undefined) {
      addRule(rules, dedupe, path, schemaType, 'Positive', 'Значение должно быть положительным числом.');
    }

    if (merged.maximum !== undefined && merged.maximum < 0 && merged.minimum === undefined) {
      addRule(rules, dedupe, path, schemaType, 'Negative', 'Значение должно быть негативным числом.');
    }
  }

  if (schemaType === 'array') {
    if (merged.minItems !== undefined || merged.maxItems !== undefined) {
      addRule(rules, dedupe, path, schemaType, 'Size', conditionForSize(merged.minItems, merged.maxItems));
    }

    if (merged.items) {
      const itemPath = path ? `${path}[0]` : '[0]';
      collectRules(merged.items, itemPath, false, rules, dedupe);
    }
  }

  if (schemaType === 'object') {
    const requiredProps = new Set(merged.required ?? []);
    const properties = merged.properties ?? {};
    for (const [key, nested] of Object.entries(properties)) {
      const nestedPath = path ? `${path}.${key}` : key;
      collectRules(nested, nestedPath, requiredProps.has(key), rules, dedupe);
    }
  }
}

export function buildValidationRulesFromSchemaInput(input: string): ValidationRuleRow[] {
  const parsed = JSON.parse(input) as JsonSchema;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON Schema должен быть объектом');
  }

  const rules: ValidationRuleRow[] = [];
  const dedupe = new Set<string>();
  collectRules(parsed, '', false, rules, dedupe);

  // Keep validations for the same parameter as contiguous block.
  const grouped = new Map<string, ValidationRuleRow[]>();
  for (const row of rules) {
    const key = row.parameter.trim();
    if (!key) continue;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }

  return Array.from(grouped.values()).flat();
}

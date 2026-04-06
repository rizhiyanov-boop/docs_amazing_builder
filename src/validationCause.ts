type ValidationCauseInput = {
  parameter: string;
  validationCase: string;
  condition: string;
  parameterType?: string;
};

function normalizeCase(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-zа-я0-9]+/g, ' ').trim();
}

function parseMinMax(condition: string): { min?: number; max?: number } {
  const minMatch = condition.match(/min\s*=\s*(\d+)/i);
  const maxMatch = condition.match(/max\s*=\s*(\d+)/i);
  return {
    min: minMatch ? Number(minMatch[1]) : undefined,
    max: maxMatch ? Number(maxMatch[1]) : undefined
  };
}

function parseExactValue(condition: string): number | undefined {
  const exactMatch = condition.match(/(?:точн\w*\s*длин\w*|exact(?:ly)?\s*length)\D*(\d+)/i);
  if (exactMatch) return Number(exactMatch[1]);

  const standaloneNumber = condition.trim().match(/^(\d+)$/);
  if (standaloneNumber) return Number(standaloneNumber[1]);
  return undefined;
}

function containsAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function buildSizeCause(field: string, condition: string, isNumericType: boolean): string {
  const exact = parseExactValue(condition);
  if (exact !== undefined) {
    return isNumericType
      ? `${field} must contain exactly ${exact} characters (digits)`
      : `${field} must be ${exact} characters long`;
  }

  const { min, max } = parseMinMax(condition);
  if (min !== undefined && max !== undefined) {
    return isNumericType
      ? `${field} value must be between ${min} and ${max}`
      : `${field} length must be between ${min} and ${max}`;
  }
  if (min !== undefined) {
    return isNumericType
      ? `${field} value must be min ${min}`
      : `${field} length must be at least ${min}`;
  }
  if (max !== undefined) {
    return isNumericType
      ? `${field} value must be max ${max}`
      : `${field} length must be at most ${max}`;
  }

  return isNumericType
    ? `${field} value is out of allowed range`
    : `${field} length is out of allowed range`;
}

function buildPatternCause(field: string, condition: string): string {
  const normalizedCondition = condition.replaceAll('\r\n', '\n');

  if (normalizedCondition.includes('^(NEW|ACTIVE|BLOCKED)$')) {
    return `${field} must be one of: NEW, ACTIVE, BLOCKED`;
  }
  if (normalizedCondition.includes('^(?!0{14})\\d{14}$')) {
    return `${field} must be 14 digits and all digits must not be 0`;
  }
  if (normalizedCondition.includes('^998[1-9]\\d{8}$')) {
    return `${field} must be valid phone number`;
  }

  const formatMatch = condition.match(/(yyyy[-/.]mm[-/.]dd)/i);
  if (formatMatch) {
    return `${field} format must be "${formatMatch[1].toLowerCase()}"`;
  }

  const regexLine = normalizedCondition
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('^') && line.endsWith('$'));

  if (regexLine) {
    return `${field} must match pattern ${regexLine}`;
  }

  return `${field} format is invalid`;
}

function buildDateCustomCause(field: string, condition: string): string {
  const date = condition.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (date) return `${field} must be after "${date}"`;
  return `${field} must satisfy custom date rule`;
}

export function buildValidationCause(input: ValidationCauseInput): string {
  const field = input.parameter.trim() || '<field>';
  const validationCase = normalizeCase(input.validationCase);
  const condition = input.condition.trim();
  const normalizedType = input.parameterType?.trim().toLowerCase() ?? '';
  const isStringType = normalizedType === 'string';
  const isNumericType = ['int', 'long', 'double', 'float', 'number', 'decimal', 'short', 'byte'].includes(normalizedType);
  const isListType = normalizedType.startsWith('array') || normalizedType === 'list';

  if (containsAny(validationCase, ['notnull', 'обязатель', 'must not be null'])) {
    return `${field} must not be null`;
  }
  if (containsAny(validationCase, ['notblank', 'не должно быть пустым', 'must not be blank'])) {
    return `${field} must not be blank`;
  }
  if (containsAny(validationCase, ['notempty', 'не должно быть пустым', 'must not be empty']) && !isStringType) {
    return `${field} must not be empty`;
  }
  if (containsAny(validationCase, ['size', 'длина строки', 'числовое значение вне допустимого диапазона'])) {
    return buildSizeCause(field, condition, isNumericType);
  }
  if (containsAny(validationCase, ['positive'])) {
    return `${field} must be a positive number`;
  }
  if (containsAny(validationCase, ['negative'])) {
    return `${field} must be a negative number`;
  }
  if (containsAny(validationCase, ['pastorpresent'])) {
    return `${field} must be in the past or present`;
  }
  if (containsAny(validationCase, ['futureorpresent'])) {
    return `${field} must be in the future or present`;
  }
  if (containsAny(validationCase, ['past', 'предыдущ'])) {
    return `${field} must be in the past`;
  }
  if (containsAny(validationCase, ['future', 'будущ'])) {
    return `${field} must be in the future`;
  }
  if (containsAny(validationCase, ['custom', 'кастом'])) {
    return buildDateCustomCause(field, condition);
  }
  if (containsAny(validationCase, ['pattern', 'regex', 'формат'])) {
    return buildPatternCause(field, condition);
  }
  if (containsAny(validationCase, ['digits'])) {
    const integerLimit = condition.match(/integer\s*=\s*(\d+)/i)?.[1];
    if (integerLimit) return `${field} value must contain no more than ${integerLimit} digits`;
    return `${field} has invalid digits count`;
  }

  if (containsAny(validationCase, ['значение не входит в допустимый список', 'one of'])) {
    if (condition) return `${field} must be one of: ${condition}`;
    return `${field} must be one of allowed values`;
  }
  if (containsAny(validationCase, ['некорректный тип данных'])) {
    if (normalizedType) return `${field} must be a valid ${normalizedType}`;
    return `${field} has invalid data type`;
  }
  if (containsAny(validationCase, ['отсутствует обязательное поле'])) {
    return `${field} must not be null`;
  }
  if (containsAny(validationCase, ['поле не должно быть пустым'])) {
    if (isListType) return `${field} must not be empty`;
    return isStringType ? `${field} must not be blank` : `${field} must not be empty`;
  }

  return condition ? `${field}: ${condition}` : `${field} failed validation`;
}

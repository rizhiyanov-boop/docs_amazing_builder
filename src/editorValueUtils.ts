import type { ParseFormat, ParsedRow } from './types';

export const STRUCTURED_EXAMPLE_PLACEHOLDER = '-';

export function usesStructuredPlaceholder(type: string): boolean {
  return ['object', 'array', 'array_object'].includes(type);
}

function escapeCodeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function wrapCodeToken(kind: string, value: string): string {
  return `<span class="code-token ${kind}">${escapeCodeHtml(value)}</span>`;
}

function highlightJsonCode(value: string): string {
  let index = 0;
  let result = '';

  while (index < value.length) {
    const char = value[index];

    if (char === '"') {
      let end = index + 1;
      let escaped = false;
      while (end < value.length) {
        const current = value[end];
        if (current === '"' && !escaped) break;
        escaped = current === '\\' && !escaped;
        if (current !== '\\') escaped = false;
        end += 1;
      }

      const token = value.slice(index, Math.min(end + 1, value.length));
      let lookahead = end + 1;
      while (lookahead < value.length && /\s/.test(value[lookahead])) lookahead += 1;
      const kind = value[lookahead] === ':' ? 'code-key' : 'code-string';
      result += wrapCodeToken(kind, token);
      index = Math.min(end + 1, value.length);
      continue;
    }

    if ('{}[]:,'.includes(char)) {
      result += wrapCodeToken('code-punctuation', char);
      index += 1;
      continue;
    }

    const literalMatch = value.slice(index).match(/^(true|false|null)\b/);
    if (literalMatch) {
      const token = literalMatch[1];
      const kind = token === 'null' ? 'code-null' : 'code-boolean';
      result += wrapCodeToken(kind, token);
      index += token.length;
      continue;
    }

    const numberMatch = value.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (numberMatch) {
      const token = numberMatch[0];
      result += wrapCodeToken('code-number', token);
      index += token.length;
      continue;
    }

    result += escapeCodeHtml(char);
    index += 1;
  }

  return result;
}

function highlightCurlCode(value: string): string {
  return escapeCodeHtml(value)
    .replace(/\b(curl)\b/g, '<span class="code-token code-keyword">$1</span>')
    .replace(/(^|\s)(--?[A-Za-z-]+)/g, '$1<span class="code-token code-flag">$2</span>')
    .replace(/(&quot;https?:\/\/.*?&quot;)/g, '<span class="code-token code-url">$1</span>')
    .replace(/(&quot;.*?&quot;|'.*?')/g, '<span class="code-token code-string">$1</span>');
}

export function highlightCode(format: ParseFormat, value: string): string {
  if (format === 'json') return highlightJsonCode(value);
  return highlightCurlCode(value);
}

export function getDuplicateValueSet(rows: ParsedRow[]): Set<string> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const value = row.field.trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([value]) => value)
  );
}

function typeRequiresJsonExample(type: string): boolean {
  return [
    'object',
    'map',
    'array',
    'array_object',
    'array_string',
    'array_int',
    'array_long',
    'array_number',
    'array_boolean',
    'array_array',
    'array_null'
  ].includes(type);
}

export function validateExampleValue(example: string, type: string): string {
  const trimmed = example.trim();
  if (!trimmed) return '';
  if (usesStructuredPlaceholder(type) && trimmed === STRUCTURED_EXAMPLE_PLACEHOLDER) return '';

  const looksLikeJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
  const mustBeJson = typeRequiresJsonExample(type) || looksLikeJson;

  if (!mustBeJson) return '';

  try {
    const parsed = JSON.parse(trimmed);
    if (type.startsWith('array') && !Array.isArray(parsed)) {
      return 'Для выбранного типа пример должен быть JSON-массивом';
    }
    if ((type === 'object' || type === 'map' || type === 'array_object') && (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object')) {
      return 'Для выбранного типа пример должен быть JSON-объектом';
    }
    return '';
  } catch {
    return 'Пример должен быть валидным JSON';
  }
}

export function validateJsonDraft(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const startsLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  const endsLikeJson = trimmed.endsWith('}') || trimmed.endsWith(']');
  if (!startsLikeJson && !endsLikeJson) return '';

  try {
    JSON.parse(trimmed);
    return '';
  } catch {
    return 'Client Response похож на JSON, но содержит ошибку синтаксиса';
  }
}

export function getDynamicTextareaRows(value: string, minRows = 1, maxRows = 8): number {
  const normalized = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const lines = normalized.split('\n');
  const wrappedLineEstimate = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 56)), 0);
  return Math.max(minRows, Math.min(maxRows, wrappedLineEstimate));
}

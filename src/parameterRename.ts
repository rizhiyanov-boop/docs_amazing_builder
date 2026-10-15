import { getParsedRowKey } from './requestHeaders';
import type { ParseFormat, ParsedRow, ParsedSection } from './types';

export type ParameterName = {
  prefix: string;
  name: string;
  suffix: string;
  structured: boolean;
  editable: boolean;
  reason?: string;
  ambiguous?: boolean;
};

export type ParameterRenameContext = {
  rows: ParsedRow[];
  format: ParseFormat;
  names: Map<string, ParameterName>;
};

type RenameResult = { ok: true; rows: ParsedRow[]; changedCount: number; descendantCount: number }
  | { ok: false; error: string };

const CONTAINERS = new Set(['object', 'map', 'array', 'array_object']);
const bucket = (row: ParsedRow): string => ['header', 'query', 'url'].includes(row.source ?? '') ? row.source! : 'body';
const isBelow = (path: string, parent: string): boolean => path.startsWith(`${parent}.`) || path.startsWith(`${parent}[`);

// The persisted flattening format cannot distinguish a literal dotted property
// from a nested path. Do not guess a hierarchy for such source names.
function ambiguousNames(input: string, schemaInput: string, format: ParseFormat): Set<string> {
  const names = new Set<string>();
  const collect = (value: unknown, schema: boolean): void => {
    const pending: unknown[] = [value];
    while (pending.length) {
      const item = pending.pop();
      if (!item || typeof item !== 'object') continue;
      if (Array.isArray(item)) { pending.push(...item); continue; }
      for (const [key, child] of Object.entries(item)) {
        if (!schema && (/[.[\]]/.test(key) || key === '$')) names.add(key);
        if (schema && key === 'properties' && child && typeof child === 'object') {
          for (const property of Object.keys(child)) if (/[.[\]]/.test(property) || property === '$') names.add(property);
        }
        pending.push(child);
      }
    }
  };
  if (format !== 'xml') {
    const body = format === 'curl' ? input.replace(/\\\r?\n/g, ' ').match(/(?:--data-raw|--data|-d)\s+(['"])([\s\S]*?)\1/)?.[2] ?? '' : input;
    for (const [text, schema] of [[body, false], [schemaInput, true]] as const) {
      try { collect(JSON.parse(text), schema); } catch { /* A cURL/manual table may have no JSON source. */ }
    }
  } else if (typeof DOMParser !== 'undefined') {
    for (const text of [input, schemaInput]) {
      if (!text.trim().startsWith('<')) continue;
      const document = new DOMParser().parseFromString(text, 'application/xml');
      for (const element of document.querySelectorAll('*')) {
        const candidates = [element.nodeName, element.getAttribute('name') ?? '', ...Array.from(element.attributes, a => a.name)];
        for (const name of candidates) if (/[.[\]]/.test(name)) names.add(name);
      }
    }
  }
  return names;
}

export function createParameterRenameContext(section: ParsedSection, target: 'server' | 'client'): ParameterRenameContext {
  const rows = target === 'client' ? section.clientRows ?? [] : section.rows;
  const format = target === 'client' ? section.clientFormat ?? section.format : section.format;
  const input = target === 'client' ? section.clientInput ?? '' : section.input;
  const schema = target === 'client' ? section.clientSchemaInput ?? '' : section.schemaInput ?? '';
  const ambiguous = ambiguousNames(input, schema, format);
  const names = new Map<string, ParameterName>();
  const keyCounts = new Map<string, number>();
  for (const row of rows) keyCounts.set(getParsedRowKey(row), (keyCounts.get(getParsedRowKey(row)) ?? 0) + 1);
  for (const row of rows) {
    const field = row.field.trim();
    const key = getParsedRowKey(row);
    const structured = bucket(row) === 'body';
    let info: ParameterName = { prefix: '', name: field, suffix: '', structured, editable: Boolean(field) };
    if (structured) {
      const split = field.lastIndexOf('.') + 1;
      const segment = field.slice(split);
      info = { ...info, prefix: field.slice(0, split), name: segment };
      if (format === 'xml') {
        const marker = segment.startsWith('@') ? '@' : '';
        const namespace = segment.slice(marker.length).lastIndexOf(':') + 1;
        info.prefix += segment.slice(0, marker.length + namespace);
        info.name = segment.slice(marker.length + namespace);
      }
      if (field === '$' || /\]$/.test(field) || info.name === '#text' || !info.name) {
        info = { ...info, editable: false, reason: 'У этого структурного узла нет отдельного имени для переименования.' };
      }
      const source = row.sourceField || field;
      if (Array.from(ambiguous).some(name => source.includes(name)) || /\.\.|^\.|\.$/.test(field)) {
        info = { ...info, editable: false, ambiguous: true, reason: 'Структура этого пути неоднозначна. Переименование недоступно.' };
      }
    }
    if ((keyCounts.get(key) ?? 0) > 1) info = { ...info, editable: false, ambiguous: true, reason: 'В таблице повторяется исходный ключ. Сначала устраните дубликат в исходнике.' };
    names.set(key, info);
  }
  return { rows, format, names };
}

export function renameParameter(context: ParameterRenameContext, rowKey: string, draft: string): RenameResult {
  const row = context.rows.find(item => getParsedRowKey(item) === rowKey);
  const info = context.names.get(rowKey);
  if (!row || !info) return { ok: false, error: 'Параметр больше не существует. Откройте поле заново.' };
  if (!info.editable) return { ok: false, error: info.reason || 'Переименование недоступно.' };
  const name = draft.trim();
  if (!name) return { ok: false, error: 'Введите имя параметра.' };
  if (info.structured && (/[.[\]]/.test(name) || name === '$')) return { ok: false, error: 'Введите только имя: путь и структурные маркеры здесь не меняются.' };
  if (info.structured && context.format === 'xml' && !/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(name)) {
    return { ok: false, error: 'Введите корректное имя XML-узла без префикса пространства имён.' };
  }
  const nextField = info.prefix + name + info.suffix;
  const affected = new Set(context.rows.filter(item => item === row || (
    info.structured && CONTAINERS.has(row.type) && bucket(item) === bucket(row) && isBelow(item.field, row.field)
  )));
  if (Array.from(affected).some(item => context.names.get(getParsedRowKey(item))?.ambiguous)) {
    return { ok: false, error: 'Среди вложенных полей есть неоднозначный путь. Переименование не применено.' };
  }
  const affectedFields = new Set(Array.from(affected, item => `${bucket(item)}\u0000${nextField + item.field.slice(row.field.length)}`));
  const fields = new Set<string>();
  for (const item of context.rows) {
    const field = affected.has(item) ? nextField + item.field.slice(row.field.length) : item.field;
    const identity = `${bucket(item)}\u0000${field}`;
    // Existing unrelated duplicate rows do not prevent editing another branch.
    if (fields.has(identity) && affectedFields.has(identity)) {
      return { ok: false, error: 'Имя уже занято на этом уровне. Выберите другое имя.' };
    }
    fields.add(identity);
  }
  const descendantCount = affected.size - 1;
  if (nextField === row.field) return { ok: true, rows: context.rows, changedCount: 0, descendantCount };
  const rows = context.rows.map(item => affected.has(item) ? {
    ...item,
    // Keep mapping addresses stable even for old/manual rows without a source key.
    sourceField: item.sourceField || item.field,
    field: nextField + item.field.slice(row.field.length)
  } : item);
  return { ok: true, rows, changedCount: affected.size, descendantCount };
}

export function mappingsAfterSourceSync(section: ParsedSection, target: 'server' | 'client'): Record<string, string> | undefined {
  if (!section.clientMappings) return section.clientMappings;
  const rows = target === 'client' ? section.clientRows ?? [] : section.rows;
  const keys = new Map(rows.map(row => [getParsedRowKey(row), row.origin === 'generated' ? getParsedRowKey(row) : row.field]));
  return Object.fromEntries(Object.entries(section.clientMappings).map(([server, client]) => target === 'server'
    ? [keys.get(server) ?? server, client] : [server, keys.get(client) ?? client]));
}

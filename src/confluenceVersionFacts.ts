export const CONFLUENCE_VERSION_NOTE_LIMIT = 255;

export const confluenceVersionSections = [
  'постановка задачи', 'общая информация', 'функциональные требования', 'нефункциональные требования',
  'Request', 'Response', 'ошибки', 'диаграммы', 'дополнительные материалы'
] as const;
export type ConfluenceVersionSection = typeof confluenceVersionSections[number];

const countedKinds = [
  'fields-added', 'fields-removed', 'types-changed', 'required-changed', 'validations-changed',
  'mappings-changed', 'masking-changed', 'descriptions-changed', 'comments-changed', 'statuses-changed',
  'tables-added', 'tables-removed', 'tables-moved'
] as const;
export type CountedConfluenceChange = typeof countedKinds[number];

export type ConfluenceVersionFact = { kind: 'migration' | 'title-changed' }
  | { kind: 'section-changed'; section: ConfluenceVersionSection }
  | { kind: CountedConfluenceChange; section: ConfluenceVersionSection; count: number };

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** Reject free text and unknown fields before they can reach the external model. */
export function validateConfluenceVersionFacts(input: unknown): ConfluenceVersionFact[] {
  if (!record(input) || Object.keys(input).length !== 1 || !Array.isArray(input.facts)
    || !input.facts.length || input.facts.length > 64) throw new Error('Нужен список распознанных изменений');
  const seen = new Set<string>();
  return input.facts.map((fact: unknown): ConfluenceVersionFact => {
    if (record(fact) && typeof fact.kind === 'string' && (fact.section === undefined || typeof fact.section === 'string')) {
      const { kind, section, count } = fact;
      const key = JSON.stringify([kind, section]);
      const fields = Object.keys(fact).length;
      if (!seen.has(key)) {
        seen.add(key);
        if (fields === 1 && (kind === 'migration' || kind === 'title-changed')) return { kind };
        if (confluenceVersionSections.some(value => value === section)) {
          const label = section as ConfluenceVersionSection;
          if (fields === 2 && kind === 'section-changed') return { kind, section: label };
          const counted = countedKinds.find(value => value === kind);
          const contract = label === 'Request' || label === 'Response';
          const supported = counted === 'statuses-changed' ? label === 'ошибки'
            : counted?.startsWith('tables-') || contract;
          if (fields === 3 && counted && supported && typeof count === 'number' && Number.isSafeInteger(count)
            && count >= 1 && count <= 10_000) return { kind: counted, section: label, count };
        }
      }
    }
    throw new Error('Комментарий принимает только типы изменений, стандартные разделы и количества');
  });
}

function plural(count: number, one: string, few: string, many: string) {
  const last = count % 10;
  return count % 100 >= 11 && count % 100 <= 14 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many;
}

function describeChange(fact: Extract<ConfluenceVersionFact, { section: string }>): string {
  if (fact.kind === 'section-changed') return 'изменено содержимое';
  const { count } = fact;
  const fields = plural(count, 'поле', 'поля', 'полей');
  const inFields = `у ${count} ${plural(count, 'поля', 'полей', 'полей')}`;
  const tables = plural(count, 'таблица', 'таблицы', 'таблиц');
  const changes: Record<CountedConfluenceChange, string> = {
    'fields-added': `добавлено ${count} ${fields}`,
    'fields-removed': `удалено ${count} ${fields}`,
    'types-changed': `изменён тип ${inFields}`,
    'required-changed': `изменена обязательность ${inFields}`,
    'validations-changed': `изменена валидация ${inFields}`,
    'mappings-changed': `изменён маппинг ${inFields}`,
    'masking-changed': `изменено маскирование ${inFields}`,
    'descriptions-changed': `изменено описание ${inFields}`,
    'comments-changed': `изменены комментарии ${inFields}`,
    'statuses-changed': `изменён HTTP-статус в ${count} ${plural(count, 'строке', 'строках', 'строках')}`,
    'tables-added': `${tables === 'таблица' ? 'добавлена' : 'добавлено'} ${count} ${tables}`,
    'tables-removed': `${tables === 'таблица' ? 'удалена' : 'удалено'} ${count} ${tables}`,
    'tables-moved': `${tables === 'таблица' ? 'перенесена' : 'перенесено'} ${count} ${tables}`
  };
  return changes[fact.kind];
}

/** The model chooses emphasis. Render only facts from the validated input. */
export function renderConfluenceAiNote(output: unknown, facts: ConfluenceVersionFact[]): string {
  if (!record(output) || Object.keys(output).length !== 1 || !Array.isArray(output.selected)
    || !output.selected.length || output.selected.length > 4 || new Set(output.selected).size !== output.selected.length
    || !output.selected.every(index => Number.isInteger(index) && index >= 0 && index < facts.length)) {
    throw new Error('ИИ не смог выбрать изменения для комментария');
  }
  const clauses = new Map<string, string[]>();
  const sentences = facts.some(fact => fact.kind === 'migration') ? ['Переход на шаблон DocBuilder'] : [];
  for (const index of output.selected) {
    const fact = facts[index];
    if (fact.kind === 'title-changed') sentences.push('Изменён заголовок');
    if ('section' in fact) clauses.set(fact.section, [...(clauses.get(fact.section) ?? []), describeChange(fact)]);
  }
  for (const [section, items] of clauses) {
    const prefix = `В разделе «${section[0].toUpperCase()}${section.slice(1)}» `;
    let line = prefix + items[0];
    if ([...sentences, line].join('. ').length > CONFLUENCE_VERSION_NOTE_LIMIT) continue;
    for (const item of items.slice(1)) {
      const next = line + ', ' + item;
      if ([...sentences, next].join('. ').length > CONFLUENCE_VERSION_NOTE_LIMIT) break;
      line = next;
    }
    sentences.push(line);
  }
  return sentences.join('. ');
}

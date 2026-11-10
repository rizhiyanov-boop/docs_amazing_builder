import { describe, expect, it } from 'vitest';
import { collectConfluenceVersionFacts, suggestConfluenceVersionNote } from './confluenceVersionNote';

const table = (title: string, headers: string[], rows: string[][]) =>
  `<h2>${title}</h2><table><tbody><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr>`
  + rows.map(row => `<tr>${row.map(value => `<td>${value}</td>`).join('')}</tr>`).join('') + '</tbody></table>';

describe('local Confluence version facts', () => {
  it('compares contract rows despite column order and aliases, returning no source text or values', () => {
    const before = { title: 'Internal name', storage:
      table('Входные параметры', ['Server Request', 'Обизательность', 'Тип', 'Описание', 'Client Request (downstream)', 'Маск.'], [
        ['personal.secretId', 'нет', 'String', 'PRIVATE DESCRIPTION', 'client.token', '+'],
        ['oldField', '+', 'int', '-', '-', '-']
      ]) + table('Ошибки', ['Полный internalCode', 'Client HTTP Status', 'Server HTTP code'], [['PRIVATE_CODE', '400', '123456']]) };
    const after = { title: 'Other internal name', storage:
      table('Request', ['Тип', 'Поле', 'Обяз.', 'Описание', 'Маскирование в логах', 'Client Request'], [
        ['string', 'personal.secretId', '+', 'OTHER PRIVATE DESCRIPTION', 'true', 'client.newToken'],
        ['bool', 'newField', '+', '-', '-', '-'], ['date', 'anotherField', '+', '-', '-', '-']
      ]) + table('Обработка ошибок', ['Server HTTP code', 'Client HTTP Status', 'internalCode'], [['999999', '422', 'PRIVATE_CODE']]) };

    expect(collectConfluenceVersionFacts(before, after, true)).toEqual([
      { kind: 'migration' }, { kind: 'title-changed' },
      { kind: 'fields-added', section: 'Request', count: 2 },
      { kind: 'fields-removed', section: 'Request', count: 1 },
      { kind: 'required-changed', section: 'Request', count: 1 },
      { kind: 'descriptions-changed', section: 'Request', count: 1 },
      { kind: 'mappings-changed', section: 'Request', count: 1 },
      { kind: 'statuses-changed', section: 'ошибки', count: 1 }
    ]);
  });

  it('falls back to a section fact for ambiguous rows and ignores version-history changes', () => {
    const before = { title: 'Method', storage: table('Response', ['Server Response', 'Тип'], [['data.id', 'string'], ['data.id', 'int']])
      + '<h2>История изменений</h2><p>Old</p>' };
    const after = { title: before.title, storage: table('Response', ['Server Response', 'Тип'], [['data.id', 'int']])
      + '<h2>История изменений</h2><p>New</p>' };
    expect(collectConfluenceVersionFacts(before, after, false)).toEqual([{ kind: 'section-changed', section: 'Response' }]);
    expect(suggestConfluenceVersionNote(before, after, false)).toBe('Изменены разделы: Response');
    expect(collectConfluenceVersionFacts(after, after, false)).toEqual([]);
  });

  it('does not interpret the ambiguous Server HTTP code column as a status', () => {
    const before = { title: 'Method', storage: table('Ошибки', ['Полный internalCode', 'Server HTTP code'], [['privateCode', '404']]) };
    const after = { title: before.title, storage: before.storage.replace('404', '503') };
    expect(collectConfluenceVersionFacts(before, after, false)).toEqual([{ kind: 'section-changed', section: 'ошибки' }]);
  });

  it('counts comments attached to known fields without sending their text', () => {
    const before = { title: 'Method', storage: table('Response', ['Server Response', 'Тип'], [['data.id', 'string']]) };
    const after = { title: before.title, storage: table('Response', ['Server Response', 'Тип', 'Комментарий'], [
      ['data.id', 'string', 'PRIVATE COMMENT']
    ]) };
    expect(collectConfluenceVersionFacts(before, after, false)).toEqual([{ kind: 'comments-changed', section: 'Response', count: 1 }]);
  });

  it('identifies a uniquely matched table moved to a different standard section', () => {
    const before = { title: 'Method', storage: table('Функциональные требования', ['Параметр'], [['PRIVATE CONTENT']]) };
    const after = { title: before.title, storage: before.storage.replace('Функциональные требования', 'Общая информация') };
    const facts = collectConfluenceVersionFacts(before, after, false);
    expect(facts).toContainEqual({ kind: 'tables-moved', section: 'общая информация', count: 1 });
    expect(facts.some(fact => fact.kind === 'tables-added' || fact.kind === 'tables-removed')).toBe(false);
  });
});

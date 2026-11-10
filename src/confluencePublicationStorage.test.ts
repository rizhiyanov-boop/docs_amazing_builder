import { describe, expect, it } from 'vitest';
import { buildConfluenceImport, prepareConfluenceImport } from './confluenceImport';
import { parseStorageDocument } from './confluenceImportStorage';
import { restoreConfluencePublication } from './confluencePublicationStorage';
import { importTestOrigin, templateImportPage } from './test/confluenceImportFixtures';
import { normalizeMethodDocument } from './workspaceBootstrap';

const table = (rows: string) => '<table><tbody>' + rows + '</tbody></table>';
const row = (...cells: string[]) => '<tr>' + cells.map(cell => '<td>' + cell + '</td>').join('') + '</tr>';
const heading = (title: string) => '<h2>' + title + '</h2>';
const attachment = '<ac:structured-macro ac:name="view-file"><ac:parameter ac:name="name">'
  + '<ri:attachment ri:filename="Contract v2.docx"/></ac:parameter></ac:structured-macro>';
const jira = '<ac:structured-macro ac:name="jira"><ac:parameter ac:name="key">TEST-10</ac:parameter></ac:structured-macro>';

const source = templateImportPage();
source.storage = source.storage!
  .replace('<td>TEST-10</td>', '<td>' + jira + '</td>')
  .replace('<h3>Response</h3>', heading('Документы по задаче') + table(row(attachment, 'Контракт')) + '<h3>Response</h3>')
  .replace('<th>Server Response</th>', '<th></th><th>Server Response</th>')
  .replace('<th>Client Response (Сервис B)</th>', '<th>Client Response (Сервис B)</th><th>Комментарий</th>')
  .replace('<td>data.result</td>', '<td>1</td><td>data.result</td>')
  .replace('<td>result</td>', '<td>result</td><td>Уточнение ответа</td>')
  .replace('<th>Server HTTP status</th>', '<th>Server HTTP code</th>')
  .replace('<td>400</td><td>999999</td>', '<td>600301</td><td></td>');

const canonical = heading('История изменений') + table(row('v.1', 'Создание документа'))
  + heading('Постановка задачи') + table(row('Epic', 'TEST-1') + row('Цель', 'Обновлённая цель') + row('Инициаторы', 'Сервис A'))
  + heading('Общая информация') + table(row('Метод', 'POST /api/edited') + row('Внешний URL', '-'))
  + table('<tr><th>Ссылка</th><th>Описание</th></tr>' + row('-', '-'))
  + heading('Response') + table('<tr><th>Server Response</th><th>Client Response</th></tr>' + row('data.result', 'result'))
  + ['Из Confluence: История изменений', 'Из Confluence: Постановка задачи', 'Из Confluence: Общая информация',
    'Документы по задаче', 'Response: примечания к таблице', 'Ошибки: исходные значения'].map(title => heading(title) + '<p>Текстовое представление</p>').join('');

function importedMethod() {
  const preview = prepareConfluenceImport(source, importTestOrigin);
  if (!preview.ok) throw new Error(preview.reasons.join(', '));
  const method = normalizeMethodDocument(buildConfluenceImport(preview, {}));
  method.sections = method.sections.map(section => section.kind === 'text' && section.id === 'goal'
    ? { ...section, value: 'Обновлённая цель' } : section);
  return method;
}

describe('Confluence import publication storage', () => {
  it('restores tables, comments, Jira and a source attachment link in a copy without duplicating metadata', () => {
    const storage = restoreConfluencePublication(importedMethod(), canonical, source, '999');
    const doc = parseStorageDocument(storage, new DOMParser());
    expect(storage).not.toContain('Из Confluence:');
    expect(storage).not.toContain('Создание документа');
    expect(storage).not.toContain('<th>Ссылка</th>');
    expect(storage).toContain('Обновлённая цель');
    expect(storage).toContain('POST /api/edited');
    expect(doc.querySelector('a')?.getAttribute('href')).toBe(importTestOrigin + '/download/attachments/901/Contract%20v2.docx');
    expect(storage).toContain('ac:name="jira"');
    expect(doc.querySelector('h2:nth-of-type(4)')?.textContent).toBe('Документы по задаче');
    const response = Array.from(doc.querySelectorAll('h2')).find(h => h.textContent === 'Response');
    expect(response?.nextElementSibling?.textContent).toContain('Комментарийdata.resultresultУточнение ответа');
    const errors = Array.from(doc.querySelectorAll('h2')).find(h => h.textContent === 'Ошибки');
    expect(errors?.nextElementSibling?.textContent).toContain('Server HTTP code');
    expect(errors?.nextElementSibling?.textContent).toContain('600301');
    expect(storage).toContain('<![CDATA[{"issue":1}]]>');
    expect(storage).not.toContain('Ошибки: исходные значения');
  });

  it('preserves the native attachment macro on the original page and respects edits to a supplemental block', () => {
    const method = importedMethod();
    expect(restoreConfluencePublication(method, canonical, source, source.id)).toContain('ac:name="view-file"');
    const edited = { ...method, sections: method.sections.map(section => section.kind === 'text' && section.title === 'Документы по задаче'
      ? { ...section, value: 'Отредактировано вручную' } : section) };
    const storage = restoreConfluencePublication(edited, canonical.replace(
      '<h2>Документы по задаче</h2><p>Текстовое представление</p>', '<h2>Документы по задаче</h2><p>Отредактировано вручную</p>'
    ), source, '999');
    expect(storage).toContain('<h2>Документы по задаче</h2><p>Отредактировано вручную</p>');
    expect(storage).not.toContain('Contract');
    expect(() => restoreConfluencePublication(method, canonical, { ...source, version: 3 })).toThrow(/Исходная версия/);
  });
});

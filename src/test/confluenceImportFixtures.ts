import type { ConfluencePage } from '../confluenceTypes';

export const importTestOrigin = 'https://confluence.example';

const code = (value: string) => '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">json</ac:parameter>'
  + '<ac:plain-text-body><![CDATA[' + value + ']]></ac:plain-text-body></ac:structured-macro>';
const expand = (title: string, value: string) => '<ac:structured-macro ac:name="expand"><ac:parameter ac:name="title">'
  + title + '</ac:parameter><ac:rich-text-body>' + code(value) + '</ac:rich-text-body></ac:structured-macro>';

export function templateImportPage(options: { variant?: boolean; id?: string; version?: number; ambiguousEndpoint?: boolean } = {}): ConfluencePage {
  const { variant, id = '901', version = 2, ambiguousEndpoint } = options;
  const heading = variant ? 'h1' : 'h2';
  const mainPath = ambiguousEndpoint ? 'other/example' : variant ? 'api/example' : '/api/example';
  const externalCalls = variant
    ? '<tr><td rowspan="3">Внешний URL</td><td>TEST - POST https://test.example/api</td></tr>'
      + '<tr><td>PROD - POST https://prod.example/api</td></tr><tr><td>POST /api/auth</td></tr>'
    : '<tr><td>Внешний URL</td><td></td></tr>';
  const intro = `
    <${heading}>История изменений</${heading}>
    <table><tr><th>Дата</th><th>Версия</th><th>Исполнитель</th><th>Jira</th></tr><tr><td>01.11.2026</td><td>1</td><td>Автор</td><td>TEST-10</td></tr></table>
    <${heading}>Постановка задачи</${heading}>
    <table><tr><td>Epic</td><td>TEST-1</td></tr><tr><td>Цель</td><td>Сохранить запрос</td></tr><tr><td>Инициаторы</td><td>Сервис A</td></tr></table>
    <${heading}>Общая информация</${heading}>
    <table><tr><td>Метод</td><td>POST ${mainPath}</td></tr>${externalCalls}</table>
  `;
  const customHeaders = variant ? `
    <h4>Headers</h4>
    <table><tr><th>Server request</th><th>Обяз.</th><th>Описание</th><th>Пример</th><th>Маск.</th></tr>
    <tr><td rowspan="2">Authorization</td><td rowspan="2">+</td><td>Первый вариант</td><td>Bearer example</td><td>***</td></tr>
    <tr><td>Второй вариант</td><td>Basic example</td><td>***</td></tr>
    <tr><td>X-USER-ID</td><td>-</td><td>ID</td><td>test-user</td><td>***</td></tr></table>
  ` : '';
  const body = `
    <${heading}>Функциональные требования</${heading}><p>Сохранить запрос</p>
    <h3>${variant ? 'Запрос' : 'Request'}</h3>${customHeaders}
    <h4>Body</h4><table>
      <tr><th>Server request</th><th>Тип</th><th>Обяз.</th><th>Описание</th><th>Client request</th><th>Маск.</th></tr>
      <tr><td>data.id</td><td>string</td><td>+</td><td>ID</td><td>requestId</td><td>***</td></tr>
    </table>
    <h4>Пример запроса к адаптеру (Server Request)</h4>
    ${expand('Пример cURL', 'curl -X POST https://adapter.example/api/example')}
    ${variant ? expand('Пример JSON', '{"data":{"id":"test"}}') : ''}
    <h3>${variant ? 'Выходные параметры' : 'Response'}</h3>
    <table><tr><th>Server Response</th><th>Тип</th><th>Client Response (Сервис B)</th><th><p>Маск.</p><p>Маскировать ID</p></th>${variant ? '<th>Обизательность</th><th>Комментарий</th>' : ''}</tr>
    <tr><td>data.result</td><td>string</td><td>result</td><td>***</td>${variant ? '<td>+</td><td>Ответ об успехе</td>' : ''}</tr></table>
    <h4>Пример ответа (Server Response)</h4>${expand('Успех', '{"data":{"result":"OK"}}')}
    <${heading}>Ошибки</${heading}>
    <table><tr><th>Client HTTP Status</th><th>Client Response</th><th>Trigger (условия возникновения)</th><th>Error Type</th><th>${variant ? 'Server HTTP code' : 'Server HTTP status'}</th><th>Полный internalCode</th></tr>
    <tr><td>400</td><td>${code('{"issue":1}')}${variant ? code('{"issue":2}') : ''}</td><td>Неверный запрос</td><td>CommonException</td><td>${variant ? '600301' : '400'}</td><td>${variant ? '' : '999999'}</td></tr></table>
    <${heading}>Диаграмма последовательности</${heading}>
    <ac:structured-macro ac:name="plantuml"><ac:plain-text-body><![CDATA[@startuml
    A -> B
    @enduml]]></ac:plain-text-body></ac:structured-macro>
  `;
  return { id, title: 'POST /api/example', spaceKey: 'TEST', version, url: importTestOrigin + '/pages/viewpage.action?pageId=' + id,
    ancestors: [], storage: intro + body };
}

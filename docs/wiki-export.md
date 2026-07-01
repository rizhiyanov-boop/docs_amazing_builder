# Wiki Export

Документ фиксирует, как в текущей реализации формируется Confluence Wiki Markup экспорт.

## Scope

Подтверждено исходниками:

- основной экспорт одного метода формируется функцией `renderWikiDocument` в `src/renderWiki.ts`;
- полный экспорт проекта формируется функцией `renderProjectWikiDocument` в `src/projectExport.ts`;
- экран предпросмотра использует `WikiScreen` из `src/screens/WikiScreen.tsx`;
- скачивание выполняется из `src/App.tsx` в `.wiki.txt` файл.

Выведено из кода:

- wiki export является строковым Confluence Wiki Markup генератором, а не HTML/PDF рендерером;
- preview в приложении показывает упрощенный HTML-просмотр wiki markup и не является точной Confluence-рендеринг моделью;
- HTML export и Wiki export имеют разные правила наполнения и не должны считаться полностью эквивалентными.

## Entry Points

### Method Wiki

Вызов:

```ts
renderWikiDocument(sections, meta, options)
```

Источник данных:

- `sections`: секции активного метода;
- `meta`: HTTP method, path, Jira, epic, initiators, responsible, externalUrl, updatedAt;
- `options`: `includeToc`, `includeTemplateIntro`, `headingOffset`.

В UI методный wiki preview строится через `getWikiPreview()`:

1. Берется активный метод.
2. Из request-секции вычисляются method/path.
3. Собирается `WikiRenderMeta`.
4. Вызывается `renderWikiDocument(sections, meta)`.
5. Результат кешируется по ссылке на массив `sections`.

Скачиваемый файл:

```text
<method-slug>.documentation.wiki.txt
```

### Project Wiki

Вызов:

```ts
renderProjectWikiDocument({
  projectName,
  updatedAt,
  projectSections,
  flows,
  methods,
  detailMode
})
```

В UI project wiki preview строится через `getProjectWikiPreview()`:

1. Берется имя проекта.
2. `updatedAt` ставится текущим временем генерации.
3. Входные `projectSections` и method sections предварительно фильтруются по `enabled`.
4. Вызывается `renderProjectWikiDocument(...)`.
5. Результат кешируется по ссылкам на projectSections, flows, methods, groups и `detailMode`.

Скачиваемый файл:

```text
<project-slug>.project.documentation.wiki.txt
<project-slug>.project.brief.documentation.wiki.txt
```

## Method Document Structure

По умолчанию `renderWikiDocument` добавляет:

1. `{toc}`;
2. template intro;
3. wiki-блоки секций метода.

Template intro состоит из:

- `h2. История изменений`;
- таблицы истории с версией `v.1`, исполнителем, датой и Jira;
- `h2. Постановка задачи`;
- таблицы Epic, Цель, Инициаторы, Ответственный разработчик / модуль;
- `h2. Общая информация`;
- таблицы Метод и Внешний URL.

Если `includeToc: false`, `{toc}` не добавляется.

Если `includeTemplateIntro: false`, intro-блок не добавляется.

Если задан `headingOffset`, все wiki-заголовки секций сдвигаются по уровню. Это используется в project export: секции метода вставляются внутрь `h3. <method name>` и становятся `h4`.

## Section Rendering Rules

### Общие правила видимости

Подтверждено исходниками:

- disabled-секции экспортируются как заголовок секции и строка `_Не используется_`;
- enabled text-секция экспортируется только если `value.trim()` не пустой;
- enabled parsed-секция generic-типа экспортируется при ошибке парсинга или наличии строк;
- enabled request/response-секция экспортируется при ошибке, наличии строк request model или наличии исходного примера/schema;
- enabled diagram-секция экспортируется только если есть хотя бы одна диаграмма с непустым кодом;
- enabled errors-секция экспортируется только если `rows.length > 0`.

Важно: `validationRules` из errors-секции в Wiki export сейчас не выводятся.

### Text Section

Формат:

```text
h2. <section title>

<plain text lines>
```

Текст проходит wiki escaping для таблиц и макросов, но rich text HTML-разметка здесь не генерируется.

### Generic Parsed Section

Формат:

```text
h2. <section title>

||Поле||Тип||Обязательность||Описание||Маскирование в логах||Пример||
|...|
```

Если есть `section.error`, вместо таблицы выводится:

```text
*Секция заблокирована:* <error>
```

### Request Section

Формат:

```text
h2. <section title>

h3. Headers
...

h3. Внешние headers
...

h3. Параметры
...

{expand:title=Пример JSON/XML/cURL (Server request)}
{code:...}
...
{code}
{expand}

{expand:title=Server cURL}
{code:bash}
...
{code}
{expand}
```

Правила:

- server rows берутся через `getRequestRows(section)`;
- headers отделяются через `splitRequestRows(...)`;
- default request headers добавляются логикой `requestHeaders.ts`;
- auth header добавляется как generated row, если настроен `authType`;
- параметры URL (`source === 'url'`) не попадают в таблицу параметров;
- client/domain model включается только если `domainModelEnabled`;
- external headers берутся из `clientRows` с `source === 'header'`;
- external auth headers генерируются отдельно из `externalAuthType`.

Если request-секция заблокирована ошибкой (`section.error` или `section.clientError`), таблица параметров не выводится, но source examples могут быть добавлены.

### Response Section

Формат:

```text
h2. <section title>

||Server response||Тип||Client response||Описание||Маскирование в логах||Пример||
|...|

{expand:title=Пример JSON/XML/cURL (Server response)}
...
{expand}
```

Правила:

- rows берутся через `getRequestRows(section)`;
- колонка `required` для response не выводится;
- client response колонка появляется только если есть `clientField`;
- при ошибке выводится `*Секция заблокирована:* ...` и затем source examples.

### Diagram Section

Формат:

```text
h2. <section title>

h3. <diagram title>
!<mermaid/plantuml image url>!
<description>
{expand:title=Код диаграммы}
{code}
...
{code}
{expand}
```

Диаграмма экспортируется ссылкой на image URL из `getDiagramImageUrl(...)`.

Для method Wiki используется `jpeg`, для project Wiki project sections и flows используют `svg`.

### Errors Section

Формат:

```text
h2. <section title>

||№||Client HTTP Status||Client Response||Trigger (условия возникновения)||Error Type||Server HTTP Status||Полный internalCode||Server Response||
|...|
```

`clientResponseCode` и `responseCode` добавляются внутрь соответствующих ячеек в раскрывающемся блоке `{expand:title=Пример}` как `{code:json}` macro, если заполнены.

Подтверждено исходниками:

- таблица ошибок не обращается к внешнему справочнику ошибок;
- `internalCode`, HTTP status, message и exception type берутся из уже заполненных строк `ErrorsSection.rows`;
- если нужно соответствие общему справочнику ошибок адаптеров, оно должно быть обеспечено до экспорта.

## Table Rules

Wiki table syntax:

- header row: `||A||B||`;
- data row: `|a|b|`.

Cell escaping:

- `|` заменяется на `&#124;`;
- `{` заменяется на `&#123;`;
- `}` заменяется на `&#125;`;
- переносы строк внутри ячейки схлопываются в пробелы;
- пустая ячейка заменяется на non-breaking space.

Examples:

- JSON example в table cell приводится к single-line JSON, чтобы не сломать wiki table markup;
- multiline JSON в error response выводится через `{code:json}` macro;
- array paths нормализуются через `normalizeArrayFieldPath`: `items[0].name` и `items[o].name` становятся `items[].name`.

Маскирование:

- если `row.maskInLogs === true`, в колонку "Маскирование в логах" выводится `***`;
- иначе выводятся пробелы;
- сам экспорт не вычисляет чувствительность поля, он только отражает уже установленный флаг.

## Source Examples

Source examples формируются функцией `renderParsedSourceExamples`.

Для request:

- server example берется из `section.input`;
- server cURL строится через `buildInputFromRows('curl', ...)`;
- client example берется из `section.clientInput`, если `domainModelEnabled`;
- client cURL строится из external auth headers, client headers и client rows.

Для response:

- если `section.input` заполнен, используется он;
- если input пустой и format `json`, пример может быть взят из JSON Schema `examples[0]`, `example` или `default`;
- если schema example нет, пример восстанавливается из rows через `buildInputFromRows(format, rows)`;
- client response example строится аналогично при `domainModelEnabled`.

Code macro language:

- `json` -> `{code:json}`;
- `xml` -> `{code:xml}`;
- `curl` -> `{code:bash}`.

## Project Wiki Structure

Project Wiki всегда начинает с:

```text
{toc}

h1. <projectName>
*Обновлено:* <updatedAt>

h2. Project Docs
...
h2. Use Case сценарии
...
h2. Методы
...
```

### Project Docs

Берутся только enabled project sections, сортируются по `order`.

Для diagram project section:

- если `diagramCode` заполнен, выводится image URL и content как текст;
- если code пустой, выводится `_Пусто_`.

Для остальных типов выводится `content` или `_Пусто_`.

### Use Case сценарии

Для каждого flow:

- строится Mermaid-код через `buildFlowMermaid(flow, methods)`;
- добавляется image URL через `getDiagramImageUrl('mermaid', ..., 'svg')`;
- строится таблица use case rows.

Порядок шагов выводится по отсортированным nodes: сначала `position.x`, затем `position.y`; note nodes исключаются.

### Методы

В project export методы предварительно фильтруются:

- в `full` режиме остаются методы с enabled секциями;
- в `brief` режиме метод может попасть в экспорт без секций.

Для каждого метода:

- выводится `h3. <method.name>`;
- выводятся Jira, Epic, Responsible и Status;
- в `brief` режиме детализация секций не добавляется;
- в `full` режиме вызывается `renderWikiDocument(method.sections, meta, { includeToc: false, includeTemplateIntro: false, headingOffset: 2 })`.

## Preview

`WikiScreen` показывает два режима:

- `source`: исходная wiki markup строка в readonly textarea;
- `preview`: упрощенный HTML preview.

Preview поддерживает:

- `{toc}`;
- `h1.` ... `h6.`;
- wiki tables `||...||` и `|...|`;
- обычные непустые строки как paragraphs.

Preview не является полной реализацией Confluence renderer. Он не интерпретирует все macros, image syntax, expand/code macros и сложные wiki-конструкции как Confluence.

## Current Gaps / Risks

P2: Wiki export не выводит `validationRules` из errors-секции. Если таблица валидаций нужна в Confluence, ее нужно добавить отдельно и покрыть тестами.

P2: Errors export не сверяет строки с общим справочником ошибок адаптеров. Риск: в Wiki может попасть невалидный `internalCode` или message, если данные уже были заполнены неверно.

P3: Project Wiki не использует `methodGroups` для группировки методов, хотя Project HTML export использует. В Wiki методы идут плоским списком.

P3: Wiki preview в приложении ограничен и может отличаться от фактического Confluence отображения.

P3: Diagram export зависит от внешнего image URL. Если Confluence или сеть блокируют remote images, диаграммы могут не отобразиться.

P3: `updatedAt` для project export ставится временем генерации, а не временем последнего изменения проекта.

## Test Coverage

Подтверждено тестами в `src/renderers.test.ts`:

- базовый wiki shell и секции;
- marker заблокированной parsed-секции;
- нормализация array paths в `[]`;
- auto-generated Server cURL;
- response example из JSON Schema examples при пустом source input;
- отсутствие SOAP metadata в Wiki при наличии в HTML;
- приоритет request JSON input над row examples при генерации cURL body;
- отсутствие Zod schemas в Wiki;
- JSON code macro внутри error response cells;
- отсутствие validation rules в Wiki;
- заполнение method/path и Jira в intro;
- отключение `{toc}`/intro и heading shift для project composition;
- project diagrams, methods и brief/full project modes.

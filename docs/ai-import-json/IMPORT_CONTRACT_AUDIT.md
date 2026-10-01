# Импорт JSON, сформированного через Codex: аудит и план

Дата: 01.10.2026. Исходник: main, commit 9d4d41ab32cfd717bed276639c90fb78c84671c7.

Аудит ниже описывает исходный commit main и служит базой для улучшений. После аудита импорт вынесен в `src/projectImport.ts`, добавлена проверка структуры в `src/projectImportValidation.ts`, а нормализация методов стала общей для файлов и localStorage. Исправлена потеря метаданных; некорректная структура и повторяющиеся ID блокируют импорт, проблемы ссылок показываются как предупреждения. Затем добавлен строгий профиль codex-v1 с общей JSON Schema, семантической проверкой и обновлённой инструкцией генерации. Текущие правила — в [README.md](README.md), порядок подготовки — в [PROJECT_IMPORT.md](PROJECT_IMPORT.md). Формат рабочего workspace остаётся version 3.

## 1. Главный вывод

Для Codex нужен один проверяемый контракт генерации, общий с импортёром. Валидность JSON и перечисление обязательных полей не гарантируют правильного результата: важны режим секции, сторона контракта, источник параметра, ключи маппинга, представление примеров и правила нормализации.

Уже существуют [руководство](README.md), [короткий prompt](SHORT_PROMPT.md) и [шаблон](saveClaim.import.template.json). Они полезны как отправная точка, но не полностью описывают текущий runtime. Источник модели — [types.ts](../../src/types.ts); текущий workspace имеет version 3. Указание version 2 в корневом README устарело.

## 2. Карта существующего импорта

| Этап | Файл / функция | Фактическое поведение |
| --- | --- | --- |
| Классификация одиночного файла / текста | src/App.tsx, processImportedText | Workspace с methods → отдельный метод с sections и id/name → legacy sections → пример API. Version не служит дискриминатором. |
| Загрузка workspace | src/App.tsx, loadWorkspaceProjectFromPayload | Фильтрует методы, нормализует секции и ссылки верхнего уровня; создаёт стартовый проект при отсутствии пригодных методов. |
| Загрузка localStorage | src/workspaceBootstrap.ts, loadWorkspaceProject | Отдельный путь загрузки; в отличие от UI import сохраняет метаданные метода. |
| Нормализация секций | src/sectionTitles.ts, sanitizeSections | Дополняет строки и выполняет legacy-преобразования; не является строгим runtime-валидатором. |
| Идентификаторы строк | src/sectionHelpers.ts, withSectionRowIds | При отсутствии id создаёт их с Date.now и Math.random. |
| Разбор примера | src/parsers.ts, parseToRows | JSON / cURL / XML → строки. Это отдельная операция от импорта готового workspace. |
| Разбор JSON Schema | src/parsers.ts, parseJsonSchemaToRows | Поддерживает ограниченное подмножество JSON Schema. При ручном разборе непустая schemaInput имеет приоритет над input. |
| Маппинг и отображение | src/requestHeaders.ts | Использует rows/clientRows; исключает неверные маппинги без диагностики, добавляет стандартные headers. |
| Восстановление source | src/sourceSync.ts | Создаёт JSON/XML/cURL из строк; преобразования не гарантируют точный обратный результат. |
| Экспорт документа | src/renderHtml.ts, src/renderWiki.ts | Использует готовые строки, source-примеры и собственные правила форматирования. |

Workspace import сохраняет готовые rows/clientRows. Наличие input или schemaInput без rows не запускает парсер автоматически. Повторное нажатие «Парсить» заменяет строки результатом разбора; сохраняются только отдельные вручную добавленные headers. Описания, обязательность, валидации и примеры таблицы могут быть потеряны.

## 3. Правила формирования JSON под текущий код

Это рекомендуемый строгий профиль генерации для текущего runtime, а не описание всех legacy-вариантов, которые он принимает.

### Workspace и идентификаторы

1. Генерировать корневой объект version 3 с projectName, updatedAt, activeMethodId, methods, groups, projectSections и flows. Даже один метод помещать в methods.
2. methods должен содержать хотя бы один метод с id, name, updatedAt и sections. activeMethodId должен ссылаться на существующий метод.
3. Передавать стабильные непустые строковые id. Проверять уникальность методов в workspace, секций в методе, строк на каждой стороне секции, а также узлов и рёбер в flow. Не полагаться на случайные id импортёра.
4. Для базовых секций использовать goal, functional, process-diagram, request, response, errors и non-functional. Для дополнительных секций передавать sectionType явно; поведение нормализации зависит также от id.
5. Обеспечивать целостность groups.methodIds, groups.links, flows.nodes.methodRef.methodId, edges.fromNodeId/toNodeId и ссылок mappings. Указание rowId связывает flow с идентификатором строки, а не с её отображаемым названием.
6. updatedAt и timestamps flow — ISO 8601. Это даты файла проекта; форматы доменных дат документируемого API задаются отдельно по контракту метода.

### Секции и строки

| Поле | Однозначная трактовка для генератора |
| --- | --- |
| kind | text / parsed / diagram / errors. Это тип секции, а не тип её содержимого. |
| sectionType | Для parsed: request / response / generic. title не определяет поведение. |
| enabled | Реальное логическое значение. Не заменять неизвестное значение на false автоматически: секция станет отключённой. |
| domainModelEnabled | Явно false для одного контракта, true для двух моделей с маппингом. Для базовых request/response пропуск сейчас приводит к true. |
| rows / clientRows | Канонические строки таблиц Server / Client. Передавать массивы объектов, без null. |
| input / clientInput | Строки исходника, а не вложенные JSON-объекты. JSON внутри этих строк требует экранирования на уровне внешнего файла. |
| schemaInput / clientSchemaInput | Строки JSON Schema. Не путать с самим workspace JSON и с примером API. |
| format / clientFormat | json / curl / xml, в нижнем регистре. lastSyncedFormat должен соответствовать сохранённому source. |
| field | Путь поля, используемый в таблице и при восстановлении JSON. Для JSON предпочтительно совпадение с sourceField. |
| sourceField | Устойчивый ключ исходного поля. Для XML может включать корневой элемент, отсутствующий в отображаемом field. |
| source | header / body / query / url / parsed. Для GET-параметров основного контракта явно query; для тела запроса и ответа body. url означает строку адреса, а не произвольный path-параметр. Отдельного source path сейчас нет. |
| origin | parsed / manual / generated. Codex как автор файла не является основанием ставить generated: это происхождение строки внутри приложения. |
| required | Для текущего профиля использовать + или -. Условие обязательности описывать отдельно; значение ± из AI guide требует согласования с UI. |
| type | Поддерживаемое имя типа, например string, int, long, number, boolean, object, array, array_object, null. Не заменять int на integer без правила преобразования. |
| example | Всегда строка. Для string передавать Alice, а не строку с дополнительными JSON-кавычками вокруг Alice. Для int/boolean — текст 1/true; для структурных строк object/array/array_object безопасный текущий placeholder — -. |
| validations | Текст ограничений поля, включая пустую строку. Каноническое имя во множественном числе; validation принимается только как legacy-вариант. |
| description | Описание поля; обязательность и ограничения должны соответствовать подтверждённому API-контракту. |
| maskInLogs | Логический признак для документации. Сам по себе не маскирует значение example и не настраивает логи документируемого сервиса. |
| clientField | Не заменяет clientMappings. Реальная связь между двумя моделями должна быть задана в clientMappings. |
| error / clientError | Для корректного готового импорта — пустые строки. Непустой текст блокирует секцию в экспорте. |

При двух моделях rows/input/requestUrl/requestMethod относятся к стороне Server, clientRows/clientInput/externalRequestUrl/externalRequestMethod — к стороне Client. Для конкретного API заранее определить, какая система соответствует каждой стороне; не определять это по обычному значению слова «клиент».

clientMappings направлен **от ключа Server к ключу Client** на request и response. Ключ строки: непустой trimmed sourceField, затем field; id строки не является ключом этого маппинга. Например:

```json
{
  "clientMappings": {
    "customer.id": "customerId"
  }
}
```

Это корректно, когда Server содержит sourceField customer.id, а Client — sourceField customerId. Одинаковые имена на разных источниках параметров могут конфликтовать: текущий ключ не включает source. Нужны уникальные ключи внутри каждой стороны.

Актуальный полный порядок колонок Request:

```json
["field", "type", "required", "validations", "clientField", "description", "maskInLogs", "example"]
```

Для вложенных массивов текущий JSON parser формирует пути items[0].id; UI/экспорт могут показывать items[].id. Не копировать отображаемый путь с [] в canonical sourceField без правила обратного преобразования. Для корневого массива правила парсинга примера и схемы сейчас различаются — см. findings.

### Defaults и данные, которые нельзя додумывать

- Пустые строки годятся для пустого текста, но не для enum, id или ссылки. authType задавать явно: none / bearer / basic / api-key; requestMethod: GET / POST / PUT / PATCH / DELETE; requestProtocol: REST / SOAP.
- Пустые projectSections и flows сейчас заменяются двумя стандартными разделами и одним flow. Если Codex создаёт конкретный сценарий, передавать его явно и проверять ссылки.
- Стандартные headers Server request добавляются автоматически. Чтобы отключить конкретный стандартный header, требуется строка source header с enabled false. Отсутствие строки не означает отключение.
- Не выдумывать обязательность, business validation, API-адреса, реальные учётные данные и коды ошибок. Неопределённости фиксировать до генерации финального файла.
- В errors HTTP statuses и internalCode представлены строками; clientResponse — текст, clientResponseCode/responseCode — строковые JSON-примеры. Нормализация может заменить message и serverHttpStatus по каталогу, а BusinessException приводит к 422.
- При ручном разборе response JSON в простом режиме приложение может добавить data/techData/warnings и демонстрационные значения. При импорте готового workspace этого автоматического разбора нет. Итоговый wrapper следует формировать по согласованному контракту, не полагаясь на этот механизм.

## 4. Findings

P1 — риск потери данных или принятия некорректного проекта. P2 — расхождение семантики/представления. P3 — неполнота документации.

| Приоритет | Место конфликта | Подтверждённый риск | Требуемая доработка |
| --- | --- | --- | --- |
| P1 | App.tsx, loadWorkspaceProjectFromPayload | Метод пересоздаётся только с id/name/updatedAt/sections. Теряются jiraTicket, epic, initiators, responsible, externalUrl, status. Повторный вызов loader при merge затрагивает также одиночный method import. | Единая нормализация метода для UI import, localStorage и остальных загрузок; проверки сохранения метаданных. |
| P1 | App.tsx, isWorkspaceProjectImportPayload и loader | methods [] проходит классификацию, loader создаёт seed. Пригодные/непригодные методы фильтруются без подробной диагностики. Version игнорируется. | Проверка структуры, версии и непустых методов до изменения состояния; диагностировать каждое исключение. |
| P1 | sectionTitles.ts, sanitizeSections | null внутри rows вызывает исключение. Ряд строковых/enum-полей не проверяется по типу; последующие trim/map могут падать. | Глубокая runtime-валидация unknown, пути ошибок вида methods[0].sections[3].rows[0].field, атомарное применение. |
| P2 | App.tsx, mergeWorkspaceImportsAsMethods | Импорт «как методы» переносит methods/groups, создаёт новые method id, но не переносит projectSections/flows. | Явно описать границы merge в preview; если перенос flow нужен, ремаппить все его ссылки вместе с методами. |
| P2 | parsers.ts и sourceSync.ts | Пример name: Alice → row.example со встроенными кавычками → восстановленный JSON содержит кавычки как часть значения. | Единое представление примеров и проверка parse → rows → source для строк. |
| P2 | parsers.ts, flattenJson / flattenJsonSchemaNode | Корневой массив объектов из примера даёт $ и [0].id, схема даёт id. JSON-массив разбирается только по первому элементу. | Согласовать canonical пути и политику неоднородных массивов; обеспечить устойчивость маппингов и ссылок. |
| P2 | requestHeaders.ts, getValidClientMappings | Перевёрнутый либо несуществующий маппинг молча исчезает из итоговой таблицы. source не входит в ключ; возможны коллизии. | Проверять ссылки и уникальность ключей; возвращать диагностическое сообщение до импорта. |
| P2 | requestHeaders.ts, getEditorRequestRows | Body-строка основного GET-контракта отсутствует в таблице редактора, тогда как query видна. | Валидировать source относительно метода либо показывать конфликт явно. |
| P2 | sectionTitles.ts и workspaceBootstrap.ts | Defaults зависят от canonical id; создаются случайные id, стандартные projectSections и flow. | Разделить compatibility normalization и строгий профиль генерации; сообщать применённые defaults. |
| P2 | requestHeaders.ts | enabled false фильтрует headers, но не исключает обычную body-строку из getRequestRows. | Определить единый смысл enabled для строк и отразить его в генераторе/экспорте. |
| P2 | parsers.ts, JSON Schema | Это subset parser: oneOf/anyOf выбирает одну ветку; type-массив берётся по первому элементу; внешние refs не поддерживаются; allOf не разворачивается. | Документировать поддерживаемое подмножество и отклонять неподдерживаемую семантику с диагностикой. |
| P2 | sectionTitles.ts, errors normalization | Переданные status/message могут заменяться каталогом и errorType без import preview. | Показывать семантические изменения и согласовать приоритет каталога над входными данными. |
| P3 | README.md, ARCHITECTURE.md, docs/ai-import-json | README: v2; guide: только json/curl, нет validations в списке строк/колонок, есть ±; ARCHITECTURE называет groups как methodGroups. | Синхронизировать документы, prompt и шаблон с единой схемой и фактическими сериализованными полями. |

## 5. Предлагаемая следующая задача

### Результат

Codex формирует JSON по опубликованному контракту, а импортёр либо применяет его без скрытых потерь, либо возвращает точные ошибки до изменения проекта.

### После изменения

1. Общий модуль принимает unknown и возвращает нормализованный workspace, errors и warnings. UI import и localStorage используют согласованные правила; legacy-входы преобразуются отдельными миграциями.
2. Публикуется JSON Schema для строгого профиля генерации v3, справочник семантики полей, проверенные примеры и короткая инструкция Codex. Схема workspace отличается от schemaInput документируемого API.
3. Пустые/default-значения, неизвестные ключи, неподдерживаемые версии, дубликаты id, ошибки ссылок, маппингов и source имеют определённую политику. Семантические проверки дополняют JSON Schema.
4. import preview показывает нормализации, потери при выбранном режиме merge и ошибки с путями. Непригодный файл не заменяет текущий проект стартовым.
5. JSON от Codex можно проверить локально той же функцией, которую вызывает UI, до загрузки в приложение.

### Scope

Модель импорта, нормализация, классификация payload, диагностика, инструкции и fixtures генерации. Основные владельцы: types.ts, workspaceBootstrap.ts, sectionTitles.ts и новый модуль projectImport; App.tsx остаётся координатором. Изменения путей/примеров затрагивают parsers.ts, sourceSync.ts и requestHeaders.ts и требуют отдельных compatibility-решений.

### Non-goals

Перестройка интерфейса, смена backend/AI-провайдера, изменение бизнес-контрактов API, формата Wiki/HTML или публикация приложения.

### Acceptance criteria

- Эталонные Codex fixtures для простого REST, двух моделей с маппингом, GET query, XML/SOAP, массивов и нескольких методов проходят общий валидатор и UI import.
- Сохраняются метаданные, описания, required, validations, маскирование, примеры, mappings и допустимые ссылки.
- import → export project JSON → import сохраняет значимые данные. Сравнение допускает только явно определённые изменения timestamp/id/defaults.
- parse → rows → source не добавляет кавычки в строковые значения и не теряет структуру массива в пределах объявленной поддержки.
- Отрицательные fixtures покрывают null, неверные типы, enum, version, дубликаты, отсутствующие ссылки и неверное направление маппинга. Текущий workspace остаётся доступным после отказа.
- Старые workspace/legacy sections продолжают загружаться через документированные миграции; несовместимые случаи имеют диагностику.

Последовательность: сначала устранить потери метаданных и ввести общий валидатор; затем согласовать семантику defaults/paths/examples; после этого обновить schema/prompt/templates и закрепить всё fixtures.

## 6. Выполненная проверка и границы

- rtk proxy npm.cmd ci --no-audit --no-fund — зависимости установлены из lockfile.
- rtk proxy npm.cmd run test:import — 7 файлов, 58 тестов прошли.
- rtk proxy npm.cmd exec -- vitest run src/App.integration.test.tsx -t import --testTimeout=10000 — 8 тестов прошли, 24 других теста пропущены фильтром.
- rtk proxy npm.cmd run build — TypeScript и production build прошли; Vite сообщает о больших chunks.
- rtk proxy node output/import-contract-probes.mjs — 12 дополнительных проверок подтвердили string roundtrip, пути корневого массива, сохранение пустых rows при наличии input, GET source, направление mapping, body enabled/default headers, defaults по id, null-row crash, пустые project arrays, будущую version, потерю метаданных и seed для пустых methods. Для метаданных выполнена фактическая функция UI loader, извлечённая из App.tsx через TypeScript AST, с зависимостями проекта.

Проверочный скрипт находится в локальном output и исключён через .git/info/exclude; он фиксирует поведение этой ревизии и не является будущим контрактом или постоянным regression suite. Продуктовые файлы не изменялись. Полный test:ci, backend и ручной browser smoke не запускались: этот этап не меняет runtime и не является релизом.

Исходники получены shallow partial fetch последней main. В рабочей папке есть src, api, docs, scripts, public, test-imports и корневые конфиги; release-архивы, временные дизайн-материалы и ранее сгенерированный output не были включены в checkout. История Git не загружена целиком.

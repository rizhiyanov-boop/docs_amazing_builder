# JSON для импорта, сформированный через Codex

Новые файлы используют профиль codex-v1 поверх workspace version 3. Его выбирает корневое поле importProfile со значением codex-v1. Импортёр проверяет структуру и семантику до изменения проекта. Без importProfile сохраняется совместимый импорт старых документов.

## Материалы и проверка

- [JSON Schema](../../src/importContract/workspace-v3.schema.json) — единственный источник схемы, непосредственно используемый приложением; Draft 7, идентификатор urn:doc-builder:import:codex-v1. В скачиваемый шаблон включён проверяемый снимок для автономной работы ИИ; менять контракт нужно в исходной схеме.
- [SHORT_PROMPT.md](SHORT_PROMPT.md) — готовая инструкция генерации.
- [simple-post.json](examples/simple-post.json) — полный учебный шаблон одного метода с вложенным массивом.
- [orchestration.json](examples/orchestration.json) — обе стороны, оба маппинга, два метода, группа и flow со ссылками на строки.
- [complex-order-saga.json](examples/complex-order-saga.json) — сложный учебный проект: 11 методов, 3 сценария, компенсации, каталог ошибок, вложенные поля и 25 диаграмм с описаниями. Пересоздание и проверка диаграмм/ссылок: node scripts/generate-complex-import.mjs.
- [get-query.json](examples/get-query.json) — GET с query и cURL.
- [root-array.json](examples/root-array.json) — корневой массив с явной строкой $.
- [xml.json](examples/xml.json) — XML с полными путями строк.
- [PROJECT_IMPORT.md](PROJECT_IMPORT.md) — подготовка и применение импорта.
- [IMPORT_CONTRACT_AUDIT.md](IMPORT_CONTRACT_AUDIT.md) — исторический аудит main до изменений.

Учебные файлы не описывают реальный API. Адреса example.test, поля и сценарии демонстрируют структуру. Старый [saveClaim.import.template.json](saveClaim.import.template.json) сохранён как legacy fixture; для новой генерации использовать примеры codex-v1.

В меню «Дополнительные действия» рядом с импортом доступен «Скачать шаблон метода для ИИ». Его источник — [public/docbuilder-ai-method-template.json](../../public/docbuilder-ai-method-template.json). Файл содержит инструкции, справочники ошибок/заголовков/тегов, примеры, определения схемы метода и его каркас. Передайте его ИИ вместе с материалами: результатом должен быть отдельный JSON с заполненным содержимым documentTemplate — один объект метода с name, метаданными и sections, без проектной обёртки и importProfile. Загрузите результат через «Импорт» и подтвердите «Импортировать метод».

Рядом доступен «Скачать шаблон проекта для ИИ»: [public/docbuilder-ai-project-template.json](../../public/docbuilder-ai-project-template.json). Он содержит общие правила и справочники, полную схему workspace и каркас проекта. ИИ возвращает documentTemplate с одним или несколькими методами, группами, общими разделами и сценариями по материалам. Для полного переноса результата выбирается «Заменить проект»; добавление методов переносит только methods/groups.

Для изменения правил редактируйте instructions и referenceData или замените соответствующий JSON, сохранив имя файла. Оба пакета автономны; общие изменения правил/справочников переносите в оба файла. Компоненты интерфейса менять не нужно. Локально файлы подхватываются сразу; для production требуется обычное развёртывание. В шаблоне метода outputSchema содержит method и связанные определения из исходной схемы, в шаблоне проекта — полную схему workspace. Оба каркаса проверяет src/aiMethodTemplate.test.ts. CLI validate:import предназначен для workspace, а не отдельного метода. Структурные defaults и учебные примеры не подтверждают бизнес-правила конкретного метода.

Из корня репозитория, после npm ci:

```sh
npm run validate:import -- path/to/generated.json
```

Команда требует codex-v1, проверяет JSON Schema и семантику, затем вызывает тот же loadWorkspaceProjectFromPayload, что и UI. Несколько файлов перечислять через пробел; каждый получает отдельный результат. Код завершения: 0 — все пригодны, 1 — ошибка чтения/JSON/контракта, 2 — неправильные аргументы. Пути с пробелами заключать в кавычки.

Для старого workspace:

```sh
npm run validate:import -- --compat path/to/old-workspace.json
```

Compat допускает старый workspace без маркера; при наличии importProfile строгая проверка всё равно применяется. CLI проверяет workspace; legacy sections и отдельный method поддерживаются UI, но не этой командой.

## Полный документ и пустые значения

Корень содержит importProfile, version, projectName, updatedAt, activeMethodId, methods, groups, projectSections и flows. Version равен 3, даже один метод находится в methods. Methods, projectSections и flows непустые. При отсутствии проектных материалов передать явный пустой Overview и сценарий Start → метод → End, как в шаблоне. Пустые массивы здесь запрещены: совместимый нормализатор заменяет их случайными стандартными данными.

Каждый метод содержит id, name, updatedAt, sections и все метаданные jiraTicket, epic, initiators, responsible, externalUrl, status. Неизвестные текстовые метаданные пустые, незавершённый метод имеет status draft. Обязательны request и response; дополнительные разделы определяет задача.

Все поля проверяются без преобразования типов и добавления defaults. Неизвестные ключи запрещены. Null не заменяет текст/массив/объект. Пустые строки допустимы только по схеме: не для enum, ID, названия проекта/секции или ссылки. Обязательность, бизнес-валидацию, адреса и авторизацию нельзя угадывать; существенные неизвестные согласовать до генерации.

ID — стабильные ASCII-строки из букв, цифр, точки, подчёркивания, двоеточия и дефиса, начинаются с буквы/цифры. Использовать читаемые префиксы. ID методов уникальны в проекте, секций — в методе, строк — во всём методе, включая обе стороны и все секции. ID групп, projectSections и flows уникальны в своих массивах; узлов/рёбер — в flow; маппингов — в ребре; диаграмм — в секции.

Служебные updatedAt/createdAt — реальные ISO timestamps UTC: 2026-10-02T00:00:00.000Z или без миллисекунд. Бизнес-даты определяются контрактом API.

## Канонические секции

| ID | kind | sectionType / смысл |
| --- | --- | --- |
| goal, functional, non-functional | text | Текст |
| process-diagram | diagram | Процесс |
| request | parsed | request |
| response | parsed | response |
| errors | errors | Ошибки |

Пользовательская parsed-секция использует sectionType generic, свой ID и domainModelEnabled false. Legacy ID body/external-url запрещены. Title не меняет смысл ID.

Parsed-секции содержат полный каркас схемы, включая обе стороны, flags и requestColumnOrder. Для request обязательны все endpoint/auth поля; у response/generic этих полей быть не должно. Поля schemaInput/clientSchemaInput пустые: профиль передаёт готовые таблицы, а не API-схему для последующего разбора. Поля error/clientError пустые.

Поле format совпадает с lastSyncedFormat своей стороны. Response/generic поддерживают JSON/XML, request — также cURL. Неиспользуемая Client-сторона имеет clientFormat/clientLastSyncedFormat json.

## Стороны и маппинг

| Поля | Сторона интерфейса |
| --- | --- |
| rows, input, format, requestUrl/requestMethod, auth* | Server |
| clientRows, clientInput, clientFormat, externalRequestUrl/externalRequestMethod, externalAuth* | Client |

Физические роли вызывающего приложения, адаптера и downstream установить по материалам задачи, а не выводить из слова external.

Поле domainModelEnabled false: заполнены rows/input; clientRows/clientInput пустые, clientMappings пустой объект. Поле externalRequestUrl пустое, externalAuthType none. При domainModelEnabled true заполнить обе стороны и явно задать их HTTP-методы/endpoints.

Поле clientMappings направлено от полного ключа Server к полному ключу Client одинаково для request и response. Связь externalId → data.customerId требует Server-строку externalId и Client-строку data.customerId. Ключ — sourceField, а не ID. Связь не преобразует input в clientInput. Поле clientField каждой исходной строки пустое: отображаемое значение вычисляется по маппингу.

Ключи уникальны на каждой стороне; одинаковые имена header/query/body конфликтуют. Header/url строки Server не участвуют в маппинге. Незамаппированные Client-строки допустимы и отображаются отдельно.

## Строки, пути и примеры

Строка содержит id, field, sourceField, type, required, validations, description, example, origin, source, enabled, maskInLogs, clientField. Поле origin равно generated. Поля field = sourceField = полный путь. Поле required: + обязательный, - необязательный; ± и пустая строка запрещены. Условную обязательность после согласования описывать в validations/description; неизвестную не заменять случайным знаком.

| Тип / ситуация | Пример и правило |
| --- | --- |
| string | example равен demo-001 без дополнительных JSON-кавычек; сам example остаётся строковым полем внешнего JSON |
| int / long / number | Строка с числом в синтаксисе JSON; int — signed int32; long — точно представимый JavaScript integer |
| boolean / null | Строки true/false или null |
| object / map | Строковый JSON-объект; обычно {} для контейнера с дочерними строками |
| array / array_object | Строковый JSON-массив; обычно [] для контейнера; array_object содержит только объекты |
| Вложенный JSON | customer.id, items[0].id; контейнер до детей; [0] описывает первый примерный элемент |
| Корневой массив | Первая строка $ типа array/array_object, затем [0].id; не $.id и не $[0].id |
| XML | Полные source-пути, например request.id; element/attribute только для XML |

Placeholder «-» у контейнеров запрещён. Внешние пробелы example запрещены: sourceSync обрезает их. JSON-профиль v1 допускает ASCII-имена из букв/цифр/подчёркивания/дефиса, точку как разделитель и индекс [0]. Числовое начало обычного имени, пробелы, [], __proto__/constructor/prototype не поддерживаются. Более сложные ключи требуют решения о представлении в парсере, а не догадки генератора.

Поля input/clientInput — строковый source, rows/clientRows — канонические таблицы; импорт не пересоздаёт строки из source. Непустой JSON source должен совпадать с body, восстановленным из rows, без учёта порядка ключей. Query/header/url в JSON body не входят. Пустой source допустим при неизвестном примере и не означает пустую таблицу. Для cURL/XML проверяется разбор текущим парсером; эквивалентность source и всех строк автоматически не доказывается.

GET на каждой стороне использует source query для параметров, а не body. У response/generic все строки source body. Поле enabled false допускается только у headers: обычные строки с false остаются видимыми в runtime, поэтому строгий профиль их запрещает.

Порядок requestColumnOrder фиксирован:

```json
["field", "type", "required", "validations", "clientField", "description", "maskInLogs", "example"]
```

## Headers, авторизация, ошибки

Server request получает стандартные headers X-CLIENT-ID, X-USER-ID, X-SOURCE-SYSTEM, X-BP-ID, X-BP-NAME, traceparent. Отсутствие строки не отключает header; для отключения передать строку source header с enabled false. Headers уникальны без учёта регистра.

Поля authType/externalAuthType: none, bearer, basic, api-key. Неиспользуемые auth-поля пустые. Для bearer заполнить authTokenExample, для basic — authUsername/authPassword, для api-key — authHeaderName/authApiKeyExample; для Client использовать поля с префиксом externalAuth. Использовать явные учебные placeholders TOKEN_EXAMPLE, USERNAME_EXAMPLE, PASSWORD_EXAMPLE, API_KEY_EXAMPLE, а не реальные учётные данные и не неявные defaults.

Секция errors содержит rows и validationRules; полный состав задан схемой. HTTP statuses/internalCode — строки. Поле clientResponse — текст, clientResponseCode/responseCode — пустые строки или валидные JSON-примеры, записанные строками. Сверить internalCode, message, exception type и status с каталогом проекта. Если нормализатор изменит значения, строгая проверка отклонит файл. Коды не изобретать; неподтверждённые ошибки согласовать. Пустые rows/validationRules допустимы.

## Группы и сценарии

Поля activeMethodId/groups.methodIds/links ссылаются на существующие методы; концы group link входят в эту группу. Поле projectSections.order равно индексу начиная с 0. Только diagram-раздел содержит diagramEngine/diagramCode.

Method-узел содержит methodRef.methodId существующего метода, остальные типы не содержат methodRef. Концы edge — узлы своего flow. Поле source.nodeId mapping совпадает с fromNodeId, target.nodeId — с toNodeId. Поле source.side: request/response/context; target.side: request/context.

Для request/response нужны rowId и fieldPath одной строки указанного метода; уникальность ID во всём методе различает Server/Client. Для context rowId пустой, fieldPath явно называет поле контекста. Transform/note — описание; импортёр не исполняет преобразования и не доказывает бизнес-корректность связей.

## Применение и границы

Поле importProfile — маркер входного файла, не сохраняется в рабочем workspace; обычный экспорт остаётся version 3. Чтобы проверить экспорт как generated-файл, явно вернуть importProfile и заполнить строгие поля; произвольный экспорт не считается автоматически соответствующим профилю.

Для полного переноса projectSections/flows выбрать замену проекта. Добавление методов переносит methods/groups с новыми ID методов; проектные разделы/сценарии не переносятся.

Проверка схемы и семантики: npm run test:import. Пересоздание учебных файлов: npm run examples:import. Валидность контракта не подтверждает фактические адреса, бизнес-правила и полноту исходной документации.

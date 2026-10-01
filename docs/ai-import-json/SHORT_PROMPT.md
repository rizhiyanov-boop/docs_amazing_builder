Сформируй workspace JSON для импорта в DocBuilder по профилю codex-v1.

Перед генерацией прочитай docs/ai-import-json/README.md, src/importContract/workspace-v3.schema.json и подходящий пример из docs/ai-import-json/examples. Схема обязательна для структуры, README задаёт семантику. Полный шаблон одного метода — simple-post.json; обе стороны и flow — orchestration.json. Учебные данные заменить материалами задачи, не выдавать их за фактический API.

Правила:

1. Корень: importProfile = codex-v1, version = 3, projectName, updatedAt, activeMethodId, methods, groups, projectSections, flows. Даже один метод внутри methods. Обязательные поля присутствуют, неизвестных ключей нет; типы не подменяются строками/null.
2. Методы содержат полные метаданные и sections, включая request и response. ID стабильные; ID строк уникальны во всём методе. Служебные timestamps — ISO UTC с Z. Неизвестные текстовые метаданные пустые; незавершённый метод status draft.
3. Режим явный: domainModelEnabled false — только rows/input, Client-данные пустые; true — rows/input описывают Server, clientRows/clientInput — Client. requestUrl/requestMethod/auth* относятся к Server, externalRequestUrl/externalRequestMethod/externalAuth* — к Client. Физические роли этих сторон установить по задаче.
4. rows/clientRows канонические; импорт не парсит source вместо них. schemaInput/clientSchemaInput/error/clientError пустые. Непустой JSON source совпадает с body, восстановленным из строк. Неизвестный source оставить пустым, а не подставлять посторонний пример.
5. В строке field = sourceField = полный путь, origin generated, clientField пустой. Required только + или -. Validations/description/example/maskInLogs явные. GET использует query, response/generic — body. Enabled false только для headers.
6. clientMappings: Server sourceField → Client sourceField одинаково на request/response; ID здесь не используется. Ключи существуют и уникальны. Маппинг не преобразует source автоматически.
7. Строковый example без добавленных кавычек: demo-001, не "demo-001". Числа/boolean/null — строки соответствующих значений. Контейнеры содержат строковый JSON, обычно {} или []; «-» запрещён. Не обрезать значащие пробелы и не терять точность целых.
8. JSON-пути: customer.id, items[0].id; контейнер перед детьми. Корневой массив: первая строка $ типа array/array_object, дети [0].id. Не использовать []/$. как сокращения. Не поддерживаемые профилем ключи требуют решения, а не переименования без согласования.
9. requestColumnOrder строго [field, type, required, validations, clientField, description, maskInLogs, example]. Request имеет полный набор endpoint/auth полей; response/generic их не имеют. Неиспользуемые auth-поля пустые, активная схема имеет явные учебные placeholders без реальных секретов.
10. projectSections/flows непустые и явные; order равен индексу. Все ссылки корректны. Flow source/target совпадают с концами edge, rowId/fieldPath с одной строкой. Неиспользуемые groups/mappings/diagram/error rows могут быть пустыми.
11. Не выдумывать обязательность, бизнес-валидацию, адреса, авторизацию и коды ошибок; сверять каталог. Существенные неизвестные сначала согласовать. Требование «только JSON» относится к финальному результату после согласования.

Сохрани файл и из корня проекта выполни npm run validate:import -- путь/к/файлу.json. Исправь все ошибки. После успешной проверки верни только итоговый JSON без Markdown-ограждения и пояснений либо ссылку на файл, если пользователь запросил файл.

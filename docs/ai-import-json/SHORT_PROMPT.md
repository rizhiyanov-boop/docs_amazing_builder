Сформируй полный import JSON для Doc Builder version 3.
Верни только валидный JSON без пояснений.

Требования:

1. Корневой объект обязан содержать:
   version, projectName, updatedAt, activeMethodId, methods, groups, projectSections, flows.
2. Даже если импортируется один метод, он должен быть внутри methods.
3. activeMethodId должен совпадать с id главного метода.
4. Для всех parsed section обязательно указывай полный каркас:
   id, title, enabled, kind, sectionType, format, lastSyncedFormat, input, schemaInput, rows, error, domainModelEnabled, clientFormat, clientLastSyncedFormat, clientInput, clientSchemaInput, clientRows, clientError, clientMappings, requestColumnOrder.
5. Для request section дополнительно обязательно указывай auth и request/external request поля.
6. Для каждой строки rows обязательно указывай:
   id, type, field, origin, source, enabled, example, required, maskInLogs, description, sourceField, clientField.
7. Если значение неизвестно, подставляй пустую строку, пустой массив или пустой объект, но не удаляй поле.
8. Все даты делай в ISO-формате.
9. requestColumnOrder всегда делай:
   field, type, required, clientField, description, maskInLogs, example.
10. JSON должен быть готов к прямому импорту без ручной доработки.
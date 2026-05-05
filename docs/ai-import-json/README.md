# AI Import JSON Guide

Эта папка содержит материалы для ИИ, который должен генерировать корректный JSON для целикового импорта в Doc Builder.

Состав:

1. SHORT_PROMPT.md
   Короткий рабочий промпт для ИИ.
2. saveClaim.import.template.json
   Эталонный шаблон полного import JSON для одного метода.

## Назначение

Используйте эти материалы, если нужно:

1. Сгенерировать полный workspace JSON для импорта.
2. Сгенерировать один метод в составе полного workspace payload.
3. Избежать ошибок импорта из-за пропущенных полей в parsed section.

## Требования к JSON для импорта

ИИ должен формировать JSON по следующим правилам:

1. JSON должен быть полностью валидным.
2. Корневой объект должен содержать поля:
   version
   projectName
   updatedAt
   activeMethodId
   methods
   groups
   projectSections
   flows
3. Даже если импортируется один метод, он должен находиться внутри массива methods.
4. activeMethodId должен совпадать с id метода, который нужно открыть после импорта.
5. Каждый метод должен содержать:
   id
   name
   updatedAt
   sections

## Обязательные поля для section kind = text

Каждая text section должна содержать:

1. id
2. title
3. enabled
4. kind
5. value

## Обязательные поля для section kind = diagram

Каждая diagram section должна содержать:

1. id
2. title
3. enabled
4. kind
5. diagrams

Каждый элемент diagrams должен содержать:

1. id
2. title
3. engine
4. code
5. description

## Обязательные поля для section kind = parsed

Каждая parsed section должна содержать полный каркас:

1. id
2. title
3. enabled
4. kind
5. sectionType
6. format
7. lastSyncedFormat
8. input
9. schemaInput
10. rows
11. error
12. domainModelEnabled
13. clientFormat
14. clientLastSyncedFormat
15. clientInput
16. clientSchemaInput
17. clientRows
18. clientError
19. clientMappings
20. requestColumnOrder

Для request section дополнительно обязательны:

1. authType
2. authHeaderName
3. authTokenExample
4. authUsername
5. authPassword
6. authApiKeyExample
7. requestUrl
8. requestMethod
9. requestProtocol
10. externalRequestUrl
11. externalRequestMethod
12. externalAuthType
13. externalAuthHeaderName
14. externalAuthTokenExample
15. externalAuthUsername
16. externalAuthPassword
17. externalAuthApiKeyExample

## Обязательные поля для rows внутри parsed section

Каждая строка rows должна содержать:

1. id
2. type
3. field
4. origin
5. source
6. enabled
7. example
8. required
9. maskInLogs
10. description
11. sourceField
12. clientField

Правила:

1. field обязателен.
2. sourceField обязателен.
3. description обязателен, даже если пустой.
4. example обязателен, даже если пустой.
5. required обязателен и должен быть одним из значений:
   +
   -
   ±
6. clientField обязателен, даже если не используется. В этом случае передавать пустую строку.

## Обязательные поля для section kind = errors

Каждая errors section должна содержать:

1. id
2. title
3. enabled
4. kind
5. rows
6. validationRules

Каждый элемент rows должен содержать:

1. clientHttpStatus
2. clientResponse
3. clientResponseCode
4. trigger
5. errorType
6. serverHttpStatus
7. internalCode
8. message
9. responseCode

Каждый элемент validationRules должен содержать:

1. parameter
2. validationCase
3. condition
4. cause

## Значения по умолчанию

Если какое-то значение неизвестно, ИИ не должен удалять поле. Нужно использовать безопасное значение:

1. string: пустая строка
2. array: []
3. object: {}
4. boolean: false или реальное значение

## Форматы и соглашения

1. format должен быть json или curl.
2. lastSyncedFormat должен совпадать с format, если нет специальной причины указать иное.
3. requestColumnOrder всегда должен быть:

```json
[
  "field",
  "type",
  "required",
  "clientField",
  "description",
  "maskInLogs",
  "example"
]
```

4. groups всегда должен быть массивом.
5. projectSections всегда должен быть массивом.
6. flows всегда должен быть массивом.
7. Все id должны быть строками.
8. Все даты должны быть в ISO-формате.

## Что ИИ не должен делать

1. Не должен отдавать parsed section без title.
2. Не должен отдавать parsed section без format.
3. Не должен отдавать parsed section без input.
4. Не должен отдавать rows без clientField.
5. Не должен формировать сокращенный или частично заполненный payload, если результат предназначен для прямого импорта.

## Рекомендуемая команда для ИИ

Сформируй полный JSON для импорта в Doc Builder version 3.
Верни только валидный JSON без пояснений.
Не пропускай ни одного обязательного поля.
Для всех parsed section всегда используй полный каркас.
Для всех rows внутри parsed section всегда используй полный набор полей.
Если значение неизвестно, подставь безопасное пустое значение, но не удаляй поле.
activeMethodId должен указывать на основной импортируемый метод.
Все ссылки flows.methodRef.methodId должны указывать на существующий method id из methods.
JSON должен быть готов к прямому импорту без ручной доработки.
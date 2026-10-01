# Подготовка импорта проекта

Модуль `src/projectImport.ts` готовит данные без чтения файлов и изменения React state. `App.tsx` отвечает за выбор файла, preview, ошибки и применение результата.

## Точки входа

| Функция | Назначение |
| --- | --- |
| `parseProjectImportText(text, fileName, enableMultiMethods)` | Классифицирует workspace, отдельный метод, legacy sections или JSON/XML/cURL source. Возвращает результат с `kind`, подготовленными данными и предупреждениями для документов. |
| `loadWorkspaceProjectFromPayload(payload, enableMultiMethods)` | Проверяет и нормализует workspace в version 3. |
| `buildWorkspaceImportFromMethodPayload(payload, fallbackName, enableMultiMethods)` | Подготавливает workspace из одного метода; при отсутствии имени использует имя файла. |
| `prepareProjectImportBatch(files, enableMultiMethods)` | Разделяет корректные JSON-документы и ошибки отдельных файлов. JSON-примеры API в batch не принимаются. |
| `prepareMethodsMerge(workspaces, existingMethods, enableMultiMethods)` | Создаёт новые ID и уникальные имена методов, переназначает ссылки групп; возвращает добавляемые методы и группы. |

Все функции по умолчанию используют режим нескольких методов. UI передаёт свой feature flag явно.

## Порядок подготовки

1. Проверить структуру исходного JSON через `validateProjectImportPayload`.
2. Нормализовать методом `normalizeMethodDocument` из `workspaceBootstrap`: сохранить метаданные, дополнить отсутствующие значения, выполнить legacy-преобразования и назначить ID строкам.
3. Проверить ID и ссылки подготовленных данных через `validateImportedWorkspace` / `validateImportedSections`.
4. Вернуть данные и предупреждения. При ошибках выбросить `ProjectImportError` с массивом `issues`; каждое сообщение содержит путь, например `methods[0].sections[1].rows[2].field`.
5. Показать preview в UI и применить подготовленные данные после выбора режима импорта. Некорректный документ до применения не меняет текущий workspace.

Отсутствующие legacy-поля допускаются и получают прежние значения по умолчанию. Переданные значения неправильного типа, `null` вместо объектов/массивов, неподдерживаемые enum, неизвестная версия и повторяющиеся ID отклоняются. Допускаются version 1/2/3 и отсутствие version в старых документах. Пустой `methods` отклоняется. Неизвестные поля пока не проверяются.

Несуществующие методы, узлы, поля и неверные Server → Client mappings дают предупреждения: черновые ссылки не мешают замене проекта. При добавлении методов сохраняется прежнее поведение: переносятся методы и пригодные группы, projectSections/flows не переносятся, ссылки групп на неимпортированные методы исключаются. Для полного переноса предназначена замена проекта.

Пустые или отсутствующие projectSections/flows по-прежнему дополняются стандартными данными; это отражено в предупреждениях. Импорт сохраняет jiraTicket, epic, initiators, responsible, externalUrl и status как при замене проекта, так и при добавлении методов.

## Границы этого этапа

- Готовые `rows`/`clientRows` остаются каноническими. `input`, `clientInput`, `schemaInput` не парсятся заново.
- Сохранены legacy sections, канонические ID, преобразование body → response и прежние значения режима доменной модели для стандартных и пользовательских секций.
- Восстановление source, кавычки в примерах и правила путей массивов не менялись.
- Для файлов без importProfile используется совместимый валидатор. Профиль codex-v1 проверяется загрузчиком до нормализации: src/codexImportValidation.ts использует опубликованную src/importContract/workspace-v3.schema.json и проверяет ссылки/источники. [Правила профиля и CLI](README.md) содержат обязательные поля и примеры.

Проверки: `npm run test:import` и `vitest run src/App.integration.test.tsx -t import --testTimeout=10000`. Тесты покрывают существующие JSON-шаблоны, metadata roundtrip, классификацию, batch, переназначение ссылок, ошибки с путями и применение через UI.

# Короткая карта кода

Использовать как индекс перед чтением исходников. Высокоуровневая схема находится в [ARCHITECTURE.md](../ARCHITECTURE.md).

## Точки входа

| Задача | Владелец | Связанные файлы | Целевая проверка |
| --- | --- | --- | --- |
| React bootstrap | src/main.tsx | src/index.css | npm run test:ui |
| Общая координация UI | src/App.tsx | hooks и components | npm run test:ui |
| Модель проекта | src/types.ts | sectionTitles, workspaceBootstrap | npm run test:import |
| Создание секций | src/sectionFactories.ts | sectionHelpers | npm run test:import |
| Legacy-нормализация | src/sectionTitles.ts | workspaceBootstrap | npm run test:import |
| Workspace v3 и localStorage | src/workspaceBootstrap.ts | App | npm run test:import |

## Import и таблицы

| Задача | Владелец | Связанные файлы | Целевая проверка |
| --- | --- | --- | --- |
| JSON/XML/cURL → rows | src/parsers.ts | editorValueUtils | npm run test:import |
| rows → JSON/XML/cURL | src/sourceSync.ts | requestHeaders | npm run test:import |
| JSON Schema → rows | src/parsers.ts | schemaValidationRules | npm run test:import |
| Validation rules | src/schemaValidationRules.ts | ErrorsSectionEditor | npm run test:import |
| Request/Response rows | src/sectionHelpers.ts | requestHeaders | npm run test:import |
| Headers и auth | src/requestHeaders.ts | App, renderers | npm run test:import |
| Server → Client mapping | src/requestHeaders.ts | App | npm run test:import |
| Порядок колонок Request | src/requestColumns.ts | App | npm run test:ui |

Канонические данные импортированного проекта:

- input и clientInput — исходный текст;
- rows и clientRows — данные таблиц;
- clientMappings — Server field key → Client field key;
- sourceField используется как устойчивый ключ строки, когда он заполнен.

## Export

| Формат | Владелец | Композиция проекта | Целевая проверка |
| --- | --- | --- | --- |
| Wiki метода | src/renderWiki.ts | src/projectExport.ts | npm run test:wiki |
| HTML метода | src/renderHtml.ts | src/projectExport.ts | npm run test:wiki |
| Preview Wiki | src/screens/WikiScreen.tsx | App | npm run test:ui |
| Preview HTML | src/screens/HtmlExportScreen.tsx | App | npm run test:ui |
| Mock service JSON | src/mockServiceExport.ts | App | npm run test:import |
| Диаграммы | src/diagramUtils.ts | flowDiagram, projectExport | npm run test:wiki |

Правило: изменение синтаксиса Wiki выполнять в renderWiki.ts. projectExport.ts менять только при изменении полного экспорта проекта. HTML не менять без отдельного требования.

## AI

| Задача | Frontend | Backend | Целевая проверка |
| --- | --- | --- | --- |
| AI transport | src/openrouterClient.ts | api/ai.ts | npm run test:ai |
| Описания | App и dialogs/AiDescriptionsPreview | task fill-descriptions | npm run test:ai |
| Ручной контекст | dialogs/AiDescriptionContextDialog | task fill-descriptions | npm run test:ai |
| Примеры | App | task generate-examples | npm run test:ai |
| Маппинг | App | task suggest-mappings | npm run test:ai |
| Маскирование | App | task mask-fields | npm run test:ai |

Backend AI обязан сохранить auth, validation, prompt isolation, JSON normalization, timeout, token limits и per-user limits.

## Backend и сохранение

| Задача | Frontend | Backend | Целевая проверка |
| --- | --- | --- | --- |
| API client | src/serverSyncClient.ts | api/* | npm run test:sync |
| Login/session | App | api/auth и api/_lib/http.ts | npm run test:sync |
| Проекты | hooks/useServerSync.ts | api/projects.ts | npm run test:sync |
| Remote autosave | hooks/useRemoteProjectAutosave.ts | api/projects.ts | npm run test:sync |
| Undo/redo | hooks/useWorkspaceHistory.ts | projects history JSONB | npm run test:sync |
| PostgreSQL | — | api/_lib/db.ts | npm run test:sync |

## UI

| Область | Основные компоненты | Целевая проверка |
| --- | --- | --- |
| Верхняя панель | components/workbench/WorkbenchTopbar.tsx | npm run test:ui |
| Навигация | components/workbench/WorkbenchSidebar.tsx | npm run test:ui |
| Parsed section | components/ParsedSectionEditor.tsx | npm run test:ui |
| Таблицы | components/tables/WorkbenchTables.tsx | npm run test:ui |
| Ошибки | components/ErrorsSectionEditor.tsx | npm run test:ui |
| Диаграммы | components/DiagramSectionEditor.tsx | npm run test:ui |
| Project docs/flows | components/ProjectDocsEditor.tsx, ProjectFlowsEditor.tsx | npm run test:ui |
| Design tokens | src/tokens*.css, src/App.css | npm run lint:all |

## Правило чтения

Начинать с владельца логики и одного соответствующего теста. App.tsx читать точечным поиском по handler, state или имени компонента; не загружать файл целиком без необходимости.


# ARCHITECTURE

## Назначение
Документ описывает актуальную архитектуру `doc-builder`: модель данных, ключевые потоки, границы MVP и оценку необходимости рефакторинга.

## Технический контур
- SPA на React + TypeScript + Vite с клиентским UI и используемым API-слоем для auth и server sync.
- Точка входа: [src/main.tsx](src/main.tsx).
- Основная оркестрация состояния и use-case действий сосредоточена в [src/App.tsx](src/App.tsx); shell-UI поэтапно выносится в `components/`.
- В проекте используются API-маршруты из `api/` и клиент `src/serverSyncClient.ts`; серверный слой больше не является только заготовкой.

## Внутренний формат проекта
Состояние проекта хранится и экспортируется как `ProjectData` (см. [src/types.ts](src/types.ts)):

```json
{
  "version": 2,
  "updatedAt": "2026-03-17T10:00:00.000Z",
  "sections": [
    {
      "id": "goal",
      "title": "Цель",
      "enabled": true,
      "kind": "text",
      "value": "Описание цели"
    },
    {
      "id": "request",
      "title": "Request",
      "enabled": true,
      "kind": "parsed",
      "sectionType": "request",
      "format": "curl",
      "input": "curl -X POST ...",
      "rows": [],
      "error": "",
      "domainModelEnabled": true,
      "clientFormat": "json",
      "clientInput": "{\"id\":123}",
      "clientRows": [],
      "clientError": "",
      "clientMappings": {},
      "requestMethod": "POST",
      "requestUrl": "https://api.example.com/method",
      "authType": "none"
    }
  ]
}
```

Ключевые сущности:
- `DocSection` — секция документа (`text` или `parsed`).
- `ParsedSection` — секция с источником для парсинга и табличными строками.
- `ParsedRow` — строка таблицы (`field`, `type`, `required`, `description`, `example`) с метаданными происхождения (`origin`, `source`, `sourceField`).

## Форматы источников
Поддерживаемые форматы парсинга (см. [src/types.ts](src/types.ts), [src/parsers.ts](src/parsers.ts)):
- `json`
- `curl`

XML в текущей версии не поддерживается.

## Основные потоки

### 1) Инициализация и нормализация
- Приложение загружает проект из `localStorage` (`doc-builder-project-v2`) в [src/App.tsx](src/App.tsx).
- Данные проходят через `sanitizeSections` в [src/sectionTitles.ts](src/sectionTitles.ts):
  - нормализуются названия,
  - заполняются значения по умолчанию,
  - выполняется совместимость со старыми секциями (`body` -> `response`).

### 2) Парсинг источника в rows
- Парсинг запускается из `runParser` в [src/App.tsx](src/App.tsx).
- `parseToRows` в [src/parsers.ts](src/parsers.ts):
  - JSON: flatten структуры в пути вида `a.b[0].c`;
  - cURL: извлечение body (`--data*`), headers (`-H/--header`), URL и метода.

### 3) Табличное редактирование и синхронизация
- В dual-model секциях (`request`, `response`) применяется логика маппинга и объединения server/client строк из [src/requestHeaders.ts](src/requestHeaders.ts).
- Обратная синхронизация `rows -> input` выполняется в [src/sourceSync.ts](src/sourceSync.ts) через `buildInputFromRows`.
- Контроль drift и дубликатов реализован в [src/App.tsx](src/App.tsx) + утилитах `getInputDriftRows`.

### 4) Экспорт
- HTML документ строится через `renderHtmlDocument` в [src/renderHtml.ts](src/renderHtml.ts).
- Wiki Markup строится через `renderWikiDocument` в [src/renderWiki.ts](src/renderWiki.ts).
- Экспорт проекта в JSON выполняется из [src/App.tsx](src/App.tsx) (`asProjectData`).

## Слои и ответственность модулей
- `App.tsx`: orchestration layer (state, use-case actions, wiring of feature components).
- `components/AppTopbar.tsx`: topbar shell (import/export actions, history controls, auth entry points, onboarding stepbar).
- `components/WorkspaceTabs.tsx`: workspace mode navigation (`editor/html/wiki`).
- `components/MethodSectionSidebar.tsx`: sidebar shell (project/method tree, section list, add block entrypoint, resize handle trigger).
- `components/ParsedSectionEditor.tsx`: wrapper of parsed section rendering flow (`request/response` editor vs generic parsed source/table).
- `components/DiagramSectionEditor.tsx`: diagram section feature shell (diagram list, source input, preview, rich-text description actions).
- `components/ErrorsSectionEditor.tsx`: error matrix feature shell (internalCode picker, formatting helpers, validation rules table).
- `components/MermaidLivePreview.tsx`: isolated Mermaid preview renderer with fallback image flow.
- `types.ts`: доменные типы и контракт состояния.
- `parsers.ts`: преобразование входа в `ParsedRow[]`.
- `requestHeaders.ts` / `requestColumns.ts`: прикладная логика request/response представления.
- `sourceSync.ts`: генерация JSON/cURL из таблицы.
- `renderHtml.ts` / `renderWiki.ts`: форматные адаптеры документа.
- `theme.ts`: управление токенами темы.
- `richText.ts`: преобразование rich text <-> wiki-подобный текст.

## Ограничения MVP
- Локальный режим (`npm run dev`) работает без backend и сохраняет данные в localStorage + JSON import/export.
- Серверные сценарии (auth, облачное сохранение проектов, AI endpoint) требуют запуска через Vercel Dev/деплой с настроенными env-переменными и Neon Postgres.
- Покрытие автотестами внедрено на MVP-уровне (unit + integration), но требует дальнейшего расширения при росте функционала.
- `App.tsx` остается крупным и все еще содержит большой объем UI и бизнес-логики, но shell-часть верхней панели, workspace tabs, sidebar, parsed-section wrapper, diagram editor и errors editor уже вынесены в `components/`.
- Эвристики парсинга cURL и определения типов покрывают типовые кейсы, но не являются строгим парсером спецификаций.

## Оценка рефакторинга на текущем этапе

### Нужен ли рефакторинг сейчас
Да, но поэтапный, без полной переработки архитектуры.

Причины:
- Высокая концентрация ответственности в [src/App.tsx](src/App.tsx) усложняет сопровождение и регрессионное тестирование.
- Дублирование похожих веток для server/client сценариев повышает риск расхождений поведения.
- Логика бизнес-правил и UI-рендеринг тесно связаны.

### Приоритет рефакторинга
1. Высокий: декомпозиция `App.tsx` на hooks + feature-компоненты.
2. Высокий: выделение use-case функций работы с `ParsedSection` (parse/sync/map/validate).
3. Средний: добавление минимального тестового покрытия для `parsers`, `sourceSync`, `requestHeaders`.
4. Средний: упростить и централизовать правила server/client ветвлений.

### Что можно отложить
- Полный переход на state machine/library для всего экрана.
- Перенос в отдельный backend до появления требований совместной работы пользователей.

## Рекомендуемый план без остановки разработки
1. Выделить `useProjectState` (load/save/import/export/reset + sanitize).
2. Выделить `useParsedSections` (parse, sync, drift, mapping, auth/meta).
3. Продолжить декомпозицию UI: вынести `TextSectionEditor` и `RequestSectionEditor` (часть parsed/request use-case), затем сократить прокидывание props через feature-level hooks.
4. Добавить тесты на чистые функции: `parseToRows`, `buildInputFromRows`, `getRequestRows`.

Такой подход снижает риск регрессий и не блокирует поставку новых функций.

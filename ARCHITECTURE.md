# ARCHITECTURE

## Назначение

Этот документ описывает фактическую архитектуру `doc-builder` на текущем этапе. Приложение эволюционировало из frontend-only MVP в SPA с serverless backend на Vercel Functions, серверным хранением проектов и AI-интеграцией.

## Контекст системы

### Frontend

- React 19 + TypeScript + Vite
- единая точка входа: `src/main.tsx`
- основной orchestration-слой: `src/App.tsx`
- клиент хранит локальное workspace-состояние, onboarding и часть пользовательских предпочтений в `localStorage`

### Backend

- serverless API в папке `api/`
- деплой-модель ориентирована на Vercel Functions
- хранение данных: Neon/Postgres
- сервер отвечает за auth, cookie-session, CRUD проектов и AI-прокси к OpenAI

### Внешние зависимости

- OpenAI Chat Completions API для AI-задач
- Neon/Postgres для пользователей, сессий и проектов
- Mermaid для визуализации диаграмм

## Основные bounded contexts

### 1. Редактор документации

Содержит:

- методы (`methods`)
- группы методов (`groups`)
- секции типов `text`, `parsed`, `diagram`, `errors`

Каждый метод является отдельным документом внутри общего workspace. Экспорт выполняется для активного метода.

### 2. Parsed-секции и dual-model

Для `Request` и `Response` приложение поддерживает:

- server-side source
- client-side source
- parsed rows для обеих сторон
- маппинг `serverField -> clientField`
- request metadata и auth metadata
- drift detection и обратную синхронизацию `rows -> input`

Ключевые модули:

- `src/parsers.ts`
- `src/requestHeaders.ts`
- `src/sourceSync.ts`
- `src/requestColumns.ts`

### 3. Onboarding

В приложении встроен управляемый onboarding:

- entry path: `quick_start`, `scratch`, `import`
- шаги: `choose-entry`, `prepare-source`, `run-parse`, `refine-structure`, `export-docs`
- состояние хранится в `localStorage`

Ключевые модули:

- `src/onboarding/featureFlags.ts`
- `src/onboarding/steps.ts`
- `src/onboarding/storage.ts`
- `src/onboarding/telemetry.ts`

### 4. Серверная синхронизация

При авторизованном пользователе клиент:

- получает текущего пользователя через `/api/auth/me`
- загружает список проектов через `/api/projects`
- сохраняет workspace и persisted history на сервер
- хранит `serverProjectId` локально для повторной привязки

Ключевой клиентский модуль:

- `src/serverSyncClient.ts`

## Формат данных

### Актуальный рабочий формат

Основное состояние приложения:

```ts
interface WorkspaceProjectData {
  version: number;      // сейчас фактически 3
  updatedAt: string;
  activeMethodId?: string;
  methods: MethodDocument[];
  groups: MethodGroup[];
}
```

`MethodDocument` содержит набор `DocSection[]` и является единицей редактирования/экспорта.

### Наследие предыдущего формата

В кодовой базе всё ещё присутствует более старый `ProjectData` с `sections[]` и `version: 2`. Он нужен для совместимости части старых сценариев и тестов, но не соответствует главной runtime-модели приложения.

## Серверный контур

### Auth

Таблицы:

- `users`
- `sessions`

Сессия хранится в cookie `doc_builder_session`:

- `HttpOnly`
- `SameSite=Lax`
- `Secure` только в `production`
- TTL 30 дней

Текущая реализация использует password hash на основе одиночного `SHA-256(salt:password)`, что является техническим долгом и должно быть заменено на password-specific KDF.

### Projects

Таблица `projects` хранит:

- имя проекта
- `workspace` в `JSONB`
- `history` в `JSONB`
- `payload_hash` для дедупликации

Сервер поддерживает:

- список проектов пользователя
- загрузку одного проекта
- сохранение проекта
- удаление проекта

### AI

`/api/ai` и `/api/openrouter` выполняют три задачи:

- исправление JSON
- генерация описаний полей
- подсказка маппинга

Сервер вызывает OpenAI напрямую и возвращает нормализованный JSON-ответ клиенту.

## Потоки данных

### Загрузка приложения

1. Клиент поднимает workspace из `localStorage`
2. Загружает onboarding state
3. Пытается получить текущего пользователя
4. При наличии сессии подтягивает серверные проекты

### Локальное автосохранение

1. Изменения workspace сериализуются в `WorkspaceProjectData`
2. Состояние пишется в `localStorage`
3. При включенной серверной синхронизации клиент дополнительно вызывает `saveServerProject`

### Парсинг source -> rows

1. Пользователь вставляет `JSON` или `cURL`
2. `parseToRows` преобразует источник в `ParsedRow[]`
3. Таблица редактируется вручную
4. При необходимости `buildInputFromRows` восстанавливает source

### Экспорт

- `renderHtmlDocument` строит standalone HTML
- `renderWikiDocument` строит Confluence Wiki Markup с `{toc}` и шаблонными вводными секциями

## Тестовый контур

### Что реально покрыто

- `parsers`
- `sourceSync`
- `requestHeaders`
- `renderHtml`
- `renderWiki`
- часть интеграционных сценариев `App`

### Текущее состояние

`npm run test:ci` сейчас не является зеленым gate. Основные причины:

- интеграционные тесты не синхронизированы с onboarding-потоком;
- часть тестов ожидает старый workspace/data contract;
- wiki renderer изменился, а тестовые ожидания остались от предыдущего шаблона.

## Архитектурные ограничения

- `src/App.tsx` перегружен UI-, state- и use-case логикой;
- часть документации в репозитории исторически отстает от кода;
- серверный контур не закрыт с точки зрения security hardening;
- отдельные тесты проверяют уже несуществующее поведение и создают ложный сигнал о качестве.

## Основные технические риски

- секреты могут утекать при неправильной работе с `.env`, если не соблюдать правила хранения;
- auth-сервис не имеет защиты от brute-force;
- AI endpoint может расходовать лимиты без rate limiting и access control;
- парольное хранилище не соответствует production-grade требованиям;
- release confidence снижен из-за красного `test:ci`.

## Рекомендуемый порядок стабилизации

1. Привести security hygiene в порядок: `.env`, auth hardening, AI rate limit.
2. Починить `test:ci` и синхронизировать тесты с текущим UX.
3. Декомпозировать `src/App.tsx` на hooks и feature-модули.
4. Разделить локальный и серверный lifecycle проекта более явно.
5. Добавить отдельный runbook для Vercel/Neon/OpenAI deployment.

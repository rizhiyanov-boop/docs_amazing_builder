# Конструктор API-документации

`doc-builder` это React/Vite-приложение для подготовки API-документации с экспортом в HTML и Confluence Wiki Markup. Текущая версия проекта уже не является frontend-only MVP: в репозитории есть serverless API для авторизации, серверного хранения проектов в Postgres/Neon и AI-помощников на базе OpenAI.

## Что умеет проект сейчас

- вести рабочее пространство версии `3` с несколькими методами и группами методов;
- собирать документацию из текстовых, parsed-, diagram- и error-секций;
- парсить `JSON` и `cURL` в табличную структуру;
- поддерживать dual-model режим для `Request` и `Response` (Server/Client);
- редактировать request headers, auth, внешний вызов, ошибки и правила валидации;
- экспортировать выбранный метод в HTML и Confluence Wiki;
- сохранять локальное состояние в `localStorage`;
- показывать onboarding-поток с быстрым стартом, пустым проектом и импортом JSON;
- выполнять серверную синхронизацию проекта и undo/redo history для авторизованного пользователя;
- использовать AI-хелперы для исправления JSON, генерации описаний и подсказки маппинга.

## Технологический стек

- Frontend: React 19, TypeScript, Vite 7
- Editor/UI: TipTap, Mermaid, highlight.js
- Testing: Vitest, Testing Library
- Serverless backend: Vercel Functions в папке `api/`
- Data store: Neon/Postgres через `@neondatabase/serverless`
- AI integration: OpenAI Chat Completions API

## Структура репозитория

- `src/` - основное SPA, редактор, экспорт, onboarding, синхронизация
- `api/` - Vercel Functions для auth, projects и AI
- `docs/` - вспомогательная продуктовая и техническая документация
- `scripts/` - служебные проверки и smoke-test
- `output/` - примеры экспортируемых артефактов

## Переменные окружения

Скопируйте [.env.example](.env.example) в локальный `.env` и заполните значения.

- `DATABASE_URL` или `POSTGRES_URL` - обязательны для `/api/auth/*` и `/api/projects`
- `OPENAI_API_KEY` - обязателен для `/api/ai`
- `OPENAI_MODEL` - опционален, по умолчанию используется `gpt-4.1-nano`

Важно: настоящий `.env` не должен попадать в Git.

## Локальный запуск

### Только frontend

Подходит для работы с локальным `localStorage`, экспортом, рендерингом и большей частью UI:

```powershell
npm install
npm run dev
```

Vite поднимет интерфейс на локальном URL вида `http://localhost:5173`.

### Полный стек через Vercel Dev

Нужен для авторизации, серверного сохранения и AI-эндпоинтов:

```powershell
npm install
npx vercel dev
```

Для server-side сценариев одного `vite dev` недостаточно, потому что клиент ожидает живые `/api/*`-эндпоинты.

## Основные API-эндпоинты

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### Projects

- `GET /api/projects`
- `GET /api/projects?id=...`
- `POST /api/projects`
- `DELETE /api/projects?id=...`

### AI

- `POST /api/ai`
- `POST /api/openrouter`

Поддерживаемые задачи:

- `repair-json`
- `fill-descriptions`
- `suggest-mappings`

## Формат данных

Текущее локальное рабочее пространство хранится как `WorkspaceProjectData`:

```json
{
  "version": 3,
  "updatedAt": "2026-03-31T18:17:07.331Z",
  "activeMethodId": "method-1",
  "methods": [],
  "groups": []
}
```

Исторический `ProjectData` с `version: 2` всё ещё упоминается в части старых тестов и документации, но фактическая рабочая модель приложения уже перешла на workspace-структуру.

## Качество и тесты

Базовые команды:

```powershell
npm run lint
npm run test
npm run test:coverage
npm run build
npm run test:ci
```

Текущее состояние на `2026-03-31`:

- `npm run test:ci` не проходит на чистом клоне;
- интеграционные тесты ожидают устаревший UI-контракт до onboarding-потока;
- часть тестов всё ещё проверяет старый формат данных `version: 2`;
- тест рендера wiki ожидает старую шапку документа, а текущий рендер формирует `{toc}` и шаблонные секции.

Подробности и статус набора тестов вынесены в [docs/TEST_PLAN_MVP.md](docs/TEST_PLAN_MVP.md).

## Известные ограничения и риски

- пароли пока хэшируются одинарным `SHA-256`, без password-specific KDF;
- auth API не содержит brute-force защиты;
- `/api/ai` не защищен rate limiting и может тратить серверный AI-бюджет;
- в ветке есть расхождение между реальным кодом и частью старых тестов;
- архитектура сосредоточена вокруг большого `src/App.tsx`, что повышает стоимость изменений.

## Полезные файлы

- [src/App.tsx](src/App.tsx) - основная orchestration-логика UI и состояния
- [src/types.ts](src/types.ts) - доменные типы и формат workspace
- [src/renderHtml.ts](src/renderHtml.ts) - экспорт HTML
- [src/renderWiki.ts](src/renderWiki.ts) - экспорт Confluence Wiki
- [src/serverSyncClient.ts](src/serverSyncClient.ts) - клиент серверной синхронизации
- [api/_lib/db.ts](api/_lib/db.ts) - схема, auth и хранение проектов
- [api/projects.ts](api/projects.ts) - server-side CRUD для проектов
- [api/ai.ts](api/ai.ts) - AI helper endpoint

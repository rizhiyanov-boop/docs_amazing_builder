# Конструктор документации API (MVP)

**Текущая версия:** 1.1.0

Приложение собирает документацию из фиксированных секций, парсит JSON/cURL в таблицы и генерирует 2 независимых формата:

- HTML
- Confluence Wiki Markup (Server/Data Center)

Актуально для текущей версии:
- парсинг поддерживает `JSON` и `cURL (REST)`;
- для секций `Request` и `Response` доступен dual-model режим (Server/Client), маппинг полей, настройка headers и авторизации.

## Что умеет MVP

- Включать/отключать секции (при отключении в экспорте выводится "Не используется")
- Мягкая валидация формы
- Блокировка parsed-секции при ошибке парсинга
- Автосохранение проекта в localStorage
- Экспорт/импорт проекта в JSON
- Экспорт документа в HTML и Wiki

## Запуск

Есть 2 режима запуска:
- frontend-only: только UI + localStorage (без `/api`);
- full-stack: UI + serverless API (`/api/*`) для auth, server save и AI.

### Вариант 1: если `node` и `npm` доступны глобально

1. Откройте терминал в папке проекта:

   `cd doc-builder`

2. Установите зависимости:

   `npm install`

3. Запустите dev-сервер:

   `npm run dev`

4. Откройте адрес из терминала (обычно `http://localhost:5173`).

Примечание:
- в этом режиме доступны редактор/экспорт/локальное сохранение;
- серверные функции (`/api/auth/*`, `/api/projects`, `/api/ai`) недоступны.

### Вариант 1.1: full-stack через Vercel Dev (рекомендуется для auth/server save/AI)

1. Убедитесь, что установлены зависимости проекта:

   `npm install`

2. Установите Vercel CLI (один раз):

   `npm install -D vercel`

3. Запустите full-stack dev:

   `npx vercel dev`

4. Откройте адрес Vercel Dev (обычно `http://localhost:3001`, но может быть `http://localhost:3000`, если порт занят).

### Вариант 2: portable Node (без админ‑прав)

1. Перейдите в проект:

   `cd doc-builder`

2. Скачайте и распакуйте portable Node 22 в `.tools` (один раз):

   ```powershell
   curl -o node22.zip https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip
   Expand-Archive -Path .\node22.zip -DestinationPath .\.tools\node22 -Force
   ```

3. Установите зависимости через portable npm (без симлинков):

   `..\.tools\node22\node-v22.14.0-win-x64\npm.cmd install --no-bin-links`

4. Запуск dev-сервера:

   `..\.tools\node22\node-v22.14.0-win-x64\npm.cmd run dev`

5. Сборка production:

   `..\.tools\node22\node-v22.14.0-win-x64\npm.cmd run build`

## Как пользоваться

1. Заполните текстовые секции (`Цель`, `Ошибки`, `Нефункциональные требования` и т.д.).
2. Для секций с парсингом:
   - выберите формат (`JSON`, `cURL (REST)`),
   - вставьте исходник,
   - нажмите `Парсить в таблицу`.
3. Если в секции ошибка парсинга — секция блокируется до исправления.
4. В любой момент можно:
   - `Экспорт HTML`,
   - `Экспорт Wiki`,
   - `Экспорт проекта JSON`,
   - `Импорт проекта JSON`.

## Быстрый smoke-тест генерации

- Команда (portable Node, без админ‑прав):

   `..\.tools\node22\node-v22.14.0-win-x64\node.exe scripts\smoke-test.mjs`

- Результат:
   - [output/smoke-test.html](output/smoke-test.html)
   - [output/smoke-test.wiki](output/smoke-test.wiki)

## AI интеграция (OpenAI API)

В проект добавлен серверный endpoint: `api/ai.ts`.

Что умеет AI:
- исправление JSON синтаксиса прямо в Source-блоке (`AI` кнопка рядом с `Beautify`);
- автозаполнение описаний полей (`AI: описания` в таблице parsed секции);
- подбор маппинга параметров (`AI: маппинг`, только при включенной доменной модели).

Важно:
- API ключ OpenAI хранится только на сервере (Vercel env vars), во фронтенд не попадает.
- Рекомендуемая модель по умолчанию: `gpt-4.1-nano`.

Настройка на Vercel (free plan):
1. Добавьте переменные окружения из файла `.env.example`.
2. Задайте `OPENAI_API_KEY`.
3. Опционально задайте `OPENAI_MODEL` (если не задано, используется `gpt-4.1-nano`).

## Авторизация и серверное сохранение

Добавлены:
- простая регистрация/вход по логину и паролю;
- серверное сохранение активного проекта;
- серверное сохранение истории изменений (undo/redo) вместе с проектом.

Без регистрации можно работать только локально (localStorage).

Новые endpoint'ы:
- `POST /api/auth/register` — регистрация;
- `POST /api/auth/login` — вход;
- `GET /api/auth/me` — текущий пользователь;
- `POST /api/auth/logout` — выход;
- `GET /api/projects` — список проектов пользователя;
- `GET /api/projects?id=...` — загрузка проекта с историей;
- `POST /api/projects` — сохранение проекта + истории.

Примечание:
Подключение Neon (Postgres):
- в проекте на Vercel создайте Postgres (Storage) и привяжите к проекту;
- Vercel/Neon добавит переменные окружения `DATABASE_URL` и связанные с ней;
- serverless API будет писать данные в Postgres без отдельного сервера.

### Частая ошибка синхронизации и как исправить

Если вы видите ошибку вида:
- `Сервер вернул некорректный ответ (HTTP 200)`
- `Сервер вернул HTML вместо JSON`

Причина:
- открыт только Vite dev-сервер (`http://localhost:5173`), а endpoint'ы `/api/*` в этом режиме недоступны.

Что делать:
1. Остановите текущий dev-сервер.
2. Запустите full-stack режим: `npx vercel dev`.
3. Откройте приложение через адрес Vercel Dev (обычно `http://localhost:3001`, но может быть `http://localhost:3000`, если порт занят).
4. Повторите вход/синхронизацию.

## Автотесты MVP

- Локальный запуск:
   - `npm run test`
   - `npm run test:coverage`
- Для CI и локального полного quality-check:
   - `npm run test:ci`
- План покрытия и quality gates:
   - [docs/TEST_PLAN_MVP.md](docs/TEST_PLAN_MVP.md)

## Основные файлы

- Интерфейс: [src/App.tsx](src/App.tsx)
- Парсеры: [src/parsers.ts](src/parsers.ts)
- Логика request/response (headers, auth, маппинг): [src/requestHeaders.ts](src/requestHeaders.ts)
- Рендер HTML: [src/renderHtml.ts](src/renderHtml.ts)
- Рендер Wiki: [src/renderWiki.ts](src/renderWiki.ts)
- Модели данных: [src/types.ts](src/types.ts)

## Важные примечания

- Текущая версия формата проекта: `version: 2` (см. `asProjectData` в [src/App.tsx](src/App.tsx)).
- Runtime поддерживает оба сценария:
   - frontend-only (`npm run dev`): только локальное сохранение;
   - full-stack (`vercel dev`/Vercel deploy): auth, сохранение проектов и AI через `api/`.

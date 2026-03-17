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

### Вариант 1: если `node` и `npm` доступны глобально

1. Откройте терминал в папке проекта:

   `cd doc-builder`

2. Установите зависимости:

   `npm install`

3. Запустите dev-сервер:

   `npm run dev`

4. Откройте адрес из терминала (обычно `http://localhost:5173`).

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

## Основные файлы

- Интерфейс: [src/App.tsx](src/App.tsx)
- Парсеры: [src/parsers.ts](src/parsers.ts)
- Логика request/response (headers, auth, маппинг): [src/requestHeaders.ts](src/requestHeaders.ts)
- Рендер HTML: [src/renderHtml.ts](src/renderHtml.ts)
- Рендер Wiki: [src/renderWiki.ts](src/renderWiki.ts)
- Модели данных: [src/types.ts](src/types.ts)

## Важные примечания

- Текущая версия формата проекта: `version: 2` (см. `asProjectData` в [src/App.tsx](src/App.tsx)).
- Runtime в MVP полностью фронтендовый (React + localStorage). Папка `server/` пока является заготовкой и не участвует в работе приложения.

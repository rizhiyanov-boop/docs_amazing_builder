# Конструктор документации API (MVP)

Приложение собирает документацию из фиксированных секций, парсит JSON/XML/cURL в таблицы и генерирует 2 независимых формата:

- HTML
- Confluence Wiki Markup (Server/Data Center)

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

### Вариант 2: если используете portable Node из текущего workspace

1. Перейдите в проект:

   `cd doc-builder`

2. Запуск dev-сервера через portable npm:

   `..\.tools\node\node-v22.14.0-win-x64\npm.cmd run dev`

3. Сборка production:

   `..\.tools\node\node-v22.14.0-win-x64\npm.cmd run build`

## Как пользоваться

1. Заполните текстовые секции (`Цель`, `Ошибки`, `Нефункциональные требования` и т.д.).
2. Для секций с парсингом:
   - выберите формат (`JSON`, `XML`, `cURL (REST)`),
   - вставьте исходник,
   - нажмите `Парсить в таблицу`.
3. Если в секции ошибка парсинга — секция блокируется до исправления.
4. В любой момент можно:
   - `Экспорт HTML`,
   - `Экспорт Wiki`,
   - `Экспорт проекта JSON`,
   - `Импорт проекта JSON`.

## Быстрый smoke-тест генерации

- Команда:

  `npm run smoke:test`

- Результат:
  - [output/smoke-test.html](output/smoke-test.html)
  - [output/smoke-test.wiki](output/smoke-test.wiki)

## Основные файлы

- Интерфейс: [src/App.tsx](src/App.tsx)
- Парсеры: [src/parsers.ts](src/parsers.ts)
- Рендер HTML: [src/renderHtml.ts](src/renderHtml.ts)
- Рендер Wiki: [src/renderWiki.ts](src/renderWiki.ts)
- Модели данных: [src/types.ts](src/types.ts)

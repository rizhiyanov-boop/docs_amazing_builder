# REVIEW PACKAGE

Дата подготовки: 2026-04-29

## Цель
Этот документ фиксирует правила формирования ZIP-архива проекта для code review и список проверок перед передачей.

## Что включено в архив
- исходники: `src/`, `api/`, `server/`, `scripts/`, `public/`;
- документация: `README.md`, `ARCHITECTURE.md`, `docs/`;
- проектные конфиги: `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `index.html`.

## Что исключено из архива
- каталоги зависимостей и сборки: `node_modules/`, `dist/`, `coverage/`, `output/`;
- служебные каталоги: `.git/`, `.vercel/`, `test-results/`;
- секреты и локальное окружение: `.env`, `.env.local`;
- временные артефакты: `*.log`, `vite*.log`, `vercel*.log`, `*.tmp`.

## Проверки перед передачей
1. В архиве отсутствуют секреты (`.env`, токены, ключи).
2. В архиве отсутствуют тяжелые/генерируемые артефакты (`node_modules`, `dist`, `coverage`).
3. В архиве присутствуют актуальные docs и конфиги запуска.
4. Структура архива открывается без ошибок.

## Как воспроизвести запуск после распаковки
1. `npm install`
2. `npm run dev` для frontend-only режима (`http://localhost:5173`)
3. `npx vercel dev` для full-stack режима (`http://localhost:3001` по умолчанию)

# TEST PLAN / QUALITY STATUS

## Цель документа

Этот файл фиксирует текущее состояние тестового контура в репозитории. Он не описывает идеальное покрытие, а отражает фактический статус на момент актуализации документации.

## Доступные команды

```powershell
npm run lint
npm run test
npm run test:coverage
npm run build
npm run test:ci
```

`test:ci` сейчас определен как:

```text
npm run lint && npm run test:coverage && npm run build
```

## Что покрыто тестами

- unit-тесты для `src/parsers.ts`
- unit-тесты для `src/sourceSync.ts`
- unit-тесты для `src/requestHeaders.ts`
- renderer-тесты для `src/renderHtml.ts` и `src/renderWiki.ts`
- интеграционные сценарии для `src/App.tsx`

## Актуальный статус

На чистом клоне после `npm install`:

- `lint` отрабатывает, но выдаёт предупреждения по `react-hooks/exhaustive-deps`
- `test:coverage` падает
- из-за этого `test:ci` сейчас красный

Основные причины падения:

1. `src/App.integration.test.tsx` ожидает поведение до onboarding-потока.
2. Тесты всё ещё опираются на формат данных `version: 2`, тогда как runtime использует workspace `version: 3`.
3. `src/renderers.test.ts` ожидает старую wiki-шапку, а текущий `renderWikiDocument` генерирует `{toc}` и шаблонные секции перед содержимым.

## Риски интерпретации

- текущий красный CI не всегда означает функциональную поломку продукта;
- часть падений вызвана устаревшими ожиданиями тестов, а не runtime-регрессией;
- при этом красный gate нельзя считать приемлемым состоянием для релиза.

## Что нужно сделать дальше

1. Переписать интеграционные тесты под onboarding и текущий UX.
2. Обновить test fixtures и ожидания под workspace `version: 3`.
3. Синхронизировать renderer expectations с текущим wiki-шаблоном.
4. После стабилизации закрепить `test:ci` как обязательный release gate.

# ARCHITECTURE

## Назначение
Документ описывает внутренний формат данных, правила трансформации входных данных в табличное представление и ограничения текущего MVP.

## Внутренний JSON формат
Состояние проекта хранится/экспортируется как `ProjectData` (см. [src/types.ts](src/types.ts#L1-L34)):

```json
{
  "version": 1,
  "updatedAt": "2026-03-02T12:00:00.000Z",
  "sections": [
    {
      "id": "goal",
      "title": "Цель",
      "enabled": true,
      "kind": "text",
      "value": "Описание цели",
      "required": true
    },
    {
      "id": "body",
      "title": "Body",
      "enabled": true,
      "kind": "parsed",
      "format": "json",
      "input": "{... исходный JSON ...}",
      "rows": [
        {
          "field": "data.items[0].id",
          "type": "int",
          "required": "±",
          "description": "",
          "example": "123",
          "source": "parsed"
        }
      ],
      "error": ""
    }
  ]
}
```

Ключевые сущности:
- `DocSection` — секция формы (`text` или `parsed`).
- `ParsedSection` — секция с парсингом (`format`: `json` | `xml` | `curl`), содержит исходный ввод `input`, результат парсинга `rows`, возможную ошибку `error` и флаг `enabled`.
- `ParsedRow` — табличная строка результата (`field`, `type`, `required`, `description`, `example`, опционально `source`). Поле `required` заполняется эвристически: `+`/`-` из cURL заголовков, `±` по умолчанию.

## Правила трансформации
Парсинг реализован в [src/parsers.ts](src/parsers.ts#L1-L200):
- JSON: `parseJson` → `flattenJson` раскладывает объект в пути вида `a.b[0].c`; для массивов берётся первый элемент, добавляется сводная строка с типом `array`/`array_object`. Типы определяются `inferType` (int/long/number/boolean/string/null/array/object).
- XML: `parseXml` использует `DOMParser`, добавляет строку на каждый элемент (`element`) и атрибут (`@attr`), пути вида `root.child.@attr`. Ошибка при невалидном или пустом XML.
- cURL: `parseCurl` извлекает тело (`-d/--data*`) и пытается распарсить JSON; затем разбирает заголовки `-H/--header` (эвристика типов: boolean/int/long/number/string, поддержка JSON-значений). URL фиксируется в `request.url`. Если ничего не найдено — ошибка.

Рендеринг:
- HTML: [src/renderHtml.ts](src/renderHtml.ts#L1-L80) — секции в `<h2>`, таблица с колонками Поле/Тип/Обязательность/Описание/Пример; экранирование спецсимволов.
- Confluence Wiki: [src/renderWiki.ts](src/renderWiki.ts#L1-L120) — заголовки `h2.`, таблица `||...||`, экранирование `|`, JSON примеры заворачиваются в `{json}`; многострочные значения нормализуются и разделяются `<br/>`.

## Ограничения
- Требуемая версия Node для dev/build: ≥ 20.19 (Vite 7.3.1); в workspace используется portable Node 22.14.0 (см. README). При запуске через более старый Node появятся ошибки `crypto.hash`/требование версии.
- XML-парсинг зависит от `DOMParser` (доступен в браузере; для серверной среды нужен полифил или среда с DOM).
- Для массивов детально раскрывается только первый элемент; `required` всегда `±` для JSON/XML и `-` для большинства заголовков cURL (без строгой схемы).
- Примеры обрезаются до 120 символов; описание/тип заполняются эвристически и могут требовать ручной корректировки.
- Постоянное хранилище — localStorage/экспорт JSON; серверной синхронизации нет.

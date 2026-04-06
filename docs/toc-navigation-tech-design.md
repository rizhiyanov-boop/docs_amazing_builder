# TOC Navigation: Technical Design

## Цель
Перейти от single-section режима в editor к full-document режиму:
- все секции выбранного метода рендерятся подряд в рабочей области;
- список секций в sidebar работает как оглавление (TOC) с мгновенным переходом к нужному блоку.

## Текущее поведение (as-is)
- Sidebar передает `onSelectSection`, который меняет `selectedId` в основном контейнере.
- Editor рендерит только `selectedSection` через ветку `selectedSection ? (...) : (...)`.
- Заголовок, кнопки удаления/включения/действий секции привязаны к единственной активной секции.

Точки кода:
- `selectedSection` вычисляется в `src/App.tsx`.
- `onSelectSection` прокинут в `MethodSectionSidebar` и вызывает `setSelectedId` в `src/App.tsx`.
- Sidebar секций находится в `src/components/MethodSectionSidebar.tsx`.

## Целевое поведение (to-be)
1. Вкладка `editor` показывает весь документ выбранного метода:
- `text`, `parsed`, `diagram`, `errors` секции идут сверху вниз по текущему порядку.
2. Sidebar секций = оглавление:
- click/Enter/Space на пункте TOC скроллит к якорю секции;
- активный пункт TOC обновляется от скролла (не только от клика).
3. Управление секциями сохраняется:
- rename/toggle/delete/copy/paste/reorder/add продолжают работать;
- действия применяются к конкретной секции-карточке в потоке документа.
4. Preview-вкладки `html/wiki` без изменений.

## Архитектурные изменения

### 1) State и refs в App
Добавить в `src/App.tsx`:
- `sectionRefs: Map<sectionId, HTMLElement>` через `useRef(new Map())`.
- `tocActiveSectionId: string | null` (можно реиспользовать `selectedId` как active-id для совместимости persisted history).
- `isProgrammaticScrollRef: boolean` для развязки click-scroll и observer-scroll.

Существующий `selectedId`:
- Не удалять сразу.
- Использовать как источник `tocActiveSectionId`, чтобы не ломать `WorkspaceSnapshot.selectedId` и историю.

### 2) Рендер editor: single -> list
В `src/App.tsx` в ветке `tab === 'editor'`:
- убрать зависимость от единственного `selectedSection` для основной панели;
- рендерить `sections.map(section => <SectionCard ... />)`;
- у каждой карточки добавить якорь:
  - `id="section-{section.id}"`
  - `data-section-id={section.id}`
  - ref callback в `sectionRefs`.

`SectionCard` на первом шаге можно не выносить в отдельный файл:
- оставить локальный `renderSectionCard(section)` для минимального diff;
- позже выделить компонент, если потребуется.

### 3) TOC-навигация из sidebar
В `src/components/MethodSectionSidebar.tsx`:
- оставить текущую разметку списка секций, но изменить смысл `onSelectSection`:
  - теперь это переход к секции, а не фильтр отображения.
- `aria-selected` заменить на `aria-current="true"` для активного пункта оглавления.

В `src/App.tsx`:
- в обработчике `onSelectSection(sectionId)`:
  - обновить active id (`setSelectedId(sectionId)`),
  - вызвать `scrollToSection(sectionId)` с `element.scrollIntoView({ behavior: 'smooth', block: 'start' })`,
  - учесть offset topbar через `scroll-margin-top` в CSS.

### 4) Синхронизация TOC от скролла
В `src/App.tsx`:
- добавить `IntersectionObserver` по всем секциям editor-потока;
- выбирать наиболее видимую секцию и обновлять `selectedId`;
- при программном скролле временно подавлять observer-обновление (флаг `isProgrammaticScrollRef`).

Рекомендованные параметры observer:
- `root`: контейнер скролла workspace/editor;
- `threshold`: `[0.1, 0.4, 0.7]`;
- `rootMargin`: верхний отступ под sticky topbar.

### 5) UX/стили
В `src/App.css` добавить:
- `.doc-section-anchor` или стиль для карточек секций с `scroll-margin-top`;
- выраженное состояние активного TOC-элемента;
- focus-visible стили для клавиатурной навигации.

## Совместимость и миграция
- Формат данных проекта не меняется (`src/types.ts` без изменений).
- `selectedId` в snapshot/history сохраняем для backward compatibility.
- undo/redo остается валидным, так как структура секций не меняется.

## План внедрения (итерации)

### Итерация 1 (минимально рабочая)
1. Рендер всех секций в editor.
2. Клик в TOC скроллит к секции.
3. `selectedId` используется как active TOC item.

### Итерация 2 (удобство)
1. IntersectionObserver обновляет активный пункт по скроллу.
2. Улучшение клавиатурной навигации и aria-атрибутов.

### Итерация 3 (стабилизация)
1. Регрессии: copy/paste/delete/reorder/add в full-document режиме.
2. Полировка scroll behavior и offset на desktop/mobile.

## Тестовый план

### Unit/logic
- helper выбора активной секции из observer entries.
- helper safe-scroll к sectionId (нет элемента -> no-op).

### Integration (обновить `src/App.integration.test.tsx`)
- editor отображает несколько секций одновременно.
- клик по пункту в sidebar вызывает переход к секции.
- при скролле меняется активный TOC пункт.
- удаление текущей секции корректно выбирает следующую visible секцию.

### Smoke
- tabs `editor/html/wiki` работают как ранее.
- импорт/экспорт проекта не изменился.
- performance приемлем на длинном документе (20+ секций).

## Риски и меры
- Риск: рост сложности `App.tsx`.
  - Мера: локальный `renderSectionCard` + отдельные helper-функции для toc/observer.
- Риск: дрожание active TOC при быстром скролле.
  - Мера: hysteresis (минимальная видимость + стабилизация через requestAnimationFrame).
- Риск: заголовок секции уходит под sticky topbar.
  - Мера: `scroll-margin-top` и корректный `rootMargin`.

## Definition of Done
- В `editor` секции отображаются единым потоком.
- Sidebar секций выполняет роль оглавления.
- Активный TOC-пункт синхронизирован со скроллом.
- Нет регрессий в parsing/export/import/history.
- Тесты и линт проходят.

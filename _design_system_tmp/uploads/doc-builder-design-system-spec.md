# ТЗ на дизайн-систему: doc-builder
**Версия:** 1.0  
**Дата:** 2026-04-29  
**Продукт:** doc-builder — инструмент для создания API-документации

---

## 1. Контекст и цели

### 1.1 Продукт
doc-builder — web SPA для технических писателей и разработчиков, которые документируют API-методы и экспортируют документацию в HTML и Confluence Wiki. Интерфейс плотный, рабочий, используется часами в день.

### 1.2 Аудитория на этапах роста
- **Сейчас:** внутренняя команда разработки (~5–15 человек), технические специалисты
- **Следующий этап:** несколько команд внутри компании, появляются нетехнические пользователи
- **Целевой:** внешние B2B-клиенты, монетизация

Дизайн-система должна масштабироваться вместе с продуктом и не потребовать полного переписывания при каждом этапе.

### 1.3 Визуальный язык
**Референсы:** Vercel, Raycast, Linear — строгий, современный, продуктовый.  
**Не:** корпоративный enterprise (SAP, Jira), яркий consumer (Notion, Canva).

Ключевые характеристики визуального языка:
- Минимализм без аскетизма — есть характер, но нет декора
- Высокая плотность информации без ощущения перегруженности
- Тёмная тема — первоклассная, не «тёмный режим как опция»
- Чёткая типографика как основной носитель смысла

### 1.4 Платформа
Web-only (SPA). Проектируется с учётом будущего расширения на mobile web и, возможно, Electron/desktop.

---

## 2. Структура дизайн-системы

Дизайн-система состоит из четырёх уровней:

```
Уровень 1: Фундамент (Foundations)
    Токены, типографика, цвет, сетка, иконки, анимация

Уровень 2: Примитивы (Primitives)
    Базовые компоненты без бизнес-логики

Уровень 3: Составные компоненты (Compounds)
    Сложные компоненты из примитивов

Уровень 4: Паттерны (Patterns)
    Типовые UI-решения для конкретных задач продукта
```

---

## 3. Фундамент

### 3.1 Цветовые токены

Двухуровневая система: **Foundation tokens → Semantic tokens**.  
Foundation токены — «что это», semantic — «для чего».

#### Foundation palette (примерный диапазон)

```
Neutral:   gray-0 (#ffffff) … gray-950 (#0a0a0a)
Accent:    blue-50 … blue-900   (primary action)
Success:   green-50 … green-700
Warning:   amber-50 … amber-700
Danger:    red-50 … red-700
Info:      sky-50 … sky-700
```

#### Semantic tokens (обязательный минимум)

| Токен | Light | Dark |
|-------|-------|------|
| `--color-bg-base` | gray-0 | gray-950 |
| `--color-bg-subtle` | gray-50 | gray-900 |
| `--color-bg-elevated` | gray-0 | gray-900 |
| `--color-bg-overlay` | gray-0 | gray-850 |
| `--color-border-default` | gray-200 | gray-800 |
| `--color-border-subtle` | gray-100 | gray-850 |
| `--color-text-primary` | gray-950 | gray-50 |
| `--color-text-secondary` | gray-600 | gray-400 |
| `--color-text-tertiary` | gray-400 | gray-600 |
| `--color-text-disabled` | gray-300 | gray-700 |
| `--color-text-on-accent` | white | white |
| `--color-accent-default` | blue-600 | blue-500 |
| `--color-accent-hover` | blue-700 | blue-400 |
| `--color-accent-subtle` | blue-50 | blue-950 |
| `--color-danger-default` | red-600 | red-500 |
| `--color-danger-subtle` | red-50 | red-950 |
| `--color-success-default` | green-600 | green-500 |
| `--color-success-subtle` | green-50 | green-950 |

Все компоненты используют **только semantic tokens**, никогда foundation напрямую.

---

### 3.2 Типографика

**Шрифт:** Geist (от Vercel, бесплатный) или Inter как запасной.  
Geist — нейтральный, технически чистый, хорошо читается в dense UI.

#### Typescale

| Имя | Size | Line height | Weight | Использование |
|-----|------|-------------|--------|---------------|
| `display-lg` | 32px | 40px | 600 | Пустые состояния, onboarding |
| `display-sm` | 24px | 32px | 600 | Заголовки страниц |
| `heading-lg` | 18px | 28px | 600 | Заголовки секций |
| `heading-md` | 16px | 24px | 600 | Заголовки карточек |
| `heading-sm` | 14px | 20px | 600 | Подзаголовки, лейблы групп |
| `body-lg` | 16px | 24px | 400 | Основной текст |
| `body-md` | 14px | 20px | 400 | Основной текст UI |
| `body-sm` | 13px | 18px | 400 | Вторичный текст, подсказки |
| `code` | 13px | 20px | 400 | Monospacе: JetBrains Mono / Geist Mono |
| `label-md` | 13px | 16px | 500 | Лейблы форм, бейджи |
| `label-sm` | 11px | 14px | 500 | uppercase-лейблы, счётчики |

#### Правила
- `label-sm` используется **только в uppercase** с `letter-spacing: 0.06em`
- Моноширинный шрифт — для всего кода, URL, имён методов/полей
- Не использовать `font-weight: 700` в UI — только в маркетинге

---

### 3.3 Пространство и сетка

#### Spacing scale (базовая единица 4px)

```
space-0.5 = 2px   (разделители, тонкие отступы)
space-1   = 4px
space-1.5 = 6px
space-2   = 8px
space-3   = 12px
space-4   = 16px
space-5   = 20px
space-6   = 24px
space-8   = 32px
space-10  = 40px
space-12  = 48px
space-16  = 64px
```

#### Радиус скругления

```
radius-sm  = 4px   (инпуты, маленькие бейджи)
radius-md  = 6px   (кнопки, карточки)
radius-lg  = 8px   (модалки, крупные блоки)
radius-xl  = 12px  (попапы, дропдауны)
radius-full = 9999px (пилюли, аватары)
```

#### Лейаут-сетка

Продукт использует **фиксированный shell-лейаут**, не CSS-колонки:

```
[Topbar: 48px высота]
[Sidebar: 220–320px, resizable] [Content: flex-1]
[Bottombar: опционально, для статуса]
```

Брейкпоинты (web-only сейчас, с расчётом на будущее):

```
sm:  640px   (сужение сайдбара до иконок)
md:  768px   (коллапс сайдбара)
lg:  1024px  (стандартный рабочий лейаут)
xl:  1280px  (комфортный рабочий лейаут)
2xl: 1536px  (широкие экраны, опциональная третья колонка)
```

---

### 3.4 Тени и глубина

Только 3 уровня глубины — не больше:

```
shadow-sm:  0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)
shadow-md:  0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)
shadow-lg:  0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)
```

В тёмной теме тени заменяются **border + slight bg elevation** — тени на тёмном фоне не читаются.

---

### 3.5 Иконки

**Набор:** Lucide Icons — открытый, консистентный, 24×24 с вариантом 16×16.  
Почему Lucide: уже частично используется в проекте, хорошая совместимость с Vercel/Linear-эстетикой.

Правила использования:
- Размер 16px — в строке с текстом `body-md`
- Размер 20px — standalone иконки в кнопках без текста
- Размер 24px — пустые состояния, иллюстрации
- Всегда использовать `currentColor` — цвет наследуется от родителя
- Stroke width: 1.5px (стандарт Lucide)

---

### 3.6 Анимация и переходы

**Принцип:** анимация функциональная, не декоративная.

```
duration-fast:    100ms   (hover-состояния, мгновенная обратная связь)
duration-normal:  150ms   (большинство переходов: открытие дропдауна, смена состояния)
duration-slow:    250ms   (сайдбар, модалки, появление панелей)
duration-enter:   200ms   (элементы появляются)
duration-exit:    150ms   (элементы исчезают — всегда быстрее появления)

easing-default:   cubic-bezier(0.16, 1, 0.3, 1)   (spring-like, для появлений)
easing-linear:    linear                            (прогресс-бары)
easing-in:        cubic-bezier(0.4, 0, 1, 1)       (исчезновения)
```

Правила:
- `prefers-reduced-motion` — все анимации отключаются, переходы мгновенные
- Не анимировать `width`/`height` — только `transform` и `opacity`
- Сайдбар collapse: `transform: translateX(-100%)`, не `width: 0`

---

## 4. Примитивные компоненты

### 4.1 Button

**Варианты:**

| Вариант | Использование |
|---------|---------------|
| `primary` | Одно главное действие на экране |
| `secondary` | Вторичные действия |
| `ghost` | Действия в тулбарах, inline-кнопки |
| `danger` | Деструктивные действия (удалить, сбросить) |
| `link` | Текстовые ссылки-действия |

**Размеры:** `sm` (28px) / `md` (32px) / `lg` (36px)

**Состояния:** default / hover / active / focus-visible / disabled / loading

Правила:
- `primary` — максимум одна на экране/панели
- `danger` всегда требует подтверждения (confirm dialog или двойной клик)
- Loading-состояние: spinner заменяет иконку, текст не меняется
- Иконка слева от текста, никогда справа (кроме стрелки «следующий шаг»)

---

### 4.2 Input / Textarea

**Анатомия:** Label → Input → Helper text / Error message

**Размеры:** `sm` (28px) / `md` (32px)

**Состояния:** default / hover / focus / error / disabled / readonly

Правила:
- Label всегда над полем, не placeholder как замена лейблу
- Placeholder — подсказка формата (`например: POST /api/v1/users`), не описание поля
- Error message появляется под полем, красный текст + иконка
- `readonly` визуально отличается от `disabled`: disabled — серый, readonly — нормальный цвет с lock-иконкой

---

### 4.3 Badge / Tag

Используется для меток `REQUEST`, `RESPONSE`, статусов, типов.

**Варианты:** `neutral` / `accent` / `success` / `warning` / `danger` / `code`

**Размеры:** `sm` (18px) / `md` (22px)

Правило: `sm` с uppercase + letter-spacing для технических меток (`REQUEST`, `GET`, `POST`). `md` для читаемых лейблов.

---

### 4.4 Tooltip

- Задержка появления: 400ms (не мигает при случайном наведении)
- Максимальная ширина: 240px
- Позиционирование: автоматическое (не выходит за viewport)
- Обязателен для всех иконок без текстового лейбла

---

### 4.5 Dropdown / Select / Menu

- Открывается с анимацией `scale(0.96) → scale(1)` + `opacity 0 → 1`
- Закрывается по Escape, клику вне, выбору пункта
- Клавиатурная навигация: стрелки, Enter, Escape — обязательно
- Поиск внутри дропдауна — при >8 пунктах
- Разделители группируют связанные действия

---

### 4.6 Tabs

Два варианта:

**Line tabs** — горизонтальные вкладки с подчёркиванием (для навигации уровня страницы: Редактор / HTML / Wiki).

**Pill tabs** — таблетки (для переключения вида внутри компонента).

Правило: не смешивать оба варианта на одном экране.

---

### 4.7 Table

Используется для основного рабочего контента (поля запроса/ответа).

- Шапка: `label-sm` uppercase, `--color-text-secondary`
- Строки: 36px высота стандарт, 28px — compact режим
- Hover строки: `--color-bg-subtle`
- Выбранная строка: `--color-accent-subtle` + accent border-left 2px
- Sticky header при скролле внутри панели
- Inline редактирование ячеек — без отдельной формы

---

### 4.8 Resizable Panel

Для сайдбара и разделения панелей.

- Drag handle: 4px широкая зона, visually 1px линия
- При hover: линия подсвечивается accent-цветом
- При drag: курсор `col-resize`, линия 2px accent
- Минимальная ширина панели фиксируется (не схлопывается до нуля, есть порог коллапса)
- Double-click на handle: сброс в дефолтную ширину

---

### 4.9 Scrollbar

Кастомный скроллбар в стиле темы:
- Ширина: 6px
- Track: прозрачный
- Thumb: `--color-border-default`, radius 3px
- Hover thumb: `--color-text-tertiary`
- Появляется только при hover родителя (`overflow: overlay` или JS-решение)

---

## 5. Составные компоненты

### 5.1 Topbar

**Высота:** 48px  
**Структура (слева направо):**

```
[Logo / Product name]  [divider]  
[Method export group: JSON · MOCK · HTML · WIKI]  [divider]  
[Project export group: Проект HTML · Проект Wiki]  [divider]  
[Undo · Redo]  
[spacer flex-1]  
[View controls]  [divider]  
[User menu]
```

**Правила:**
- Divider — вертикальная линия `1px --color-border-subtle`, высота 20px
- Группы кнопок экспорта — визуально разделены, не сливаются
- Активная вкладка (HTML/WIKI как state switcher) — pill-стиль с bg, не просто underline
- User menu — аватар + имя + стрелка, Logout внутри dropdown
- Все иконки-кнопки без текста имеют tooltip

---

### 5.2 Sidebar

**Ширина:** 220px default, 320px max, 180px min, коллапс в 48px (только иконки)  
**Resizable:** да, drag handle справа

**Анатомия (сверху вниз):**
```
[Project header: название + счётчик методов + actions]
[Method list: скроллируемый список]
  [Method item: имя + стрелка expand]
    [Section list: секции метода]
      [Section item: иконка + название + badge]
[divider]
[Workspace switcher: другие проекты]
[+ добавить метод / – удалить]
```

**Method item:**
- Высота: 32px
- Имя метода: `body-md`, моноширинный шрифт
- Переполнение: `ellipsis` с tooltip на hover
- Expand arrow: анимированный rotate 90°

**Section item:**
- Высота: 28px, отступ слева 16px (вложенность)
- Badge `REQUEST`/`RESPONSE`: `badge-sm code`
- Активная секция: accent bg + accent text

**Workspace switcher:**
- `border-top --color-border-subtle`
- Заголовок: `label-sm` «Рабочее пространство» uppercase
- Каждый проект: название + счётчик + стрелка перехода

---

### 5.3 Content Area

**Tabs:** Line tabs (Редактор / HTML / Wiki) — единственное место переключения, кнопки в топбаре дублируют их состояние, синхронизированы.

**Editor tab:**
- Область редактирования секции: белый/тёмный фон, чёткая граница от сайдбара
- Заголовок секции: `heading-md` + действия (AI-кнопки) в правом углу

**HTML / Wiki tab:**
- Монолитный блок с исходником
- Toolbar: «Скопировать» + «Скачать» — в правом верхнем углу блока
- Шрифт содержимого: моноширинный, `body-sm`
- Блок имеет `border --color-border-default` и `border-radius-md`
- Светлая тема: `box-shadow-sm` для отделения от фона страницы

---

### 5.4 Empty State

Для пустых методов, пустых секций, пустого проекта.

**Анатомия:**
```
[Иконка 32px, --color-text-tertiary]
[Заголовок display-sm]
[Описание body-md --color-text-secondary, max-width 320px]
[CTA Button primary или ghost]
```

Центрируется в доступной области. Не занимает весь экран.

---

### 5.5 AI Action Bar

Панель AI-действий внутри секции (fill-descriptions, suggest-mappings и т.д.).

- Появляется как floating bar под заголовком секции при наведении / фокусе
- Кнопки: ghost с иконкой + короткий текст
- Loading state: spinner + текст «Генерация...»
- Error state: inline сообщение об ошибке + retry

---

### 5.6 Confirmation Dialog

Для деструктивных действий.

**Размер:** 400px ширина  
**Анатомия:** заголовок + описание последствий + [Отмена] [Подтвердить danger]

Правила:
- Фокус автоматически на «Отмена» (не на деструктивной кнопке)
- Escape = отмена
- Backdrop blur + overlay

---

## 6. Паттерны

### 6.1 Inline editing

Ячейки таблицы редактируются по клику — без отдельных форм/модалок. Состояния: view → edit → saving → saved/error. При edit: border акцентный, остальные ячейки приглушены.

### 6.2 Autosave indicator

В топбаре или рядом с названием проекта: `Сохранено · 2 мин назад` / `Сохранение...` / `Ошибка сохранения [Retry]`. Не попап, не toast — постоянный тихий индикатор.

### 6.3 Keyboard shortcuts

Продукт активно используется техническими пользователями — шорткаты обязательны. Отображаются в tooltip через `⌘K`-нотацию. Список шорткатов доступен через `?`.

### 6.4 Drag and drop

Для переупорядочивания секций и методов. Drag handle: `⠿` иконка, появляется при hover строки слева. При drag: строка становится ghost, позиция вставки — accent линия.

### 6.5 Toast notifications

Для некритичных уведомлений (скопировано, экспорт начат).
- Позиция: bottom-right
- Максимум 3 одновременно
- Auto-dismiss: 3s для info/success, 6s для error, кнопка ✕
- Не перекрывают рабочую область

---

## 7. Токены темы в коде

Дизайн-система реализуется через CSS Custom Properties. Текущая файловая структура расширяется:

```
src/
  tokens.foundation.css    — palette (уже есть, расширить)
  tokens.semantic.css      — semantic mapping light (уже есть, расширить)
  tokens.dark.css          — semantic mapping dark (выделить из текущего)
  tokens.motion.css        — duration + easing (новый)
  tokens.typography.css    — typeface + scale (новый)
```

Переключение темы: `data-theme="dark"` на `<html>`, без дублирования переменных через класс.

---

## 8. Figma-структура (для дизайнера)

```
📁 doc-builder Design System
  📄 0. Cover & Changelog
  📄 1. Foundations
      Colors (palette + semantic, light + dark)
      Typography (typeface + scale)
      Spacing & Grid
      Shadows
      Icons (Lucide subset)
      Motion
  📄 2. Primitives
      Button
      Input / Textarea
      Badge / Tag
      Tooltip
      Dropdown / Menu
      Tabs
      Table
      Scrollbar
  📄 3. Compounds
      Topbar
      Sidebar
      Content Area
      Empty State
      AI Action Bar
      Confirmation Dialog
  📄 4. Patterns
      Inline Editing
      Autosave
      Drag & Drop
      Toast
  📄 5. App Screens
      Editor (light + dark)
      HTML Preview
      Wiki Source
      Onboarding
      Auth (login / register)
      Empty workspace
```

**Требования к Figma-файлу:**
- Все цвета через Variables (Figma Variables, не Styles)
- Все компоненты с Auto Layout
- Каждый компонент: все состояния в одном фрейме
- Light/Dark — через Variable Modes, не дублирование компонентов
- Именование: `Component/Variant/State` (например `Button/Primary/Hover`)

---

## 9. Критерии готовности

### Фундамент готов, когда:
- [ ] Все semantic color-токены определены для light и dark
- [ ] Typeface подключён, typeScale задокументирован
- [ ] Spacing scale покрывает все случаи без магических чисел
- [ ] Motion-токены покрывают все анимации

### Примитив готов, когда:
- [ ] Все состояния реализованы (включая focus-visible для a11y)
- [ ] Работает в light и dark теме без правок
- [ ] Есть keyboard navigation где применимо
- [ ] Есть storybook / живая документация (опционально на MVP)

### Система готова к production, когда:
- [ ] Все экраны продукта используют только компоненты системы
- [ ] Нет inline-стилей и магических значений вне токенов
- [ ] CSS-переменные не дублируются — один источник правды
- [ ] `prefers-reduced-motion` обрабатывается

---

## 10. Приоритет реализации

| Этап | Что делаем | Цель |
|------|-----------|------|
| **1. Фундамент** | Токены цвета, типографика, spacing | Единый источник правды для всех правок |
| **2. Критические примитивы** | Button, Input, Badge, Tooltip | Унификация повторяющихся элементов |
| **3. Shell** | Topbar, Sidebar | Исправить главные UX-проблемы навигации |
| **4. Таблица** | Table + inline editing | Ключевой рабочий компонент продукта |
| **5. Остальные примитивы** | Dropdown, Tabs, Dialog | Покрытие оставшихся компонентов |
| **6. Составные** | Content Area, Empty State, AI Bar | Финальная сборка экранов |

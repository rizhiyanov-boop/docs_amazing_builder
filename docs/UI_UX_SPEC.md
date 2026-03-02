# UI/UX Specification

## Goals
- Modern, clean, contrast UI with light/dark themes.
- Fast data entry with clear validation and instant previews.
- Drag-and-drop section ordering and smooth feedback for parsing states.

## Visual System
- **Fonts:** Google Fonts Inter (primary), fallback sans; sizes 14/16/20/28.
- **Colors:**
  - Light theme: bg #0F172A -> panels #111827 -> cards #1F2937 with gradient accents (#6366F1 -> #22D3EE).
  - Dark theme: bg #0B1021 -> panels #0F172A -> cards #111827 with gradient accents (#7C3AED -> #06B6D4).
  - States: success #22c55e, warning #f59e0b, error #ef4444, info #3b82f6.
- **Elevation:** Subtle shadows (0 8px 24px rgba(0,0,0,0.16)); border radius 10-14px.
- **Icons:** Material Symbols Rounded; size 18/20; accent color for state icons.
- **Motion:** 180ms ease-out transitions on hover/focus; skeleton shimmer for loading; shake/pulse for parse errors.

## Layout Structure
- **Header:** Logo, actions (New, Open, Save, Export), Theme toggle, Autosave badge.
- **Left Sidebar:** Sections list with drag-and-drop, status chips (ok/error/disabled), "Add section" button.
- **Main Workspace:**
  - Top tabs: Editor | HTML | Wiki.
  - Editor pane: form for selected section; for parsed sections — format switcher (JSON/XML/cURL), textarea, Parse button, validation messages.
  - Preview panes (HTML/Wiki) rendered live; split view toggle.
- **Right Rail (optional):** Quick properties (required toggle, title, enable/disable), history of autosaves, export shortcuts.
- **Footer:** Version info, docs links, "Smoke test" shortcut.

## UX Flows
1) **Add section**
   - Trigger: "Add section" button (sidebar).
   - Modal: choose type (Text/Parsed), name, required flag.
   - Result: new section appended and focused; inline toast confirms.
2) **Reorder sections**
   - Drag-and-drop rows in sidebar; drop indicator and smooth reorder animation.
   - Persist order immediately; show "Saved" badge.
3) **Edit section**
   - Select section -> form opens.
   - Autosave on pause (800ms debounce); badge shows time, spinner while saving.
4) **Parse data (parsed section)**
   - User selects format (JSON/XML/cURL), enters source, clicks "Parse".
   - Success: table preview updates; chip "Parsed"; toast with row count.
   - Error: field outlined in error color; inline message; icon; shake animation; section locked until resolved.
5) **Preview HTML/Wiki**
   - Tabs or split view; render via existing renderers; auto-update on change.
   - Copy buttons; download buttons for HTML/Wiki.
6) **Export / Import**
   - Export buttons: HTML, Wiki, Project JSON.
   - Import: drag-and-drop JSON file or file picker; validation before replace.

## Component Plan (React/TS)
- **Shell**: layout with header/sidebar/main/footer, theme provider.
- **SectionList**: sortable list, status chips, add button.
- **SectionForm**:
  - TextSectionForm: title, textarea, required, enabled.
  - ParsedSectionForm: format switch (segmented control), textarea, parse action, error panel.
- **PreviewTabs**: Editor/HTML/Wiki + Split toggle; renders HTML/Wiki outputs.
- **TablePreview**: renders parsed rows with sticky header, zebra rows, copy cell.
- **AutosaveBadge**: states: saving/saved/error + timestamp.
- **Toasts**: success/error/info; top-right.
- **ThemeToggle**: light/dark.
- **Modal**: add section, confirm overwrite on import.

## Validation & States
- Empty input for parsed -> error "Введите исходные данные".
- Parse errors surface from parsers; section locked with explanation.
- Highlight invalid fields; tooltips with details; keyboard focus moves to first error.
- Required text sections: basic non-empty check.

## Accessibility
- Keyboard navigation for sidebar and tabs.
- Focus rings with 2px outline; sufficient contrast per WCAG AA.
- ARIA labels on inputs, buttons, drag handles.

## Implementation Notes
- Use TailwindCSS (preferred for speed) or MUI. If Tailwind: set up dark mode class strategy; define CSS variables for brand colors and shadows.
- Use `@dnd-kit` or `react-beautiful-dnd` for section ordering.
- Keep preview rendering on a worker-friendly boundary if performance becomes an issue (optional later).
- Integrate autosave with localStorage; show last saved time; debounce 800ms.
- Add lightweight state machine for parse states: idle -> parsing -> success | error.

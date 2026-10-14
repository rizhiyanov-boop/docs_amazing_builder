# Design Tokens

This file documents the shared design tokens used by the UI.

## Source Of Truth

- Token entrypoint: `src/tokens.css`
- Foundation tokens: `src/tokens.foundation.css`
- Semantic tokens: `src/tokens.semantic.css`
- Component styles consume tokens from: `src/App.css`

## Guardrail Script

- Run `npm run lint:tokens` to detect hardcoded `px` values in tokenized properties.
- Scope: `font-size`, `gap`, `padding`, `margin`, `border-radius` families in `src/**/*.css`.
- Token files are excluded from this check by design.

Do not hardcode spacing, font-size, or radii in component rules when an existing token is suitable.

## Typography

- `--font-sans`: base UI font stack
- `--font-size-2xs`: 12px
- `--font-size-xs`: 12px
- `--font-size-sm`: 12px
- `--font-size-md`: 14px
- `--font-size-lg`: 16px
- `--font-size-xl`: 16px
- `--font-size-2xl`: 20px
- `--font-size-3xl`: 24px
- `--line-height-base`: base text line height

## Spacing

- `--space-0`: 0
- `--space-0-5`: 4px
- `--space-1`: 4px
- `--space-1-5`: 8px
- `--space-2`: 8px
- `--space-2-25`: 8px
- `--space-3`: 8px
- `--space-4`: 16px
- `--space-5`: 16px
- `--space-5-5`: 24px
- `--space-6`: 16px
- `--space-7`: 24px
- `--space-8`: 24px
- `--space-10`: 32px
- `--space-neg-0-5`: -4px

## Radius

- `--radius-2xs`: 4px
- `--radius-xs`: 8px
- `--radius-sm`: 8px
- `--radius-md`: 8px
- `--radius-lg`: 12px
- `--radius-pill`: 999px

## Semantic Colors

- Surfaces: `--bg`, `--panel`, `--card`
- Text: `--text`, `--muted`
- Accent: `--accent`, `--accent-solid`
- Borders and shadows: `--border`, `--shadow`
- States: `--success`, `--warning`, `--danger`
- Inputs and scrolling: `--input-bg`, `--input-text`, `--scrollbar-track`, `--scrollbar-thumb`, `--scrollbar-thumb-hover`
- Buttons and active states: `--button-*`, `--active-*`

## Usage Rules

- Prefer token values over raw px in new CSS.
- If a one-off value appears multiple times, add a new token.
- Keep token names semantic and stable to avoid large refactors.
- Theme toggling should only override token values (or color-scheme), not component structure.

The method editor consumes editor-standard.css after workbench-shell.css. Its UI font is Inter, matching the sidebar; technical content uses JetBrains Mono. Editor controls/table text use 13px and labels use 12px. Section inset is 16px, nested group inset is 12px. Ordinary icons use wb-text-soft, selected states use wb-accent, and destructive actions use wb-danger. Tables and contract panels use neutral Workbench surfaces; Client/Server color is limited to badges.

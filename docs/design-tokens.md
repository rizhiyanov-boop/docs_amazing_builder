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
- `--font-size-2xs`: 9px
- `--font-size-xs`: 12px
- `--font-size-sm`: 13px
- `--font-size-md`: 14px
- `--font-size-lg`: 15px
- `--font-size-xl`: 16px
- `--font-size-2xl`: 17px
- `--font-size-3xl`: 20px
- `--line-height-base`: base text line height

## Spacing

- `--space-0`: 0
- `--space-0-5`: 2px
- `--space-1`: 4px
- `--space-1-5`: 6px
- `--space-2`: 8px
- `--space-2-25`: 9px
- `--space-3`: 10px
- `--space-4`: 12px
- `--space-5`: 14px
- `--space-5-5`: 22px
- `--space-6`: 16px
- `--space-7`: 20px
- `--space-8`: 24px
- `--space-10`: 40px
- `--space-neg-0-5`: -2px

## Radius

- `--radius-2xs`: 6px
- `--radius-xs`: 8px
- `--radius-sm`: 10px
- `--radius-md`: 12px
- `--radius-lg`: 14px
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

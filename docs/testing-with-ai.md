# Testing With AI

This project now uses a three-layer testing setup that works well for a solo developer:

## Fast local check

Run this after small code changes:

```bash
npm run lint
npm run test:unit
```

What it covers:
- Type-safe logic regressions
- Parser and request mapping rules
- HTML and Wiki export rendering

## Browser smoke check

Run this before merge, deploy, or after risky UI refactors:

```bash
npm run test:smoke
```

What it covers:
- App shell loads
- Text editing works
- Request JSON parsing works
- Domain model client flow works
- HTML/Wiki export still downloads
- Workspace import still works

## Full regression command

Run this before release:

```bash
npm run test:all
```

This executes:
- `lint`
- `unit tests`
- `Playwright e2e`
- `production build`

## AI workflow

Use AI in three concrete ways:

### 1. Generate test cases before coding

Prompt:

```text
Act as a senior QA. Based on this feature diff, list:
1. core happy paths
2. risky regressions
3. edge cases
4. which cases should be unit, which should be Playwright
```

### 2. Expand unit coverage after logic changes

Prompt:

```text
Act as an SDET. Review this file and generate table-driven Vitest cases for the logic branches that are currently untested.
Focus on regressions, invalid input, and format drift.
```

### 3. Run exploratory regression after refactors

Prompt:

```text
Act as a senior exploratory tester for this product.
Given the changed files, produce a regression checklist ordered by risk.
Highlight anything around parsing, source sync, auth, headers, import/export, and dual-model request/response flows.
```

## Suggested habit

Daily:
- `npm run lint`
- `npm run test:unit`

Before pushing risky UI changes:
- `npm run test:smoke`

Before release:
- `npm run test:all`

## Current smoke suite

Playwright smoke scenarios live in:
- [e2e/app-smoke.spec.ts](/D:/pet/docs_amazing_builder_github_2026-03-21/e2e/app-smoke.spec.ts)

Current unit coverage additions:
- [src/renderHtml.test.ts](/D:/pet/docs_amazing_builder_github_2026-03-21/src/renderHtml.test.ts)
- [src/renderWiki.test.ts](/D:/pet/docs_amazing_builder_github_2026-03-21/src/renderWiki.test.ts)

## Important note

The smoke suite is intentionally small. Keep it focused on business-critical flows.
Do not try to automate every UI detail in Playwright, or maintenance cost will grow faster than value.

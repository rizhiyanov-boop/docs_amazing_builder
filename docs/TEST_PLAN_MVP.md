# MVP Test Plan

## Scope
- Runtime-critical flows for MVP: parse, edit, export, import, and autosave.
- Core modules: `parsers`, `sourceSync`, `requestHeaders`, `renderHtml`, `renderWiki`.
- Integration-level checks for `App`.

## Stage 1: Foundation
- Tooling: `vitest`, `jsdom`, Testing Library, V8 coverage.
- CI pipeline gates: lint + tests + build + smoke.
- Baseline thresholds (for core MVP modules only):
  - lines >= 70
  - functions >= 75
  - statements >= 70
  - branches >= 50

## Stage 2: Core Unit Tests
- `src/parsers.test.ts`
  - JSON flattening
  - cURL parsing (headers, body, url)
  - empty input error
  - large payload stability
- `src/sourceSync.test.ts`
  - rows -> JSON
  - rows -> cURL
  - header/url exclusion in JSON mode
  - default URL fallback
- `src/requestHeaders.test.ts`
  - drift detection
  - row splitting
  - auth info derivation
  - mapping options priority
  - default request headers
- `src/renderers.test.ts`
  - HTML shell and content
  - Wiki shell and content
  - blocked-section output

## Stage 3: App Integration
- `src/App.integration.test.tsx`
  - initial render and autosave to `localStorage`
  - tab switch (Editor/HTML/Wiki)
  - HTML/Wiki export blob flow
  - reset project flow
  - parse validation error for empty source
  - invalid JSON import handling

## Stage 4: Quality Gates
- Pull request merge is blocked when any CI check fails.
- Exit criteria for MVP:
  - 0 failing tests in CI
  - 0 lint errors
  - build succeeds
  - smoke generation succeeds
  - coverage thresholds are satisfied

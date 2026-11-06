# DocBuilder agent router

## Start here

- Before editing, confirm that Git is clean. Create a branch named codex/<task> unless the user explicitly requests another branch or asks to work on the current one.
- Read only the task-relevant files from docs/CODE_MAP.md. Do not scan all of src/App.tsx by default.
- Keep changes local to the requested behavior. Preserve unrelated user changes.
- Use the task structure from docs/TASK_TEMPLATE.md when requirements are incomplete.
- Ignore generated folders such as node_modules, dist, coverage and output during code discovery.

## Required references

- API, integration, project JSON or documentation work: read docs/standards/API_DOCUMENTATION.md.
- UI work: read ARCHITECTURE.md and docs/design-tokens.md; reuse existing components and Workbench tokens.
- Wiki export: read docs/wiki-export.md, then change src/renderWiki.ts. Touch src/projectExport.ts only for project-level composition.
- Import or model changes: read src/types.ts, src/sectionTitles.ts and src/workspaceBootstrap.ts before editing.
- Request/Response mapping: read src/requestHeaders.ts. clientMappings direction is Server field key to Client field key.
- AI work: inspect src/openrouterClient.ts and api/ai.ts; retain authentication, input validation, timeout, output limits and normalization.
- Backend persistence: inspect src/serverSyncClient.ts, relevant hooks, api/projects.ts and api/_lib/db.ts.

## UI Quality, Modern Design & Visual Review Standard

- **Mandatory Visual Review**: Conduct visual inspection for any UI modification before concluding the turn. Inspect rendered screenshots using `read_file`.
- **Visual Tooling & Automation**: Use `node scripts/visual-review.cjs --url <url> --out <path>` to capture pixel-perfect screenshots of rendered components.
- **Full Interactive Flow Traversal**: When changes affect multi-step states (e.g. form → submission → success card → action → unlinking/reset), walk through and visually inspect every state in the complete flow (using `--flow` steps in visual-review tool).
- **Accuracy, Typography & Alignment**: Ensure strict vertical alignment (e.g. unified 24px/32px heights across badges, buttons, chips and icon actions), consistent font hierarchy, balanced padding, and no clumsy text wrapping.
- **Modern UI Patterns**: Prioritize critical user information and primary actions; keep technical or secondary metadata softly muted. Group controls logically.
- **Strict Minimalism**: Ruthlessly eliminate redundant, duplicate, or useless text/elements. Remove boilerplate instructions, obvious helper text, duplicate statuses, and obsolete buttons.
- **Autonomous Remediation**: If visual review reveals any flaws, misalignment, awkward wrapping, or unnecessary visual noise, immediately fix them autonomously without stopping to ask the user.

## Engineering rules

- Treat src/types.ts as the canonical model and workspace version 3 as the current persisted format.
- Keep input/clientInput as source text and rows/clientRows as canonical imported table data.
- Preserve canonical section ids such as request, response, errors and process-diagram.
- Add compatibility normalization for persisted-model changes; do not silently break old project JSON.
- Put pure logic in a focused module with unit tests instead of expanding src/App.tsx.
- Keep HTML and Wiki formatting independent; share selectors, not output syntax.
- Never expose secrets or place server credentials in frontend code.
- Do not edit Cyrillic JSON/Markdown through inline Node/Python piped from PowerShell; use apply_patch or a checked-in script.

## Verification & Testing Strategy

- **Visual Review First**: Visual inspection of rendered screens via screenshots is mandatory for all UI work.
- **Contextual Autotests (Time-Saving)**: Autotests are run only when strictly necessary as determined by AI per request (e.g., core parser changes, shared contract shifts) to save iteration cycle time.
- **Pre-Release Verification**: Run `npm run test:ci` and `npm run build` before release or when shared contracts/data models change.
- Report visual inspection findings, reviewed flow states, commands run, failures, and residual risk.

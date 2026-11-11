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

- **Targeted Visual Review (Fast Iteration)**: Conduct visual inspection for UI modifications using `read_file` on captured screenshots. For isolated controls, buttons, or styling tweaks, review ONLY the target screen/component state. Do NOT execute the entire multi-scenario flow matrix on every micro-tweak. Full scenario matrix traversals are reserved for multi-step workflow changes or final integration sign-off.
- **Visual Tooling & Automation**: Use `node scripts/visual-review.cjs --url <url> --out <path>` to capture pixel-perfect screenshots and run automated DOM audit checks.
- **Information Hierarchy First (Primary Law of UI)**:
  - The primary entity (Title, Name, Subject, Ticket Key) MUST dominate the top row or primary visual anchor. NEVER bury the title underneath a cluster of secondary metadata chips or badges.
  - Secondary metadata (status, type, priority, epic, tags) belongs on a separate subordinate row or softly muted alongside.
  - Action buttons (Open, Copy, Delete) must be clustered logically on the right with strict 24px/32px uniform height.
- **Strict Minimalism & Anti-Noise**:
  - Ruthlessly eliminate redundant, duplicate, or useless text/elements. Remove boilerplate instructions, obvious helper text, duplicate statuses, and obsolete buttons.
  - **Conciseness in Badges**: Badges/chips must be 1–2 words (<= 18 characters, e.g. `[ ✓ Создана ]` instead of full sentences like `[ ✓ Созданная задача этого сценария ]`).
  - **Zero Tautology**: Forbid repeating terms or word stems across adjacent badges/chips (e.g. no repeating "сценарий" in multiple sibling chips).
- **Pruning Transparency (Explicit Reporting in Chat)**: Whenever elements, buttons, notices, or fields are removed or simplified during UI cleanup, ALWAYS output a dedicated section in the chat response:
  `### Исключенные / удаленные элементы`
  listing each discarded item and the exact rationale, ensuring critical functionality is never silently lost in the background.
- **Accuracy, Typography & Alignment**: Ensure strict vertical alignment (e.g. unified 24px/32px heights across badges, buttons, chips and icon actions), consistent font hierarchy, balanced padding, and no clumsy text wrapping.
- **Autonomous Remediation**: If visual review or automated audit reveals any flaws, misalignment, awkward wrapping, inverted hierarchy, or unnecessary visual noise, immediately fix them autonomously without stopping to ask the user.

## Engineering rules

- Treat src/types.ts as the canonical model and workspace version 3 as the current persisted format.
- Keep input/clientInput as source text and rows/clientRows as canonical imported table data.
- Preserve canonical section ids such as request, response, errors and process-diagram.
- Add compatibility normalization for persisted-model changes; do not silently break old project JSON.
- Put pure logic in a focused module with unit tests instead of expanding src/App.tsx.
- Keep HTML and Wiki formatting independent; share selectors, not output syntax.
- Never expose secrets or place server credentials in frontend code.
- Do not edit Cyrillic JSON/Markdown through inline Node/Python piped from PowerShell; use apply_patch or a checked-in script.

## Verification & Testing Strategy (Fast Iteration & Safety)

- **Targeted Visual Review & DOM Audit First**: Visual inspection of rendered screens via screenshots is mandatory for UI work, supported by automated DOM audit checks in `scripts/visual-review.cjs`. Scope screenshots to the specific target state during intermediate tweaks.
- **Fast Dev Loop (No Heavy Builds on Micro-Tweaks)**: NEVER run `npm run build` (~28s) on CSS/JSX styling tweaks, small visual fixes, or intermediate edits. Vite dev server handles hot reload. Defer `npm run build` and `npm run test:ci` strictly to the final pre-release step or when core contracts/persisted schemas change.
- **Contextual Autotests (Time-Saving)**: Run focused unit tests (e.g. `vitest run <specific.test.tsx>`) only when logic or contracts shift. Do not run full test suites on pure visual/CSS adjustments.
- **Final Pre-Release Verification**: Run `npm run test:ci` and `npm run build` only once at the conclusion of the entire task before handoff.
- Report visual inspection findings, reviewed flow states, pruned elements list, commands run, failures, and residual risk.

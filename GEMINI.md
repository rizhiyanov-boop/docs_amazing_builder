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
- **Visual Tooling & Automation**: Use `node scripts/visual-review.cjs --url <url> --out <path>` to capture pixel-perfect screenshots and run automated DOM audit checks.
- **Scenario Matrix Coverage (No Happy-Path Blindness)**: Never test only the single default happy path. When modifying a component with branching modes (e.g. standard method vs standalone/freeform vs pre-linked vs error states), systematically traverse and capture screenshots for EVERY scenario in the matrix.
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

## Verification & Testing Strategy

- **Visual Review & DOM Audit First**: Visual inspection of rendered screens via screenshots is mandatory for all UI work, supported by automated DOM audit checks in `scripts/visual-review.cjs`.
- **Contextual Autotests (Time-Saving)**: Autotests are run only when strictly necessary as determined by AI per request (e.g., core parser changes, shared contract shifts) to save iteration cycle time.
- **Pre-Release Verification**: Run `npm run test:ci` and `npm run build` before release or when shared contracts/data models change.
- Report visual inspection findings, reviewed flow states, pruned elements list, commands run, failures, and residual risk.

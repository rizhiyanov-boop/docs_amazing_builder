# ARCHITECTURE

Updated: 2026-05-08

## Purpose

`doc-builder` is a React + TypeScript workbench for building API method documentation. The app combines structured method sections, request/response tables, source import, AI helpers, and HTML/Wiki export.

## Runtime Shape

- Frontend: React, TypeScript, Vite.
- Full-stack local mode: `npx vercel dev`, which serves the SPA and `/api/*` endpoints together.
- Local-only mode: Vite can render the UI, but auth, server sync, and AI endpoints require the full-stack mode.
- Main entry: `src/main.tsx`.
- Main orchestration layer: `src/App.tsx`.

## API Integration

Backend endpoints live in `api/` and are consumed through `src/serverSyncClient.ts` and feature hooks.

- Auth: login/register/session checks use cookie-backed API routes.
- Server project sync: project list/load/save/delete goes through `/api/projects`.
- Autosave: `useRemoteProjectAutosave` builds a `WorkspaceProjectData` snapshot and posts it to the backend after idle delay and hash dedupe.
- AI: `/api/ai` requires an authenticated session and delegates model calls through `api/_lib/openrouterClient.ts`.
- Import/export: JSON import is handled client-side; HTML/Wiki renderers run in the client and downloads are triggered from preview screens.

## Data Model

The workspace is stored as `WorkspaceProjectData`:

- `projectName`: workspace/service label.
- `methods`: array of `MethodDocument`.
- `methodGroups`: service/group tree for methods.
- `projectSections`: project-level documentation sections.
- `flows`: project flow definitions.
- `activeMethodId`: current method selection.

`MethodDocument` owns method metadata and `sections`. `DocSection` is either a text section, parsed request/response-like section, diagram section, or errors section. `ParsedRow` is the normalized table row with `field`, `type`, `required`, `description`, `example`, and source metadata.

## Component Architecture

### Screens

- `src/screens/HtmlExportScreen.tsx`: rendered HTML preview, TOC/search, copy and download actions.
- `src/screens/WikiScreen.tsx`: Wiki source/preview modes with copy and download.
- Project docs and flows remain separate editor surfaces inside the workspace.

### Workbench Shell

- `src/components/workbench/WorkbenchSidebar.tsx`: project/service switcher, method tree, section tree, search entry.
- `src/components/workbench/WorkbenchTopbar.tsx`: current method context, Workbench/Editor mode, layout toggle, import, preview/export actions, user/theme menu.
- `src/components/workbench/MethodMetaPanel.tsx`: right-side method metadata editor.

### Cards and Tables

- `src/components/cards/Card.tsx`: Kraft card primitive.
- `src/components/cards/MethodHeaderCard.tsx`: method header card with HTTP method, path, and description.
- `src/components/tables/WorkbenchTables.tsx`: classic/gallery/mini table views, inline editing, required marker, type selector, row grouping, and row copy affordances.
- `src/components/primitives/WorkbenchPrimitives.tsx`: HTTP chips, type chips, required marker, buttons, inputs, tabs, sidebar rows, and AI action buttons.

## Theme & Design System

The UI uses Kraft Workbench tokens:

- `src/tokens-workbench.css` defines `--wb-*` tokens for `blue`, `warm`, and `violet` accents.
- `warm` is the default Kraft accent.
- `src/theme.ts` keeps the legacy `--bg`, `--card`, `--panel`, and related variables aligned with Kraft colors for older editor surfaces.
- Fonts: `Inter Tight` for UI and `JetBrains Mono` for code, methods, endpoints, and table field names.

New UI should prefer `var(--wb-*)` tokens. Legacy variables should only be used where old editor code still depends on them.

## Editing and Source Flow

- Source import supports JSON and cURL.
- `src/parsers.ts` turns source text into `ParsedRow[]`.
- `src/sourceSync.ts` rebuilds JSON/cURL source from table rows.
- Drift alerts compare rows against last synced source.
- Request/response sections support inline import, table row editing, AI descriptions, and AI examples.

## Export Flow

- Topbar `HTML` and `Wiki` open preview tabs.
- HTML/Wiki preview screens provide explicit copy/download actions.
- JSON remains a direct project/workspace download.
- Lazy preview rendering is used so HTML/Wiki renderers do not run on every editor keystroke.
- Wiki export generation rules are documented in `docs/wiki-export.md`.

## Mobile Behavior

On narrow viewports, the sidebar behaves as a drawer:

- Hidden by default when entering compact layout.
- Opened from the topbar menu button.
- Closed by backdrop click or after selecting a method/section.
- Desktop keeps the persistent left sidebar.

## Deprecated Patterns

- The old flat shell is no longer the primary layout.
- Legacy editor mode remains as a fallback for advanced editing, but must visually use Kraft tokens.
- New design work should not add more UI directly to `App.tsx` unless the state coupling makes extraction impractical.

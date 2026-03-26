# RFC: Onboarding Strategy And Technical Design

Status: Draft
Owner: Product + Frontend
Last updated: 2026-03-18

## 1. Context

Current UI is powerful but has high first-session cognitive load:
- many blocks and controls are shown immediately,
- user has no clear first action,
- no guided path to first successful result.

Target: reduce time to first successful export and increase first-session activation.

## 2. Goals

- Allow a new user to reach first export in under 5 minutes.
- Add guided onboarding without breaking existing expert flow.
- Keep rollout reversible with feature flags.
- Instrument onboarding with telemetry for data-driven iteration.

## 3. Non-goals

- Full product redesign in one release.
- Hard dependency on backend services.
- Removal of existing advanced capabilities.

## 4. UX Scope (Phase Model)

### Phase A (fast wins)
- First-run entry modal:
  - Quick Start (demo)
  - Start from scratch
  - Import JSON
- Empty-state call-to-actions in key places.
- Basic progress helper (step hint bar).
- Telemetry baseline.

### Phase B (guided flow)
- Full step-by-step guided mode (5 core steps).
- Step completion predicates based on actual app state.
- Skip onboarding and "Do not show again" controls.

### Phase C (optimization)
- Progressive disclosure for advanced controls.
- Contextual hints and presets (especially errors/auth).
- Copy and accessibility polish.

## 5. Architecture Decision

Decision: implement onboarding as a configurable state-driven engine, not inline ad-hoc `if` blocks.

Why:
- maintainable,
- testable,
- easy to iterate,
- reversible via flags.

## 6. Proposed Modules

- `src/onboarding/types.ts`
  - Type contracts for steps, statuses, events.
- `src/onboarding/engine.ts`
  - Step resolution and completion predicates.
- `src/onboarding/config.ts`
  - Step sequence definition.
- `src/onboarding/storage.ts`
  - localStorage persistence (`seen/skipped/completed`).
- `src/onboarding/telemetry.ts`
  - event helpers (initially console/noop adapter allowed).
- `src/components/onboarding/*`
  - entry modal, step bar, contextual prompts.

## 7. Data Contracts

```ts
export type OnboardingStepId =
  | 'choose-entry'
  | 'add-source'
  | 'parse-source'
  | 'review-table'
  | 'fill-errors'
  | 'export-doc';

export type OnboardingStatus = 'idle' | 'active' | 'completed' | 'dismissed';

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  description: string;
  isOptional?: boolean;
  predicate: (ctx: OnboardingContext) => boolean;
  ctaLabel?: string;
  ctaAction?: 'focus-source' | 'run-parser' | 'focus-errors' | 'open-export';
}

export interface OnboardingContext {
  hasAnyInput: boolean;
  hasParsedRows: boolean;
  hasErrorsRows: boolean;
  hasExportedInSession: boolean;
  importUsedInSession: boolean;
}
```

## 8. Feature Flags

Add local flags (later can be env-driven):

```ts
const FEATURES = {
  onboardingV1: true,
  onboardingGuidedMode: true,
  onboardingProgressiveDisclosure: false
} as const;
```

Rules:
- All onboarding surfaces must be behind flags.
- If flags are off, app behavior remains unchanged.

## 9. Persistence

Key example:
- `doc-builder-onboarding-v1`

Suggested payload:

```json
{
  "version": 1,
  "status": "active",
  "seenAt": "2026-03-18T14:10:00.000Z",
  "completedAt": null,
  "dismissed": false,
  "currentStep": "add-source"
}
```

## 10. Telemetry Schema

Minimal event set:
- `onboarding_started`
- `onboarding_step_viewed`
- `onboarding_step_completed`
- `onboarding_skipped`
- `onboarding_completed`
- `first_export_done`

Common payload fields:
- `stepId`
- `sessionId`
- `timestamp`
- `timeSinceStartMs`
- `source` (`quick_start`, `scratch`, `import`)

Adapter design:
- Start with local logger/noop.
- Keep API stable for future analytics backend.

## 11. UI Integration Plan

### 11.1 Entry Modal
Show only when:
- first run OR onboarding not completed,
- and `onboardingV1=true`.

Actions:
- Quick Start imports sample state.
- Start from scratch keeps current reset flow.
- Import opens file picker.

### 11.2 Step Hint Bar
- fixed lightweight bar near top workspace area,
- shows current step title + action CTA,
- can be collapsed.

### 11.3 Contextual Prompts
- non-blocking helper hints near relevant controls,
- only one active hint at a time,
- disappear after step completion.

## 12. Accessibility Requirements

- Full keyboard navigation through onboarding UI.
- `aria-current="step"` for active step markers.
- Focus management on step CTA actions.
- Respect `prefers-reduced-motion` for guided transitions.

## 13. Rollout Strategy

1. Release Phase A behind `onboardingV1`.
2. Enable for internal users only.
3. Validate telemetry and qualitative feedback.
4. Enable for 20% users.
5. Enable globally after KPI thresholds are stable.

Rollback:
- disable `onboardingV1` flag, no data migration required.

## 14. KPIs

Primary:
- Time To First Export (TTFE)
- First-session activation rate

Secondary:
- Step drop-off per onboarding step
- Import vs scratch path ratio
- 7-day return rate for first-time users

## 15. Risk Assessment

### Risk: onboarding annoys expert users
Mitigation:
- "Skip" and "Do not show again" at all times.
- hidden when completed.

### Risk: code complexity in `App.tsx`
Mitigation:
- isolate onboarding engine into separate modules.
- avoid embedding business rules directly in JSX.

### Risk: weak telemetry quality
Mitigation:
- define schema first,
- add event contract tests for required fields.

## 16. Implementation Backlog (Jira-ready)

1. ONB-1: Add onboarding feature flags and storage contracts.
2. ONB-2: Implement onboarding engine (steps + predicates).
3. ONB-3: Build first-run entry modal.
4. ONB-4: Build step hint bar with CTA wiring.
5. ONB-5: Add telemetry adapter + baseline events.
6. ONB-6: Add contextual hints for parse/errors/export.
7. ONB-7: Add skip/dismiss controls and persistence.
8. ONB-8: Add accessibility pass and keyboard QA.
9. ONB-9: Progressive disclosure for advanced controls.
10. ONB-10: KPI dashboard and rollout checks.

## 17. Acceptance Criteria (MVP Onboarding)

- New user sees entry modal on first launch.
- User can complete guided path and export document.
- Onboarding can be skipped and does not reappear when dismissed.
- With feature flag off, onboarding UI is absent.
- Telemetry events are emitted for start, step complete, skip, complete.

## 18. Open Questions

- Should Quick Start use built-in seed or `docs/ultimate-import.json`?
- Should onboarding progress be per-browser or per-user account (future)?
- Should guided mode auto-focus controls or stay passive?

## 19. Suggested First PR Slice

Scope for first incremental PR:
- Add feature flags.
- Add onboarding storage model.
- Add entry modal with 3 actions.
- Emit `onboarding_started` and `onboarding_skipped` events.

This gives immediate value with minimal risk and unblocks phased rollout.

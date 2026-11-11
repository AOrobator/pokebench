# Viewer: fill the workbench from /api/cards when the current projector has no runs

Status: M1 in progress on `claude/workbench-without-projector` (worktree `~/dev/pokebench-workbench-no-projector`), off main 640ba5c74. Approved by the coordinator 2026-11-11 19:50Z as the follow-up to splits-no-frontier. Landing needs the operator's own @mention.

## Problem Statement

A viewer started on a runs root without the current-run projector service (any `just view` or `just view-release` root) gets 503 from `/api/current-runs`. The client's current-mode state then has no runs and no snapshot, and `needsWorkbenchEnrichment()` asks for card enrichment only when a snapshot exists. So `/api/cards` is never loaded, the workbench has no record of the selected run, and the SPLITS race waits forever for a real frontier ("Loading the frontier run…" past 5 minutes on a root holding 67d7 and a 37ca clone). The live 8790 viewer has the projector, so it is unaffected.

## Skills Loaded

- `feature-worklog`, `execute-worklog`, `close-the-loop`, `viewer-e2e` (background browser only)

## Architecture

The decision moves into a pure exported `needsCardEnrichment(...)` in `packages/viewer/src/workbench-data.ts`, which `app.ts` `needsWorkbenchEnrichment()` calls. The new case: in projector mode with a run selected but no runs from the projector, the cards must be loaded. Every existing case keeps its answer. The existing path then does the rest: `loadWorkbench()` fetches `/api/cards?run=<id>` and stores the result as the recorded workbench, and `currentChanged` merges those recorded runs into `this.workbench`.

No feature switch: viewer-only; nothing the model sees or does changes (the coordinator confirmed the exemption for the sibling fix).

Files: `packages/viewer/src/workbench-data.ts`, `packages/viewer/src/app.ts`, a new `packages/viewer/src/workbench-enrichment.test.ts`.

## Invariants

- **INV-1** In projector mode with a selected run and zero projector runs, cards are enrichment-needed. Test.
- **INV-2** All previous answers are unchanged (no projector means yes; no selected run means no; snapshot with metadata and a card means no; snapshot missing metadata or card means yes; no snapshot while the projector has runs means no). Test: the table.

## Security Review

No new endpoint or input; `/api/cards` is already fetched and validated by `parseWorkbench`.

## Milestones

**M1 — Source readiness**
- [x] Worklog
- [ ] Tests (RED)
- [ ] Implement; cheap checks; guard deletion; full gates
- [ ] Browser check: scratch multi-run root (67d7 + 37ca clone) with no projector, where SPLITS races the frontier; single-run root still settles (with splits-no-frontier) or is unchanged
- [ ] Codex review; ready to land

**M2 — Landing** (the operator's own @mention); `just viewer-main` only on the operator's words

## Closing the Loop

## Session Log

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive

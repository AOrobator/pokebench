# Restore thinking elapsed seconds on live current snapshot

**Started:** 2026-11-01
**Status:** Active; operator confirmed the Oct 28 regression and asked to restore the timer
**Branch:** `cursor/thinking-timer-restore`

## Problem Statement

The emerald thinking box used to show `AGENT is thinking… N.Ns` while the model was mid-turn. After the current-run snapshot path landed (`8f28701d2`), a live `phase.kind === "thinking"` override replaces that head with bare `MODEL IS THINKING…`, dropping the elapsed seconds the operator watches.

## Skills Loaded

- `.claude/skills/close-the-loop/SKILL.md`
- `.claude/skills/viewer-e2e/SKILL.md` (activation / live proof after land)

## Architecture

Keep the current-snapshot phase override for lag/status (`CURRENT TURN` loading, `RUNNING`, `PAUSED`, indexing). When the recorded thinking view is already on the same turn and has `turnStartMs`, set the head to the timed `AGENT is thinking… N.Ns` string instead of stripping it.

## Invariants

- **INV-1:** With a live current snapshot in thinking phase and recorded history caught up on that turn, `think-head` shows `AGENT is thinking… N.Ns` and ticks. Test: `app-current.test.ts`.
- **INV-2:** When recorded thinking is still behind the live turn, head stays `MODEL IS THINKING…` (no invented start time). Covered by existing lag path; do not invent `requestAt` on the public snapshot.
- **INV-3:** Non-thinking phase labels (`RUNNING`, `PAUSED`, indexing) unchanged.

## Security Review

Viewer display string only. No new network, ROM, tools, or secrets.

## Milestones

**M1 — Restore timed thinking head**
- [x] RED test: live current snapshot keeps thinking elapsed seconds (fails: `MODEL IS THINKING…`)
- [x] COMMIT: `test(viewer): require thinking elapsed seconds under live current snapshot` (RED) `abfb3c99c`
- [x] GREEN: keep seconds when recorded thinking is caught up
- [ ] COMMIT: `fix(viewer): restore thinking elapsed seconds on live current head`
- [ ] Focused vitest for `app-current`
- [ ] Cheap lint/types on changed files
- [ ] Full gates + review + land/activation as separate stages

## Closing the Loop

- Proven at tests for the DOM `think-head` string under `snapshotFirst` current browser.
- Live viewer proof after authorized `just viewer-main` (not claimed until then).

## Session Log

- 2026-11-01: Confirmed regression in `app.ts` liveSnapshot override; opened branch.

## Surprises

- None yet.

## Multi-Model Review Log

- (pending)

## Boy Scout Log

- None.

## Archive Milestone

- ASK USER

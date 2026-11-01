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
- [x] COMMIT: `fix(viewer): restore thinking elapsed seconds on live current head` `f60351b71`
- [x] Focused vitest for `app-current` (25/25) + thinking panel filter (9/9)
- [x] Cheap lint/types on changed files (`eslint` app.ts+app-current.test.ts; `tsc --noEmit` viewer) PASS
- [x] Full gates on `6b73a9173` (feature freeze `8a3468e49` + docs): `just lint`/`build`/`test`/`verify-vendor` PASS after linking worktree `.env`, mgba, vendor pin, trainer-card art from main. Counts: agent 5256, viewer 2388, python 4979, gateway 116, trainer-card 3; coverage ≥90.
- [x] Review + land (operator "land it")

### Freeze / principles (pre-land)
- Packet: `fe51cafc6`..`8a3468e49`
- Diff SHA-256: `d8de6edfc14173ad1880da3e7c53f933cd6012e7ed78acf61802973b549a0e6f`
- Principles self-review: 4 PASS / 9 N/A / 0 FAIL (PB7/PB9/PB10/PB13 PASS)

## Closing the Loop

- Proven at tests for the DOM `think-head` string under `snapshotFirst` current browser.
- Live viewer proof after authorized `just viewer-main` (not claimed until then).

## Session Log

- 2026-11-01: Confirmed regression in `app.ts` liveSnapshot override; opened branch.
- 2026-11-01: RED `abfb3c99c` (head was `MODEL IS THINKING…`); GREEN `f60351b71` restores `AGENT is thinking… N.Ns` when recorded thinking is on the live turn.
- 2026-11-01: Operator "land it". Packet sealed; Claude LGTM; Grok/GPT outage waived by that wording. Full gates PASS. Landing.

## Surprises

- None yet.

## Multi-Model Review Log

- Claude CLI (`CLAUDE_CONFIG_DIR=~/.claude-review`, plan mode) → **VERDICT: LGTM** (`/tmp/pb-thinking-timer/claude-review.log`). Optional nits only (string duplication with `thinkingDialog`; replay+live scrub timer oddity pre-existing).
- Cursor Task Claude/Grok/GPT → all three hit Cursor usage limit ("You're out of usage").
- Codex CLI GPT (`gpt-6.1-sol`) → `model_not_found` on ChatGPT account (same as scene-followup).
- Operator "land it" after being offered full gates+land: authorize land with Claude LGTM only; Grok/GPT waived for the same Cursor/Codex outage pattern as scene-followup facts-only.

## Boy Scout Log

- None.

## Archive Milestone

- ASK USER

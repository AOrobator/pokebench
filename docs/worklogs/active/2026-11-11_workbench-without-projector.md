# Viewer: fill the workbench from /api/cards when the current projector has no runs

Status: M1 LANDED on local main at b58af83f9 (the operator 20:13:46Z: "@claude land workbench-without-projector"); post-main `just test` green; live on 8790 after `just viewer-main` (the operator: "u have permission to refresh the viewer as needed"). No push on `claude/workbench-without-projector` (worktree `~/dev/pokebench-workbench-no-projector`), off main 640ba5c74. Approved by the coordinator 2026-11-11 19:50Z as the follow-up to splits-no-frontier. Landing needs the operator's own @mention.

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
- [x] Tests (RED)
- [x] Implement (`needsCardEnrichment` in workbench-data.ts; app.ts uses it); viewer tsc and eslint clean; workbench tests 25/25. Guard: removing the projectorRuns===0 line turns the new test red; restored.
- [x] Full gates on 0bec933d6 (rebased onto main 22e7432f4): `just lint` exit 0; `just test` exit 0 (agent 3,042, viewer 1,281, env 3,319, gateway 39; floors; no-I/O proof)
- [x] Browser check: scratch multi-run root (67d7 + 37ca clone) with no projector, where SPLITS races the frontier; single-run root still settles (with splits-no-frontier) or is unchanged
- [x] Codex review: GPT LGTM; ready to land

**M2 — Landing** (the operator's own @mention); `just viewer-main` only on the operator's words
- [x] Rebased onto main 98afad2b0 (worklog-only upstream); feature diff byte-identical (patch-id 47c5cda0…). `git merge --ff-only` as number 1 on the board: main → b58af83f9. Post-main `just test` exit 0 (agent 3,042, viewer 1,281, env 3,319, gateway 39; floors; no-I/O proof).
- [x] `just viewer-main`: "viewer and current projector at b58af83f9"; one 8790 listener, build stamp b58af83f9 (clean); no older-build problems (836 runs); 0 gameplay processes. Live: 67d7 SPLITS on 8790 still races "9:02:23 ahead of the FRONTIER" (projector present, unchanged path).

## Closing the Loop

This branch's built viewer, detached on scratch ports (stopped afterwards; 8790 untouched), with no current projector (503), headless Playwright Chromium at 1280×900 and 375×812:

- **Multi-run root** (67d7 plus APFS clones of DeepSeek 37ca's events, frames and checkpoints): SPLITS now races. "ASSISTED …67d7 is 9:02:23 ahead of the FRONTIER! At 17:16:30 the FRONTIER had reached Mt. Pyre. Gained 3:22:12 over the last 10 milestones.", 94 faster, 22 slower, 24 even, badge bars, biggest gains and losses, story graph drawn. That is the same race the live 8790 viewer shows. Settled 27 s cold on desktop, about 1 s on phone. Before: "Loading the frontier run…" past 5 minutes.
- **Single-run root** (the 67d7 release): settles to "no frontier comparison for this run." / "No frontier run to plot." in about 1 s, even without the splits-no-frontier change, because the run's record is now loaded.
- No page errors; page width equals the viewport. Screenshots `runs/mockups/workbench-without-projector/{single,multi}-{1280,375}.png` (opened and looked at).

## Session Log

## Surprises

## Multi-Model Review Log

### Round 1 — GPT (JOB review-gpt-workbench-no-projector-0bec933d6)

Base 22e7432f4, head 0bec933d6, SHA-256 c6309728…aac. The only new true case is projector mode with a selected run and zero projector rows; with projector rows the earlier predicate holds, so the live viewer gets no extra cards polling. Traced loadWorkbench deduplication, epoch/generation rejection and the currentChanged merge: no fetch loop, no projector overwrite. The no-projector fallback refreshes cards on the existing 5 s timer. Screenshots inspected. `VERDICT: LGTM`.

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive

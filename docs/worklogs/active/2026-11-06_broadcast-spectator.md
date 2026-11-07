# Broadcast spectator mode

Coordinator brief 2026-11-07 for the operator: build the approved A2 "Broadcast" layout (`runs/reports/run-analysis/2026-11-06_spectator-mode-mockups/mock-A2.html`) into the viewer and land it in small pieces. The Mt. Pyre recorder is waiting on piece 1. Viewer-only and display-only, so no feature switch (feature-switch skill: viewer-only changes need none). No restart of 8790 without the operator's approval.

## Skills Loaded

execute-worklog, viewer-e2e, close-the-loop, talk-to-codex (landing board), steady-screen (page never scrolls; redraws only changed parts).

## Architecture

- `broadcast-feed.ts`: the feed's types and JSON guard, shared by server and page.
- `broadcast-reducer.ts`: server side; keeps only what the page needs from each event line and validates each through narrow schemas. A line it cannot read is skipped, so a run from a newer build still plays.
- `broadcast-store.ts`: server side; reads a run's log incrementally, a bounded chunk per event-loop turn, with disk injected. Answers `GET /api/runs/<id>/broadcast?after=<n>`. Reads `runs/broadcast/<id>/commentary.jsonl` and `runs/broadcast/pricing.json` when they exist.
- `broadcast-timeline.ts`: the page's model; answers "what is on screen at t".
- `broadcast-view.ts`: lane geometry and HTML. `broadcast-main.ts`, `broadcast-boot.ts`: page boot.
- `static/broadcast.html`, `static/broadcast.css`: fixed 1920x1080 stage, scaled to fit other windows.

API COST has no source in the event log. Rates come from the gitignored `runs/broadcast/pricing.json` (USD per million tokens, by model id; no SKU in code). No entry shows a dash.

## Invariants

- INV-1: read-only. The page and endpoint write nothing and never touch `runs/<id>/`.
- INV-2: the game box and every panel keep fixed geometry, caption or not, so a compositor can rely on them.
- INV-3: chips never overlap: an older chip sits at least 30 px left of the next.
- INV-4: nothing shows a time limit or end time.
- INV-5: `broadcastSetTime(t)` resolves only after the frame for t is decoded.

## Security Review

GET only, behind the viewer's existing host check and CSP. Run ids go through `eventsPath`. All log text reaches the page through `esc`.

## Milestones

### Piece 1: `/broadcast` page
- [x] RED (8002bec3d)
- [x] GREEN: 68 focused tests
- [ ] Browser proof on a separate port against a0b4, 1920x1080 screenshots viewed; follow mode on fake data
- [ ] Gates, review, landing

### Piece 2: `just broadcast-render`
- [ ] Ask the Mt. Pyre thread for the recorder's file format and clock base
- [ ] Build, proof, review, landing

### Piece 3: `just broadcast-commentary`
- [ ] Find a local model not serving a live run; stop and report if none fits
- [ ] Build, proof, review, landing

## Closing the Loop

Per piece: tests, real headless browser screenshots at 1920x1080, then landing and the post-main `just test`. Serving on 8790 waits for the operator's OK.

## Session Log

Piece 1 browser proof, headless on port 8797 from a scratch runs root symlinking finished runs (the 8790 viewer and e09e untouched): a0b4 at t=4656.3 and 4700 matches the mock with real data (`FIGHT → ROCK TOMB`, 24/159, vs WINONA, $0.83 at OrcaRouter's public rates). 5f0f boot run at 2:10:50 shows FROM BOOT and a full lane with no overlap. transparent=1 clears the page and game box and keeps the caption. Fake live run (log replayed from a0b4 with fresh times, fake game server with health and frame socket): the default run picked it, clock ticked, 15 chips arrived, frames came through the socket as blobs, and the clock held once run_end landed; no console errors. Cold read: 1.8 s for a0b4's 516 MB, 7.3 s for 5f0f's 2.3 GB, in bounded steps; feed 5.8 MB and 7.1 MB.

## Surprises

## Multi-Model Review Log

Round 1, frozen 0bc415075..5eff8420d (sha 0e4069bc). Cursor out of usage until 11/17, so Claude CLI, Codex GPT (gpt-5.6-sol) and a fresh fallback subagent per the operator's standing rule. All BLOCKING on one real bug: setTime on a page already following live frames neither stopped them nor loaded the recorded frame (Claude reproduced it). Claude and GPT also: a frame that failed to load still resolved setTime. Both fixed, with tests; a held moment also re-reads a live log and clears the picture before the first frame. Rebutted: GPT's superlinear copying in the store test fake and in partial lines: lines stay far under the 1 MiB chunk, and the fake's copying is a few KB; no failure shown.

## Boy Scout Log

## Archive Milestone (user-gated)

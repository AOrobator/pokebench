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
- [ ] RED
- [ ] GREEN
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

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

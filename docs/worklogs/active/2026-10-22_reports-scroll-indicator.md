# Reports scroll indicator

## Problem Statement

The operator (2026-10-22, 1:05 PM): an opened report gives no sense of where you are. The page is locked to the window (c16b1ad92, so the page and the report never both scroll), only the report frame scrolls, and on macOS its overlay scrollbar hides until you scroll. The operator picked design B (Emerald HP bar in the gap between the header and the date bar) with design C's percent readout, and no extra vertical scrollbar (runs/mockups/reports-scroll-indicator/index.html).

## Architecture

The report runs sandboxed in an opaque origin, so the viewer cannot read its scroll. The viewer appends a small script (`reportScrollProbe`) to every report HTML it serves; it posts `{ pokebenchReportScroll: 0..1 }` to the parent on scroll, resize, load and size change. The opened-report view draws a 12px HP bar under the header and a percent in the date bar, and accepts only messages whose source is its own report frame and whose value is a number in [0, 1]. Viewer display only: no switch.

## Invariants

- INV-1: only the opened report's own frame moves the bar; malformed or foreign messages are ignored.
- INV-2: the injected probe is self-contained (runs from its source text alone) and sends only a number.
- INV-3: the page lock stays; no second scrollbar is added.

## Security Review

The probe sends one number to `parent` with target `*`; it carries no report content. The parent checks `event.source`. Report CSP and sandbox are unchanged.

## Milestones

**M1 — Scroll indicator**
- [x] Tests (RED): 8 failing (view 4, probe 3, server 1). COMMIT: `test(viewer): failing tests for the opened report's scroll HP bar` (bb1f80607)
- [x] Implement (GREEN)
- [x] Gates: `just test` (agent 4507, viewer 1697, pytest 3961 passed), `just lint`, `just build`, `just coverage` (viewer 95.47 lines / 91.43 branches / 94.44 functions; one unrelated experiment-cli timeout on the first run, clean rerun), `just verify-vendor` OK
- [x] Headless desktop and phone proof on a candidate viewer (8796, copied reports): 0% at top, 42% after scrolling the report, 100% at the bottom by wheel, outer page never scrolls, no console errors. Shots: runs/mockups/reports-scroll-indicator/built/. The phone header hides the POKE BENCH logo on main too (pre-existing).
- [x] Review: Claude and GPT lanes (Grok not needed, per coordinator brief): round 1 LGTM from both
- [x] Land, viewer-main, live check: `git merge --ff-only 540cb4e02` (main a0c3d6138 → 540cb4e02, landing board #1 at 1:38 PM), `just test` on main green (agent 4507, viewer 1697, pytest 3961), `just viewer-main` → viewer at 540cb4e02 with 4 live runs kept; live headless on 8790 desktop 1280 and phone 375: 0% / 42% / 100%, no console errors, shots in runs/mockups/reports-scroll-indicator/live/; Tailscale /reports?open= returns 200 and serves the probe

## Multi-Model Review Log

- Round 1, packet runs/reviews/reports-scroll-indicator/r1.diff, base a0c3d6138, head 540cb4e02, SHA-256 20b3ddf62eb7e79194c99116c5953fbd6cda4335bf9de3b9a47b2ecf69e07785. Principles: zero FAIL.
  - Claude CLI (~/.claude-review, plan mode): VERDICT: LGTM. Non-blocking: post() runs after constructing ResizeObserver (all targets have it); test listeners accumulate across mounts (inert). Rebut: no defect.
  - GPT: Cursor gpt-5.6-sol-xhigh out of usage; isolated Codex default gpt-6.1-sol rejected for ChatGPT accounts; isolated Codex gpt-5.6-sol: VERDICT: LGTM. Non-blocking: PNG fetched twice in a test. Rebut: constant cost.
  - Grok: not run (coordinator brief: not needed).

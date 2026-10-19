# Replay trainer card and mobile sheet repair

## Contract

Restore the selected replay card when no renderable live cards exist, preserving live-card precedence. Fix mobile card background stability during updates and animate the bottom sheet opening with reduced-motion support. Viewer only; no harness or experiment changes.

## Evidence and scope

- Reported tab: 8790, selected `2026-10-19T16-13-42-317Z_qwen36-gpu1_petalburg2h-r6-visited-map`, REPLAY mode, no trainer cards. Served build `35edd7af`, PID 9114.
- Discovery advertises two newer live runs plus two stale old runs. The workbench has not loaded the newer runs and marks the old pair unresponsive. `cardInputs` returns an empty live branch and never reaches replay fallback.
- Mobile sheet currently remounts every card when any card markup changes; this can discard loaded image backgrounds. Preserve sheet card nodes separately from its surrounding metadata and give the art a solid fallback surface.
- Use an isolated worktree from main; the original checkout belongs to ongoing 60fps changes and is dirty.

## Milestone

- [x] RED: both regressions fail at the consumer seam: no replay card when live workbench records are missing; unchanged other mobile card is replaced when a fresh badge expires. Focused result 16 passed / 2 failed.
- [x] Implemented fallback based on renderable live cards, preserved the sheet's card container through metadata updates, and reused `syncCards` for per-card updates. Added a solid art fallback and clipped long title tabs to protect the state badge. Mobile entrance is a 260ms slide plus 180ms shade fade, disabled under reduced motion.
- [x] Build and gates: viewer 1,240 tests; agent 2,574 tests; Python 2,724 tests with ROM; TypeScript lint, ruff, formatting and mypy passed; pinned vendor verified. Coverage: viewer lines/branches/functions 97.72/91.32/93.97; agent 99.25/94.08/98.27; Python 97.12/92.85/100.
- [x] Browser on isolated 8803 with a clone-on-write copy of the reported replay (no experiment approvals): selected dotless REPLAY card in the mobile sheet with its PNG background, 260ms entrance style, pointer and Enter opening, card activation closes sheet; no horizontal overflow at 375. Desktop checked at 1280 and 1440. Captures visually inspected in tool record; persistent screenshot paths are unavailable from this browser surface.
- [ ] Independent review and local-main landing, followed by live proof.

## Principles adherence

PB1 PASS: status remains recorded/discovered data, no agent claims used. PB2 N/A: no result filtering. PB3 N/A: no benchmark claim. PB4 PASS: viewer only. PB5 PASS: no measured runs. PB6 N/A: no context changes. PB7 PASS: scratch replay uses recorded events. PB8 N/A: no agent retry changes. PB9 PASS: prior live-card precedence retained; this corrects empty live-row behavior. PB10 PASS: both new regression tests observed failing before implementation; gates unchanged. PB11 PASS: no dependency/API change. PB12 PASS: ROM stays outside git and recordings unchanged. PB13 PASS: worklog and independent review track closeout.

## Review boundary

Production owners: `app.ts` card selection and sheet rendering, `trainer-card.ts` title geometry, `style.css` card surface and sheet entrance. No new runtime, dependency, API, persistence, experiment or gameplay behavior. Stop when the replay fallback, stable cards and mobile animation are verified and reviewed; adjacent viewer performance work belongs to the separate dirty checkout.

Test quality: mounted app consumer tests with fixture-owned IDs and exact card sets/node identity; both were RED before changes. Existing per-test DOM setup and width cleanup retained; no new shared global owner, concurrency, retries, sleeps, skipped tests or large fixture loops. Browser uses a scratch copy of real data, not the shared queue root.

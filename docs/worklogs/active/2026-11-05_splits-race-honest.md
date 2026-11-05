# Splits race: honest opponents for assisted and save runs

Branch `claude/splits-race-honest`, worktree `/private/tmp/pb-splits-race-honest`, based on main 61da9af6c.
Viewer-only correctness fix, so no feature switch (the feature-switch skill excludes viewer-only changes); it is always on.

## Scope

- [x] Assisted runs race the New Game frontier, flagged HEAVILY ASSISTED; they still never rank on it.
- [x] Save runs race the fastest earlier unassisted run from the same save (start_state sha1), each on its own clock.
- [x] No qualifying earlier run: the page says why and never falls back to the New Game frontier.
- [x] Race graph draws the opponent as unhelped when an assisted run races it.
- [x] Heavy gates passed under the START window, run one step at a time at low priority.
- [x] Browser proof on real runs 0952, ee2a, 9f4c: `runs/reports/run-analysis/2026-11-05_splits-race-honest/`.
- [ ] Multi-model review, then land only on the operator's go.

## Decisions

- "Fastest" uses the frontier's own order: furthest checkpoint, then the time to reach it.
- Rivals exclude assisted, excluded, problem, probe and milestone-free runs. Aborted runs count.
- A named checkpoint resume (for example ROUTE_101.state) now also races its save frontier; it used to race nothing.
- The save frontier list is in memory only. After a viewer restart a save run shows loading until the first ranking.

## Log

COMMIT: `test(viewer): assisted runs and save runs get an honest race` (2c2467279). RED.
GREEN: focused files only (splits-race-honest, splits-race, frontier-cache, frontier-fail-open, custom-lane), 74 passed. Full gates not run.
COMMIT: `fix(viewer): race assisted runs and save runs honestly` (3da30766f). GREEN.
Typecheck found the test fixture missing the event envelope; fixed in the next commit. Build and `pnpm -r lint` pass.
Browser proof found the live page has no origin: `/api/cards` leaves it null, so an arbitrary save's splits landed under STONE. RED test added; the frontier answer now carries the start.
COMMIT: `test(viewer): the frontier answer says where a save run starts` (0263e8747). RED.

Commits were rebased onto 3cb67999e, so the SHAs above are from before the rebase. Frozen head c4e6c7b18, diff SHA-256 5fd0ce61d371e06786defe1e8908b9f0001f19b4f6bcfcd3a99e01695fd78dec.

## Gates

Build and `pnpm -r lint` pass. Agent 2537 tests; viewer 989 tests; env 2930 tests at 79% (floor 69); gateway 38 tests at 46% (floor 22); no-I/O proof passes; `just verify-vendor` OK. Env mypy fails in this worktree only because the native mGBA binding is absent; it is clean run with main's venv.

## Multi-Model Review Log

Round 1 on c4e6c7b18. Claude CLI: LGTM. GPT via Codex CLI gpt-5.6-sol: LGTM. Cursor Grok and GPT: usage limit until 11/17, so a fresh read-only fallback reviewer stood in under the operator's standing rule: BLOCKING on one real finding.
Triage. FIX: the no-race sentence was false when an earlier run was excluded; reworded. FIX: two stale comments. FOLLOW-UP: `loadFrontier` in-flight guard (already there, self-corrects), unknown-origin saves file under STONE, `runFromSave` failure answers New Game (no race renders today), `saveFrontiers` copies arrays.
COMMIT: `fix(viewer): say truthfully why a save run has no race` (5c638507c).
Round 2 on the delta c4e6c7b18..5c638507c: Claude CLI LGTM, GPT via Codex LGTM, fallback reviewer LGTM. Focused tests 47 passed; viewer lint passes. Delta is one page sentence, its test string and two comments, so the other gates stand.
The operator's go (2026-11-05 4:23 PM New York): "fix the bugs and land ur changes".

## Landed

main fast-forwarded to c974803c8. `just test` on main passes: agent 2537, viewer 989, env 2930, gateway 38, no-I/O proof OK.
`just viewer-main` restarted 8790 at c974803c8; 2 live gameplay processes kept running. Headless proof on 8790 for 0952, ee2a and 9f4c at 1280 and 390 wide: 0 page errors, 0 horizontal overflow, both graph lines drawn. `just current-main` not needed: no recorded event or snapshot change.
Report: `runs/reports/run-analysis/2026-11-05_splits-race-honest/`.

# Supervisor repeat count and navigate already-here (2026-10-20)

Requested by the operator in the "Cook runs analysis" thread (2026-10-20 10:52 NY). Evidence:
`runs/reviews/2026-10-20-run-analysis-cook-6h-v2/evidence.md`, run
`2026-10-20T03-02-13_qwen36-gpu1_f28d` (turns 2201-2585, seq ~53510).

Two harness bug fixes, each behind its own new default-OFF switch, bundle-only (the
coordinator adds them to `experiments/fixed/bundle-v-control.json`).

1. `briefing-repeat-count-v1` (needs `supervisor-briefing-v2`): the focused briefing's
   "Recent attempts" drops the ×N repeat count the full briefing shows. Recorded at
   turn 2303: "navigate_to 10,5 → no change; …" with no count after ~100 repeats.
2. `navigate-already-here-v1` (needs `bounded-navigation-v1`): navigate_to to the tile
   the player already stands on says "arrived at requested coordinate; 0 bounded movement
   actions". ON: "you are already standing on (10,5), the coordinate you asked for, so no
   movement was needed".

Rules: RED/GREEN, gates (ROM from .env), Claude + Grok review (Codex waived by the
coordinator; max 2 rounds), features.ts merge slot from the coordinator, ff-only to local main.

## M1

- [x] RED: `packages/agent/src/supervisor-nav-truth.test.ts` (6 failing, 3 passing OFF cases)
- [x] GREEN (ca48ad49): both switches registered (`needs: null`, default off; each acts only with its base switch on) and wired; agent 2,711 and viewer 1,356 tests pass
- [x] Explainers (pages-check clean), pending experiments, readiness rows, FEATURE_EXPLAINERS
- [x] Gates: TS coverage agent 2,712 tests 97.61/93.77/97.87 (stmts/branches/funcs), viewer 1,356 tests 95.15/91.17/93.88; Python 2,894 tests, lines 96.94 branches 92.45 functions 100; lint clean (Python lint and pytest via the main checkout's mGBA venv, Python unchanged); verify-vendor OK; verify-rom OK. Wiring deletion turned both factory tests red, then restored.
Rebased onto main 48309d51 (semantic navigation landed); re-ran all gates: agent 2,797 tests 97.27/93.33/97.88, viewer 1,358 tests 95.15/91.17/93.88, Python 2,896 tests 96.95/92.46/100; lint clean; verify-vendor OK.
- [ ] Reviews: r1 Grok (cursor-grok-4.5-high) VERDICT: LGTM, non-blocking note: duplicated </head> in both explainers (fixed). r1 Claude CLI failed: "OAuth session expired and could not be refreshed"; Claude lane moves to Cursor Claude on r2.
- [ ] Land ff-only on main

## Review round 2 fixes

r2 Claude lane (Claude CLI OAuth expired; Cursor Opus and Sonnet usage-capped; fresh Claude subagent fallback) VERDICT: BLOCKING:
1. navigate-already-here-v1 changed the status semantic navigation reads (`semantic-navigation.ts` accepts only "arrived at requested coordinate" at the approach), so navigate_to_target/explore_map already on the approach tile failed without activating. Accepted.
2. Packet base 957b5626 was not an ancestor of the head; branch rebased onto main dd3d701b. Accepted.
- [x] RED: semantic navigation on the approach tile with the switch ON still activates (fails: "route failed at the selected approach")

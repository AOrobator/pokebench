# grass-strides-v1: navigate_to strides cross ordinary tall grass

Branch `claude/grass-strides`, worktree `/private/tmp/pokebench-grass-strides`, from main `1b7ae8b96`.
Brief: coordinator relay 2026-10-27 7:11 PM ET; The operator confirmed the fix choice. Stop after review, do not land.

## Problem Statement

With safe-navigation-strides-v1 ON (both arms), `planStride` (`packages/agent/src/navigation.ts`) accepts only
behavior 0 tiles and the server corridor check (`env/pokebench_env/strides.py` `_safe_next`) refuses
`behavior != 0`. Any step on or into tall grass (MB_TALL_GRASS 0x02) gets no stride and navigation forces
`automaticRunning:false`, so the player walks through grass the game lets them run in. Native running is refused
only on long grass 0x03, 0x0A, 0x28, 0x74–0x77 and the Fortree bridge lower level (`running.py`).
Evidence: run `2026-10-27T17-35-16_qwen36-gpu0_a702`, 173 navigate_to presses on metatile 0x02 with native
running permitted all walked (`runs/grass-running-audit/`).

## Skills Loaded

feature-switch, feature-worklog, tool-prompt-sync (tool description text only; no tool added), feature-explainer,
close-the-loop, execute-worklog (review gate).

## Architecture

- New switch `grass-strides-v1` (guidance group, `needs: safe-navigation-strides-v1`, plus a validation line
  requiring `automatic-running-v1`), default OFF everywhere, appended at the end of every registry list.
- `planStride(state, path, options, tallGrass=false)`: with `tallGrass`, `safe()` also accepts behavior 0x02
  (same collision/elevation/object/warp/trigger exclusions), and the corridor carries `tall_grass: true`.
- `StridePlanSchema` gains optional `tall_grass: true`; the press tool sends it unchanged in the POST body.
- Server `StrideRequest.tall_grass: bool = False`; `_safe_next` accepts 0x02 only when the request asked.
  Receipts omit the field when false, so OFF receipts are byte-identical.
- Native per-frame permission is unchanged: `B` is added only when `read_running_permission` says permitted.
  A battle (wild encounter) stops the stride with "field input unavailable".
- `NavigationPorts.grassStrides` threaded from `features["grass-strides-v1"]` in `withNavigation`.
- The navigate_to description, with the switch on, says corridors may include tall grass and strides stop before
  other grass. rejected-movement-stride-v1 keeps plain-floor-only corridors (out of scope).

## Invariants

- INV-1 OFF parity: switch OFF → same corridors, same POST bytes, same receipts, same tool description.
  Test: agent planStride/description/POST tests with OFF; server receipt has no `tall_grass` key.
- INV-2 Server default refuses grass: a request without `tall_grass` stops before 0x02 as today. Test: existing
  hazard test + explicit default test.
- INV-3 Long grass 0x03 (and every non-0/0x02 behavior) stays refused with the switch on. Test: agent + server.
- INV-4 Native permission governs B: grass with native permission false walks (`[direction]` only). Test: server.
- INV-5 A battle mid-stride stops the stride with no further direction. Test: server grass corridor + IN_BATTLE.
- INV-6 Production factory honors the switch. Test: playTools/withNavigation with ON sends `tall_grass:true`.

## Security Review

No new inputs beyond one strict boolean on a loopback-only endpoint (pydantic strict, extra=forbid). No
subprocesses, paths or ROM handling.

## Milestones

**M1 — grass-strides-v1**
- [x] Write tests (agent: planStride ON/OFF, long grass, description, factory POST; server: default refuses,
      opt-in accepts, long grass refused, native-false walks, battle stops)
- [x] COMMIT: `test: grass-strides-v1 corridors through tall grass (RED)` (3e70ba4a7)
- [x] Implement
- [x] Gates on frozen head 7c9f32eda (coordinator CPU window, 7:41 PM ET): `just lint` PASS; `just test`: agent 4576/4576 (lines 99.16, branches 92.67, functions 97.56), viewer 2083/2083 (98.26 / 91.68 / 95.32), Python 4437 passed (lines 97.47, branches 93.58, functions 100), gateway 69 (99.29 / 97.01 / 100); `just build` PASS. trainer-card-check failed 3/3 only because the gitignored art `runs/sprites/trainer-card-v1` is missing in a fresh worktree ("Approved font/art did not load"); re-run with `POKEBENCH_CARD_ART` pointed at main's art passed 3/3, and the design guard printed OK. No baselines or fixtures were touched.
- [x] COMMIT: `feat: grass-strides-v1 lets navigate_to strides cross tall grass` (6c4be031d)
- [x] Guard deletion check: removing `grassStrides:features["grass-strides-v1"]` from `withNavigation` turned 2 agent tests red (factory, description); forcing the server `floor` to `(0,)` turned 4 server tests red. Both restored.
- [x] Explainer `docs/explainers/grass-strides-v1.html`, `FEATURE_EXPLAINERS` entry, README, server.test.ts page list; pages-theme + pages-check clean
- [x] Multi-model review loop: round 2 LGTM on 7c9f32eda from Claude (subagent), Codex gpt-5.6-sol, and the fallback
- [x] Arm placement (the operator 2026-10-27, relayed verbatim: "Let's actually have this be on in both arms."): `onInBoth` + base `features: true` in `experiments/feature-configs/current.json`; `packages/viewer/src/grass-strides-recipe.test.ts` asserts control and bundle true (and both dependencies) for all four definitions that use the current recipe. Without the recipe change it fails 4/4. Switch description and explainer status updated.
- [ ] Landing: two-lane delta review, sync, land-join, ff-only, land-done, viewer-main

## Closing the Loop

Tests prove the corridor, POST and server step. No live run is touched. A live grass stride is left for the
operator's arm decision.

## Session Log

- 7:49 PM ET: The operator: "the grass fix should be on in the bundle", then "Let's actually have this be on in both arms." (relayed verbatim by the coordinator). Merged main 27356153f: conflicts in the three registry lists and the default maps, because main added type-gap-team-v1, supplies-v1 and untalked-in-gym-v1. Resolved with main's entries first and grass-strides-v1 after them, so it is now at index 280 (the test pin moved from 277). Schema regenerated with no diff. Focused agent 190 and viewer 398 tests pass.

- 2026-10-27 7:15 PM ET: worktree created, code read.
- GREEN gates run 1 (7:25 PM ET): agent vitest 320 files / 4576 tests pass, coverage above floor; build pass; lint failed on one E501 (fixed) and mypy mgba import (environment); Python failures were environment only. Focused re-runs after the env fix: test_strides 42 pass, mypy clean. Full re-run waits for a coordinator CPU window.
- RED: `packages/agent/src/grass-strides.test.ts` 6 failing; `env/tests/env/test_strides.py` 4 new failing (default-refusal test passes today, as INV-2 requires).

## Surprises

- trainer-card-check reads gitignored art from `runs/sprites/trainer-card-v1`; a fresh worktree needs `POKEBENCH_CARD_ART` (or that folder) or all 3 cards fail to load. Environment only.

- `exact-context.test.ts` pinned context-exact-count-v1 as `playHarnessFeatures(...).at(-1)`, which any new switch breaks. Changed it to "present, and nothing registered earlier follows it" so later switches need no edit.
- `schemas/events.v1.json` embeds the stride plan schema; regenerated with `just schema` (adds optional `tall_grass`).
- A fresh worktree venv lacks the mGBA binding and `.env`: copied the built binding from main's venv and symlinked `.env` as the other worktrees do. Without it, 257 Python tests and mypy fail for environment reasons only.

## Multi-Model Review Log

Round 4, head 3167a4c93 (type-gap test pin fix plus a docs-only merge of main 896088908): Claude subagent LGTM; Codex BLOCKING, because the playHarnessFeatures assertion checked only that the ids were adjacent. ACCEPTED: they are now pinned at absolute harness positions [301,302,303]. The focused file passes 4/4.
Full gates at 3167a4c93 (CPU window 8:00 PM ET): lint PASS; test PASS (agent 4620, coverage lines 99.18, branches 92.68, functions 97.52; viewer 2093, 98.26 / 91.67 / 95.32; Python 4446, 97.48 / 93.60 / 100; gateway 69, 99.41 / 97.44 / 100; trainer cards 3/3 with POKEBENCH_CARD_ART set). Coordinator decision (8:05 PM ET): the round-5 delta is one assertion in one test file, so landing rests on that file's focused run plus this green full suite. The post-landing just test on main is the full check and waits for a relayed CPU window.

Round 3, delta review (both-arms activation + merge of main), head a496838f8 (packet3 sha256 3a5e5462…): Codex gpt-5.6-sol LGTM; Claude subagent LGTM. Nits deferred: the recipe test hardcodes the four current-recipe definitions, and does not assert definitionProblems (checked by hand: []).
Full gates at a496838f8 (CPU window 7:56 PM ET): lint PASS, build PASS; test FAIL 1/4620 in main's `type-gap-registry.test.ts`, which pinned its three switches with `slice(-3)`, so any appended switch breaks it. Fixed by pinning absolute indices 277-279 (feature-switch skill step 6). The fix needs a round-4 delta review.

Round 1, packet 1b7ae8b96..33d24aca5 (diff sha256 e9a3134d…):
- Fallback subagent: LGTM; nits: receipt check ignores tall_grass, new test over-pins `.at(-1)`, stale exact-context test title.
- Codex CLI gpt-5.6-sol: BLOCKING. (1) the receipt identity check in game-tools.ts ignored `tall_grass`: ACCEPTED, the check now compares it, a test refuses mismatches in both directions, and deleting the check turns that test red. (2) the `.at(-1)` registry pin: ACCEPTED, now pinned by absolute index 277, and the exact-context title is fixed. (3) PB13 is not complete while gates are pending: ACCEPTED, now scored PARTIAL.
- Claude CLI: lane error ("OAuth session expired"), not a review. Re-run as a read-only Claude subagent (the operator 2026-10-16: the Claude lane is never down while subagents work).

Round 2, frozen head 7c9f32edac2be7695fa3eb2844deb1a3e64065f3 (cumulative diff sha256 2b228996…, delta ef70efe2…):
- Codex CLI gpt-5.6-sol: VERDICT: LGTM (all round-1 findings resolved).
- Claude lane (read-only Claude subagent; checked pokeemerald `MetatileBehavior_IsRunningDisallowed`: tall grass is not on its list, long grass is): VERDICT: LGTM.
- Fallback subagent: VERDICT: LGTM.
- Grok: down per coordinator brief; Claude + GPT + fallback is full approval (the operator 2026-10-21/22).
- Nits, DEFERRED (not defects): every ON stride carries `tall_grass:true` even on an all-floor corridor, so it is a permission rather than a description; the battle test sets IN_BATTLE rather than the field lock (the guard stops on both); whether the readout draws 0x02 and 0x03 differently is unchecked (an observation question, out of scope); the OFF description is checked against the ON text rewritten back, not against the base string literal (confirmed by inspection).

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive

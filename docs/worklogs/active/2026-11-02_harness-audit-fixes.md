# Harness bugs from the thinking-error audit: two real fixes behind OFF switches

## Problem Statement

The thinking-error audit (`runs/thinking-audit-20261102/reports/`, 750 runs) listed eight suspected harness bugs. Each was checked against current `main`, the replay runs' recorded events and their `raw-ram` archives (2026-11-02, read-only):

| # | Audit claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Petalburg Woods entrances labeled `deep_water_exit` | **Real, open** | `map_terrain_elements.py` maps 0x6E to `deep_water_exit`; pokeemerald 731ad5b `MB_DEEP_SOUTH_WARP` = 0x6E is a non-animated door (`MetatileBehavior_IsNonAnimDoor`, no `TILE_FLAG_SURFABLE`; `GetAdjustedInitialDirection` faces north on arrival). Reproduced on fixture `exit-labels-b300` seq 18834 (ROUTE 104, (10,30)/(11,30)). Live in the current recipe (`map-observability-v1` on). |
| 2 | Legend letters change meaning | Fixed | `stable-map-codes-v1` (f3e2b48a8), on in both arms |
| 3 | Objects missing after warps (Briney, Dewford Gym Guide) | Moot in current recipe | `world.read_targets` on 7da5 `raw-ram/00016493` has EXPERT_M at (9,4); control24h `raw-ram/00020761` has MAN_2 at (5,24). Both dropped by `player-map-visibility-v2`'s actor filter. V2 is `offInBoth` since def665b08 (2026-11-02 6:46 PM). |
| 4 | Refusals without reachability; no cross-warp `navigate_to` | Refusals fixed; cross-map routing is a feature, not a bug | `semantic-refusal-reasons-v1` (850551a2f), on in both arms |
| 5 | Tracker missed 0d5d May/Wally wins | Fixed | 0d5d started 2026-10-22 20:40; `ROUTE_110_RIVAL_DEFEATED`/`MAUVILLE_WALLY_DEFEATED` arrived in f2c42632a (2026-10-23 09:06); 6bbd logs both |
| 6 | Navigation recovery note fires mid-battle | **Real, open** (guard is `offInBoth`) | 6bbd: note opened at turn 811 on the overworld; `NavigationRecovery.context()` returns the open episode on every request, and battle calls do not advance its 12-call budget, so the model read it on battle turns 818–823 and called it boilerplate |
| 7 | "empty battle move has PP" in the Wally tutorial | Fixed | 747561436 (2026-10-19); 0 hits in the 352 runs since 2026-10-20 |
| 8 | Visited-map fog | Moot | `player-map-visibility-v2` off in both arms |

## Architecture

**`deep-south-warp-label-v1`** (observation, server feature, default OFF, needs `map-observability-v1`).
`rerender.read_state` relabels map-observation elements `warp`/`deep_water_exit` to `warp`/`entrance` after the observation is built, so the legend, codes, neighbour lines and `state_json` all agree. The game shows no text for this tile; "entrance" is the plain observable fact (it is a warp you step into). OFF: byte-identical.

**`recovery-note-field-only-v1`** (guard, agent, default OFF, needs `navigation-recovery-v1`).
`NavigationRecovery.context()` returns nothing while the latest state is in battle; the episode stays open and its text returns on the next field request. A pending briefing is not marked exposed during the battle, so it is still delivered afterwards. OFF: byte-identical.

Non-goals: no change to visibility V2 (operator turned it off), no cross-map routing.

**Activation (the operator / the operator 2026-11-02, 11:08 PM: "the label fix should be on in both arms")**: `deep-south-warp-label-v1` base true and onInBoth in `experiments/feature-configs/current.json` and `experiments/presets/current-control-24h-8k.json`, with a dated README entry. `recovery-note-field-only-v1` stays OFF everywhere.

## Invariants

| ID | Invariant | Test |
|---|---|---|
| INV-1 | OFF reproduces today's readout and state JSON bytes | `test_deep_south_warp_label.py` OFF case on fixture 18834 |
| INV-2 | ON: no `deep_water_exit`/`deep water exit` in readout or JSON; the two tiles read `Wp:entrance`; other warps untouched | same file |
| INV-3 | OFF: open recovery episode text is returned on a battle request (today's behavior) | `recovery-note-field-only.test.ts` |
| INV-4 | ON: nothing during battle; same text on the next field request; briefing survives a battle | same file |

## Milestones

**M1 — both switches**
- [x] Triage all eight bugs against code, events and raw RAM
- [x] RED: tests for INV-1..INV-4 (`env/tests/env/test_deep_south_warp_label.py` 3 failed / 1 passed; `packages/agent/src/recovery-note-field-only.test.ts` 3 failed / 1 passed — the passing ones are the OFF guards)
- [x] GREEN: implement, register (features.ts, play-preset.ts, next-run.ts, readout.py SERVER_FEATURES + default-off list). Focused: agent 6 files / 173 tests; viewer server+next-run 139, panels 137; env 145. Wiring removal in `harness.ts` turns the factory test red (1 failed / 3 passed), restored green.
- [x] Explainers + `FEATURE_EXPLAINERS` (`docs/explainers/deep-south-warp-label-v1.html`, `recovery-note-field-only-v1.html`; `just pages-check` clean)
- [x] Gates (coverage-gate CPU window granted by the coordinator at 11:18 PM): `just build` pass. Agent 382 files / 5406 tests, 96.39 lines / 92.35 branches / 97.44 functions. Viewer 184 files / 2423 tests, 94.57 / 90.78 / 94.83. Env 5203 passed, 97.51 / 93.58 / 99.90. Gateway 116 passed, 99.12 / 96.22 / 100. `just trainer-card-check` pass after `just trainer-card-art`. First env pass: 5 failures where tests stub `read_game_state` with non-GameState objects. The relabel now reads `map_observation` only from a real `MapObservation` (fixed in the next commit). `test_view` needs the native mgba binding, which the worktree venv lacks, so env coverage ran with the main checkout's venv against worktree sources (`PYTHONPATH`). It fails identically with main's `rerender.py`. Lint: TS tsc and eslint pass, and the gateway passes. ruff check, ruff format and mypy fail only on files this branch does not touch (`adjacent_tiles.py`, `map_observation.py`, `launcher.py`, `test_exit_reach.py`, `test_adjacent_tiles.py`, `test_compact_map_grid.py`), plus the mgba stubs.
- [ ] Cloud review (Claude, Grok, GPT/Codex lanes)
- [x] Landed ff-only on main at eaf728764. Post-merge `just test` on main green with the same counts and coverage as the branch. `just viewer-main` put 8790 at eaf728764 (parent launchd), and the one live gameplay process (pid 66126) kept running. Both explainers serve 200 on 8790 `/explainers/` and 8791.

## Progress Log

- 2026-11-02 11:15 PM: triage done; worktree `/private/tmp/pb-harness-audit` on `claude/harness-audit-fixes` from 9f8993be1.
- 2026-11-02 11:11 PM: RED committed.
- 2026-11-02 11:25 PM: GREEN committed; changed-file eslint/tsc/ruff/mypy clean. Main itself carries ruff errors in `adjacent_tiles.py` and `map_observation.py` (not touched here), so `just lint` will need that noted.
- 2026-11-02 11:20 PM: The operator asked for the label fix ON in both arms; config + preset + README updated. Heavy-CPU window granted by the coordinator at 11:18 PM.
- 2026-11-02 11:50 PM: gates recorded, stub-guard fix committed, CPU window released.
- 2026-11-03 12:10 AM: review round 1. Claude BLOCKING on B1 (the explainer Status still said OFF in every recipe after activation). Fixed B1, the INV filename and the activation attribution, and aligned the features.ts copy. Cursor Grok and GPT returned usage-limit errors (reset 11/17), so the GPT lane goes to Codex CLI and the Grok lane to a fallback subagent (standing rule, see memory claude-review-lane).
- 2026-11-02 11:37 PM: review round 2 on packet 9f8993be1..0180268bc (sha256 e0a99340…). Claude CLI (~/.claude-review, plan mode): **VERDICT: LGTM**. Its only notes are non-blocking: test caching, index pins (the sibling switches lack them too), and undefined `latest`. GPT lane: Cursor gpt-5.6-sol-xhigh returned a usage limit (resets 11/17), and Codex CLI gpt-5.6-sol returned a usage limit (resets Nov 4, 1:36 AM). Both harnesses are exhausted, so per the subagent fallback two fresh read-only subagents (sonnet, opus) replace the Grok and GPT lanes. Reduced vendor diversity is recorded.
- 2026-11-02 11:45 PM: fallback lanes on packet 9f8993be1..0180268bc. Sonnet subagent (Grok role; The operator also waived Cursor/Grok at 11:38 PM): **VERDICT: LGTM**. Opus subagent (GPT role, both GPT harnesses usage-limited): **VERDICT: LGTM**. Non-blocking notes deferred: a ROM-free unit test for `deep_south_warp_entrances`, registry index pins, a deferred briefing that holds other stall notes until the field (with retry, nothing lost), and `latest` undefined after an unavailable state. The ROM-dependent tests ran with `.env` here (RED 3 failed / 1 passed, then GREEN).
- 2026-11-02 11:48 PM: landing. Main advanced to fb7042cbf: worklog plus a bundle-arm config for open-milestone switches, with no code overlap. Merged main into the branch (f67e1053e). The feature diff outside `docs/worklogs` and `current.json` is byte-identical to the reviewed packet (sha256 82c9444b…), and the `current.json` added lines are identical. Reviews and gates are retained. Post-merge `just test` on main to follow.
- 2026-11-03 12:05 AM: post-merge check and viewer refresh done; landing slot released.

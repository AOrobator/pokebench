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
- [ ] Gates: `just build` PASS; agent vitest 4576/4576 PASS with coverage ≥90; focused viewer 378 PASS, focused Python + mypy PASS after env fix; full `just test` / `just lint` re-run PENDING coordinator CPU window
- [x] COMMIT: `feat: grass-strides-v1 lets navigate_to strides cross tall grass` (6c4be031d)
- [x] Guard deletion check: removing `grassStrides:features["grass-strides-v1"]` from `withNavigation` turned 2 agent tests red (factory, description); forcing the server `floor` to `(0,)` turned 4 server tests red. Both restored.
- [x] Explainer `docs/explainers/grass-strides-v1.html`, `FEATURE_EXPLAINERS` entry, README, server.test.ts page list; pages-theme + pages-check clean
- [ ] Multi-model review loop (Claude + Codex gpt-5.6-sol + fallback; Grok down per brief)
- [ ] ASK USER: arm placement / landing (not in this brief)

## Closing the Loop

Tests prove the corridor, POST and server step. No live run is touched. A live grass stride is left for the
operator's arm decision.

## Session Log

- 2026-10-27 7:15 PM ET: worktree created, code read.
- GREEN gates run 1 (7:25 PM ET): agent vitest 320 files / 4576 tests pass, coverage above floor; build pass; lint failed on one E501 (fixed) and mypy mgba import (environment); Python failures were environment only. Focused re-runs after the env fix: test_strides 42 pass, mypy clean. Full re-run waits for a coordinator CPU window.
- RED: `packages/agent/src/grass-strides.test.ts` 6 failing; `env/tests/env/test_strides.py` 4 new failing (default-refusal test passes today, as INV-2 requires).

## Surprises

- `exact-context.test.ts` pinned context-exact-count-v1 as `playHarnessFeatures(...).at(-1)`, which any new switch breaks. Changed it to "present, and nothing registered earlier follows it" so later switches need no edit.
- `schemas/events.v1.json` embeds the stride plan schema; regenerated with `just schema` (adds optional `tall_grass`).
- A fresh worktree venv lacks the mGBA binding and `.env`: copied the built binding from main's venv and symlinked `.env` as the other worktrees do. Without it, 257 Python tests and mypy fail for environment reasons only.

## Multi-Model Review Log

Round 1, packet 1b7ae8b96..33d24aca5 (diff sha256 e9a3134d…):
- Fallback subagent: LGTM; nits: receipt check ignores tall_grass, new test over-pins `.at(-1)`, stale exact-context test title.
- Codex CLI gpt-5.6-sol: BLOCKING. (1) the receipt identity check in game-tools.ts ignored `tall_grass`: ACCEPTED, the check now compares it, a test refuses mismatches in both directions, and deleting the check turns that test red. (2) the `.at(-1)` registry pin: ACCEPTED, now pinned by absolute index 277, and the exact-context title is fixed. (3) PB13 is not complete while gates are pending: ACCEPTED, now scored PARTIAL.
- Claude CLI: lane error ("OAuth session expired"), not a review. Re-run as a read-only Claude subagent (the operator 2026-10-16: the Claude lane is never down while subagents work).

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive

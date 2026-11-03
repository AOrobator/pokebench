# Moving-NPC intercept: step into a patrol path and talk

**Started:** 2026-11-03
**Status:** Approved 2026-11-03 (the operator: "u can code when the worklog is written"); M1 in progress
**Branch:** `claude/moving-npc-intercept` (worktree `/private/tmp/pb-moving-npc-intercept`, from main `ce6f83fc4`)
**Switch:** `moving-npc-intercept-v1` (registry default OFF; `onInBoth` in `experiments/feature-configs/current.json`, the operator 2026-11-03: "go, this should be on in both arms")

## Problem Statement

Agents lose a median of about 10 minutes and 40 turns between first entering ROUTE104 MR BRINEYS HOUSE (map 17/0) after the Devon Goods and sailing. A direct talk should take about 3 turns. Twelve recorded runs entered the cottage after DEVON_GOODS_RECOVERED. Eleven sailed: median 9.9 min, 40 turns (range 2.6 to 136.7 min). Qwen3.8 27B `2026-11-01T01-37-02_hyperqwen-gpu0_7da5` never sailed.

Game mechanism (pret `731ad5bf`):
- `Route104_MrBrineysHouse_OnTransition` → `Route104_MrBrineysHouse_EventScript_SetBrineyPeekoPos`. When `VAR_BRINEY_HOUSE_STATE == 1`, it puts MR. BRINEY at (9,3) with `MOVEMENT_TYPE_WALK_SEQUENCE_DOWN_LEFT_UP_RIGHT` and PEEKO at (9,6) with `MOVEMENT_TYPE_WALK_SEQUENCE_LEFT_UP_RIGHT_DOWN`. Both walk the same 12-tile ring around the table, nonstop, the same way round. Over 80c8's samples PEEKO is 1 to 3 ring steps ahead of BRINEY.
- `event_object_movement.c MoveNextDirectionInSequence`: when the next tile collides, a walk-sequence object walks in place instead (`GetWalkInPlaceNormalMovementAction`). A player standing on the ring pins whoever reaches them first.

Harness failure:
- `moving-npc-target-v1` (onInBoth) follows the NPC's *current* tile, one bounded action per iteration, about 75 frames apart. BRINEY moves about 5 tiles in that time. 80c8 t321 (seq 16281–16487): the player oscillates (10,3)↔(10,4)↔(10,5) for 32 steps, then returns "moving target attempt limit reached". In 88ea, 37 of 39 follows ended that way. The follow never reaches a press of A.
- Blocking at an arbitrary ring tile pins PEEKO, not BRINEY, because PEEKO is ahead (the operator 2026-11-03).

The one quick success shows the fix. 80c8 t360 (seq 19611–19623): the player waited off the ring at (8,2). At frame 393348, one frame after BRINEY reached (7,3) with PEEKO already past at (9,4), it pressed DOWN onto ring tile (8,3). BRINEY walked in place at (7,3). The player pressed LEFT, then A, and got "We'll set sail for DEWFORD."

The step-in window lasts about one BRINEY step (16 frames) and agent-side latency is about 75 frames. The timing therefore has to be owned per emulated frame on the game server, like strides (`env/pokebench_env/strides.py`).

Separate finding, not in scope: `player-map-visibility-v2` drops an actor whose sprite is only partly on screen (BRINEY at (9,4), sprite y=−19 on every door arrival). It is OFF in both arms since 2026-11-02; record it for that switch's owner if it returns.

## Skills Loaded

- `.claude/skills/feature-worklog/SKILL.md`
- `.claude/skills/feature-switch/SKILL.md`
- `.claude/skills/tool-prompt-sync/SKILL.md`
- `.claude/skills/pokebench-game-state/SKILL.md`
- `.claude/skills/pokebench-trace-forensics/SKILL.md` (evidence above)
- `.claude/skills/feature-explainer/SKILL.md`
- `.claude/skills/close-the-loop/SKILL.md`
- `.claude/skills/execute-worklog/SKILL.md` (after approval)
- `.claude/skills/pokebench-run-coordination/SKILL.md` (before the emulator rehearsal)

## Architecture

### Agent side: `followObject` in `packages/agent/src/semantic-navigation.ts`

With `moving-npc-intercept-v1` ON (it needs `moving-npc-target-v1`):
1. **Observe the walk.** Each verified state read during the follow already gives the target's tile. Keep the target's observed one-tile moves (P→T edges), read from native object current and previous coordinates.
2. **Choose an intercept** once the target has been seen moving along at least two consecutive edges:
   - a track tile T with an observed incoming edge P→T;
   - T is walkable at the player's elevation, and is not a warp or coordinate trigger;
   - a side tile S, cardinally next to T and off the observed track, is reachable on foot, unoccupied and not a warp;
   - prefer the S nearest the player.
   No map, person or story names are involved; the choice works from the observed walk only.
3. Walk to S with the existing bounded `navigate.executeChecked`.
4. Submit a server **intercept** (below) and await its receipt.
5. On `entered`, the target is pinned, walking in place. Face it with the existing checked press, then press A once. The existing recipient and identity checks apply unchanged.
6. Any other receipt falls back to today's follow loop, within the same 32-attempt bound and with a truthful status line.

OFF keeps today's follow exactly.

### Server side: new `env/pokebench_env/intercept.py`, installed like strides

- `POST /pokebench/intercept` with `{id, map_id, wait: S, enter: T, approach: P, target_local_id, target_slot, elevation, max_frames}`. The same input-queue-busy admission as strides applies. A private queue marker owns the frames.
- Per emulated frame:
  1. Validate the player is on S, field control is free, the map is unchanged and the target's identity is intact.
  2. If the player is not facing T, tap the direction toward T and verify the turn.
  3. Wait without input until the target's current coordinates are P, and T is clear of every object's current and previous coordinates.
  4. Hold the direction to T until the player's coordinates are T.
  5. Stop with a receipt: `entered`, `blocked`, `target left`, `field input unavailable` or `frame budget`.
- `max_frames` ≤ 480, two ring laps at walk speed. Game-state-driven waiting only: no wall-clock sleeps (operator rule).
- `SERVER_FEATURES` entry in `features.ts` and `readout.py`, default-off list.

### Model-facing text

`MOVING_NPC_SENTENCE` gains one ON-only sentence. It says that for a person seen walking a fixed path, the tool may wait beside the path and step into it so the person stops, then talks. The result status gives the observable outcome, for example "stepped into the person's path at (8,3); they stopped". It names no person, place or story step. Tool-prompt sync is part of the same change.

## Invariants

- **INV-1 OFF exact:** with the switch OFF, follow requests, tool descriptions, prompt and receipts match today's bytes. Test: existing `moving-npc-target.test.ts` with OFF plus a description snapshot.
- **INV-2 target, not leader:** the server never steps into T while any other object occupies T or P's successor. It steps only when the selected target is on P. Test: a two-walker ring fixture where the leader (PEEKO role) is 1, 2 and 3 steps ahead. Only the trailing target is pinned.
- **INV-3 frame-owned timing:** the step is issued on the first frame the condition holds, never from agent-side polling. Test: a stepped fake emulator asserts the input frame equals the condition frame (+1 at most).
- **INV-4 bounded:** the server stops within `max_frames`; the agent stays within 32 attempts; no new unbounded loop. Test: a never-arriving target yields `frame budget` and a truthful status.
- **INV-5 identity and safety:** a map change, battle, dialogue, locked field, identity change, warp or trigger on T or S all stop without input. Test: one per stop reason.
- **INV-6 no foreknowledge:** text and choice use only the observed walk and the map's walkability. Test: the fixture uses unnamed sprites; snapshot the result text.
- **INV-7 recipe:** `moving-npc-intercept-v1` is onInBoth and base true in `current.json`; registry default OFF. Test: fixed-definition materialization.

## Security Review

One new loopback-only FastAPI route on the existing game server (127.0.0.1). Strict pydantic request model (`extra="forbid"`, bounded ints, id pattern), the same as strides. No ROM, path or subprocess changes.

## Milestones

**M1 — Server intercept (frame-owned)**
- [x] RED: `env/tests/env/test_intercept.py`, a stepped fake emulator. Cases: two-walker ring (leader 1/2/3 ahead), face-then-step, frame budget, each stop reason, request validation, queue-busy 409.
- [x] COMMIT: `test(env): require a frame-owned patrol intercept` (RED) `3ce404d69`
- [x] Implement `intercept.py`, installed through `install_travel(intercept=...)` from `serve.py`; server feature off-list
- [x] Cheap checks: ruff check/format clean on changed files; mypy clean on intercept.py/travel.py (the one mypy error and one format diff are in `map_observation.py`, pre-existing on main); focused pytest intercept+travel+strides 92 passed; intercept.py 96% lines+branches
- [x] COMMIT: `feat(env): frame-owned patrol intercept behind moving-npc-intercept-v1` (GREEN) `3a82530b8`
- Outcome: the server can pin a named walker from a side tile. Non-goals: choosing S/T, any model text. Split trigger: if the turn-before-step needs its own receipt protocol.

**M1b — Server patrol watch (design change found while building M2)**
- Agent state reads are ~35–75 frames apart, so they never see the target's one-tile steps or its direction of travel. The server now also offers `POST /pokebench/intercept/watch`: no input, per-frame record of the target's one-tile steps until a step repeats ("loop closed"), the target stands still for 48 frames, jumps, or the budget ends. The agent picks P→T from those exact steps.
- `MAX_FRAMES` 480 → 240: one 12-tile lap is 192 frames, and the recorded `button_press.hold_frames` schema caps at 255.
- "blocked" now counts every stepping frame: a refused step walks in place and keeps the player "moving", so the old idle count never fired.
- [x] RED: watch cases (exact loop edges with no input, still/jump, lost control/target/map/budget, shared admission)
- [x] COMMIT: `test(env): require a no-input patrol watch` (RED) `cac33db0b`
- [x] COMMIT: `feat(env): patrol watch for the intercept` (GREEN) `38c38c378`; 49 intercept tests

**M2 — Agent intercept in `followObject`, registry, prompt, recipe**
- [x] RED: `packages/agent/src/moving-npc-intercept.test.ts` (10 cases). Cases: track learning from object coordinates, T/S choice (off-track, reachable, no warp/trigger), receipt handling (`entered` → face + A; others → fallback), OFF byte-exact, factory wiring, recipe onInBoth.
- [x] COMMIT: `test(agent): require moving-NPC intercept` (RED) `80f5cbd89`
- [x] Implement: registry append (last switch), preset optional, `DEFAULT_NEXT_RUN` off, `SERVER_FEATURES` (TS and Python), `current.json` onInBoth + base true and a README paragraph, tool-prompt sync (navigate_to_target description and the overworld system-prompt line carry `PATH_STEP_IN_SENTENCE` only when ON). Press tool gains `executeWatch`/`executeIntercept` (`game-tools.ts`, schemas in `intercept.ts`); `followObject` tries a watch and step-in at most twice per call, only after the target is seen to move, and falls back to the follow on any other outcome.
- [x] Delete-guard: forcing the switch gate on turned the OFF and fallback-equivalence tests red (2); dropping the result notes turned 3 red; restored. Focused agent suites: features, game-tools, play-config, play-preset, semantic-navigation, tool-prompt-sync, moving-npc-target, moving-npc-intercept all pass (254 + 165).
- [x] Explainer `docs/explainers/moving-npc-intercept-v1.html` + README entry + `FEATURE_EXPLAINERS`; pages-theme applied, pages-check clean; viewer tests for the card link, byte-for-byte serving and both-arm recipe bits (3 pass)
- [x] COMMIT: `feat(agent): step into a walking person's path to talk (moving-npc-intercept-v1)` (GREEN) `e5802a693`

**M3 — Emulator rehearsal (proof at the surface)**
- [x] CPU only on 127.0.0.1:8183, no GPU lane, no model; live run on 8075 untouched
- [x] Boot `runs/2026-10-25T10-50-57_gpt-6-astra_429f/checkpoints/DEVON_PRESIDENT_SCENE_COMPLETE.state` in an isolated `runs/<id>/` server. Walk to the cottage with plain inputs, save a cottage state for reuse, then call `navigate_to_target` on object 1 with the switch ON.
- [x] PASS. ON: 4/4 trials opened BRINEY's sail prompt in one call (36.4, 36.9, 32.3 s from the door at three phases; 30.4 s from (9,7), which stepped in at (9,6) as he reached (9,5)). OFF control from the same door state: 0/2 (53.7 s "stride geometry or native input changed before action"; 73.1 s "moving target attempt limit reached"). Driver log `runs/rehearsal-intercept-20261103/driver.jsonl` with frames. Server stopped after the trials. Pass bar was: BRINEY's sail prompt opens within one tool call, from at least 3 different entry phases (enter at different ring offsets). Record frames and receipts. OFF control at the same entry reproduces the attempt-limit return.
- Tagged as a manual probe so summaries exclude it.

**M4 — Full gates, review, landing**
- [ ] Principles self-review PB1–PB13 zero FAIL
- [ ] CPU START via `just tell-claude`; `just lint`, `just test` (coverage ≥90 lines/branches/functions), `just verify-vendor`, `just trainer-card-check`; CPU RELEASE
- [ ] Claude, Grok and GPT/Codex review lanes `VERDICT: LGTM` on the frozen packet (no local inference reviewers)
- [ ] `just land-join`, FF-only merge while number 1, evidence commit, `just land-done`; report merge SHA
- [ ] Activation: `just viewer-main` only when the operator asks for it, or before a fixed-run launch check from the newer pin. No launch here. Live runs keep their pins.

## Closing the Loop

- Tests for code (M1/M2), emulator rehearsal frames and receipts (M3), local explainer link (200, pages-check clean).
- What M3 cannot show: model behavior in a real run. That waits for the next launch from the landed pin.

## Session Log

- 2026-11-03: Forensics in thread "Briney chase" (12 runs, two harness causes). The operator chose stepping into the path over the off-path wait, and said "go, this should be on in both arms". Worklog drafted (`d3d36e7b4`).
- 2026-11-03 00:08 NY: The operator approved coding ("u can code when the worklog is written", relayed verbatim by the coordinator). M1 RED: 35 cases; the module import and travel wiring fail until GREEN.

- 2026-11-03: M1 delete-guard checks: removing the other-walker tile check, previous-coordinate check, approach wait, facing turn, identity or entered-tile safety each turns tests red. Removing the separate player-moving guard stays green because the native controllable check already withholds input while the player moves; kept as defense in depth.

- 2026-11-03 01:00 NY: M3 rehearsal on an isolated CPU-only server (127.0.0.1:8183, run dir `runs/rehearsal-intercept-20261103`, worktree build, current-recipe features, no model, no GPU). Booted `gpt-6-astra_429f/checkpoints/DEVON_PRESIDENT_SCENE_COMPLETE.state`, walked to the cottage with the harness tools (MAY's battle offer declined; two ROUTE 104 trainers fought), saved `route104-before-cottage.ss0` (sha1 55a8b6e6…) and `cottage-door.ss0` (sha1 774fc549…).
- First cottage call opened BRINEY's sail offer, but the result text had no step-in notes: dialogue auto-advance keeps only the first content part of a semantic walk, and the notes were a separate part. Bounded source correction: the notes now ride in the status text, before burst frames (test added; 11 agent cases).
- Trials from the door state with the fix (each one navigate_to_target call on object 1): phase 0 36.4 s, phase +1 B 36.9 s, phase +3 B 32.3 s; each watched a 12-step loop, stepped in at (6,6) as BRINEY reached (7,6), and opened "We'll set sail for DEWFORD." with the YES/NO.

- 2026-11-03 01:05 NY: CPU window granted by the coordinator. Gate pass 1: `just verify-vendor` PASS. `just lint`: pnpm lint PASS; the env ruff step fails on 9 errors, all in files this branch does not touch, and identical on main `d535a4d6f` (adjacent_tiles.py, launcher.py, map_observation.py, test_adjacent_tiles.py, test_compact_map_grid.py, test_exit_reach.py), so they are pre-existing. `just test` failed 1/5423 agent tests: `control-preset-8k.test.ts` requires `experiments/presets/current-control-24h-8k.json` to mirror the recipe features; added the switch there. `just trainer-card-check` failed because the worktree has no `runs/sprites/trainer-card-v1`; re-running with `POKEBENCH_CARD_ART` pointed at the main checkout's generated art.

- 2026-11-03 01:15 NY: Gate pass 2 at `a7787785b` (the code is identical to `4e968ab0b`; later commits are docs). `just test`: agent 383 files, 5423/5423, coverage lines 99.01 / branches 92.27 / functions 97.4 / statements 96.34; viewer 184 files, 2427/2427, 98.22 / 90.78 / 94.83 / 94.57. The pytest step failed once only because the worktree's fresh `.venv` has no mGBA binding (`ModuleNotFoundError: No module named 'mgba'` in `test_view.py`). Re-run with main's `.venv` and `PYTHONPATH` set to the worktree: 5252/5252 passed; coverage gate lines 97.50%, branches 93.59%, functions 99.90% (floor 90); intercept.py 96%. `just trainer-card-check` (with POKEBENCH_CARD_ART) PASS, 3/3. `just verify-vendor` PASS. `just lint`: pnpm lint PASS; env ruff has the 9 pre-existing errors, identical on main. CPU window released.

## Surprises

- `moving-npc-target-v1` already onInBoth and already "fixed" for drift (2026-11-01); the remaining failure is pursuit lag, not drift aborts.
- PEEKO shares BRINEY's ring, so naive blocking pins the wrong walker.

## Multi-Model Review Log

- 2026-11-03 01:09 NY: The operator waived the Grok and GPT/Codex lanes for this landing ("grok and cgpt are waived"). The Claude lane is the review gate. Principles self-review: `runs/reviews/moving-npc-intercept/principles.md`, zero FAIL.
- Round 1 Claude CLI (`~/.claude-review`, plan mode, read-only) on the frozen packet base `ce6f83fc4` head `a7787785b`, diff SHA-256 `f35dafcb…c853`: `VERDICT: LGTM`, no blockers. Output in `runs/reviews/moving-npc-intercept/claude-review.out`.
- Deferred hardening from that review, none of it blocking. (1) During stepping the server does not re-check that the target is still on P, so a refused-then-cleared step can report `entered` without a pin; the follow still recovers. (2) After a failed watch, `seen` comes from the state before the watch, so the second try can start on any movement, contrary to the comment; still capped at 2. (3) The receipt is compared by JSON key order; it is correct today but brittle. (4) An HTTP 409 or missing route throws a tool error instead of falling back, the same as strides. Only the 12-tile ring was rehearsed; back-and-forth paths are untested on the emulator.

## Boy Scout Log

- Not fixed here (pre-existing, other switch's owner): with `moving-npc-frame-burst-v1` ON and no step-in notes, the follow's first content part is a burst image, so dialogue auto-advance drops the "Semantic navigation: …" status line after a talk.

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog to `docs/worklogs/2026-11-03_moving-npc-intercept.md`

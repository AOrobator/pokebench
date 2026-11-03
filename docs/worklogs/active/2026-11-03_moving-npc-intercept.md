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
- [ ] COMMIT: `feat(env): patrol watch for the intercept` (GREEN)

**M2 — Agent intercept in `followObject`, registry, prompt, recipe**
- [ ] RED: `moving-npc-intercept.test.ts`. Cases: track learning from object coordinates, T/S choice (off-track, reachable, no warp/trigger), receipt handling (`entered` → face + A; others → fallback), OFF byte-exact, factory wiring, recipe onInBoth.
- [ ] COMMIT: `test(agent): require moving-NPC intercept` (RED)
- [ ] Implement: registry append (index after the last switch), preset optional, `DEFAULT_NEXT_RUN` off, `SERVER_FEATURES`, `current.json` onInBoth plus a README paragraph, tool-prompt sync
- [ ] Delete-guard once (wiring off → ON test red), restore, record
- [ ] Explainer `docs/explainers/moving-npc-intercept-v1.html` + `FEATURE_EXPLAINERS`; `just pages-theme`, `just pages-check`
- [ ] COMMIT: `feat(agent): step into a walking person's path to talk (moving-npc-intercept-v1)` (GREEN)

**M3 — Emulator rehearsal (proof at the surface)**
- [ ] Run coordination check; CPU only, no GPU lanes, no live run touched
- [ ] Boot `runs/2026-10-25T10-50-57_gpt-6-astra_429f/checkpoints/DEVON_PRESIDENT_SCENE_COMPLETE.state` in an isolated `runs/<id>/` server. Walk to the cottage with plain inputs, save a cottage state for reuse, then call `navigate_to_target` on object 1 with the switch ON.
- [ ] Pass bar: BRINEY's sail prompt opens within one tool call, from at least 3 different entry phases (enter at different ring offsets). Record frames and receipts. OFF control at the same entry reproduces the attempt-limit return.
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

## Surprises

- `moving-npc-target-v1` already onInBoth and already "fixed" for drift (2026-11-01); the remaining failure is pursuit lag, not drift aborts.
- PEEKO shares BRINEY's ring, so naive blocking pins the wrong walker.

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog to `docs/worklogs/2026-11-03_moving-npc-intercept.md`

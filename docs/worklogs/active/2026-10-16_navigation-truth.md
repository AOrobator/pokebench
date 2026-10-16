# Navigation truth (cook harness audit fixes, TypeScript)

Branch `claude/navigation-truth`, worktree `/private/tmp/pokebench-navigation-truth`, cut from main 1f4ac74e. Operator (the operator) approved fixing these bugs at 5:34 AM New York time 2026-10-16 ("fix all of these bugs and then put them in the bundle"), relayed by the thread owner; that is this worklog's approval. Merging is left to the thread owner (no self-merge from this branch).

## Problem Statement

The 2026-10-16 cook harness audit (`runs/reports/2026-10-16-cook-harness-audit/`) found TypeScript harness messages that tell the model false or incomplete things:

1. navigate_to offers "to talk to it or use it … press A" for a live object with no script (sh02 T260 seq 5861, PROF_BIRCH on Route 101, script 0x0, absent from `interaction_targets`).
2. The planner walks and offers stand tiles through coordinate triggers whose condition matches now, which run a script that pushes the player back (sh02 T260: PreventExitWest (6,15–18), PreventExitNorth (7,13); 3f21 T123 seq 2374: NeedPokemon triggers (10,1)/(11,1), "nearest walkable … (10,0)").
3. "blocked; inspect obstacle" does not name the wandering NPC that stepped into the route (54a7 T169 seq 3790, FAT_MAN (13,14)->(14,14)).
4. A walk that advances and then refuses, or hits the 8-press cap, does not say where it stopped (sh02 T806 seq 13284: stopped at (13,7), result named (19,7)).
5. The interaction loop-guard text says "Reopening the same message is not story progress." when no message was open (sh02 T810 seq 13428, T1061 seq 18027; 54a7 T125 seq 2745).
6. Dialogue auto-advance cuts a page at every scroll prompt, so one sentence becomes several "pages" (54a7 seq 3032, 3959, 4838).
7. Speakers: narration ("GMREEN received the TORCHIC!") is tagged with the previous speaker (sh02 T334); a speaker named by "MAY:" on page 1 becomes `RIVAL_MAY_NORMAL (sprite kind, not a name)` on the next pages of the same conversation (sh02 T922).
8. (Behavior change) A goal reachable only through tiles outside the 15×15 local window is refused with "no supported local path" and no reason (show T800; 54a7 T213–218 seq 5217–5268; e588 seq 21016/21228/21335).

## Skills Loaded

feature-worklog, execute-worklog (incl. Landing on main), feature-switch, feature-explainer, pokebench-game-state, agent-observability, multi-model-review (+ reviewer-invocation reference). pokeemerald reference checkout 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, clean.

## Architecture

Two new switches, registered at the registry tail:

- `navigation-truth-v1` (correctness group for items 1–7; needs null; default OFF in presets; **intended ON in both arms** of bundle-v-control, set by the integrator, not this branch). OFF reproduces today's bytes.
  - `navigation.ts`: `targetReason` offers "press A" only for an object in `interaction_targets` (object with a script, world.py) or an A-activated target; otherwise says the object has no script. Planner option `triggers`: tiles of `world_context.triggers` with `condition_met === true`, `variable !== 0` (TRIGGER_RUN_IMMEDIATELY returns no script, pokeemerald `TryRunCoordEventScript`) and elevation 0 or the walker's elevation (`GetCoordEventScriptAtPosition`) are never crossed on the way to another goal; stand tiles and the nearest-walkable suggestion skip them; when the goal is reachable only across one, the refusal names the trigger. Trigger avoidance needs `coordinate-script-conditions-v1` too (that switch owns telling the model about triggers). The walk names the object that now stands on the next route tile when it is blocked, and says where a partial walk stopped and why (refusal after steps, or the per-call press cap).
  - `loop-detection.ts`: the interaction message keeps "Reopening the same message is not story progress." only when this call ended with a ready message or restarted a conversation (message text only; repeating/recover untouched).
  - `dialogue-auto-advance.ts` (`Pages` only): a `scroll_wait` (RENDER_STATE_SCROLL_START, `\l`) is not a page end; the page closes at `page_wait` (`\p` clear), `button_wait`, `dismiss_wait` or flush. A speaker named by a NAME: prefix is kept for later messages while the player still faces the same object; a page that narrates the player's own action (`{PLAYER} received …`) gets no speaker.
- `navigation-refusal-reasons-v2` (behavior change, needs `bounded-navigation-v1`, default OFF, **bundle arm only**). Local mode, goal inside the window, standable, unreachable inside it, map bounds known: the refusal says the route would leave the 15×15 local map and names the reachable window-edge tile (one with an unseen in-map neighbour) nearest the goal. Does not enable full-map-navigation-v1.

## Invariants

- INV-1 OFF is byte-identical: every changed message and plan is gated; existing tests stay green unchanged. Test: OFF assertions on each fixture.
- INV-2 No model-facing truncation; pages are whole paragraphs. Test: 54a7 seq 3014–3026 states produce one page.
- INV-3 Trigger facts come from `world_context.triggers` (game RAM, `condition_met`), grounded in pokeemerald `field_control_avatar.c` 877–916.
- INV-4 The production factories honor both switches (withNavigation, attachLoopGuard via live/decision-probe, withDialogueAutoAdvance). Test: factory tests + wiring deletion.

## Security Review

No new I/O, subprocesses, network, persistence or permissions. Strings are built from typed state only.

## Milestones

**M1 — navigation-truth-v1 + navigation-refusal-reasons-v2**
- [x] RED: tests for items 1–8 from recorded states (sh02 5860, 3f21 T123, 54a7 T169, sh02 T806, 54a7 seq 3014–3026, sh02 T922/T334, e588 seq 21335 / 54a7 T213), OFF byte-identity, factory wiring
- [x] COMMIT RED: `test(agent): RED navigation-truth-v1 and navigation-refusal-reasons-v2 from recorded cook states` (73a12a86)
- [x] GREEN: implement, register switches, presets, next-run defaults, explainers, FEATURE_EXPLAINERS, pending experiments + readiness rows
- [x] Wiring deletion check (red once, restored): 16 receipts, see Session Log
- [x] Gates: `just test`, `just lint`, `just build`, `just coverage` (≥90), `just verify-vendor` (pytest: 34 failures inherited from main, see Surprises)
- [ ] COMMIT GREEN
- [ ] Merge main, rerun gates, seal packet
- [ ] Principles self-review (PB1–PB13)
- [ ] Review: Claude, Grok, GPT lanes LGTM on the frozen packet
- [ ] STOP: report to thread owner (no self-merge)

## Closing the Loop

Report branch, frozen head, packet sha256, verdicts, gates, switch ids and intended arms to the thread owner.

## Session Log

- 2026-10-16: worktree from main 1f4ac74e; evidence read (sh02, 3f21 qualification N4, 54a7 live F8–F11, e588 F6, show F5).

- 2026-10-16: RED. `navigation-truth.test.ts` (25 tests: 16 fail, the 9 OFF/byte-identity cases pass). Fixture `fixtures/navigation-truth-states.json.gz` (82 recorded state events from sh02, 3f21, 54a7, e588, show; envelope plus resources/running/party_ownership/game_stats stripped). The dialogue replay reproduces the recorded 54a7 seq 3032 pages exactly with the switch off.

- 2026-10-16: GREEN. navigation.ts (talk offer, trigger-aware planner/stand/nearest, triggerReason, windowReason, blocker, partial-walk and command-limit status), loop-detection.ts (message text only; `messageTruth` 7th ctor arg, attachLoopGuard 8th, wired in live.ts and decision-probe.ts), dialogue-auto-advance.ts (Pages only: scroll_wait is not a page end; named speaker kept while the same object is faced; narration pages get no speaker). Registry: `navigation-truth-v1` (guidance, needs null) and `navigation-refusal-reasons-v2` (guidance, needs bounded-navigation-v1) appended last; presets/flagFeatures/next-run default false; registry position tests bumped by 2. Explainers `docs/explainers/navigation-truth-v1.html`, `navigation-refusal-reasons-v2.html` (figures drawn from the recorded local maps), mapped in FEATURE_EXPLAINERS; `just pages-check` prints nothing. Pending experiments `experiments/navigation-truth.json`, `experiments/navigation-refusal-reasons-v2.json` + readiness rows (PENDING).
  - Wiring/guard deletion receipts (scratchpad nt/receipts, each red once then green): withNavigation truth, triggers, windowReasons; live.ts messageTruth arg; harness.ts pass-through; dialogue truth; scroll guard; narration guard; speaker keep; reopen guard; planner trigger step; blocker; partial walk; command limit; no-script offer; gated nearer.
  - Gates: agent 1588 passed, viewer 885 passed; pytest 2236 passed / 34 failed (all `KeyError: 33786826` in `pokebench_env/route103_rival.py:34`, inherited from main; env/ untouched); lint clean (mypy needed the main checkout's native mgba binding linked into the worktree venv); build OK; verify-vendor OK. Coverage: agent lines 99.16 / branches 94.35 / functions 98.08; viewer 97.64 / 91.02 / 93.62; python lines 97.31 / branches 93.11 / functions 100.
  - Evidence outputs (ON): show T800 lists (6,16) south then (14,9) east; e588 (11,3) lists (7,6) west first; 54a7 T213 (10,0) lists (14,9) east first.

## Surprises

- pytest on main 1f4ac74e has 34 failures: `read_route103_rival` (route103-rival-splits merge) reads 0x0203A1CA, which older recorded raw-RAM fixtures do not contain. Not touched here (Python env belongs to other branches); reported to the thread owner.
- The worktree needed `git submodule update --init` (from the main checkout's submodule) before pytest; vendor stays at the pin.

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog

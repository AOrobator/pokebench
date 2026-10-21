# Interface ownership, move-learn tool and tool-prompt sync

Approved direction by the operator 2026-10-21 3:43 PM ET: "yes and we need skills so that everytime u add a tool u update the system prompt". Branch `claude/interface-ownership`, worktree `.claude/worktrees/interface-ownership`, based on local main 4b70c35dd. No live runs touched. Landing: landing board, fast-forward only, Claude + Grok + GPT/Codex cloud LGTM, max 2 review rounds, and the operator is asked before landing or changing any arm.

## Problem Statement

Live pair of bundle-v-control-2h at pin 4590d681 (read-only evidence):

- **Control `2026-10-21T13-33-36_qwen36-gpu1_d548` froze at the evolution decision.** After the win at turn 555 (seq 20434), the model called `navigate_to_target` on object 21 for 85 turns and was still at phase `evolution_decision` at turn 662 (seq 22321). Every refusal said only "target is not listed in the current verified state", with no Screen or Interface line (seq 20511, 20531). `evolution-decision-v1` is ON in both arms; the run's system prompt (run_start, 15881 chars) never mentions `choose_evolution`.
  - The game keeps `gMain.inBattle` set during a post-battle evolution (TryEvolvePokemon runs before ReturnFromBattleToOverworld), so `in_battle` stays true while `screen=evolution`.
  - `navigate_to_target` resolves the target before any field-free check (`semantic-navigation.ts:224`); `navigate_to` has one (`navigation.ts:45`).
  - auto-talk refuses `not_free` silently every turn (`auto-talk.ts:56,112`).
  - The stall briefing prints "in battle" because `interfaceOf` returns null when `in_battle` (`loop-supervisor.ts:27,409`).
- **Bundle `2026-10-21T13-33-54_qwen36-gpu0_ea04` looped 15 turns on "Delete a move to make room for DOUBLE KICK?"** (turns 547–561, 3:21–3:23 PM ET), pressing B round the 4-state cycle Delete → Stop learning → trying to learn → can't learn more than four.
  - The readout was correct (move-learn F2/J1 lines present). The thinking was byte-identical for 15 turns (md5 bf66221a, seq 20494–20844).
  - `semanticState` returns null when `in_battle` (`loop/fingerprints.ts:20`) and evolution/summary phases are not whitelisted (:36), so ineffective/state-cycle rules never count. Duplicate-turn collapse keys on result state, which differs each step. Short-cycle collapse fires only at 3 cycles (turn 559) and its note is gated on `fixed-point-breaker-v1` (OFF; `play-wiring.ts:70`).
  - SCRATCH was forgotten by a blind A on the forget screen's default slot (seq 20950/20981); the model thought it was still on the YES/NO box.
  - The battle block stays stale on the evolution screen ("Your moves … SCRATCH" after DOUBLE KICK replaced it, seq 20991).

## Skills Loaded

feature-worklog, feature-switch, feature-explainer, pokebench-game-state, pokebench-trace-forensics (evidence above), experiment-queue, close-the-loop, agent-observability, multi-model-review (cloud lanes only), talk-to-codex (landing board).

## Architecture

| Switch | Side | ON | OFF |
|---|---|---|---|
| `tool-prompt-docs-v1` | agent prompt | Every tool in the model's tool list has a system-prompt section; adds the missing ones (at least `choose_evolution`) | today's prompt bytes |
| `field-ownership-feedback-v1` | agent | `navigate_to_target` checks field ownership before resolving; a refusal on an owned interface (evolution, move learning, summary, menus) states the Screen/Interface/controls readout and presses nothing. Stall briefing names a ready non-battle `active_ui` over `in_battle`. auto-talk sends one message naming the interface on `not_free` with an owned interface, once per interface episode | today |
| `move-learn-loop-fingerprint-v1` | agent | A move-learning fingerprint (phase, question kind, selected, MVSTATE, move to learn, party moves) counts while `in_battle` or on the evolution screen, so ineffective and state-cycle rules fire after 2 cycles | null fingerprint |
| `stale-plan-fact-v1` | agent | When a reply's thinking is byte-identical to the previous turn's but the latest result shows a different interface/phase/question, the result appends "Your reasoning repeats turn N word for word; the game now shows: <Interface line>." | nothing |
| `post-battle-readout-v1` | server | On evolution/summary with battle phase finishing, the battle block is labelled ended and moves come from the party; in battle the Interface line agrees with a ready learn_move / stop_learning_move box | today |
| `move-learn-tool-v1` | agent + server | `learn_move(forget: <known move> \| "none")`: deterministic executor for evolution and in-battle move learning (below) | no tool |

`learn_move` design (model: `evolution-decision.ts`):
- Acts only when the state shows a move-learning prompt for gMoveToLearn: evolution MVSTATE 3–6/10, battle `learn_move` / `stop_learning_move`, or `summary_move_forget`. Otherwise refuses without pressing.
- `forget=<move>`: must be one of the four party moves (game names). From "Stop learning X?" answer NO first; advance MVSTATE 1/2 text pages; YES at "Delete a move…?"; wait per emulated frame for the forget screen to be ready; UP/DOWN with a state check after each step until the selected slot is that move; A; settle.
- `forget="none"`: NO at Delete, YES at "Stop learning X?".
- Verifies from party moves: new move present and named move gone, or moves unchanged plus the game's "did not learn" text. Reports what the game printed.
- Timing from game state per emulated frame (move-learn-settle F1 pattern), never sleeps or polling.
- Tool description and prompt section added in the same change (tool-prompt sync rule). With the switch ON, ordinary A/B on these prompts are still allowed (unlike choose_evolution) so OFF/ON differs only by the tool.

## Invariants

- **INV-1** Every switch OFF reproduces today's prompt, tools, readout bytes and plans. Test: OFF snapshot equality per switch.
- **INV-2** With `tool-prompt-docs-v1` ON, every tool returned by `toolNames(features)` is named in `playSystemPrompt(features, …)` for every feature set in the presets and both arms of every `experiments/*.json` and fixed-run cohort. Test: property test over presets/arms.
- **INV-3** Model-facing text uses only what the game shows (no-story-foreknowledge-v1): move names, types, descriptions and questions read from RAM/ROM, never walkthrough text. Test: strings sourced from readout fields; review.
- **INV-4** `learn_move` never presses when no move-learning prompt is open, and never forgets a move other than the one named. Test: fake-state executor tests including cursor misread and screen change mid-drive.
- **INV-5** Field executors (navigate_to_target, auto-talk) never press while `screen !== "overworld"` or an `active_ui` is open. Test: evolution and summary fixtures.
- **INV-6** No model-facing truncation. Test: refusal readout equals full observation readout.

## Security Review

No new network surface, subprocesses or file paths. ROM read only through existing static readers. No secrets.

## Milestones

**M0 — Tool-prompt sync skill and `tool-prompt-docs-v1`**
- [x] Write `.claude/skills/tool-prompt-sync/SKILL.md`: adding/renaming/removing a model tool updates its system-prompt section (and scene tool lists, contextual docs) in the same change behind the tool's switch; checklist + veto. Reference it from feature-switch step 5 and CLAUDE.md.
- [x] Audit `playTools` vs `playSystemPrompt` over the default flags, both arms of all 25 `experiments/fixed/*.json`, the 7 control bases and every parseable `experiments/*.json` arm (221 feature sets). Missing with the full prompt: `choose_evolution` (evolution-decision-v1) and `battle_action` (battle-move-tool-v1: no section at all; only its tool description). Missing per just-in-time scene: `choose_evolution` in every scene; in `battle` (and `menu`) the overworld-only sections hide `get_dialogue`, `recall_dialogue`, `remember_destination`, `note_contradiction`, `get_next_milestone` while those tools stay offered.
- [x] Tests: INV-2 property test `packages/agent/src/tool-prompt-sync.test.ts` (RED with the switch ON: 416 failing); OFF bytes pinned by sha256 of the full and per-scene prompts taken before the switch existed (default flags, control base whole-map-bundle-fd95, fd95 + evolution/battle_action).
- [x] COMMIT RED: `test(prompt): every model tool named in the system prompt behind tool-prompt-docs-v1 (RED)` (2ee4ba856). 416 of 890 tool-prompt-sync cases red.
- [x] Implement: `CHOOSE_EVOLUTION_SECTION` (with evolution-decision-v1, every scene), `BATTLE_ACTION_SECTION` (with battle-move-tool-v1, where battle is shown), and `SCENE_TOOL_LINES` (one line per kept tool whose own section a just-in-time scene hides), all behind tool-prompt-docs-v1, before the harness-trust section. `evolution-decision.test.ts` now compares its ON/OFF prompt equality with tool-prompt-docs-v1 OFF and asserts the section with it ON.
- [x] Guard deletion: removing the choose_evolution append → 181 red; disabling the scene-line block → 259 red; restored → 890 green.
- [x] Gates: vitest agent 4288 / viewer 1656 pass; pytest 3806 pass; lint clean (tsc, eslint, ruff, mypy); build ok; coverage agent 99.2 L / 93.15 B / 97.77 F, viewer 97.95 / 91.33 / 94.35, Python 97.29 / 93.11 / 100.
- [x] COMMIT GREEN: `feat(prompt): tool-prompt-docs-v1 names choose_evolution, battle_action and scene-hidden tools in the system prompt` (3e9253c33). Review deferred to one branch packet before landing (coordinator: max 2 rounds).

**M1 — `field-ownership-feedback-v1`**
- [x] Tests `packages/agent/src/field-ownership-feedback.test.ts` with fixture `packages/agent/test-support/evolution-owned-d548.json` (d548 seq 20530 state event; berry_trees and task_data trimmed): production `playGameTools` navigate_to_target refuses on evolution / summary / field_yes_no / battle with navigate_to's reason, no press, and the whole observe readout; OFF keeps "target is not listed in the current verified state" with no observation; stall briefing names "in the evolution decision interface (screen evolution)" and the readout controls (OFF: "ROUTE116 (map 0/31) in battle at 37,13"); auto-talk sends one message per interface episode and never presses; OFF silent.
- [x] COMMIT RED: `test(field): navigate_to_target, stall briefing and auto-talk name an owned interface behind field-ownership-feedback-v1 (RED)` (9446ca607). 5 of 9 red; OFF and registration green.
- [x] Implement: `fieldOwner()` in semantic-navigation.ts (navigate_to's unreadyReason wording, non-battle screen named before the battle flag; observe's full result returned through `withStatus`); `interfaceOf(s, owned)` and `where()` in loop-supervisor.ts, stall-briefing dwell; auto-talk `ownedInterface` once per episode (a free overworld state event ends it), recorded as the `auto_talk` event's text (Activity History already prints it) and delivered as the retained user message.
- [x] Guard deletion: refusal branch off → 2 red; seeInterface without the owned flag → 1 red; auto-talk message branch off → 1 red; once-per-episode check off → 1 red; restored → 9 green.
- [x] Gates: vitest agent 4297 / viewer 1656; pytest 3806; lint clean; build ok; coverage agent 99.2 L / 93.14 B / 97.8 F, viewer 97.95 / 91.34 / 94.35, Python 97.29 / 93.11 / 100.
- [x] COMMIT GREEN: `feat(field): field-ownership-feedback-v1 refuses navigate_to_target on an owned interface with the readout, names it in briefings and auto-talk` (516cf378c). Review deferred to one branch packet before landing (coordinator: max 2 rounds).

**M2 — `move-learn-loop-fingerprint-v1`**
- [x] Tests `packages/agent/src/move-learn-loop-fingerprint.test.ts`, fixture `packages/agent/test-support/move-learn-loop-ea04.json.gz` (ea04 seq 20470–20870: turn_start, tool_call, button_press, state, tool_result; raw_ram dropped, berry_trees/task_data trimmed, result text tail 1500 chars). The four prompts fingerprint apart (question pair 5/10 vs 11/0, MVSTATE 1/2 pages); the production `attachLoopGuard` replay warns `cycle` within the first 8 results ON; OFF no cycle/ineffective notice.
- [x] COMMIT RED: `test(loop): move-learning prompts get a loop fingerprint behind move-learn-loop-fingerprint-v1 (RED)` (4691b3c68). 2 of 5 red.
- [x] Implement: `moveLearningState()` in loop/fingerprints.ts (evolution_move_* / summary_move_forget ready prompts; in battle the learn_move / stop_learning_move boxes and the sText_TryToLearnMove1/2 pages); `semanticState(…, moveLearning)` used only by BasicRules (prepare and action candidates); a cycle made only of move-learning entries is checked with 2 repeats (the policy's 3 still applies to everything else); threaded `attachLoopGuard` features → LoopDetector `moveLearnLoops` → coordinator option → BasicRules. Replay warns `cycle` at result seq 20676 (9th result of the window, 2nd time round; the recorded run's short-cycle collapse came at turn 559).
- [x] Guard deletion: 2-repeat check removed → 1 red; coordinator not passing the option → 1 red; restored → 6 green.
- [x] Gates: vitest agent 4303 / viewer 1656; pytest 3806; lint clean; build ok; coverage agent 99.2 L / 93.12 B / 97.81 F, viewer 97.95 / 91.34 / 94.35, Python 97.29 / 93.11 / 100.
- [x] COMMIT GREEN: `feat(loop): move-learn-loop-fingerprint-v1 fingerprints move-learning prompts so the cycle rule fires after two repeats` (0c9732274). Review deferred to one branch packet before landing (coordinator: max 2 rounds).

**M3 — `stale-plan-fact-v1`**
- [x] Tests `packages/agent/src/stale-plan-fact.test.ts` (readouts from ea04 results seq 20504 Delete, 20529 Stop, 20554 page), through production `playGameTools`: same thinking + different Interface line → fact; same Interface line + different game question → fact with the question; same screen and question, changed thinking or empty thinking → nothing; OFF → nothing.
- [x] COMMIT RED: `test(result): repeated thinking against a changed interface gets a stale-plan fact behind stale-plan-fact-v1 (RED)` (ee9a741d3). Module missing, suite red.
- [x] Implement `packages/agent/src/stale-plan-fact.ts`: `StalePlanFact` observes `assistant` events (thinking, turn) and non-error `tool_result` events (the readout's `Interface:` line and `The game asks: "…"` quote); `withStalePlanFact` wraps the play tools outermost in `playGameTools`, so the line is the last text part of the result the model reads and the recorded `tool_result` text carries it (raw-event inspector; no timeline mark).
- [x] Guard deletion: wrapper unwired in play-wiring → 1 red; the same-screen comparison removed → 1 red; restored → 5 green.
- [x] Gates: vitest agent 4308 / viewer 1656; pytest 3806; lint clean; build ok; coverage agent 99.21 L / 93.13 B / 97.81 F, viewer 97.95 / 91.33 / 94.35, Python 97.29 / 93.11 / 100.
- [x] COMMIT GREEN: `feat(result): stale-plan-fact-v1 says when repeated thinking meets a different Interface line or game question` (f330bce71). Review deferred to one branch packet before landing (coordinator: max 2 rounds).

**M4 — `post-battle-readout-v1` (server, Python)**
- [x] Tests `env/tests/env/test_post_battle_readout.py`: states built from ea04 seq 20991 (evolution screen, battle finishing, COMBUSKEN with DOUBLE KICK in the party, battle struct still TORCHIC/SCRATCH), seq 20256 (battle, learn_move box ready, Interface "battle_resolving; input not ready") and the pokemon_summary forget screen. OFF pinned to `env/tests/env/fixtures/post_battle_off.json`, written by the code before the switch existed (every other server switch on). Registered server-side (TS `SERVER_FEATURES` and Python `SERVER_FEATURES` + default-off list).
- [x] COMMIT RED: `test(readout): post-battle battle block and the battle learn-move Interface line behind post-battle-readout-v1 (RED)` (9cedd233c). 2 ON tests red; OFF golden and registration green.
- [x] Implement: `battle_details_lines(..., ended=)` writes `ended (outcome won)`, drops the Actions line, and takes the You line and Your moves from the party member with the battler's identity (`_ended_lines`; an unreadable member is a visible HARNESS BUG line); readout.py passes `ended` on evolution / pokemon_summary / summary while the battle is finishing, and `_learn_box_interface` replaces the Interface line in battle when the learn_move / stop_learning_move box is ready with YES/NO highlighted.
- [x] Guard deletion: Interface replacement off → red; `ended` forced False → red; restored → 6 green.
- [x] Gates: vitest agent 4308 / viewer 1656; pytest 3812; lint clean (ruff, ruff format, mypy, tsc, eslint); build ok; coverage agent 99.21 L / 93.13 B / 97.81 F, viewer 97.95 / 91.33 / 94.35, Python 97.29 / 93.12 / 100.
- [x] COMMIT GREEN: `feat(readout): post-battle-readout-v1 labels the finished battle ended with party moves and names a ready learn-move box as the interface` (5fa06e15e). Review deferred to one branch packet before landing (coordinator: max 2 rounds).

**M5 — `move-learn-tool-v1`**
- [x] Tests `packages/agent/src/learn-move.test.ts` with fixture `packages/agent/test-support/learn-move-ea04.json` (ea04 state events seq 20456–21087 evolution and 20100–20364 battle; one shared base plus the varying screen, in_battle, active_ui, battle and party per state). A fake game moves between the recorded states the way pokeemerald does: forget each slot 1–4 from the Delete box (A,A / A,DOWN,A / A,DOWN,DOWN,A / A,UP,UP,A), from the Stop-learning box (B,A,A,A,…), from the MVSTATE 1/2 pages, NO highlighted, from the forget list; "none" from Delete, Stop and the list; battle forget and none; refusal with no prompt, a result page, a bound or paused wait, an unreadable learner; unknown name and the new move refused with the four moves listed; cursor misread (double step) stops after DOWN; screen changed before the press sends nothing; unexpected screen after a press; bound/paused mid-drive; unreadable highlight; list/party mismatch; 16-press limit; verification failures (party unchanged, HM refusal, moves changed, no did-not-learn text, unreadable moves). Registry, OFF byte equality of tools and prompt, the section in every just-in-time scene, and the production factory over HTTP (StateWatcher.moveLearnWait). Python `env/tests/env/test_learn_move_wait.py`: `learn_step` on the nine 97a0 raw-RAM archives, the battle script range checked against the ROM bytes at 0x082DABE3, synthetic branches, LearnWait hold/bound/error/park, the route through `serve.run`, none in human mode.
- [x] COMMIT RED: `test(move-learn): learn_move answers the recorded move-learning prompts one checked press at a time behind move-learn-tool-v1 (RED)` (0dcfc846c). Both new suites fail at collection (no `./learn-move.js`, no `pokebench_env.learn_move_wait`); registry collateral green.
- [x] Implement: `packages/agent/src/learn-move.ts` (`learnMoveTool` / `withLearnMove`, built beside battle_action from the ordinary checked press and observe; every press re-checks the planned screen; UP/DOWN one step with the selected slot checked after each; party-move verification; game pages collected from the waits), `LearnWaitSchema` (events.ts) and `StateWatcher.moveLearnWait` (GET /pokebench/move-learn/wait). Server `env/pokebench_env/learn_move_wait.py`: `learn_step` per emulated frame (fade; summary Task_HandleReplaceMoveInput / HM window; evolution tState 22 MVSTATE 4 box, 5/6 hand-off, pages; result pages in tStates 15/20/21; battle while gBattlescriptCurrInstr is in 0x082DABE3..0x082DAC2B, ROM bytes checked), `battle_learner` (expGetterMonId + gMoveToLearn), `LearnWait` (frame-bounded, parks with the pause); route in observation.py, installed in serve.py beside the battle wait (inert unless learn_move asks; none in human mode).
- [x] Prompt section + tool description (M0 rule): `LEARN_MOVE_SECTION` appended in every scene behind move-learn-tool-v1 (before harness-trust); `learn_move` last in `playTools`; kept in every just-in-time scene (not in DROP_TOOLS); battle-decision-ready anchor set names it when ON. No server readout pointer (optional; would need a server switch and its registry collateral; deferred).
- [x] Emulator check: no save state at a move-learn prompt exists (ea04 and 97a0 have raw-RAM archives only) and the worktree venv has no mgba binding, so fixtures only: recorded TS states through the fake game, and the production `learn_step` / `battle_learner` on the nine 97a0 raw-RAM archives.
- [x] Guard deletion: withLearnMove unwired in play-wiring → 1 red; before-press screen check removed → 1 red; cursor index check removed → 1 red; `install_learn_wait` removed → route test red; restored → 23 + 24 green.
- [x] Gates: vitest agent 4331 / viewer 1656; pytest 3836; lint clean (tsc, eslint, ruff, ruff format, mypy); build ok; coverage agent 99.2 L / 93.12 B / 97.8 F, viewer 97.95 / 91.34 / 94.35, Python 97.29 / 93.18 / 100 (learn-move.ts 98.6 L / 92.8 B; learn_move_wait.py 100).
- [x] COMMIT GREEN: `feat(move-learn): move-learn-tool-v1 adds learn_move, which answers the move-learning prompts one checked press at a time and verifies the party's moves` (2af9cefca). Review deferred to one branch packet before landing (coordinator: max 2 rounds).

**M6 — Explainers, experiments, landing**
- [x] One Emerald-themed explainer per switch (`just pages-theme`, `just pages-check` clean), linked from feature cards; 127.0.0.1:8791 links verified 200. `docs/explainers/{tool-prompt-docs-v1,field-ownership-feedback-v1,move-learn-loop-fingerprint-v1,stale-plan-fact-v1,post-battle-readout-v1,move-learn-tool-v1}.html`, listed in `docs/explainers/README.md`, mapped in `FEATURE_EXPLAINERS` (panels.ts) with card-link and byte-for-byte serving tests. Preview copies in main's `runs/mockups/<id>/<id>.html`, all six 200 at `http://127.0.0.1:8791/<id>/<id>.html`; desktop and 375 px phone checked in the browser pane (no page-level horizontal scroll; wide figures scroll inside their box). Gates: vitest agent 4355 / viewer 1658; lint clean; build ok (Python untouched).
- [x] COMMIT: `docs(explainers): explainers and Harness Config links for the six interface-ownership switches` (8b6439695).
- [x] `experiments/<id>.json` pending entries; readiness verdicts in `docs/experiments/readiness.md`. Six entries, no queuePosition; incumbent = the bundle arm of bundle-v-control-2h (base + switches + onInBoth, offInBoth off) with the six switches off; candidate flips only its switch; 8 per arm, think-fast, primary ROXANNE_DEFEATED; activation NEW_GAME_CREATED (tool-prompt-docs, stale-plan-fact), PLAYER_NAME_CONFIRMED (field-ownership-feedback), PETALBURG_WOODS (the three move-learning switches). `source.commit` = branch HEAD 8b6439695 at registration; repin to the landing merge SHA at landing. `just experiments-check`: no problem for these six (only the 150 pre-existing starter-decision-salience ledger problems); `just experiments` stops on the same pre-existing problems, so readiness rows say PENDING until it runs after landing.
- [x] COMMIT: `feat(experiments): register pending entries for the six interface-ownership switches` (a8f973d4e). Gates after: vitest agent 4355 / viewer 1658; lint clean (tsc, eslint, ruff, ruff format, mypy); build ok; Python untouched.
- [x] SYNC 1 (landing prep, review subagent 2026-10-21): `git merge main` (36 commits: gym-evidence-v1, trigger-navigation-boundary-v1, milestone-instruction-memory-v1, codex-coordinator mail). 72 conflicted files, all registry collateral: SWITCHABLE_FEATURES / FEATURES / playHarnessFeatures with main's three entries first and ours appended after (no reordering); play-preset.ts (filter, defaults, flagFeatures), next-run.ts DEFAULT_NEXT_RUN, legacy-features.ts, play-wiring.ts (main's withGymProgress + our withLearnMove / withStalePlanFact both kept), FEATURE_EXPLAINERS, explainers README, readiness.md; 60+ test files with `.at(-N)` positions and counts resolved as ours + main − base. Main added no model tool (tool-prompt-sync green). Gates on the merged tree: vitest agent 4403 / viewer 1664; pytest 3857; lint clean (tsc, eslint, ruff, ruff format, mypy); build ok; coverage agent 99.21 L / 93.25 B / 97.92 F, viewer 97.95 / 91.33 / 94.35, Python 97.32 / 93.26 / 100; verify-vendor OK; experiments-check only the 150 pre-existing starter-decision-salience problems.
- [x] Review round 1 fix batch RED: `test(review): unmatched ended battle block, raw learn-wait receipt on a learner error, registered waiters (RED)`. 2 red: `test_on_after_the_battle_an_unmatched_party_is_a_harness_bug_not_the_battle_copy` (no party / mismatched / identity-less member fell back to TORCHIC, SCRATCH and the action menu) and `test_raw_route_persists_the_capture_before_a_learner_read_error` (calls stopped at reserve, raw_snapshot); the waiter-registration helper (`Registering`) replaces the timed `join(0.1)` before frames, green.
- [ ] ASK USER: arms. Default: all six ON in the next bundle; propose `field-ownership-feedback-v1` and `tool-prompt-docs-v1` in both arms (like `evolution-decision-v1`).
- [ ] ASK USER: land. Then `just land-join`, sync, ff-only merge, `just land-done`, `just viewer-main`, report merge SHA.

## Closing the Loop

Tests per switch; fake-state executor rehearsal for `learn_move`; viewer check that new events show in Activity History (no timeline additions); explainer pages opened on desktop and phone widths.

## Session Log

- 2026-10-21 3:25 PM ET: read-only forensics on d548 and ea04 (two parallel subagents); findings above.
- 2026-10-21 3:43 PM ET: The operator approved building the fixes and asked for the tool-prompt skill. Worklog written; coordinator relayed that this yes covers building; M0 started 3:47 PM ET. Arms and landing stay ASK USER.

- 2026-10-21 (implementer subagent): M0–M4 built RED → GREEN on this branch, each switch default off with OFF pinned (prompt hashes, golden readout, OFF-path tests). Multi-model review deferred to one branch packet before landing (coordinator: max 2 rounds). M5 (`move-learn-tool-v1`) and M6 (explainers, experiments, landing) not started; no `experiments/*.json` entries added (no registry test demanded them).

- 2026-10-21 (implementer subagent): M5 (`move-learn-tool-v1`) built RED → GREEN (0dcfc846c, 2af9cefca); fixtures only (no save state at a move-learn prompt). Deferred: the server readout's learn_move pointer (needs a server switch).

## Surprises

- Worktree environment: `env/vendor/continual-harness` was not checked out in this worktree (336 pytest failures on missing vendor files). Checked out at the pin from the local module store (`git -c submodule...url=<main .git/modules path> submodule update --init`; shared config unchanged; `just verify-vendor` OK). The worktree's `env/.venv` lacks the `mgba` binding; pytest/mypy run with `PYTHONPATH`/`MYPYPATH` pointing at a scratch symlink to main's built `mgba` package (no build). Without it only `test_view.py::test_production_main_registers_view_pcm_and_browser_module_before_vendor_main` fails and mypy reports `mgba._pylib` missing. Machine load makes `serial-comparison` child-timing and `experiment-cli` git tests time out intermittently; reruns pass.
- `battle_action` (battle-move-tool-v1) never had a system-prompt section either, only its tool description.

- `choose_evolution` is in the control's tool list but not in its system prompt.
- `gMain.inBattle` stays set through post-battle evolution, so every `in_battle` short-circuit hides the evolution scene.

## Multi-Model Review Log

Packet base = main at sync (384a87f92), head = the commit that adds this section. Cloud lanes only (Claude CLI, Cursor Grok, Cursor GPT / isolated Codex); no local inference reviewers.

### Round 1 principles self-review (PB1–PB13) — claude/interface-ownership, packet main 384a87f92 .. HEAD 94de6df32

Scored against the full current docs/agent-principles.md (PB1–PB13). Zero FAIL.

| ID | Score | Evidence |
|---|---|---|
| PB1 The game grades the run | PASS | No milestone/grading change. learn_move verifies outcomes from the party's moves in game RAM (learn-move.ts `partyMoves`, `verified`), not from the model's claim; stale-plan-fact quotes only the readout's `Interface:` line and `The game asks:` quote (stale-plan-fact.ts). Tests: learn-move.test.ts verification-failure cases (party unchanged, moves changed, no did-not-learn text). |
| PB2 Failed runs count | N/A | No run-terminal record, stop-reason or reporting change. Switches only alter in-run feedback/tools; terminal records untouched. |
| PB3 One run is an anecdote | PASS | No improvement is claimed. Six pending experiments/*.json entries use 8 runs per arm, primary ROXANNE_DEFEATED, no queuePosition (experiments/{tool-prompt-docs,field-ownership-feedback,move-learn-loop-fingerprint,stale-plan-fact,post-battle-readout,move-learn-tool}-v1.json); readiness rows PENDING (docs/experiments/readiness.md). No model SKU hardcoded. |
| PB4 Declare every advantage | PASS | Every new helper is a named switch in FEATURES (features.ts) recorded in harness_features via playHarnessFeatures, default OFF, with an explainer (docs/explainers/*-v1.html) and Harness Config link (panels.ts FEATURE_EXPLAINERS). learn_move is a declared scripted capability (move-learn-tool-v1). post-battle-readout-v1 is a server switch registered in TS SERVER_FEATURES and Python SERVER_FEATURES. No game memory writes, no save-state reloads; vendor untouched (`just verify-vendor` OK). |
| PB5 Change one thing | PASS | Six independent switches, each with its own experiment entry where the candidate flips only that switch against the bundle incumbent. OFF byte-equality tests per switch (tool-prompt-sync.test.ts sha256 pins, post_battle_off.json golden, OFF-path tests in each suite). Hypothesis per experiment in its JSON. |
| PB6 Long runs fail where short runs can't see | PASS | No context growth: stale-plan-fact appends one line only on a repeat; auto-talk sends at most one message per interface episode (`named` episode key, field-ownership-feedback.test.ts once-per-episode); field-ownership refusal returns the existing observe readout once per call (no accumulation). No new image payloads. |
| PB7 A run with no event log didn't happen | PASS | learn_move presses go through the ordinary checked press (`executeChecked`) so button_press/tool_call/tool_result events are recorded; result details carry `learn_move:{forget,presses,refused,verified,status}`; auto-talk message recorded as the auto_talk event's text; stale-plan line is in the recorded tool_result text. No timeline additions (operator rule). |
| PB8 Model misbehavior is loud, bounded, counted | PASS | learn_move args validated by TypeBox (`Value.Check(LearnMoveArgs)`), unknown move refused listing the four moves; MAX_PRESSES=16 bound; server LearnWait frame-bounded (600 frames, `reason:"bound"`) and parks with pause; LearnWaitSchema validates the server reply (game-state.ts `moveLearnWait`). Loop guard now counts move-learning cycles after 2 repeats (move-learn-loop-fingerprint-v1). No new fallback branch without run evidence (d548/ea04 cited). |
| PB9 Rock-solid-or-ask | PASS | Arm assignment and landing are ASK USER items in the worklog M6; the learn_move server readout pointer is explicitly deferred rather than guessed; no default chosen for the operator. |
| PB10 No carve-outs | PASS | No skip/xfail/disabled tests; floor 90 unchanged; no coverage exclude changes; no --no-verify (pre-commit hook ran on every commit including the merge 94de6df32). Coverage on merged tree: agent 99.21 L / 93.25 B / 97.92 F, viewer 97.95 / 91.33 / 94.35, Python 97.32 / 93.26 / 100. |
| PB11 Verify the pinned dependency | PASS | Game-flow facts cite pret pokeemerald (evolution_scene.c MVSTATE_*, battle_scripts_1.s BattleScript_AskToLearnMove, pokemon_summary_screen.c Task_HandleReplaceMoveInput); battle script range checked against ROM bytes at 0x082DABE3 in test_learn_move_wait.py; production `learn_step` exercised on nine recorded 97a0 raw-RAM archives; pi-agent-core AgentTool shapes unchanged and typechecked. Limitation recorded in worklog M5: no live emulator check (no save state at a move-learn prompt; worktree venv lacks mgba) — fixtures only. |
| PB12 macOS privacy prompts | N/A | No new ROM or protected-path access; ROM read only through existing static readers and POKEBENCH_ROM (tests). No file paths added. |
| PB13 Close the loop | PASS | Each milestone RED→GREEN with gates and worklog entries (commit SHAs recorded M0–M6); merge synced and gated; this review is the remaining loop step; landing left to the coordinator/operator per the worklog ASK USER items. |


## Boy Scout Log

(none yet)

## Archive Milestone (user-gated)

- [ ] ASK USER: archive.

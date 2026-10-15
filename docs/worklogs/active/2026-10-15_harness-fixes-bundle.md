# Harness fixes, strong bundle and fixed-incumbent relaunch

Requested by the operator in the "Agent trace failure analysis" thread (2026-10-15 16:41 UTC), after the reports
`runs/reports/2026-10-15-agent-trace-analysis.html` and `runs/reports/2026-10-15-switch-harm-followup.html`.
Branch `claude/harness-fixes-bundle`, worktree `/private/tmp/pokebench-harness-fixes`. Local only; merge on approval.

## Problem Statement

The thinking traces show the model being told false or incomplete things at its decision points:
- the loop supervisor contradicts the readout ("name confirmed, clock set" while the readout says "rival met");
- it grades reading a conversation with B as "no change, do not try again";
- it marks every tile the player stood on as tried, hiding exits;
- it clips dialogue, cutting May's "help Dad catch wild POKéMON" line, along with 12 other clipping sites.

The finals (24 h, from boot) measure navigation on top of these bugs. The operator's decisions (16:41 UTC):
1. Land the bug fixes **without an A/B**. They are corrections, not hypotheses. This is an explicit operator exception to the feature-switch rule for the items in M1 only.
2. **No truncation of anything sent to the model.** The context window is the only bound; detail is fetched through tools.
3. Bundle the high- and medium-value features into **one arm** against the fixed incumbent, from the CLOCK_SET save, 30-minute trials, 8 per arm.
4. Build faster screening (decision-point tests).
5. Do not let the finals run all day. Once the fixes and bundle are ready, start the new cohort.
6. The `navigate_to` prompt fix is a bug fix (M1).
7. Battle details: a thorough, game-owned readout (actions with enabled/disabled only where the game can disable them, moves with type/PP, opponent and party types, party movesets).
8. Dialogue auto-advance plus a full dialogue log under one switch, automatic rather than a tool. That is a separate worklog. So are the conversation repeat guard, the type-effectiveness battle skill and the human ground-truth traces (own thread).

## Skills Loaded
feature-worklog, feature-switch, experiment-queue, feature-explainer, pokebench-game-state (M2), agent-observability (M1, M3, M4), pokebench-patch-evaluation (M6), multi-model review contract.

## Architecture

- **M1, no switch:**
  - `loop-supervisor.ts` reads story steps from the same decoded story text the readout uses.
  - Attempt outcomes count a buffer cursor, phase change or closed box as "dialogue advanced" or "dialogue closed".
  - Tried targets are recorded only from actions: a `navigate_to` target, A facing a target, or a warp actually taken. Standing on a tile no longer counts. The tried set resets when story state changes.
  - Every `clip()` on model-facing text is removed (supervisor, navigation memory, instruction ledger, dialogue log, objectives). Over-long sections drop whole older entries and say how many were omitted and which tool recalls them. Strings are never cut.
  - Hint and supervisor subscribe before the recorder replays start-of-run milestones.
  - The story line reads "unavailable during map load" instead of "no completion confirmed".
  - The `navigate_to` description adds three rules: target a walkable tile, adjacent to an NPC or object; dismiss open messages first; use it for listed warps.
- **M2–M4, new switches (all default OFF):**
  - `battle-details-v2`, which needs `expanded-menu-battle-information-v1`.
  - `character-presence-v1`
  - `navigation-refusal-reasons-v1`
  - `transition-press-result-v1`
  - `stall-briefing-v1`
- **Strong bundle** = fixed incumbent + `named-warp-destinations-v1`, `world-destinations-v1`, `game-evidence-priority-v1`, `expanded-menu-battle-information-v1`, `battle-details-v2`, `character-presence-v1`, `navigation-refusal-reasons-v1`, `transition-press-result-v1`, `stall-briefing-v1`.
- **Fixed incumbent** = the finals incumbent switch set (from `2026-10-15T11-08-31_think-fast_504f` run_start) on the fixed build.

## Invariants
- **INV-1:** No model-facing string is cut mid-text. *Test:* property test over every context builder with 10 kB dialogue entries; output contains each kept entry verbatim.
- **INV-2:** The supervisor's story steps equal the readout's Story line for the same state. *Test:* fixtures at intro_stage/rival_stage values 0–4.
- **INV-3:** Every new switch OFF reproduces today's prompt, tools and readout bytes. *Test:* golden comparisons, plus a factory-path test per switch with the wiring-deletion check.
- **INV-4:** Battle readout facts come only from game RAM. Enable/disable flags appear only for actions the game can disable. *Test:* pokeemerald-cited fixtures from recorded raw RAM.
- **INV-5:** Cohort trials are isolated (INV-7 of the project): own run dir, own server, the same frozen source and checkpoint SHA-1 for both arms.
- **INV-6:** The ROM never enters git; the vendor tree stays untouched.

## Security Review
Local-only harness. No new network surface, subprocesses keep argv lists, and no user paths are interpolated. The cohort driver reuses the existing argv-only launcher.

## Milestones

**M1 — Harness bug fixes (no switch, operator exception)**
- [x] RED tests: supervisor story steps (staged values); B/page grading; action-only tried targets plus reset on story change; no-truncation property across supervisor/memory/ledger/dialogue-log/objectives; hint/supervisor subscription order from a CLOCK_SET save; story line during map load; navigate_to description text.
- [x] COMMIT (RED) `test: supervisor matches the readout story, …` (e14d8ec)
- [x] Implement
- [x] Gates: `just test`, `just lint`, `just build`, `just coverage` (≥90 both stacks)
- [x] COMMIT (GREEN)
- [x] Observability check: replay `0c40` T520–540 and `504f` T252 states through the fixed supervisor; record the new note text
- [ ] Multi-model review loop until clean

**M2 — `battle-details-v2` (needs expanded-menu-battle-information-v1)**
- [x] Game-source research recorded here (docs/findings/2026-10-15_battle-details-v2.md): action options and when each can be disabled, catch/run eligibility, move type/PP/power/accuracy and disable sources, all types, party movesets, input phase, opponent party count
- [x] RED tests on recorded raw-RAM battle fixtures (Birch rescue, a trainer battle, move select, empty bag prints "empty")
- [x] COMMIT (RED) `test: battle-details-v2 readout from recorded Birch-rescue and turn-2 raw RAM, …` (0f01a7c)
- [x] Implement (Python decode + readout; TS registry/preset/defaults)
- [ ] Gates, GREEN commit, explainer, pending experiment entry, review loop

**M3 — `character-presence-v1`, `navigation-refusal-reasons-v1`, `transition-press-result-v1`**
- [ ] RED tests for each switch, ON and OFF byte-identity
- [ ] Implement:
  - Story characters by unique sprite graphics: "PROF. BIRCH: not on this map". A sprite kind is never named as a person.
  - Refusals: "a message is waiting for A/B", "(x,y) is <object>: stand at …, face …, press A", "wall/collision".
  - Press results: "warped: A (x,y) → B (x,y)", "moved by a script while controls were locked", "conversation restarted with X (nth time)".
- [ ] Gates, GREEN, explainers, pending entries, review loop

**M4 — `stall-briefing-v1`**
- [x] RED tests: map A→B→A→B cycle briefs on the second round trip; N minutes with no new milestone briefs once per window; identical multi-button batches
- [x] COMMIT (RED) `test: stall-briefing-v1 briefs on map ping-pong and milestone droughts` (81a6b3c)
- [x] Implement (extends the supervisor triggers; the briefing text uses the M1-fixed facts)
- [x] Gates, GREEN, explainer, pending entry
- [ ] Review loop

**M5 — Strong-bundle cohort launch (needs the operator)**
- [ ] ASK USER: approve the merge of M1–M4 into main
- [ ] ASK USER: press WITHDRAW FINALS in the viewer. Agents never press it; the trial in flight finishes.
- [ ] Freeze the source at the merge SHA in a detached worktree; presets `control` (fixed incumbent) and `bundle`; manifest; checkpoint `rival-push-checkpoint/CLOCK_SET.state` with SHA-1 check; 8 per arm, 30 min, 1,500 turns, balanced order; driver from the 2×2 pattern
- [ ] Launch (the operator authorized the start on 2026-10-15 16:41 UTC: "as soon as … the bugs are fixed, you can start the new run")
- [ ] Record the receipt, run ids and live status here

**M6 — Decision-point screening (built while the cohort runs)**
- [ ] Spike: rebuild a recorded turn's exact context (system prompt, history, images, ledger/supervisor) from events.jsonl and frames, and re-render its readout under a different switch set from the recorded raw RAM
- [ ] RED/GREEN: `just probe-decision <run> <turn> --switch <id>=on|off --samples K`, which reports how the next tool-call distribution changes
- [ ] Seed set: `c0b8` T314, `0c40` T529, `c497` T301, `258d` T641, `9d86` T148, `dea1` T137
- [ ] Gates, review loop

## Closing the Loop
Cohort report: furthest milestones first; reach counts and survivor medians per arm with DNFs kept; comparison against the human run and the 2×2. A bundle win nominates for finals under the winner gate. Afterwards, the decision-point probes ablate which switches carried it.

## Session Log
- 2026-10-15 16:45 UTC: worklog drafted; battle source research running read-only.
- 2026-10-15 16:47 UTC: The operator approved the worklog ("yes").

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER: archive this worklog
- Baseline: agent vitest 1083 passed; pytest 1877 passed (worktree, submodule initialised from local checkout).
- 2026-10-15 16:50 UTC: The operator decided the finals run now to keep the GPU busy; when fixes + bundle are ready, deploy and stop the finals (one bundle, all switches). Coordinate with the "Resume the finals" thread before merging (build pin).
- M1 RED: packages/agent/src/harness-fixes.test.ts 8 failing (story steps, map-load story, B grading/restart, action-only tried + reset, no truncation supervisor/ledger/log/memory, milestone replay, navigate_to rules); env test_story 1 failing (all-unavailable story line).
- M1 GREEN: supervisor reads the readout's own Story line (keeps last on reload; story change clears tried); outcomes: dialogue advanced / closed / restarted a conversation already shown, attempts keyed by outcome; tried = navigate_to target or A facing only (no stood-on tiles); no clip anywhere in supervisor, instruction ledger, dialogue log (recall returns all requested pages), navigation memory (whole entries; all targets), objectives evidence; recorder.subscribe(observer, replayMilestones) used by hint + both supervisors; story.py all-None -> "Story: unavailable while the game state reloads; progress already confirmed still stands"; NAVIGATE_RULES in both navigate_to tool descriptions and system prompt lines.
- Found during M1 (fixed, test added): context-window collapse summary matched only the vendor "Current Location:" line, so every collapsed PokeBench result read just "pressed A"; now matches "Location:" too and no longer slices the first line.
- Updated old tests whose expectations encoded truncation/bounds (supervisor ≤2500, ledger ≤4000, dialogue-log ≤6000 + "truncated", memory ≤6500 + "first 8 of") and stood-on tried tiles.
- Wiring check: removing replay from loopSupervisor turned "wires the hint and both supervisors…" red; restored green.
- Gates: agent 1093 (97.55/93.95/98.12), viewer 649 (95.36/91.18/94.36), pytest 1878 (lines 96.73 / branches 91.94 / functions 100), lint clean (worktree venv needed the built mgba binding copied from the main checkout), build ok.
- Observability: replayed 0c40 up to s8000 through the fixed supervisor: story line now includes rival met; tried shows "press B ×45 → dialogue advanced", "A facing SCIENTIST_1 ×7 → restarted a conversation already shown"; untried now lists the lab exit warps (6,12)/(7,12) first, which the old stood-on marking hid.
- 2026-10-15 16:47 → 18:39 UTC paused (usage limit). The operator decided the foe-information policy for battle details v2: "everything. a talented human would remember much of this".
- M1 review round 1 (packet 1629a3d..793ed46; artifacts in session scratchpad review-m1/): grok-4.5-high LGTM; think-swarm LGTM with hardening note; Codex gpt-5.6-sol BLOCKING (5); think-fast BLOCKING; Claude CLI and Cursor Claude lanes unavailable (usage limit until 10/17) → standing subagent fallback A (opus) BLOCKING, B (fable) BLOCKING.
  Accepted: (1) events.ts ledger_context/navigation_context kept maxLength 4000/6500, so un-clipped context would throw before delivery → caps removed, schema regenerated, test; (2) supervisor parsed Story from any tool_result (forgeable via remember_destination/recall_dialogue/errors) → only paired, non-error observe/press/navigate_to results, test; (3) feature descriptions and explainers still described 4,000/6,500/6,000/2,500/650/300-char caps → updated (dialogue-log, ledger, supervisor, navigation memory); (4) no test for objectives evidence slice → test; (5) no test for NAVIGATE_RULES in tool descriptions → factory test through withNavigation (local + full); (6) collapsed navigate_to results lost their "Navigation:" status → action keeps "pressed"/"Navigation:" first lines, test; (7) all-None story at title/intro said "reloads" → "Story: unavailable (story state not readable right now)".
  Rejected: think-fast "removing caps risks context overflow" — operator rule 2026-10-15: no truncation; the context window is the only bound.
  Deletion checks: restoring the objectives slice and unguarded readStory each turned their new test red; restored green.
  Gates: agent 1098 (97.5/93.98/98.12 lines 98.87), viewer 649, pytest 1878 (96.73/91.94/100), lint clean, schema regenerated.
- M3/M4 registry (branch claude/bundle-switches, worktree /private/tmp/pokebench-bundle-switches): registered character-presence-v1 (observation, server), navigation-refusal-reasons-v1 (guidance, needs bounded-navigation), transition-press-result-v1 (guidance, needs press-result), stall-briefing-v1 (guard, needs loop-guard-supervisor); all default OFF in presets, flagFeatures, DEFAULT_NEXT_RUN and the Python default-off list; registry/count fixtures updated. No behavior yet. Gates: agent 1093, viewer 649, pytest 1878.
- M3 RED: env/tests/env/test_character_presence.py (hidden characters not on map, live position vs out of view, VAR graphics, unreadable save, readout gated by character-presence-v1).
- M3 character-presence-v1 GREEN (Python): pokebench_env/character_presence.py reads SaveBlock1 objectEventTemplates (0xC70, 64x24) with hide flags and VAR graphics; GameState.story_characters; readout line gated by character-presence-v1. pytest 1883 green, ruff clean. TODO: explainer, pending experiment entry, TS coverage/gates, review. Paused at usage limit 2026-10-15.
- M3 character-presence-v1: explainer docs/explainers/character-presence-v1.html (+README, FEATURE_EXPLAINERS, panels/server tests), pending experiments/character-presence.json (activation PLAYER_HOUSE_EXITED_AFTER_CLOCK), readiness row PENDING; experiments-check ok (40); viewer 649; lint clean.
- Loop guard bug (operator 18:55 UTC: finals run 2026-10-15T14-21-06_think-fast_6684 looped from turn 494 with zero loop_guard events — A×8 batches restart a scientist's 2-page line, print cursor jitters 45–49 so no exact state repeat, and every turn ends while printing so the ready-message check never applies). RED: packages/agent/src/conversation-restart-loop.test.ts (jittering A-batch restarts; talk→read→talk at the lab aide; no flag for one long read or the same words elsewhere; off without interaction-loop-detection). Lands as a bug fix of interaction-loop-detection-v1's stated scope (repeated page cycles), no new switch.
- Loop guard GREEN: LoopDetector.restartedConversation (interaction-loop-detection-v1 scope): same overworld dialogue text at the same location+tile, reopened after closing or with its print cursor jumping back, ≥ policy.ineffective (3) times → cycle. Replay of live finals run 6684 through dist: old guard 0 notices in 703 turns; new guard first warning+briefing at call 491 (loop began turn 494), 39 notices, none earlier in the run. Agent 1102 (lines 98.88 / branches 94.04 / functions 98.12), tsc+eslint clean.
- M3 navigation-refusal-reasons-v1 RED (branch claude/nav-refusal-reasons, worktree /private/tmp/pokebench-nav-refusal-reasons): packages/agent/src/navigation-refusal-reasons.test.ts, 11 failing (message waiting, script lock, battle/screen/ui/geometry, mid-walk interrupt, person/object neighbours + facing, A-object on solid tile, wall/water/ledge/terrain + nearest, outside bounds, whole map, factory path), 5 passing (OFF byte-identical, counter hint priority, description unchanged).
- M3 RED committed: `test: navigate_to explains why it cannot walk behind navigation-refusal-reasons-v1` (c2e5c7c).
- M3 navigation-refusal-reasons-v1 GREEN: navigation.ts unreadyReason (battle, not started/other screen, message or dialogue → "dismiss it with B", menu open, script lock, lock unknown, geometry) for the pre-walk refusal and "walk interrupted: …" after a step; targetReason after the counter hint (outside bounds; warp → generic; person/object or A-target on a solid tile named with free planner-reachable neighbours and facing; ledge/water/wall/terrain with nearest reachable walkable tile within 3; else generic). NavigationPorts.refusalReasons from FeatureSet in withNavigation. OFF byte-identical; description unchanged.
  Wiring check: removing refusalReasons from withNavigation turned "withNavigation reads the switch from the FeatureSet" red; restored green.
  Gates: agent 1114 (lines 98.89 / branches 94.15 / functions 98.03), viewer 650 (98.09 / 91.18 / 94.36), pytest 1883 (96.75 / 91.98 / 100), lint clean, build ok.
  Explainer docs/explainers/navigation-refusal-reasons-v1.html, README + FEATURE_EXPLAINERS mapping (panels/server tests). Pending entry experiments/navigation-refusal-reasons.json (activation PLAYER_NAME_CONFIRMED: navigate_to exists in the truck; source.commit = RED sha, repin to merge SHA on landing); readiness row PENDING EVALUATION (experiments-check reads main's directory, so it validated 40 main entries; this entry checked with parseExperiment). Review loop not run.
- M3 navigation-refusal-reasons-v1 GREEN committed: `feat: navigate_to explains why it cannot walk behind navigation-refusal-reasons-v1` (0f89a6c).
- M3 transition-press-result-v1 RED (branch claude/transition-press-result): packages/agent/src/transition-press-result.test.ts — carried-over warp (258d T52 states), warp during press with both map names, scripted move while locked (504f s1512) and no-direction move, restarted conversation (Nth time), OFF byte-identical, factory path through gameTools/pressTool/objectiveGameTools with toolSwitches(FeatureSet). Red: new exports missing (ShownStates, ordinal, gameTools, transitions switch).
- M3 transition-press-result-v1 GREEN: press-result.ts ShownStates (last state the model was given + per-text dialogue openings), carried-over warp vs warp during press with Location names and map ids, scripted move (locked before, or no direction pressed), restarted conversation (Nth time); game-tools.ts gameTools() shares one ShownStates between observe and press (live.ts, objective-tools.ts); toolSwitches threads transitions from the FeatureSet. OFF byte-identical (recorded replays: 258d seq 683/690/697 OFF 'moved (8,3) -> (8,2)', 504f seq 1506/1511 OFF 'moved (5,9) -> (5,8)', both matching the recorded tool_result text). Wiring check: deleting transitions from toolSwitches turned 4 factory tests red; restored green. Explainer docs/explainers/transition-press-result-v1.html + FEATURE_EXPLAINERS + README; pending experiments/transition-press-result.json (PLAYER_HOUSE_ENTERED; source.commit = RED SHA, repin on merge); readiness row PENDING (manual survey 4/4). experiments-check CLI reads the main checkout (git common dir), so the new entry was validated with parseExperiment/experimentArms directly. Gates: agent 1120 (97.58/94.11/98.15, lines 98.89), viewer 650 (95.36/91.18/94.36), pytest 1883 (96.75/91.98/100), lint clean, build ok. Not done: multi-model review, live viewer click-through of READ EXPLAINER.
- M4 RED: packages/agent/src/stall-briefing.test.ts (map ping-pong on the second round trip with map-load gaps, per-pair counts reset by a new milestone, 5-minute active-play drought once per window ignoring pauses and start milestones, dea1 multi-button batches, c497 battle-bag A presses, deferral while a loop briefing is open, OFF byte-identity, factory wiring, diagnostic mode, headline text). Fails: stall-briefing.ts and the stallBriefing factory do not exist yet.
- M4 GREEN stall-briefing-v1: stall-briefing.ts StallBriefing counts map changes per unordered pair of maps (location+map id, map-load states skipped) and active play time (elapsed minus RunControl.pausedMs) since the last observed milestone (present_at_start and GAME_RUNNING ignored; a new milestone clears the pairs and the clock); checked after each tool_result. Briefs at 2 round trips per pair (4 moves) then every 2 more, and at 5, 10, … minutes of drought. LoopDetector.stall(kind, text, evidence) records loop_guard phase supervisor with new kinds map_cycle / milestone_drought (schema regenerated) and shows the note via context() until the next completed call; refused while a loop episode or an earlier note is open (fires after recovery), in diagnostic mode and after a stop. SupervisorBriefing.stallText shares the fact block with text() (loop text byte-identical). Wiring: play-wiring stallBriefing(features, recorder, detector, runControl, elapsed), called in live.ts after the budget timers. Viewer: Activity History labels "Map back-and-forth" / "Milestone drought"; timeline shows Supervisor note rows (tests added). Explainer docs/explainers/stall-briefing-v1.html mapped in FEATURE_EXPLAINERS; experiments/stall-briefing.json pending on the finals incumbent (504f switch set; the shared incumbent has loop-guard-supervisor-v1 off so its candidate fails dependency validation), source.commit = RED SHA until landing (repin at merge); readiness READY 4/4 PLAYER_NAME_CONFIRMED (checked with the worktree's experiment store against main's runs; `just experiments-check` reads main's checkout so it does not see this branch's file).
  Wiring check: removing the StallBriefing subscribe in stallBriefing() turned 8 of 11 stall-briefing tests red; restored green.
  Gates: agent 1109 (97.59/94.07/98.15), viewer 652 (95.36/91.18/94.36), pytest 1883 (96.75/91.98/100), lint clean, build ok. Explainer not visually checked in a browser (the pane cannot render local files here).
- M1 review round 2 (packet 1629a3d..068b462, artifacts review-m1-r2/): grok LGTM (fix delta); Codex gpt-5.6-sol BLOCKING (stale explainers; no production-composition test; worklog-declared INV-1/INV-2 tests missing); fallback A opus BLOCKING and fallback B fable BLOCKING (stale explainer rows, PB4); think-fast/think-swarm contract retries BLOCKING on the rejected "removed caps risk overflow" concern and misreading removals as additions; Claude CLI OAuth expired, Cursor Claude at usage limit → subagent fallback.
  Fixed on claude/bundle-switches (M1 now lands with the bundle): loop-guard-supervisor-v1 and dialogue-log-v1 explainer rows rewritten (no caps, readout Story line, new outcomes, action-only tried, all targets listed); production-composition test (real RunRecorder + loopSupervisor + attachLoopGuard; briefing with the readout Story line lands in the recorded loop_guard supervisor event — deleting the readStory call turns it red); INV-1 property test (10k and 40k entries whole through supervisor, text-only note, ledger, dialogue log, navigation memory); INV-2 staged Story lines verbatim; mkdtemp dirs removed. Deletion evidence for the other round-2 guards recorded by fallback B (read-based). Agent 1154 green.
- Merged into claude/bundle-switches: claude/nav-refusal-reasons (c2e5c7c, 0f89a6c, 355dcc2), claude/transition-press-result (e51d2ab, 69b3446), claude/stall-briefing (81a6b3c, 164502f). After merges: agent 1151→1154, viewer 654, pytest 1883 green; schema up to date.
- 2026-10-15 19:07 UTC: The operator approved a combined round-3 review of the whole bundle branch, with subagents as reviewers ("You can do a combined review, and you can use sub-agents to do the review.").
- M2 RED (branch claude/battle-details-v2, worktree /private/tmp/pokebench-battle-details-v2): env/tests/env/test_battle_details_v2.py on recorded raw-RAM windows from c406 seq 1266/1269 (Birch rescue, action and move select) and c497 seq 1557 (turn 2, Atk -1 stages; trainer variant flips gBattleTypeFlags to TRAINER|IS_MASTER since no recorded run has a trainer battle) plus pokeemerald ROM rows; OFF golden from the pre-change readout (fixtures/battle-details-v2-off-c406-00001266.txt). TS registry fixtures updated as in ddd9e33, plus registration and explainer-map tests.
- M2 GREEN (claude/battle-details-v2): env/pokebench_env/battle_details.py + GameState.battle_details (not in state JSON) + readout gate (needs expanded; OFF byte-identical to the golden); registered battle-details-v2 exactly as ddd9e33 (SWITCHABLE last, observation FEATURES entry needs expanded-menu-battle-information-v1, playHarnessFeatures last, SERVER_FEATURES TS+Python, Python default-off, preset optional/false, flagFeatures false, DEFAULT_NEXT_RUN false); explainer docs/explainers/battle-details-v2.html + FEATURE_EXPLAINERS + server allowlist test; pending experiments/battle-details-v2.json (incumbent = navigation incumbent with expanded-menu-battle-information-v1 ON, required by the dependency check; activation STARTER_CHOSEN; source = RED commit, repin at merge); readiness BLOCKED (0 of last 4 boot think-fast runs reached STARTER_CHOSEN). `just experiments-check` reads the main checkout's definitions, so the entry was validated with dist parseExperiment/experimentArms instead (ok; every existing entry still parses).
  Wiring check: dropping `"battle-details-v2" not in off` from readout.py turned the OFF golden and production-route tests red; dropping it from TS SERVER_FEATURES turned the registration test red; both restored green.
  Deferred (written in the findings): Disable/Taunt/Torment/Imprison/Encore/Choice Band move locks, runTries, ENIGMA BERRY effect, battle text, script-owned YES/NO prompts, Battle Pyramid odds, multi-battle partner slots, Safari actions, opponent party size — all need derived/unverified addresses. ROM reads were blocked in this session, so no live-ROM replay of the archives; the recorded decoded JSON (real ROM) matches the fixture facts. No recorded trainer battle exists; the trainer fixture flips recorded flags.
  Gates: agent 1099 (97.55/94.01/98.12, lines 98.87), viewer 650 (95.36/91.18/94.36, lines 98.09), pytest 1904 (lines 96.91 / branches 92.40 / functions 100; battle_details.py 100%), lint clean, build ok. Review loop not run.
- Merged claude/battle-details-v2 (0f01a7c RED, 460bace GREEN; full foe info per operator; deferred: move-lock structs, runTries, Enigma Berry, battle text, script YES/NO owner, Pyramid/multi/Safari, turn order — see docs/findings/2026-10-15_battle-details-v2.md). Post-merge: agent 1155, viewer 655, pytest 1904, lint clean, schema current.
- M5 dialogue-auto-advance-v1 RED (branch claude/dialogue-auto-advance, worktree /private/tmp/pokebench-dialogue-auto-advance): packages/agent/src/dialogue-auto-advance.test.ts against a fake printing game server (multi-page line with B only at wait phases, A-batch re-trigger dropped, already-open conversation, YES/NO stop with options, short lock, long cutscene lock, press cap, time cap, never-ready message, battle/naming stops, NAME: speaker carried over, free walk byte-identical, OFF identical tools/prompt/A batch, navigate_to ending in dialogue, get_dialogue filters, registry/dependency/state-only, safe-batch composition, production factory through a real RunRecorder). Fails: module missing.
- M5 dialogue-auto-advance-v1 GREEN: packages/agent/src/dialogue-auto-advance.ts wraps press and navigate_to (withDialogueAutoAdvance via play-wiring playGameTools, used by live.ts): free-field walking batches still go whole; any other batch goes one input at a time and stops the moment a field message is engaged; the harness then presses B only at ready wait phases (polls 100 ms while printing), stopping at field free, ready menu (options + highlighted named), naming, battle, screen change, or loud caps (50 presses, 90 s, 10 s per wait kind: locked/no message, interface not ready, message never ready); leftover inputs dropped with "dialogue closed; N remaining inputs not sent". Pages cut from the buffer at the printer cursor (snapped to line breaks), remainder on close; speaker from NAME: prefix (carried over), else faced sprite kind (labelled) or faced named object. dialogue_auto_advance event (schema regenerated) with requested/sent/dropped/pages(state_seq, map, map_id, position, speaker, speaker_source)/stop/detail; get_dialogue (speaker, contains, map, last; whole, newest first). Registry: guidance, needs active-field-message-buffer-v1, extra dependency on field-dialogue-phase-v1, state-only refuses it, compatible with dialogue-safe-batches-v1 (composition test), default OFF in presets/flagFeatures/DEFAULT_NEXT_RUN, recorded last. Viewer: model KNOWN, Activity History text (all pages whole), trace row (DLG, act), timeline tool-lane marker; tail DIALOGUE line. Deletion check: removing withDialogueAutoAdvance from playGameTools turned the factory test red; restored green. Live smoke (isolated server port 8871, worktree runs/dialogue-auto-advance-smoke, CLOCK_SET save): Mom 4 pages speaker MOM; notebook A x8 -> 1 A + 4 B, 7 dropped, 4 pages; PC -> stop at pc_player_menu with options. Explainer docs/explainers/dialogue-auto-advance-v1.html + FEATURE_EXPLAINERS + README; pending experiments/dialogue-auto-advance.json (NEW_GAME_CREATED, readiness 4/4 recent think-fast) + readiness row. Gates: agent 1130 (98.93/94.17/98.13; new module 100/97.04/98.18), viewer 651 (98.09/91.2/94.36), pytest 1883 (96.75/91.98/100), lint clean, build ok, experiments-check ok (worktree definitions validated: 42, no problems). Not done: multi-model review.
- Merged claude/dialogue-auto-advance (b9b2f0a RED, c45f7fd GREEN) on integration branch claude/bundle-integration (bundle-switches HEAD stays frozen for the running round-3 review): live.ts uses gameTools (shared press/observe tracker) + playGameTools (navigation + auto-advance); registry fixtures updated. Agent 1187, viewer 656, pytest 1904, lint clean, schema regenerated, coverage ≥90.
- DEFERRED (operator 19:31 UTC agreed to start minimal): detailed bag check — per-pocket contents and item effects, bag cursor/selection, a verifiable bag-menu loop equivalence for the loop guard. Revisit when runs reach Route 103/Petalburg trainer battles; battle-details-v2 already gives Bag: empty, usable/unusable/ball split and trainer-ball refusal.
- ROUTE_101_AFTER_HANDOFF RED (branch claude/route101-return-split, operator ask via external review 2026-10-15): measurement-only navigation split for the first stable Route 101 state after the lab handoff (VAR_BIRCH_LAB_STATE 0x4084 3/4/5), ordered between BIRCH_STARTER_HANDOFF_COMPLETE and OLDALE_TOWN. Tests: packages/agent/src/route101-return.test.ts (tracker, qualification, save-start guard, compacted replays of 258d / c0b8 / human_1848 in test-support/route101-return-replays.json), measurement-only checks in run-control / loop-supervisor / stall-briefing tests, features/milestones order, viewer frontier axis + status + recovery tests.
- ROUTE_101_AFTER_HANDOFF GREEN: milestones.ts routeProof branch (pre-handoff witness, settled Littleroot/Oldale, settled Route 101; lab state 3/4/5), MEASUREMENT_ONLY_MILESTONES skipped by SupervisorBriefing progress, StallBriefing drought and StallStop; measured feature route-101-after-handoff-v1 recorded after rival-house-exit-v1; viewer FRONTIER_MILESTONES "Back on Route 101", MILESTONE_ORDER, milestoneStatus/panels feature gate, RunView recovery for older logs, resumed-split list. RED features test index fixed (target-stop slice 29→30). Full-log read-only replay (viewer recovery and tracker agree): 258d seq 9922 turn 653 evidence [8908,9916,9922]; human_1848 seq 8901 at 9.67 min (handoff 9.12, Oldale 11.5) evidence [8402,8899,8901]; c0b8 none. Gates: agent 1165 (97.66/94.48/98.11), viewer 657 (95.37/91.19/94.37), pytest 1904 (96.91/92.40/100), lint clean, build ok, schema unchanged. No explainer page written; review loop not run.
- Merged claude/route101-return-split (14e402a RED, 69d5306 GREEN): ROUTE_101_AFTER_HANDOFF measured split (route-101-after-handoff-v1), measurement-only milestones hidden from model-facing progress; replays: 258d turn 653, c0b8 none, human 9.67 min.
- Operator 19:38 UTC approved listing a room's exits before its objects in the supervisor's not-tried list (bug-fix group; ordering only, no new information). RED test in harness-fixes.test.ts (truck shape from dc0e).
- Exits-first GREEN: untried() sorts warps before other targets (stable otherwise); explainer row updated. Agent 1198 green, lint clean.

# Pre-launch harness fixes for bundle-v-control

## Problem Statement

The bundle-v-control qualification runs on main `be38752` (cook phase, main-menu FAST-text save, 12-min cap) both stalled after PLAYER_HOUSE_EXITED_AFTER_CLOCK. Forensics found harness bugs on the exact CLOCK_SET → RIVAL_MET path the confirmatory phase measures (`runs/reviews/2026-10-16-qualification-forensics/control-2919.md`, `bundle-3f21.md`). Launching 248 trials (about 47 h on two GPUs) with them would measure the bugs, not the bundle. Operator decisions (the operator, 2026-10-16 12:20–12:40 AM EDT): fix them before launch; the loop guard and the MAYS HOUSE sign are confirmed; the control arm's press-result wording stays as the treatment `transition-press-result-v1` measures; the blocked-direction batch wording ships as a new bundle switch (`blocked-batch-result-v1`, separate branch `claude/blocked-batch-result`); exploration memory is a separate experiment.

## Skills Loaded

feature-switch, feature-explainer, pokebench-game-state, agent-observability, pokebench-trace-forensics (read-only evidence), fixed-run-launch, pokebench-experiment-design.

## Architecture

Every behavior change is a registered switch whose OFF state reproduces today. Fixes F2–F4 change what both arms see, so their switches are ON in both arms and listed in the definition as `onInBoth`; the control-base check (`controlBaseProblems`) accepts exactly those flags as differing from the finals incumbent and nothing else. F5–F8 change bundle-only behavior inside existing bundle switches before the treatment is frozen (no new switch where the change is a bug fix inside a default-off switch that has never run in a measured cohort; recorded here).

| Fix | Arms | Where | Switch |
|---|---|---|---|
| F1 Door/stairs/warp animation: settle while the game's door/warp exit task runs (per emulated frame), report the warp, label a bound hit truthfully | **bundle** (operator decision 2026-10-16 12:46 AM EDT: measured as part of the treatment) | env observation settle (`screen_settle.py`, `observation.py`), press result | `warp-arrival-settle-v1` (design: `runs/reviews/2026-10-16-qualification-forensics/harness-engineer-animation.md`) |
| F2 Loop guard sees door/stairs bounces: a transient lock must not clear the cycle history; map-to-map ping-pong counts as a cycle | both | `packages/agent/src/loop-detection.ts` `semanticState` (~l.118–140), history reset (~l.381) | `transition-loop-detection-v1` |
| F3 Name signs and warp destinations by the text the game shows for this save (Littleroot (12,8) reads "PROF. BIRCH'S HOUSE" for a male player, pokeemerald `data/maps/LittlerootTown/scripts.inc` 402–412) | both (named-interactions) + bundle (named-warp-destinations) | `env/pokebench_env/interaction-names.json` script-symbol names, warp destination names | `displayed-place-names-v1` |
| F4 Story dialogue stays in context: collapsed tool results keep every dialogue page whole (no model-facing truncation) | both | `packages/agent/src/harness.ts` `collapsed`/`summary` | `dialogue-context-kept-v1` |
| F5 Stall briefing and loop supervisor cite the last story instruction (MOM's "next door"), not only the 3 newest pages, and list untried warps across known maps | bundle (briefing); both (supervisor pages rule) | stall-briefing, loop-supervisor | inside `stall-briefing-v1`; supervisor part under F4's switch |
| F6 navigate_to/press results never say "a message is waiting, press B" after auto-advance closed it | bundle | navigation result text after auto-advance | inside `dialogue-auto-advance-v1` |
| F7 A reachable warp-door target gets its real reason (approach tile, blocker) instead of "no supported local path" | bundle message on a both-arm planner limit | `navigation.ts` `targetReason` (l.126) | inside `navigation-refusal-reasons-v1` |
| F9 Map connections list the crossable edge tiles per direction (Littleroot NORTH -> ROUTE 101 from (10,0)/(11,0)); bearings and edge refusals name them (showcase run `2026-10-16T00-34-26_qwen36-gpu1_show` turns 175–212, seq 3580–3745) | bundle (operator decision 12:54 AM EDT) | readout, navigation refusal, supervisor/briefing bearings | `connection-edge-tiles-v1` (branch `claude/connection-edge-tiles`) |
| F10 In-game naming (nicknames) gets the same naming readout as the pre-game editor (showcase turns 252–330 stuck in the editor) | bundle (the operator 1:01 AM EDT) | env game_state/readout | `in-game-naming-readout-v1` (branch `claude/nickname-naming`) |
| F11 Speed-run guidance: answer NO to nickname offers; START then A keeps the species name | bundle (the operator 1:01 AM EDT) | prompt/readout | `no-nickname-guidance-v1` (branch `claude/nickname-naming`) |
| F12 Stall briefing is screen-aware (names the naming editor/owned interface, buffer, selected key, way out; drops field lists) and an interface-dwell stall fires well before 5 min (showcase turns 253–353: briefings at 302 and 353 briefed the field) | bundle (default; The operator may move it) | stall briefing | inside `stall-briefing-v1` (branch `claude/bundle-prelaunch-fixes`) |
| F8 Auto-advance never sends a queued button after a message has appeared | bundle | `dialogue-auto-advance.ts` | inside `dialogue-auto-advance-v1` |

## Invariants

- INV-1 OFF reproduces today, byte for byte, for every new switch (tests compare the OFF text with recorded results).
- INV-2 Both arms differ only in the bundle switches; `onInBoth` flags are identical in both arms and checked at every load.
- INV-3 No model-facing text is truncated; dialogue pages are kept whole.
- INV-4 Timing comes from game state per emulated frame; no sleeps (F1 settle).
- INV-5 Readouts are grounded in game state or source; unknown is reported as unknown, never guessed.

## Security Review

Local only. No new network, file or subprocess surface beyond existing argv-only calls. No RAM writes or save edits.

## Milestones

**M1 — F2 loop guard sees door bounces** (both arms)
- [ ] RED: replay-style unit tests: lab door bounce from 2919 (seq 3097–4239) produces a cycle notice; stairs bounce; a real script lock still yields no false cycle
- [ ] GREEN, gates, review

**M2 — F3 displayed place names** (both arms)
- [ ] RED: Littleroot sign (12,8) and warp (14,8) read "PROF. BIRCH'S HOUSE" for a male save and whatever the script's own gender branch prints for a female save; OFF keeps "Mays House Sign"
- [ ] GREEN, gates, review; real-ROM probe readout from the FAST CLOCK_SET save

**M3 — F4 dialogue kept in context** (both arms)
- [ ] RED: a collapsed result that contained MOM's T98 pages still carries them whole; non-dialogue results collapse as today
- [ ] GREEN, gates, review

**M4 — F1 warp arrival settle** (bundle switch `warp-arrival-settle-v1`)
- [x] ASK USER: settle on the game's warp task with a truthful bound-hit label; switch in the bundle (the operator, 12:46 AM EDT)
- [ ] Receipt of the task function addresses on the real ROM; measure the exit length on the 2F stairs and the lab door
- [ ] RED/GREEN, real-ROM proof on the 2919 door cases

**M5 — F5–F8 bundle fixes**
- [ ] RED/GREEN per fix, gates, review

**M6 — Definition and control base**
- [ ] `onInBoth` in the fixed-run schema; `controlBaseProblems` accepts exactly those; definition lists F1–F4 switches and `blocked-batch-result-v1` joins `switches` (operator decision); re-plan with the recorded seed
- [ ] RED/GREEN, gates, review, merge with the operator's OK

**M7 — Qualification and review**
- [ ] Qualification: one trial per arm per lane, both phases (confirmatory 15 min from the FAST CLOCK_SET save; cook 12 min from the main-menu save)
- [ ] Forensics on the qualification runs: none of F1–F8 recurs
- [ ] Full four-persona PokeBench review of the final design
- [ ] ASK USER: approval and launch (fixed-run-launch skill)

## Closing the Loop

Done when every milestone is merged, qualification shows none of F1–F8, the four-persona review is in, and the operator approves the launch.

## Session Log

- 2026-10-16 08:41 AM EDT: From the cook-2 rival-house-exit thread (79bcaae5) and pushback-loop-guard (50f0add3): onInBoth += briefing-battle-outcomes-v1, pushback-loop-detection-v1, pushback-press-result-v1, battle-observation-loop-v1 (bug fixes, on in base); bundle switches += blocked-exit-fact-v1, battle-loss-recap-v1 (off in base). trainer-opponent-v1 is a recorded reading, not a switch.
- 2026-10-16 07:56 AM EDT: trainer-heal-guidance-v1 and low-hp-trainer-warning-v1 merged on main (60f66178, three reviews approved); added to the bundle switches (off in base); their pending experiments repinned to 60f66178.
- 2026-10-16 07:54 AM EDT: people-ledger-v1 merged on main (9a1ea32d); added to the bundle switches (off in base).
- 2026-10-16 07:40 AM EDT: briefing-exits-v1 (bug fix) and untaken-exits-v1 merged on main (780f40a5); briefing-exits-v1 added to onInBoth (on in base), untaken-exits-v1 to the bundle switches (off in base).
- 2026-10-16 07:30 AM EDT: levelup-box-v1 (bug fix for the level-up stats box stall in run 54a7) merged on main (36aad5b1); added to onInBoth (on in base).
- 2026-10-16 07:10 AM EDT: disproved-beliefs-v1 and same-plan-breaker-v1 merged on main (3d218b98, repin a21c24db); added to the bundle switches (off in base).
- 2026-10-16 06:18 AM EDT: offscreen-objects-v1, navigate-first-prompt-v1 and presence-penalty-v1 (the operator approved 3:41 AM EDT) merged on main (164d7a79); added to the bundle switches (off in base; their dependencies live-object-sprites-v1 and bounded-navigation-v1 are on in base).
- 2026-10-16 06:06 AM EDT: script-line-presence-v1 (on-screen speakers on script lines) merged on main (bbbee47b); added to the bundle switches (off in base).
- 2026-10-16 05:52 AM EDT: battle-message-waiting-v1 (bug fix: the readout names a waiting battle message and says to press A or B) merged on main (09d1a652, Claude/Codex/grok reviewed); added to onInBoth (on in base).
- 2026-10-16 05:37 AM EDT: F12 (screen-aware stall briefing, inside stall-briefing-v1) merged on main (586ab6d1); no definition change. All four Route 101 fixes (F9–F12) are on main and in the bundle.
- 2026-10-16 05:27 AM EDT: battle-text-auto-advance-v1 merged on main (61f6fac7, pinned fd4ad89c); added to the bundle switches (off in base). Its merge made normalizeFeatures return keys in registry order; experiments-check and fixed-run check re-run clean.
- 2026-10-16 05:12 AM EDT: Repinned pending experiments to their merges (connection-edge-tiles → fb6fa7c7; in-game-naming-readout, no-nickname-guidance → 2124e9db) and listed each changed switch explicitly (false) in its incumbent.
- 2026-10-16 05:08 AM EDT: in-game-naming-readout-v1 and no-nickname-guidance-v1 (F10/F11) merged on main (2124e9db) by the Route 101 thread; both added to the bundle switches (off in base).
- 2026-10-16 04:57 AM EDT: connection-edge-tiles-v1 (F9) merged on main (fb6fa7c7) by the Route 101 thread; added to the bundle switches (off in base).
- 2026-10-16 04:45 AM EDT: explorer-guidance-v1 merged on main (20478f28, pinned 735d307d); added to the bundle switches (off in base).
- 2026-10-16 04:38 AM EDT: Operator (the operator, other thread): the RIVAL_MET confirmatory experiment will not run. M7 qualification/launch is dropped. The bundle definition stays maintained for the overnight cook rounds planned in the "Overnight GPU plan and fix report" thread. Cook #2 (`2026-10-16T02-23-17_qwen36-gpu1_sh02`, main 0ccf1bd) set a new frontier: FIRST_POKECENTER_HEAL at 53.9 min (OLDALE 30.6, ROUTE_103 32.2, RIVAL_BATTLE_WON 50.8).
- 2026-10-16 04:14 AM EDT: readout-rules-in-prompt-v1 merged on main (005b94f8, pinned cfc67921); added to the bundle switches (off in base).
- 2026-10-16 04:09 AM EDT: displayed names everywhere merged on main (4b8a37d1, Codex/grok approved by the "Long runs vs significance review" thread), under displayed-place-names-v1 (on in both arms; no definition change). Incoming on-in-both fixes: battle-message-waiting-v1, a loop-guard fix for observes in battle and pushbacks.
- 2026-10-16 04:00 AM EDT: adjacent-tiles-v1 merged on main (a100eda5, Claude/Codex/grok approved by its thread); added to the bundle switches (off in base).
- 2026-10-16 03:50 AM EDT: The operator put walkable-floor-v1 (existing switch; cook #2 had navigate_to call rug tiles unwalkable 13 times) in the bundle; the "Cook run 2 rival house exit" thread builds more bundle fixes (pushback press result, briefings that stop listing used exits, room exploration, a loop-guard fix).
- 2026-10-16 03:45 AM EDT: battle-triage-guidance-v1 merged on main (9f744e40, Claude/Codex/grok approved by its thread); added to bundle-v-control switches (off in base).
- 2026-10-16 03:18 AM EDT: readout-rules-in-prompt-v1 (safe readout trim: fixed rules moved into the system prompt) joins the upcoming bundle switches; grass cost stays out (the operator).
- 2026-10-16 03:10 AM EDT: Upcoming bundle switches also include people-ledger-v1 (claude/people-ledger) and explorer-guidance-v1 (claude/explorer-guidance), built by the showcase-analysis thread; the speaker check is dropped; readout trimming is undecided (likely a separate A/B).
- 2026-10-16 03:04 AM EDT: The operator added adjacent-tiles-v1 (built by the showcase-analysis thread) to the upcoming bundle switches; grass-cost-navigation-v1 stays out pending a PokeBench review.
- 2026-10-16 02:55 AM EDT: M6 gates: agent 1400, viewer 797 (coverage 97.73/94.55/97.98/99.08 and 95.11/90.43/93.59/97.61); review of main..034510d6: Codex LGTM, grok LGTM (nit: some wording still says "switches and off-in-both"). Merging. Upcoming bundle switches from other threads: F9 connection-edge-tiles-v1, F10 in-game-naming-readout-v1, F11 no-nickname-guidance-v1, F12 (in stall-briefing-v1), battle-text-auto-advance-v1, battle-triage-guidance-v1 (the operator 2:02 AM EDT).
- 2026-10-16 02:40 AM EDT: Merged into main: blocked-batch-result-v1 (342a2d5), transition-loop-detection-v1 (cd2dafd), displayed-place-names-v1 (2514774), F5–F8 (0e645b7), dialogue-context-kept-v1 (36e7c73), warp-arrival-settle-v1 (ead1837); main gates green (agent 1400, viewer 794, pytest 2017, lint clean). The operator put both battle switches in the bundle (1:38 AM EDT). Definition wired on this branch: onInBoth = transition-loop-detection-v1, displayed-place-names-v1, dialogue-context-kept-v1 (on in base); switches += blocked-batch-result-v1, warp-arrival-settle-v1, expanded-menu-battle-information-v1, battle-details-v2 (off in base); offInBoth = milestone-stall-stop-v1. definitionProblems and controlBaseProblems empty; arms differ in exactly the 12 bundle switches. F9–F12 to be added when the Route 101 thread merges them.
- 2026-10-16 01:16 AM EDT: Ownership change (the operator told the "Route 101 turnaround" thread to land its own fixes on main itself): F9–F12 are owned and landed by that thread; my F9 and F10/F11 agents stopped, F12 dropped from the M5 branch. I wire the merged switches into the bundle definition.
- 2026-10-16 01:05 AM EDT: F12 added to the M5 branch: screen-aware stall briefing and an interface-dwell stall, inside stall-briefing-v1.
- 2026-10-16 01:01 AM EDT: The operator put the nickname readout fix and the no-nickname line in the bundle (F10, F11); branch started.
- 2026-10-16 12:54 AM EDT: Showcase bundle run reached BIRCH_RESCUE_COMPLETE at 15.4 min from the main-menu save (RIVAL_MET 10.3, ROUTE_101 13.9). The operator added F9 `connection-edge-tiles-v1` to the bundle; branch started.
- 2026-10-16 01:10 AM EDT: M6 GREEN for `b9977c5`: `onInBoth` in the schema, `featureProblems`, `armFeatureBits` and `controlBaseProblems`; `check` prints the list; bundle-v-control.json gets `onInBoth: []` until the fix branches merge. Fixed-run tests 69 pass; tsc and eslint clean.
- 2026-10-16 01:00 AM EDT: M1–M5 and blocked-batch-result-v1 running as parallel branches (claude/transition-loop-detection, claude/displayed-place-names, claude/dialogue-context-kept, claude/warp-arrival-settle, claude/bundle-prelaunch-fixes, claude/blocked-batch-result). M6 RED: `onInBoth` required in the definition; control base accepts exactly those flags; armFeatureBits/armPreset carry them true in both arms; definitionProblems refuses off/unknown/switch/off-in-both overlaps.
- 2026-10-16 12:46 AM EDT: Approved by the operator. F1 goes in the bundle as `warp-arrival-settle-v1`; F2–F4 switches ON in both arms; `blocked-batch-result-v1` (branch `claude/blocked-batch-result`) joins the bundle. M1–M5 run in parallel worktrees, one branch each; M6 integrates.
- 2026-10-16 12:45 AM EDT: Worklog drafted from the two forensics reports; awaiting operator approval. Estimate: about a day of work for M1–M6, then qualification and review.

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER: archive

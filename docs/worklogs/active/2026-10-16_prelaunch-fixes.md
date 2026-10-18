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

- 2026-10-18: refinement RED/GREEN and gates. RED: after changing the contract test, the focused file failed 1/18 because MOM's later running-shoes line still produced `is newer` and removed the lab door. GREEN: removed the parallel generic dialogue ledger from `StoryDestinations`; 44 focused story/trust tests pass and the explainer page check is silent. `just experiments-check`: 111 entries, OK. `just fixed-run check bundle-v-control`: definition valid; `stale-story-goal-v1` remains in bundle switches, base/control false, and `story-destinations-v1` remains off in both. Full gates: agent 2,456, viewer 1,172, Python 2,707 with the configured ROM, all pass; lint/type/format clean; build clean; coverage agent 98.00/94.28/98.31/99.23, viewer 95.40/91.46/93.83/97.64, Python 97.48 lines / 93.42 branches / 99.43 functions; vendor pin `bbab97a` clean. Setup-only receipts: the first Python run failed 12 tests because the fresh worktree's vendor submodule was uninitialized; after initializing the outer pinned submodule, all non-ROM tests passed. Mypy then needed the main checkout's read-only mGBA binding linked into the worktree venv. One full viewer coverage attempt had two streaming timing flakes; the focused coverage rerun passed 17/17 and the subsequent full coverage run passed 1,172/1,172 without retries in the test code.
- 2026-10-18: The operator approved refining `stale-story-goal-v1`, keeping the improved switch ON in the bundle and OFF in control, and landing it on main. The refinement removes the broad "any later ledger line" retirement rule. A destination remains active across incidental later dialogue; a newer line that actually names a place already supersedes it through the existing latest-place selection. Native checklist completion still retires only the exact resolved place (for example `RECEIVED_POKEDEX` retires Birch's lab), drops the door, and disables the walk-away supervisor. Invariants for this change: OFF remains byte-identical; ON changes only milestone-backed retirement; the bundle definition continues to flip only `stale-story-goal-v1` for this behavior; the pending experiment stays unqueued and its hypothesis/readiness text describes the narrowed contract.
- 2026-10-18 01:53 AM EDT: the three cloud lanes returned VERDICT: LGTM on the landed branch tip aa1e76f1 (packet 157a6a80, base 44c42815). That tip was already on main via bbc35297. This commit only records the review. The live cook was not restarted. source.commit was not repinned.
- 2026-10-17 10:12 PM EDT: gates on the round-2 tip before its review. `just test`: agent 2373, viewer 1137, pytest 2707. `just lint` clean. `just build` ok. `just coverage`: agent 98.04/94.14/98.29/99.24, viewer 95.36/91.38/93.79/97.62, Python 97.66/93.82/100, floor 90. `just verify-vendor` ok.
- 2026-10-17 10:15 PM EDT: round-1 review blocked. Cities were retired by the woods and gym labels, and `watch-snapshot-v1` was still registered. Both fixed on `stale-story-goal-v1-r2`. The uncommitted left-conversation-loop and watch-snapshot work in the other worktree is not part of this branch.
- 2026-10-17 09:51 PM EDT: gates on 40036af1 before review. `just test`: agent 2372, viewer 1137, pytest 2707. `just lint` clean. `just build` ok (viewer stamp 40036af). `just coverage`: agent 98.04/94.14/98.29/99.24, viewer 95.36/91.38/93.79/97.62, Python 97.66/93.82/100, floor 90. `just verify-vendor` ok. Main still 44c42815. Local inference reviewers are not in this roster.
- 2026-10-17 09:49 PM EDT: eslint: the factory describe had an unused `resultAt(272)`. Removed.
- 2026-10-17 09:48 PM EDT: the switchboard test counted "No matching runs yet" as 112. The new switch makes it one per switchable feature, so the assertion now uses that count.
- 2026-10-17 09:47 PM EDT: the first stale-story-goal commit also picked up an unrelated viewer watch snapshot (app.ts, server.ts, watch.ts, watch-snapshot.test.ts). That snapshot is removed in the following commit so the review packet is only this switch.
- 2026-10-17 09:45 PM EDT: The operator asked for stale-story-goal-v1 to be reviewed and, once the cloud lanes approve, merged to main, with the fix in the bundle. The switch retires the latest place-naming story line when the story checklist shows that place's milestone is done, or when a later ledger line exists, and does not promote an older place line. `story-destinations-v1` is off in both arms (`offInBoth`); `stale-story-goal-v1` is a bundle switch (base false). Pending experiment `experiments/stale-story-goal.json` is not queued. The live cook loaded its definition at start and is not restarted.
- 2026-10-17 08:45 PM EDT: archived 50 active worklogs whose implementations are already on main (76431ffd). This worklog stays active; launch approval is still open.
- 2026-10-17 07:45 PM EDT: no-exit-here-v1 (landed 18bb0a4b; needs world-destinations-v1, on in both) joins the bundle-v-control bundle arm; open-goal-prompt.json incumbent follows. Previous commit 2c2023d8.
- 2026-10-17 07:42 PM EDT: navigation-evidence-memory-v1 leaves the bundle, off in both (the operator 7:40 PM EDT). The RAM-confirmed bug fixes stay bundle-only: tutorial-party-owner-v1, mid-frame-readout-v1, unset-dynamic-warp-v1 already in; field-whiteout-record-v1 joins when it lands. open-goal-prompt.json incumbent follows. Previous commit cf52c8f7.
- 2026-10-17 06:08 PM EDT: instruction-ledger-v2 (landed 9b4dcc15; needs dialogue-auto-advance-v1, on in both) joins the bundle-v-control bundle arm; open-goal-prompt.json incumbent follows. Previous commit a04de386.
- 2026-10-17 05:38 PM EDT: readout-truth-fixes (landed 8cdf6cd1): tutorial-party-owner-v1, mid-frame-readout-v1, unset-dynamic-warp-v1, status-names-v1 and surf-gated-exits-v2 join the bundle-v-control bundle arm (all dependencies already on in both arms; control keeps surf-gated-exits v1). open-goal-prompt.json incumbent follows. Previous commit 1da4be69.
- 2026-10-17 05:22 PM EDT: harness-trust-v2 (landed 8280b57a, main 43ebeda9; needs harness-trust-v1, with battle-move-tool-v1, both in the bundle) joins the bundle-v-control bundle arm; open-goal-prompt.json incumbent follows. Previous commit 44652551.
- 2026-10-17 05:03 PM EDT: battle-move-tool-v1 (landed f7923b5c, repin feb3ad83; no dependency) joins the bundle-v-control bundle arm; open-goal-prompt.json incumbent follows. Previous commit 3d9581c6.
- 2026-10-17 04:46 PM EDT: harness-trust-v1 (needs dialogue-auto-advance-v1) and cited-destination-v1 (needs bounded-navigation-v1), landed 815c17a5 / b9216bc7, join the bundle-v-control bundle arm; open-goal-prompt.json incumbent follows. Previous commit b5c6c5a6.
- 2026-10-17 04:42 PM EDT: full-map-navigation-v1 leaves the bundle, off in both (the operator 4:41 PM EDT; v2 to be built and decision-probed first). open-goal-prompt.json incumbent follows. On top of 815c17a5: agent 2210, viewer 1115 pass after a rebuild (a stale dist gave 14 unrelated viewer failures).
- 2026-10-17 04:29 PM EDT: heal-before-trainers-v1 (landed 68f7348d, repin 4eb10245; server+agent; needs low-hp-trainer-warning-v1, on in both) joins the bundle-v-control bundle arm; open-goal-prompt.json incumbent follows.
- 2026-10-17 04:10 PM EDT: exit-reachability-v1 (landed 7235ae56, server+agent switch, the operator approved bundle only) joins the bundle-v-control bundle arm (base false, no dependency); open-goal-prompt.json incumbent follows. Viewer restart (just viewer-main) needed before any launch check from this pin.
- 2026-10-17 04:04 PM EDT: dialogue-log-v1 and instruction-ledger-v1 leave the bundle-v-control bundle, off in both (the operator 4:02 PM EDT; instruction-ledger-v2 to follow as a bundle-only switch). open-goal-prompt.json incumbent follows.
- 2026-10-17 02:27 PM EDT: objective-tracking-v1 and repeat-attempt-guard-v1 leave the bundle arm again, off in both (the operator 2:26 PM EDT: minimal tool set; a standalone repeat-press-guard-v1 is being built instead). open-goal-prompt.json incumbent follows. Previous commit f7f34d1e.
- 2026-10-17 02:03 PM EDT: objective-tracking-v1 and repeat-attempt-guard-v1 (needs objective tracking) join the bundle-v-control bundle arm (the operator 1:59 PM EDT); off in control. open-goal-prompt.json incumbent follows. Previous commit e176b935. fixed-run check clean (1c34512d); both arms' presets parse and prompts build; agent 2105, viewer 1101, pytest 2530 pass.
- 2026-10-17 02:00 PM EDT: **Control becomes the frontier (the operator approved 1:57 PM EDT).** blackout-readout-v1, ineffective-loops-v1, navigation-refusal-reasons-v2 and people-id-cards-v1 move to on-in-both. The control arm's switch set now equals frontier run 2026-10-17T11-15-07_qwen36-gpu0_0e05's recorded harness_features exactly (checked both directions, no differences). Bundle keeps low-hp-trainer-warning-v2, story-destinations, counter-talk, instruction-ledger, dialogue-log, grass-cost, full-map navigation, navigation-evidence-memory. repeat-attempt-guard-v1 and objective-tracking-v1 still held.
- 2026-10-17 01:52 PM EDT: **Control change:** open-goal-prompt-v1 moves from the bundle to on-in-both (the operator 1:46 PM EDT). Previous commit bc5982d4. fixed-run check clean (0ac63662); agent 2105, viewer 1101, pytest 2530 pass.
- 2026-10-17 01:48 PM EDT: **Control change:** cross-map-goal-v1 moves from the bundle to on-in-both (the operator approved 1:41 PM EDT). grass-cost-navigation-v1 (needs bounded-navigation-v1, on in both) joins the bundle arm (the operator 1:42 PM EDT, replacing the earlier grass-cost-out rule); open-goal-prompt.json incumbent follows. full-map-navigation-v1 (needs bounded-navigation-v1; navigate_to plans over the whole map, up to 512 presses) and navigation-evidence-memory-v1 join the bundle arm too (the operator 1:40 PM EDT). repeat-attempt-guard-v1 held: it needs objective-tracking-v1, which is off in both arms (asked the operator).
- 2026-10-17 01:46 PM EDT: instruction-ledger-v1 and dialogue-log-v1 join the bundle-v-control bundle arm (the operator 1:38 PM EDT; base false, both need active-field-message-buffer-v1, on in both); open-goal-prompt.json incumbent follows.
- 2026-10-17 01:42 PM EDT: **Control changes:** surf-gated-exits-v1 moves from the bundle to on-in-both (the operator 1:37 PM EDT promotion). world-destinations-v1, battle-text-auto-advance-v1, in-game-naming-readout-v1 and no-nickname-guidance-v1 were already on in control (base). 2-hour cook cap kept.
- 2026-10-17 01:30 PM EDT: counter-talk-v1 joins the bundle-v-control bundle arm (the operator 1:29 PM EDT, next round; base false, needs live-map-v1, on in both); open-goal-prompt.json incumbent follows.
- 2026-10-17 01:20 PM EDT: story-destinations-v1 (landed 9060af6c, repin 967b2713; place resolution only, no people) joins the bundle-v-control bundle arm (base false; needs dialogue-auto-advance-v1, on in both); open-goal-prompt.json incumbent follows (story-destinations-v1 true).
- 2026-10-17 11:53 AM EDT: Fixed main red from 90dae68b: agent open-goal-prompt.test.ts required the incumbent to name exactly the switches registered up to open-goal-prompt-v1; it now requires that prefix and that every bundle switch is on (open-goal off), so later bundle switches can join. Agent 2084 and viewer 1040 tests pass.
- 2026-10-17 11:40 AM EDT: low-hp-trainer-warning-v2 (landed 74b76850, the operator approved) joins the bundle-v-control bundle arm (base false; needs low-hp-trainer-warning-v1, on in both). experiments/open-goal-prompt.json incumbent follows the bundle cook arm: 120-min cap (budget doubled to 122400000), low-hp v2 on; open-goal-prompt.test.ts expects 7_200_000 (it failed on main since 997f570e), and its feature check now compares both sides without the changed switch (the arm has it on since 993f7df9). Viewer tests 1040 passed.
- 2026-10-17 12:23 AM EDT: Cook phase cap doubled from 60 to 120 min in both arms (the operator 12:21 AM EDT: many cook runs hit the 60-min cap). Confirmatory phase unchanged at 15 min. The overnight dry-run rounds pass their own --wall-ms (owned by the Overnight GPU plan thread).
- 2026-10-16 06:12 PM EDT: open-goal-prompt-v1 (landed 2fcb544b, repin 61f77a22) joins the bundle-v-control bundle arm (base false, no dependency).
- 2026-10-16 05:56 PM EDT: people-id-cards-v1 landed fast-forward at 04a4c165 (Claude, Codex, Grok LGTM; The operator approved the design 4:47 PM EDT) and joins the bundle-v-control bundle arm (base false; needs people-ledger-v1, on in both).
- 2026-10-16 05:12 PM EDT: ineffective-loops-v1 (landed f7ee1bae, repin cbdee575) joins the bundle-v-control bundle arm (base false, no dependency).
- 2026-10-16 04:58 PM EDT: **Control changed at pin d9d82b3f.** explorer-guidance-v1 off and explorer-guidance-v2 on in both arms (the operator 4:18 PM EDT: no talk-to-particular-NPC guidance; generic talk-to-people text). Control base frontier-incumbent-4caa edited in place, sha256 now 5f22d1b9; definition base matches; `fixed-run check` clean. Runs from earlier pins had v1 in control and are not comparable on this flag.
- 2026-10-16 04:27 PM EDT: cross-map-goal-v1 (merged 85a52e85, pin fe65ac57) joins the bundle-v-control bundle arm (base false; needs bounded-navigation-v1, on in base). `fixed-run check` clean; definition sha256 60bfe9dd.
- 2026-10-16 04:04 PM EDT: navigation landed (e580f3ce, pins e707ab88): navigation-truth-v1 added to onInBoth (on in base); navigation-refusal-reasons-v2 added to the bundle switches (off in base; bounded-navigation-v1 is on in base).
- 2026-10-16 03:57 PM EDT: surf-gated-exits-v1 landed (49e18c58, main 54a525b5); added to the bundle switches (off in base and in the frontier control base).
- 2026-10-16 02:47 PM EDT: Control follows the frontier (the operator, 2:43 PM EDT). New control base `experiments/fixed/control-bases/frontier-incumbent-4caa.json` (sha256 9d6f9e98…) = the bundle-arm features recorded by run `2026-10-16T12-42-29_qwen36-gpu0_4caa` (pin 6603d64f), with same-plan-breaker-v1 and presence-penalty-v1 off (the operator: drop both), plus the both-arm fixes landed since (transition-coherence-v1, readout-truth-v1, birch-speech-pages-v1). base.features = that preset; bundle switches = blackout-readout-v1 (the one bundle switch landed after 6603d64f); offInBoth = milestone-stall-stop-v1, same-plan-breaker-v1, presence-penalty-v1; onInBoth empty. warp-arrival-settle-v1 is now in control. Definition sha256 798e11ae…; plan unchanged.
- 2026-10-16 02:23 PM EDT: readout-truth landed (173fcd4b, pins 4996fb96): readout-truth-v1 and birch-speech-pages-v1 added to onInBoth (on in base); blackout-readout-v1 added to the bundle switches (off in base).
- 2026-10-16 01:30 PM EDT: transition-coherence-v1 (correctness fix, landed 7334cfda, pin 58a6d06c) added to onInBoth (on in base).
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

- 2026-10-17: stale-story-goal-v1. Deleting the production wiring once turned the factory test red, then it was restored. With `features["stale-story-goal-v1"]` removed from `withStoryDestinations`, the ON result kept `Way in: door in LITTLEROOT TOWN (map 0/9) at (7,16)`. With `retireLab` removed from `playGameTools`'s `withHarnessTrust` call, the Story goal line kept the door. Both restored; the factory test is green. The same switch now retires a place line when the story checklist shows that milestone is done, or when a later ledger line exists, and does not promote an older place line. `story-destinations-v1` is off in both arms of bundle-v-control; the switch stays a bundle-only harness-trust change.

## Multi-Model Review Log

- Round 1, packet `65e72a86243fc3ba6df27263376412cac9fee7d5d20aab4b6744619b13a0e8d4`, base `44c42815`, head `d46ef9d0`. Cursor Claude `claude-opus-5-5-high` VERDICT: BLOCKING. Cursor Grok `grok-4.7-high` VERDICT: BLOCKING. Cursor GPT `gpt-5.6-sol-xhigh` VERDICT: BLOCKING. Claude CLI was logged out; the Claude lane was Cursor Claude. Local inference reviewers were not run.
- Fix: `covers()` required every distinctive word of a place to appear in the label, so PETALBURG CITY matched "Petalburg Woods Aqua event complete" and RUSTBORO CITY matched "Rustboro Gym complete" (Claude blocker 2, Grok blocker). A label now covers a place only when the place's words are exactly the place that label names.
- Fix: `watch-snapshot-v1` was still registered and recorded after the writer was removed (Claude blocker 1, GPT blocker 3). The registration is removed. The snapshot itself stays out of this branch.
- Rebut, same-call page order (GPT blocker 1): a later line is a greater turn number. The locked example is turn 5 then turn 6. Pages in one call share a turn and do not retire the place line.
- Rebut, change `activationMilestone` (GPT blocker 2): the pending experiment is not designed and not queued. The milestone stays `RECEIVED_POKEDEX`, which is the comparison the hypothesis names. The notes and readiness row no longer say that flag is the first text change.
- Rebut, quadratic feature-list test and one extra explainer request (GPT blockers 4 and 5): both follow tests this diff did not invent. A scaling receipt or a new shared fixture is more proof than the project skills require.
- Rebut, browser screenshots and a model-delivery receipt (GPT blocker 6): more screenshots than this landing's gates. The explainer check stays `just pages-check` and HTTP 200.
- Follow-up, not in this branch: `newerThan` copies the ledger; the trust sentence is awkward when the only reason is a later line; the pending incumbent still has story-destinations on, which the bundle now turns off in both arms.
- Review of the fix, 2026-10-18 01:40–01:53 AM EDT. Packet `git diff --binary 44c42815 aa1e76f1`, SHA-256 157a6a802e73802ec9e1e102634c1c29d8d7a0ecd0c890cd0ead6dbc21180c30, unchanged across both rounds. Worktree `/Users/user/dev/pokebench-stale-r2` stayed clean at aa1e76f1. Claude lane was Cursor `claude-opus-5-thinking-high` (CLI logged out). Grok `cursor-grok-4.5-high`. GPT `gpt-5.6-sol-xhigh`. Empty unexpected stderr on every lane. Local inference reviewers were not run.
- Round 1 of that packet: Claude VERDICT: LGTM. Grok VERDICT: LGTM. GPT VERDICT: BLOCKING. Same-turn pages, a missing RED commit, the merge having already happened, a model-path replay, and three-width screenshots. Rebutted in the boundary: a later line is a greater turn (the locked test is turn 5 then turn 6); the wiring-deletion red probe is already recorded and the commit is on main; bbc35297 is already the merge; the factory test drives `playGameTools`; `just pages-check` on the explainer printed nothing.
- Round 2, same packet: Claude VERDICT: LGTM. Grok VERDICT: LGTM. GPT VERDICT: LGTM.
- The branch was already an ancestor of main (merge bbc35297, parents cf013f99 and aa1e76f1) before these LGTMs. It was not fast-forwarded by this review. No code changed after the LGTMs.

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER: archive

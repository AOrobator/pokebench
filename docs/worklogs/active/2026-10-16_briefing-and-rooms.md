# Briefing exit facts and untaken exits (two switches)

Requested 2026-10-16 by the orchestrating thread for the operator. Branch `claude/briefing-and-rooms`, worktree `.claude/worktrees/agent-a01e487804edb59d3`. Local only: never push, no PR, no remote. Standing merge OK into main once Codex, Grok and Claude all LGTM and every gate passes. Review lanes: Codex, Grok, Claude only (no local-inference reviewers). `experiments/fixed/bundle-v-control.json` belongs to another thread: not edited here. No runs or viewer started, restarted or stopped.

Evidence (read-only): live run `runs/2026-10-16T02-23-17_qwen36-gpu1_sh02` (bundle arm), loop_guard seq 2783 (T134, map_cycle) and seq 3616 (T171, milestone_drought); analysis `runs/reports/cook-run2-forensics.html`.

## A: `briefing-exits-v1` (bug fix; The operator wants it ON in both arms, like transition-loop-detection-v1)

Problems in the recorded briefings:
1. "Not tried yet on other maps" for LITTLEROOT TOWN MAYS HOUSE 1F (map 1/2) lists the warps to map 0/9 at (1,8)/(2,8) and coordinate_trigger (2,8). The player arrived on (2,8) at T113 (seq 2305) and left through it at T116 (seq 2384-2394). Cause: `touched` only records navigate_to targets, faced A targets and step triggers reached by a same-room move; a warp used to leave or arrive, and a trigger tile the player arrived on, are never recorded.
2. The decisive "Exits to maps you have not entered … Warp to map 1/3 at 2,2" is the last line, after 14 PCs and bookshelves.
3. Destinations are bare ids ("Warp to map 1/3") although the readout named them ("Warp to PROF. BIRCH'S HOUSE 2F (map 1/3)").

Design (ON):
- Exit history from recorded overworld states: on a map change A -> B, the warps taken are, on A, the warps to B within one tile of A's last recorded position (else, when every warp on A to B shares one destination, all of them), and on B, the warps back to A within one tile of B's first recorded position (same fallback); each with its same-destination siblings (a two-tile door). A step trigger is tried once any recorded overworld state stands on it. Marks are applied after the call's Story line is read, so the existing "tried resets when the Story line changes" rule is unchanged.
- Stall briefing order: Where you are, then Exits to maps you have not entered, then the dialogue of the latest story step that came with dialogue, then every other line in today's order. Nothing else dropped.
- Names: a warp's destination is named the way the readout named it: names are collected from the readout text the model received (its Location line for the current map, and `-> NAME (map g/n)` / `Warp to NAME (map g/n)`). A map the readout never named keeps the bare id, so a control arm without named warps is not handed names its readout never showed. Room headers keep `roomOf` (displayed-names-everywhere, unmerged at start, fixes those via `location_display`).
- Applies to every briefing that shows these lists (loop supervisor, stall briefing, text-only supervisor); ordering only to the stall briefing.
- OFF: byte-identical (replay of sh02 reproduces the recorded seq 2783 and 3616 messages exactly on main baff5cd3).

## B: `untaken-exits-v1` (bundle-arm behavior switch, default off, pending experiment)

- Readout line after Position (after Location when position is off): `Exits here you have not taken: (2,2) -> PROF. BIRCH'S HOUSE 2F (map 1/3)`. Every warp on the current map (from RAM `interaction_targets`, grouped by destination) and, with world-destinations-v1, every map connection, minus those this run has taken (same exit history, whole run, never reset). Names as in A. Nothing clipped.
- System prompt sentence: before leaving a building or area, consider the exits there you have not taken, especially any someone mentioned. Names no character, place or story step.
- Separate from explorer-guidance-v1 (talk-to-people prompt section, other thread).
- OFF: readout and prompt byte-identical.

## Milestones

**M1: A RED -> GREEN**
- [ ] RED: sh02 replay (OFF byte-identical to recorded seq 2783/3616; ON drops used exits/trigger, orders unentered exits and story dialogue first, names destinations); synthetic unit cases; registry asserts
- [ ] GREEN: registry, presets, defaults, SupervisorBriefing + exit history
- [ ] Wiring-deletion check

**M2: B RED -> GREEN**
- [ ] RED: readout line on sh02 states (May's house 1F at T113-T116), prompt sentence, OFF identity, factory path
- [ ] GREEN: `withUntakenExits` in playGameTools, prompt, registry
- [ ] Wiring-deletion check

**M3: explainers, pending experiments, gates**
- [ ] Explainers + FEATURE_EXPLAINERS, pages-check
- [ ] experiments/briefing-exits.json, experiments/untaken-exits.json pending; readiness rows
- [ ] just test, coverage (90), lint, build, verify-vendor

**M4: review and land**
- [ ] Principles self-review PB1-PB13
- [ ] Claude, Codex, Grok LGTM
- [ ] Rebase/merge latest main, re-run gates, local merge

## Log

- 2026-10-16 02:59 AM EDT: branch from main baff5cd3. Checked: displayed-names-everywhere, explorer-guidance, adjacent-tiles, people-ledger unmerged; pushback-loop-guard at main. Fixture `packages/agent/src/fixtures/briefing-sh02.jsonl.gz`: sh02 seq 0-3616, state events trimmed to the fields the briefing reads, native_action/assistant events dropped.
- 2026-10-16 03:05 AM EDT RED: `briefing-exits.test.ts` (sh02 replay: OFF byte-identical to recorded seq 2783/3616 on main, verified with a scratch replay before any change; ON drops the used door pair and trigger, orders exits and story dialogue first, names destinations; exit-history units; production rig for loop/text-only/stall factories; registry) and `untaken-exits.test.ts` (sh02 readouts at T113-T116 and the lab; unit lines; prompt ON/OFF; playGameTools wiring; registry). Both files fail at import (modules absent).
- 2026-10-16 03:25 AM EDT GREEN: `exit-history.ts` (ExitHistory, usedWarps, readoutNames), SupervisorBriefing (exit marks and stepped-on triggers flushed after each result's Story line; warp names from the readout; stall order), `untaken-exits.ts` (UntakenExits, withUntakenExits in playGameTools), `UNTAKEN_EXITS_SECTION` appended last in playSystemPrompt, registry (A guard needs null; B observation needs world-targets-v1; both appended last; B in stateOnlyProblems), presets/flagFeatures/DEFAULT_NEXT_RUN false. Registry position asserts shifted by two; prompt/preset tests that spread ALL_ON pin the two new ids off.
  - Design change found by the existing finals test (`finals-briefing.test.ts`, 2026-10-15 rule "standing on a trigger without moving there keeps it untried"): A no longer counts standing on or arriving on a trigger. It counts a trigger walked onto at any recorded step of a batch (not only where the batch ends). The May's house (2,8) trigger still leaves the list, because it shares its tile with the door the player used. Test added for the mid-batch case.
  - Wiring deletion: `this.exits=null` turns 6 of 15 briefing-exits tests red; dropping withUntakenExits from playGameTools turns the production-wiring test red; dropping the prompt line turns the prompt test red. All restored.
  - Agent 1435/1435, viewer 801/801 (controls 20/20 observation, 60 switch rows; next-run defaults). tsc + eslint clean.
- 2026-10-16 03:45 AM EDT: explainers `docs/explainers/briefing-exits-v1.html`, `docs/explainers/untaken-exits-v1.html` (pages-check silent), README entries, FEATURE_EXPLAINERS mapping with panels/server tests (viewer 802/802). Pending experiments `experiments/briefing-exits.json`, `experiments/untaken-exits.json` (finals incumbent, activation PLAYER_NAME_CONFIRMED, primary RIVAL_BEDROOM_REACHED, provisional source.commit a92532c2, no queuePosition; both parse and give OFF/ON arms). Readiness rows PENDING. `just experiments-check` reads the main checkout, so it cannot see them before landing.
- 2026-10-16 04:00 AM EDT: merged main f46346a3 (49 commits: displayed-names-everywhere, adjacent-tiles-v1, readout-rules-in-prompt-v1 landed). Conflicts resolved by taking main's files and re-appending this branch's two switches after `readout-rules-in-prompt-v1`; registry position asserts re-shifted by two on main's values; `readout-rules.test.ts` "names every registry switch" now compares against the switches registered up to and including readout-rules-in-prompt-v1 (the entry predates these two; editing its experiment definition instead would change a registered entry). Since displayed-names-everywhere landed, briefing room headers use `location_display` via `roomOf`; this switch only adds the destination names. Agent 1454/1454, viewer 821/821, lint clean.
- 2026-10-16 04:15 AM EDT: coverage gate after the merge: agent 97.71 st / 94.52 br / 98.05 fn / 99.11 ln; viewer 95.19 / 90.64 / 93.55 / 97.65; Python lines 97.14 / branches 92.80 / functions 100 (floor 90); 2132 pytest passed. `just lint`: tsc, eslint, ruff clean; mypy fails only on the known worktree `mgba._pylib` import in the untouched `memory_reader.py`. verify-vendor OK. Added wrapper edge-case tests (untaken-exits.ts branches 98.0); warps typed with a non-null destination (removes a dead branch).
- 2026-10-16 04:15 AM EDT scope addition from the coordinator (same switch, ON in both arms): stale "Where you are" in battles. sh02 milestone_drought seq 11928 (T716) said "at 11,21" (last overworld result seq 9644, T417) while RAM at seq 11926 had (11,13), in a wild battle on ROUTE103 (source `runs/reports/cook2-navigation.html`). RED: fixture `briefing-battle-sh02.jsonl.gz` (seq 9630-11928, trimmed); OFF reproduces the recorded line; ON expects "ROUTE103 (map 0/18) in battle at 11,13" in the stall, loop and text-only briefings. Fails as expected.
- 2026-10-16 04:25 AM EDT GREEN (battle position): SupervisorBriefing keeps the latest matched result state with a map id (`shown`) when the switch is on; `where()` reads it, and says "in battle at x,y" (no facing) when `in_battle` or the battle screen. `loop-supervisor.test.ts` "labels odd calls" pins the switch OFF (its synthetic menu state keeps the fixture's default room). Wiring deletion (never set `shown`): the ON battle test goes red; restored. Feature text and explainer section updated. Agent 1457/1457.

## Principles self-review (PB1-PB13), head eb60d88b

| ID | Score | Note |
|---|---|---|
| PB1 | PASS | No grading or milestone code touched; exit history and names only shape model text. |
| PB2 | N/A | No run accounting touched. |
| PB3 | N/A | No result claimed; both explainers say no measured runs. |
| PB4 | PASS | Both switches are named harness features in `harness_features`, switchable, with explainers. A names destinations only as the model's own readout named them, so it adds no privileged name to an arm whose readout lacks it. B lists exits from the game's own warp events (already in the readout's candidates list) plus the run's own history. |
| PB5 | PASS | Two separate switches; OFF byte-identical (sh02 replay reproduces the recorded seq 2783/3616 messages and the seq 11928 Where line; prompt and tools identical OFF). Pending experiments carry one hypothesis each. |
| PB6 | PASS | Both bugs come from a 60-minute watched run (cook #2 sh02), fixed with its recorded events as fixtures (T113-T171, T417-T716). |
| PB7 | PASS | No new event types; briefings land in the existing `loop_guard` events and readout text in `tool_result` text. |
| PB8 | N/A | No guard thresholds changed. |
| PB9 | PASS | Two judgment calls are recorded, not hidden: "latest story dialogue that names a direction or place" is read as moving the existing latest-story-step dialogue section up (reorder only, no text classifier); the trigger rule keeps the 2026-10-15 finals rule (arriving or standing does not try a trigger) and adds walked-over-mid-batch. Both flagged in the report. |
| PB10 | PASS | No test skipped, no threshold or exclude changed. `readout-rules.test.ts` now compares that entry's incumbent with the switches registered up to it (the test otherwise fails for every later switch; the entry's definition is unchanged). `loop-supervisor.test.ts` "labels odd calls" pins this switch OFF for its synthetic menu state. |
| PB11 | PASS | `just verify-vendor` OK; no vendor change. |
| PB12 | N/A | No ROM or protected path touched. |
| PB13 | IN PROGRESS | Gates green; review below. |

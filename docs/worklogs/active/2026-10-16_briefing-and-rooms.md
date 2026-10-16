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

# Unfinished activity memory (`unfinished-activity-v1`)

Status: M1 RED. The operator said yes (1:10 PM ET), own-trip part included.

## Ask

Item 5 of the list the operator approved from ChatGPT's 10/20 review: a bundle-only switch that remembers the agent's own unfinished activity across detours. It keeps four things apart: an observed instruction, a destination reached, a partly done activity, and an outstanding one to resume. It is memory of what the agent did, in the game's own words. It never tells the agent to fight anyone or where to go.

## What r10 actually shows

Run `2026-10-19T20-53-55-875Z_qwen36-gpu0_petalburg2h-r10-whole-map` (checkpoint, whole-map arm, 1,225 turns).

| Turn | What happened | What the model was shown |
|---|---|---|
| 162 | Enters RUSTBORO CITY | `Story goal: "Head for RUSTBORO CITY beyond this town." (DAD, turn 20) -> ... You are in it now.` This stays the Story goal for 100 turns, inside the city and gym. |
| 212–220 | Enters the gym, beats JOSH, TORCHIC at 7/37 | heal-before-trainers warning |
| 221–239 | Leaves to heal at the Pokémon Center | Story goal still DAD's reached line |
| 240–259 | **Does go back** ("return to the Rustboro City Gym to challenge Roxanne"), talks to ROXANNE | |
| 261 | Loses to ROXANNE, whites out in Rustboro | `Battle recap: you lost to ROXANNE (trainer 265) ... has not been defeated.` and the Story goal becomes ROXANNE's `"...what I learned at the POKéMON TRAINER'S SCHOOL in battle." -> not resolved` |
| 262–323 | Second detour: grinds on Route 104 to get stronger | Story goal still the TRAINER'S SCHOOL line |
| 268, 323 | Stall briefing: "What you have been trying is not working, so do not try it again." | |
| 324 | Model: "My next logical step should be to head to Petalburg City to challenge my dad, Norman". **This is where the gym is dropped.** | The recap line about ROXANNE was still on screen. |
| 387 | NORMAN: "Aren't you going to the POKéMON GYM in RUSTBORO CITY?" Model re-adopts Rustboro. | |
| 388–1224 | Never gets back: it is on the south half of ROUTE104 and the readout says "Way in: this map's NORTH edge", which is not reachable on foot from there. Its own trip at turns 51–162 went through PETALBURG WOODS. | |

So the review is right that it never wins the gym, but the detour to heal did resume. What lost it was the second detour (training after the loss) plus a stall briefing, with no record that the gym was the thing in progress. After Norman re-sent it, it lost 800 turns because it did not know how it had got to Rustboro before.

## Design

One new block in observe, press and navigate_to results, and in supervisor notes (loop, stall, text-only), titled `Your unfinished activity (from what you did and the game's own records):`. It has four labelled parts, each shown only when it has content:

1. **Heard.** The latest story-character line naming a place, whole, speaker and turn (the line story-destinations-v1 already picks). Labelled as heard, not as a goal.
2. **Reached.** For each map that line names: `RUSTBORO CITY (map 0/3): you first entered it at turn 162.` A reached place is a fact, not a destination.
3. **Started here and not finished.** Per map where the agent itself fought a trainer battle: who it beat (game's trainer flag, turn), and who it battled and lost to while the game's flag stays clear. Plus the detour that took it away, from recorded state: `You left at turn 221 with TORCHIC at 7/37 HP; healed at RUSTBORO CITY POKéMON CENTER 1F at turn 239.` Only trainers the agent battled appear. Unbattled trainers on the map are never listed.
4. **Still open.** Each battle the agent lost whose trainer flag the game still shows clear, with that character's own words when the agent talked to them: `ROXANNE (trainer 265), RUSTBORO CITY GYM (map 11/3): you battled at turn 259 and lost at turn 261. When you talked, ROXANNE said: "Would you kindly demonstrate how you battle, and with which POKéMON?" The game last showed (turn 330) ROXANNE not defeated; Badges: none.`

Rules:
- Every fact comes from recorded game state or delivered dialogue. No model claims, no semantic parsing of instructions, no route choice, no imperative ("go", "fight", "return").
- An open item retires only on positive game evidence: the trainer's defeated flag read set, or a later win against it. (A new badge was dropped at build time: it does not say which trainer.) Otherwise it stays for the run, through any number of detours and context trims, never clipped.
- Two story-goal fixes, both inside this switch: a reached destination no longer reads as the Story goal (it moves to Reached), and a newer story line whose places all fail to resolve (ROXANNE's TRAINER'S SCHOOL) does not replace an earlier line that resolved.
- Supervisor notes keep the block, so "do not try it again" cannot be read as dropping the open item.
- Default OFF, bundle arm only. OFF is byte-identical. Recorded as an Activity History event when an item opens or retires; no timeline mark.

### Open question for the operator: the agent's own way back

The 388–1224 failure is not fixed by the four parts alone. Option: part 4 also gives the agent's **own** last trip to that map, as the maps and exits it actually used, starting from the last place it stood that is reachable on foot from where it is now: `Your own last trip there, turns 126–212: PETALBURG WOODS (map 24/11) door at 10,30 → ROUTE104 north edge → RUSTBORO CITY → gym door at 27,19.` It is the agent's history, not a walkthrough, but it is the closest this switch gets to telling it where to go.

## Milestones

- M1: RED tests from the r10 events (heard/reached split, open item survives both detours and the 323 briefing, retires on flag, OFF byte-identical), then GREEN. Registry, presets, defaults, pending experiment, bundle (after the coordinator gives the features.ts merge slot).
- M2: own-trip memory, only if the operator says yes.
- M3: explainer, Claude + Grok review, ff-only landing.

## Session log

- 12:45 PM ET: spawned. Read r10 trace turns 160–1224 (events only, read-only). Worktree `/private/tmp/pokebench-unfinished-activity` on `claude/unfinished-activity` from main 5fe8b8bc.
- 1:10 PM ET: The operator: "yes". Own trip included in the block as "Your own last walk".
- RED: `packages/agent/src/unfinished-activity.test.ts` on fixture `unfinished-activity-r10.jsonl.gz` (r10 turns 0-420, trimmed). 11 failing (block, trip from reachable exit at T323/T390/T400, persistence, retirement, imperative-free wording, heard/reached story line, unresolved line kept out, supervisor line, playGameTools wiring, registry), 3 passing (OFF comparisons). Stub module only.
- GREEN: `unfinished-activity.ts` (fold + `withUnfinishedActivity` inside `withResultFacts`), story-destinations/harness-trust heard-reached and unresolved-line rules behind the switch, supervisor line from `unfinished_activity` events, event schema, recorder, tail, viewer model/panels/trace, registry/presets/defaults. Focused 14/14. Full agent 2840/2840. Viewer 1383/1385 (the two failures are the explainer file, written next). Registry suffix indexes in 30 older tests advance by one; historical experiment vectors exclude the new switch; LEGACY_ALL_ON keeps it OFF.
- Wiring mutation: replacing `withUnfinishedActivity` in `playGameTools` with identity fails the playGameTools test (1 failed / 13 passed); restored byte-identical (sha1 b385350f) and 14/14.
- Coordinator (1:02 PM ET): semantic-navigation-v2 holds the features.ts/experiments merge slot; do not land until given the slot.
- Coverage-driven rules tests (draw, update, win retirement, unnamed trainer, wild battles, no-table/own-map/no-walk, heal on the item's map, unread species) and wrapper edges (OFF identity, non-game tool, stateless result, failing table, checked press). Internals simplified: heal place from the latest state, arrivals pushed inline, carry() by index. Focused 20/20.
- Pending experiment `experiments/unfinished-activity-v1.json` (source 4bb807c0, activation RUSTBORO_GYM_TRAINER_JOSH_DEFEATED, primary ROXANNE_DEFEATED, not queued); readiness row; bundle arm in bundle-v-control and bundle-cook-1h (switches list, OFF in base); fixed-runner and open-goal tests extended. Explainer `docs/explainers/unfinished-activity-v1.html` mapped in FEATURE_EXPLAINERS; `just pages-check` prints nothing.
- Gates: TS lint (tsc + eslint) clean; build clean; agent 2846/2846 coverage 97.12/93.04/97.55 (lines/branches/functions); viewer 1385/1385 coverage 95.12/91.05/93.91; verify-vendor OK after submodule init. Python unchanged vs main: 2895 pass, 1 fails only in this worktree (`test_view` production server start: no mGBA binding in the fresh worktree venv; same test passes 2/2 on main). experiments-check: only pre-existing `starter-decision-salience` trials.jsonl ledger lines.
- Synced with main e224ced9 (positive-supervisor-v1 landed first). Registry order: positive-supervisor-v1 then unfinished-activity-v1. Conflicts resolved by taking main and re-applying this switch after positive-supervisor in features/presets/defaults/legacy/panels/bundles/readiness/README; test suffix indexes advanced again; positive-supervisor notes also carry the open-item line. Agent 2853/2853; viewer 1387/1388 then server.test.ts 70/70 three times alone (socket timing under full-suite load).
- Added supervisor test for positive-supervisor and focused briefings plus retirement (21/21).
- Synced with main cd23443e (whole-map pair config, phone sheet). Agent 2854/2854; viewer 1387/1388 with experiment-cli.test.ts 11/11 alone (git timing under load).
- Synced with main fa5ae160 (loop recovery metrics). Agent 2864/2864, tsc clean. Review packet frozen next.

## Review log
- R1 (packet a6e0cf94 over fa5ae160, SHA-256 c67347ba…): Grok (cursor-grok-4.5-high) LGTM. Claude lane: ~/.claude-review and default CLI logged out; Cursor Opus and Sonnet usage-capped; Claude subagent (standing operator rule, memory claude-review-lane) BLOCKING on B1.
- Triage: B1 fix (on the reached map, "first entered" used the latest visit; now the first entry since the line, and a line said inside the map reads "you were in it when this was said (since turn N)"). Claude obs 1 fixed by the same change. Obs 3 fix (a blackout activity whose evidence predates the latest arrival no longer marks the next walk carried; test fails on old code, passes now). Grok MEM/sup label: trace label now SUP. Obs 2/4/5 and Grok places-retry: rebut, no failing input (door transits in r10 all within two tiles; resolution cost bounded by dialogue volume; one-result lag acceptable).
- Viewer proof on an isolated worktree viewer (127.0.0.1:18767, scratch runs dir, clearly named reconstruction-r10-unfinished-activity: r10 events to T330 with the switch added to run_start and one unfinished_activity event in place of a T262 destination_citation; frames symlinked read-only): Harness Config card found by name, READ EXPLAINER opened /explainers/unfinished-activity-v1.html, Agent Trace row "Unfinished activity" at T262 expanded to the full text. Server stopped. Explainer timeline/walk labels de-overlapped; phone width scrollWidth 375.
- Fix batch gates: agent 2867/2867, viewer 1388/1388, tsc+eslint clean, pages-check clean.
- 3:31 PM ET: merge slot granted. Merged main fe81fed5 (semantic-navigation-v2, auto-talk-v1, duplicate-turn-collapse-v1). Conflicts: harness-trust TrustOptions/goalLine call and play-wiring options unioned (activity + semanticTargets); registry/presets/defaults/legacy/panels put this switch after duplicate-turn-collapse-v1; bundles keep it OFF in base and in the bundle switches (ON in the bundle arm only, the operator via coordinator). Gates: agent 2897/2897, viewer 1400/1400, tsc+eslint clean, pytest 2906 passed (main venv; env unchanged vs main), fixed-run check against this tree exit 0 for bundle-v-control and bundle-cook-1h with unfinished-activity-v1 in bundle switches.
- R3 Claude: merge resolution correct but packet base had moved to fd95491e (extension-timing landing) so the packet reverted main's viewer files; merged main 231231ad (viewer timing + docs only, no conflicts), viewer 1411/1411, agent tsc clean. Asked coordinator to hold main.

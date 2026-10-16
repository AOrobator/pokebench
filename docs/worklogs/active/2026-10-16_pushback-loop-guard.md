# Push-back loop guard and truthful push-back press results

Branch `claude/pushback-loop-guard` (worktree `.claude/worktrees/agent-ac31af784cbdcc618`), from main 917fd9a1. Brief from the operator (the operator) via the project coordinator, 2026-10-16 ~02:50 AM EDT, with two amendments relayed by the coordinator: (1) review lanes are Codex, Grok and Claude only (no think_fast / think_swarm); (2) bug fixes land as harness switches marked ON in both arms like `transition-loop-detection-v1`, not as pending A/B experiments; `experiments/fixed/bundle-v-control.json` is owned by another thread and is not edited here. Scope addition: the press-result fix is required, behind its own switch. The brief is the operator's approval of this scope; the operator gave standing approval to merge locally once every lane approves and all gates pass.

## Problem Statement

The loop guard misses loops where a game script pushes the player back after each attempt. Evidence (read-only live run `runs/2026-10-16T02-23-17_qwen36-gpu1_sh02`, all loop switches ON):

1. **Twin bounce, T141–T171 (seq 2934–3615).** At Littleroot (11,2) the model presses UP every turn. Odd turns: UP moves to (11,1); the result returns mid-script (field locked, script context running, no message). Between calls the twin's message opens; the next UP is auto-advanced through "Um, um, um! … It's dangerous if you don't have your own POKéMON" while the script walks the player back to (11,2). 30 turns, zero loop_guard events; only `milestone_drought` at T171 (seq 3616).
2. **Birch bounce, T263–T307 (seq 5927–7271).** At Route 101 (7,15) the model sends LEFT,LEFT,LEFT,UP,UP,UP 45 times. Each steps onto (6,15), triggers Route101_EventScript_PreventExitWest ("Wh-Where are you going?! Don't leave me like this!"), is auto-advanced and ends at (7,15). Zero loop_guard events; `milestone_drought` at T307 (seq 7272). It ends at T308 (UP, A: bag) → STARTER_CHOSEN T310.
3. The press results lie or omit: twin T142/T146/… say `locked (field controls locked in a snapshot; no net movement)` although the call moved the player (11,1)->(11,2); Birch says only `conversation restarted …` although LEFT moved the player to (6,15) and the script moved them back to (7,15).

### Confirmed root causes (replay of the trimmed fixtures through `LoopDetector` with the run's switches, a scratch spy on `complete`)

- **(a) confirmed.** Every twin "move" call ends at (11,1) with field controls locked by a running script (script_mode 2, status 0) and no message, so `semanticState` is null and the cycle history is cleared (`history.length = 0`) every other call. `transientLock` does not apply (script running, not stopped).
- **(b) confirmed, and wider than hypothesised.** Auto-advance's B presses are `button_press` events of the same tool call. Each one overwrites the pending call's `before` state (the mid-message state at (11,2) or (6,15)) and, with interaction-loop-detection ON, its action (`args.buttons` becomes `["B"]`). So the push-back calls read `[message state, B, settled state]`: before never equals after (no `ineffective`), and the history entries are one identical entry repeated, which `repeating()` refuses (a pattern needs two distinct entries).
- **(c) confirmed.** Auto-advance closes the conversation before the result, so the result state has no dialogue: `restartedConversation` and the message-visit key see nothing.
- Press result: the press line is computed for the model's own input only (before → state when the input ended); the script's movement happens during auto-advance and is never compared.

## Skills Loaded

feature-worklog, feature-switch, feature-explainer, agent-observability, experiment-queue (only to confirm no pending entry is added, per amendment 2), multi-model-review (local-inference-stack).

## Architecture

### Switch 1: `pushback-loop-detection-v1` (guard, default off, needs null)

`LoopDetector` gets a `pushback` flag (constructor and `attachLoopGuard` 8th argument), wired from the FeatureSet in `live.ts` and `decision-probe.ts`. ON adds a round-trip tracker; nothing existing changes:

- A **settled** state: semantic fingerprint known, field controls free (`field_controls_locked === false`), no dialogue and no message. The player can act there.
- The tracker keeps an **anchor** (the last settled result of a game call), the model's own actions since it (the tool call's requested buttons or the navigate_to target, never auto-advance's B), and whether a **script or message held the controls** since it (any recorded state with field controls locked that is not a door/warp transient lock).
- When a press/navigate_to result is settled and equal to the anchor, and a script or message held the controls in between, that is a **push-back**: key = anchor + actions. The last 12 push-backs are kept; when one key occurs `cycleRepeats` (3) times, the guard raises a `cycle` hit through the existing warning → supervisor path, with its own message and the evidence seqs of those push-backs.
- A settled result elsewhere moves the anchor. More than 8 calls without a settled result drop it. A story milestone and a novel state clear the push-back window.

OFF: no tracker; byte-identical.

### Switch 2: `pushback-press-result-v1` (guidance, needs `dialogue-auto-advance-v1`, default off)

In `withDialogueAutoAdvance`, when auto-advance ran, the press result compares three states: before the call, when the model's own input ended, and after auto-advance. If the player's tile changed during auto-advance, the result says so with tiles: `… then a script moved you (11,1) -> (11,2) while the dialogue advanced`; if the press itself moved the player and the script returned them, `your press moved you (7,15) -> (6,15), then a script moved you back (6,15) -> (7,15) while the dialogue advanced: you are back where this press began`. A press line that says `no net movement` for a call the script moved is reworded to `your press did not move you`. Tiles only when positions are shown. OFF: today's text.

Kept separate from switch 1 because one is model-facing text, the other a guard; each can be A/B'd or reverted alone.

## Invariants

- **INV-1** OFF is byte-identical: both fixtures replay to today's notices with switch 1 OFF; press-result text unchanged with switch 2 OFF. Test: replay OFF equals recorded silence; existing suites unchanged.
- **INV-2** Only a script or message push-back counts: a settled no-op (wall bump), an ordinary walk, a door bounce and a single conversation add nothing. Tests: synthetic cases.
- **INV-3** The action is the model's own request, never auto-advance's B. Test: replay keys.
- **INV-4** No sleeps, polling or truncation: the tracker is driven by recorded events; model text is not clipped.
- **INV-5** The production factory honors each switch (live.ts loop guard; play tools for the press result). Wiring-deletion check.

## Security Review

No new inputs, files, processes or network. Fixtures are trimmed copies of a local run (no ROM bytes; RAM fields dropped).

## Milestones

**M1 — Push-back loop guard + press result**
- [x] RED: replay tests for both fixtures (ON fires; OFF silent), synthetic negative cases, press-result tests, registry/factory tests
- [x] COMMIT RED (SHA in the session log)
- [x] GREEN: switches registered, LoopDetector tracker, auto-advance press result, wiring (live, decision-probe, play-config)
- [x] Wiring-deletion checks
- [x] COMMIT GREEN (SHA in the session log)

**M2 — Battle observation loop (scope addition 3, own switch `battle-observation-loop-v1`)**
- [ ] RED: replay of sh02 seq 9850–11960 (270 observes in a static wild battle) fires an observation warning ON, silent OFF; a battle that advances on its own between observes never counts; registry/factory
- [ ] COMMIT RED
- [ ] GREEN
- [ ] COMMIT GREEN

**M3 — Close**
- [ ] Observability: loop_guard recorded, delivered via context(), visible in timeline/replay
- [ ] Explainer(s) + FEATURE_EXPLAINERS mapping
- [ ] Gates: test, lint, build, coverage (90), verify-vendor
- [ ] Principles self-review
- [ ] Review: Claude, Codex, Grok — LGTM each
- [ ] Merge main, re-run gates, local merge into main

## Closing the Loop

Merge locally after all lanes LGTM. No pending experiment entry (amendment 2). Report: switch ids for the coordinator to mark ON in both bundle-v-control arms. Viewer not restarted (brief: do not restart the viewer).

## Session Log

- 2026-10-16 02:55 AM EDT: Worktree on `claude/pushback-loop-guard` from 917fd9a1. Root causes confirmed by replay (above). Fixtures `packages/agent/src/fixtures/pushback-twin-sh02.jsonl.gz` (seq 2880–3720) and `pushback-birch-sh02.jsonl.gz` (seq 5880–7345), trimmed: state events without navigation grid, interaction targets, local map, raw RAM and heavy resources; tool result text cut at the first blank line (press echo, press result, navigation status, auto-advance summary).

- 2026-10-16 03:10 AM EDT: RED. `pushback-loop-detection.test.ts` (12 of 22 fail: every ON push-back case and the registry; OFF silence on both fixtures and the add-nothing negatives pass today), `pushback-press-result.test.ts` (10 of 13 fail; the three OFF cases reproduce the recorded text exactly: Birch `moved (7,15) -> (6,15)` then `conversation restarted … (2nd time)`, twin `locked (field controls locked in a snapshot; no net movement)`), `live-world-features.test.ts` factory test (both arms fail: the preset does not know the switch), `decision-probe-live.test.ts` AUTO_TEXT line.

- RED commit d89716cc.
- 2026-10-16 03:25 AM EDT: GREEN M1.
  - `LoopDetector` gets `pushback` (constructor 7th, `attachLoopGuard` 8th argument), wired from `features["pushback-loop-detection-v1"]` in live.ts and decision-probe.ts. The tool call's own args are kept as `requested` so auto-advance's B never becomes the action. A settled state event or a settled before state seeds the anchor when no trip is under way.
  - `pushbackPressResult` in press-result.ts, applied in `withDialogueAutoAdvance` when auto-advance ran and `toolSwitches(features).pushback`. decision-probe's AUTO_TEXT lists the switch (an auto-advanced result is kept as recorded, and flipping the switch is refused).
  - Design change from the plan: `pushback-press-result-v1` has `needs: null` (inert without auto-advance). With `needs: dialogue-auto-advance-v1`, every ALL_ON-derived preset that turns auto-advance off failed validation (experiment-gate, state-runtime tests).
  - Receipts (replay through attachLoopGuard with the run's own switches and a supervisor): twin ON warning + supervisor T146 seq 3062 (evidence 2973, 3062: the push-backs of T142 and T146), re-brief T152/T158/T164/T170, recovered T173 seq 3693 (navigate_to reached (12,9)); OFF none. Birch ON warning + supervisor T265 seq 6011 (evidence 5951, 6011), re-brief every 6 calls T271–T307, recovered T310 seq 7333 (STARTER_CHOSEN); OFF none. No stop in either.
  - Wiring/guard deletions (each red once, restored): live.ts argument dropped → factory test (true arm) red; `switches.pushback===true&&engaged` → `false` → 3 ON press tests red; play-config `pushback` dropped → 4 red; `!trip.left` dropped → "conversation read in place" red; `!trip.scripted` dropped → passed at first (the one-call door case was masked by the existing ineffective hit), so the door negative became a two-call LEFT/RIGHT bounce through animation locks, which then went red; restored.
  - Registry churn: `.at(-N)` positions +2 (features, battle-triage, blocked-batch, dialogue-auto-advance, dialogue-context-kept, transition-loop tests), group counts guidance 28 / guard 13, switchboard rows 60, presets/next-run expectations.
  - Tests: agent 1444 passed; viewer 801 passed. Lint (tsc + eslint, both packages) clean.

- GREEN M1 commit d17b71dc (it also picked up the M2 fixture `battle-observe-sh02.jsonl.gz`, staged early).
- 2026-10-16 03:35 AM EDT: scope addition 3 (the operator via coordinator): 270 observes in a wild battle, T445–T716, no loop guard. Root cause confirmed by replay of sh02 seq 9850–11960 through attachLoopGuard with the run's switches: zero notices. `semanticState` returns null for `in_battle`, so the observation counter compares null and resets to 0 on every observe. The battle object is byte-identical in all 268 state snapshots from seq 10056 to 11928 (phase resolving, turn 3, Wingull 0/13 HP, same script_pc, controller flags, signals and input state): the game waits for A while the readout says resolving (that readout text is owned by claude/battle-text-auto-advance; env/pokebench_env/battle_details.py untouched here).
  - Design: own switch `battle-observation-loop-v1` (guard, needs null): it acts on a different surface (battle) and kind (observation) than the push-back tracker. ON, an observe whose battle readout (the whole decoded battle object, active UI, party, message) equals the previous game call's counts as an unchanged observation; any changed field (script pointer, controller flags, HP, turn, inputs, signals, execution) is the battle advancing and restarts the count. A decoder diagnostic or a missing battle readout never counts. A battle state not seen in the last 16 is novel and recovers the episode.
- 2026-10-16 03:40 AM EDT: RED M2. `battle-observation-loop.test.ts` (5 of 13 fail: the replay warning and recovery, four unchanged observes, recovery, registry; OFF silence and every advancing-battle negative pass today), factory test both arms (preset does not know the switch).

- RED M2 commit e86af861.
- 2026-10-16 03:55 AM EDT: GREEN M2. `battleState()` in loop-detection.ts; `LoopDetector` 8th / `attachLoopGuard` 9th argument `battles`, wired from `features["battle-observation-loop-v1"]` in live.ts and decision-probe.ts. Registry: guard, needs null, recorded last; presets, flagFeatures and next-run default false.
  - Receipt (replay, run's switches + supervisor): ON warning + supervisor T452 seq 10079 (fourth identical observe, T449–T452), supervisor every 6 calls to T716 (45 briefings), recovered T717 seq 11945 (the press moved the battle on); OFF none. No stop.
  - Wiring/guard deletions (each red once, restored): live.ts argument dropped → factory test (true arm) red; the battle comparison in the observation counter dropped → 4 battle tests red.
  - Sweep of the 60 most recent runs (OFF vs each switch ON, warnings/stops only): push-back adds sh02 T146/T265 and two others, both checked by hand and real: 939e T341 (the twin push-back without auto-advance, UP then A×3–4, (10,1)→(10,2)) and 9d86 T470 (Birch, LEFT,A,A ×3, (7,15)→(6,15)→(7,15)). Battle adds only sh02 T452. Limit: only sh02 (284) and show (1) have in-battle observes among those runs; sh02's battle changed between 15 consecutive in-battle observes outside the static stretch and none of those counted.
  - Positions +1 again (now +3 overall), guard count 14, switchboard rows 61. Tests: agent 1459 passed, viewer 801 passed; lint clean.

- GREEN M2 commit a0cb78b5.
- 2026-10-16 04:05 AM EDT: M3 explainers and observability.
  - Explainers `docs/explainers/pushback-loop-detection-v1.html`, `pushback-press-result-v1.html`, `battle-observation-loop-v1.html` (inline CSS/SVG, `just pages-check` prints nothing), README entries, `FEATURE_EXPLAINERS` mappings (panels.ts) with panels tests (mapped file exists, renders a body heading).
  - Observability trace: producer `LoopDetector` → `attachLoopGuard` → `RunRecorder.recordLoopGuard` (schema-validated; the factory tests run the real recorder and RunLog, and the replay tests `checkEvent` every notice) → model delivery through `piLoop`'s `transformContext`, which appends `loopDetector.context()` before every model call (unchanged seam, proven kind-agnostically by `loop-integration.test.ts`; the replay tests assert the SUPERVISOR text is what `context()` returns at the next turn_start) → viewer `RunView` timeline/Activity History label and replay cursor (new `model.test.ts` case with the sh02 receipts: "Short cycle warning · … · evidence #2973, #3062 · enforced", "Observation stall warning …", hidden before its time with `foldUntil`). No viewer code changed; the existing kinds `cycle` and `observation` carry the new hits. No live viewer session was started (brief: do not restart or launch the viewer).

- Explainers commit bf04fe56.
- 2026-10-16 04:20 AM EDT: gates on the branch (after a comment-only fix in loop-detection.ts: the `pushedBack` doc comment had landed above `settled`). The worktree had no vendor submodule checked out (10 pytest failures, FileNotFoundError on `map_groups.json`); `git submodule update --init` checked out the pin bbab97ad.
  - `just build` OK; `just test`: agent 1459 passed, viewer 802 passed, pytest 2042 passed; `just verify-vendor` OK.
  - `just coverage` OK: agent lines 99.1 / branches 94.73 / functions 98 (loop-detection.ts 98.49 / 97.57 / 100; press-result.ts 100 / 99.22 / 100); viewer lines 97.62 / branches 90.47 / functions 93.6; python lines 97.09 / branches 92.70 / functions 100.
  - `just lint`: tsc, eslint, ruff and ruff format clean; mypy fails only on `pokebench_env/memory_reader.py:83` (`mgba._pylib` not found: this worktree has no native mGBA binding; the same known worktree gap as the transition-loop worklog). Re-run in the main checkout after the merge.
  - Principles self-review: all 13 rows scored, zero FAIL (review packet artifact).

## Surprises

- `loop_guard` evidence is capped at 2 items by the event schema (`maxItems:2`); a 3-seq evidence list made the recorder throw in the factory test. Evidence is now [first push-back, completing call]. The replay tests validate every notice through `checkEvent`.
- An existing registry assertion pattern, `expect(array).not.toContain(expect.stringContaining(...))`, is vacuous (`toContain` does not use asymmetric matchers). The new tests use `toContainEqual`. Not changed in older tests (Boy Scout candidate).
- The auto-advance B presses overwrite the call's before state and its action in `LoopDetector.observe` (root cause b). Every loop kind that reads before/action is blind to auto-advanced calls, not only push-backs.

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive

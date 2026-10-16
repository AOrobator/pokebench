# disproved-beliefs-v1 and same-plan-breaker-v1

Asked by the operator 2026-10-16 (relayed by the parent session, 03:20 AM EDT) after `runs/reports/cook-run2-forensics.html` sections 1–7 on the live run `2026-10-16T02-23-17_qwen36-gpu1_sh02` (read-only; analysed from a snapshot copy up to seq 17052, turn 1009, taken 03:17 AM EDT). Branch `claude/beliefs-and-same-plan` in its own worktree. Two default-off switches, both meant for the bundle arm of bundle-v-control (the bundle file is owned by another thread and is not edited here). Standing merge OK once Codex, Grok and Claude approve and every gate passes.

## Problem Statement

1. **The model acts on beliefs the game already contradicted.** It went to Birch's lab three times (T79, T122, T227) after the lab's scientist said at T98 "The PROF's away on fieldwork. Ergo, he isn't here." and while every lab readout said "Not on this map: PROF. BIRCH". Inside the lab it placed Birch on tiles (T81–T91, T124–T125: "Prof. Birch is at (7,7)"). It pressed UP at (11,1) 15 times (T142–T170) although the twin's script moved it back to (11,2) each time. On Route 101 the "Don't leave me like this!" script moved it from (6,15) back to (7,15) 47 times (T261–T307).
2. **The same plan, word for word, while the game does not move on.** In T142–T171 and T263–T307 the stated plan was near-identical every turn and the state only repeated. The loop guard was silent for both (fixed separately on `claude/pushback-loop-guard`).

## Skills Loaded

feature-worklog, feature-switch, feature-explainer, experiment-queue, agent-observability, pokebench-game-state (character presence and coordinate scripts), multi-model-review (cloud lanes only: Codex, Grok, Claude; no think_fast/think_swarm by operator instruction).

## Architecture

### Switch 1: `disproved-beliefs-v1` (guidance, default off)

A new module `packages/agent/src/disproved-beliefs.ts` watches the recorded event stream and keeps a ledger. Before each model call, when the ledger has entries, it appends one user message, recorded as a new `belief_ledger` event (text, entry count, evidence seqs):

```
Things the game has contradicted (from this run's readouts and dialogue; an entry is dropped when a story flag changes or the game shows otherwise):
- <pursuit> | <game evidence>
```

Each entry pairs what the model pursued with the game's evidence against it, both from recorded data. Two sources, chosen because they are the two failures of this run and both sides are observable:

- **Scripted push-back (tool args + game positions).** A press or navigate_to call during which a script showed dialogue (dialogue-auto-advance-v1 pages) that began with the player at tile Q, and the call ended on the same map one tile away at R, moved back against the direction the model was going: for a press, Q→R is opposite to a direction it pressed; for navigate_to, R is closer than Q to where the walk began. While a message is open the harness presses only A/B, so the move from Q to R is the game's own. Pursuit: "moving D from Q in <map>", with every turn and the latest action. Evidence: the pages shown, whole, with speaker labels, and the tile R. Run: T59 (Mom stops the player leaving before the bedroom), T142–T170 (twin), T261–T307 (Birch's "Don't leave me").
- **Absent story character (model text + character-presence-v1 readout).** A reply whose text places a story character on a tile ("Prof. Birch is at (7,7)") while the readout the model had just been shown said "Not on this map: …, PROF. BIRCH, …". Conservative text rule: the name must be one of the readout's own names in its "Not on this map" list, matched case-insensitively, where the game's abbreviation `PROF.` also matches `Prof.` and `Professor`; not possessive ("Birch's lab"), not a sprite kind (underscores: `RIVAL_MAY_NORMAL`), not inside parentheses (a label the model gives another person, e.g. "a woman (MOM)"), followed in the same sentence by `at (x,y)` with no negation (`not`, `n't`, `never`, `no longer`, `away`) between. Pursuit: the whole sentence, with every turn it was made. Evidence: the readout's whole "Story characters here … Not on this map …" line with its turn, plus any conversation shown on that map whose pages name the character (whole pages: T98's scientist "Hunh? PROF. BIRCH?" … "The PROF's away on fieldwork. Ergo, he isn't here." …).

Considered and not used: navigate_to targets and entered maps carry no claim about who is there (the lab trips are visible only in the text naming Birch); refusals by navigate_to are already explained per call by navigation-refusal-reasons-v1.

**Leaving the ledger.** An entry is dropped when the game state changes so that it may no longer hold: any story flag in the recorded state (`state.story`, RAM) differs from when the entry was made; a later readout on that map lists the character as here; the player is later seen on the tile the push-back kept it from. So the T79–T125 Birch entry stands until RIVAL_MET (T222) changes the story, and the twin entry until the same change moves the twin. T227's third lab trip comes after that change, so the old entry is not shown there; a new one starts only if the model again places Birch on a lab tile.

**Never clipped.** Quotes, page lists and turn lists are whole.

### Switch 2: `same-plan-breaker-v1` (guard, default off, needs deterministic-loop-guard-v1)

A new module `packages/agent/src/same-plan.ts`, attached by `stallBriefing(...)` in `play-wiring.ts` (the production factory both `live.ts` and the decision probe already call), posts through the existing `LoopDetector.stall()` supervisor-note path with a new stall kind `same_plan` (loop-detection.ts: one type member; events.ts: one enum member; viewer: one label). loop-supervisor.ts is not edited.

- **Decision**: an assistant reply with at least one tool call. **Plan**: its thinking and text, joined by a newline.
- **Similarity** (deterministic): lowercase; tokens are runs of `[a-z0-9]` or single other non-space characters; similarity = 2·LCS(tokens)/(|a|+|b|). Near-identical: ≥ 0.80 for every pair of the 3 latest plans.
- **Game state** after each decision (the state its last tool result cites): screen, map, position, facing, field-control lock, story flags, party (species, level, HP, status), battle (phase, turn, outcome, battlers' species/HP/status), active UI phase/selection/value and dialogue text. Only started overworld states with map, position and facing, or battle states whose input is ready, qualify; anything else (intro, naming, unknown) withholds the note.
- **Did not change**: none of the 3 decisions reached a state outside the two states just before them (after the 4th and 5th latest decisions), and at least one of those 5 states had field controls free (or battle input ready). This covers both the Route 101 stall (one state) and the twin's two-state bounce ((11,1) locked by the trigger ↔ (11,2) free), and excludes the truck ride (locked throughout) and walking (new tiles).
- **Note** (factual, the plan whole): `SUPERVISOR: Your last 3 plans (turns a, b, c) were the same and the game state did not change: <plan>`; for a two-state bounce, `… and the game state did not change beyond going back and forth between <A> and <B>: <plan>`. Re-armed after 3 more decisions.

## Invariants

- INV-1: OFF is byte-identical: no message, no event, no tool, same prompt. Test: OFF runs the production factories over the same events and compares the delivered context and recorded events.
- INV-2: Every ledger entry has both sides from recorded data (tool args/positions/pages or readout lines/model text with turn). Test: production-shaped fixtures from the run.
- INV-3: Entries and plans are never clipped. Test: long quotes and 40+ turn lists survive whole.
- INV-4: Entries leave on story change, on the character being listed here, and on the player reaching the refused tile. Test each.
- INV-5: The same-plan note never fires when any of the 3 decisions reached a new state, or when no state is qualified. Test: walking, battles, truck, intro.
- INV-6: Wiring: deleting the factory call turns a factory-level test red (recorded below).

## Security Review

No new inputs from outside the process: both modules read recorded run events. No subprocesses, files or network. Regexes are linear (no nested quantifiers); LCS is O(n·m) on two plans of at most the model's max_tokens.

## Milestones

**M1 — RED**
- [x] Tests: registry/presets/defaults for both ids; ledger push-back and absent-character entries from fixtures cut from the run (T59, T81–T98, T142–T146, T261–T264); retirement cases; never-clipped; OFF identity; same-plan fires on T142–T146 and T263–T266 fixtures, not on walking/battle/truck; wiring tests
- [x] COMMIT: `test: RED disproved-beliefs-v1 ledger and same-plan-breaker-v1 note on run sh02 fixtures` (cefa4a7c)

**M2 — GREEN**
- [x] Modules, registry, presets, DEFAULT_NEXT_RUN, events schema (`just schema`), recorder, decision probe, viewer labels
- [x] Gates: test, lint, build, coverage ≥90
- [x] Replay on the run snapshot: entries and precision, same-plan firings and false positives; before/after excerpts via the decision probe
- [x] COMMIT: `feat: disproved-beliefs-v1 ledger of what the game contradicted and same-plan-breaker-v1 supervisor note (both default off)` (c33cb859)

**M3 — explainers, pending experiments, review, merge**
- [x] Two explainers + FEATURE_EXPLAINERS + README; pending `experiments/disproved-beliefs.json`, `experiments/same-plan-breaker.json`; readiness rows
- [ ] Principles self-review; Codex, Grok, Claude until LGTM
- [ ] Merge latest main, re-run gates, merge to main (standing OK), repin source.commit

## Closing the Loop

Report per switch: id, model-facing before/after excerpts from this run, precision and false positives, test and coverage numbers, review verdicts, merge SHA, explainer links, pending experiment ids.

## Session Log

- 2026-10-16 03:22 AM EDT: design drafted from the run snapshot (prototypes in the session scratchpad: push-back finds T59, T142–T170 (15 calls), T261–T307 (47 calls); claims find Birch in the lab T81–T91, T124–T125 and two rejected candidates, "a woman (MOM) at (8,7)" T177–T178 and "RIVAL_MAY_NORMAL has appeared at (2,5)" T221; same-plan at 0.80 fires on T144–T171, T264–T307 and three Route 103 stalls (T780, T800–T804, T810), and on nothing else in 1006 decisions). Approved by the parent session relaying the operator's request; proceeding to M1.

- 2026-10-16 03:40 AM EDT: RED. `packages/agent/src/disproved-beliefs.test.ts` (15 tests) and `same-plan.test.ts` (12 tests) on the new fixture `packages/agent/test-support/beliefs-sh02.json` (970 real events of sh02, turns 48–62, 72–126, 140–148, 168–172, 212–216, 219–228, 257–266, 316–322, 846–853; states reduced to the fields the modules and schema read). With the implementation set aside, both files fail: `Cannot find module './disproved-beliefs.js'` / `'./same-plan.js'`.

- 2026-10-16 04:05 AM EDT: GREEN. `disproved-beliefs.ts` (DisprovedBeliefs, `disprovedBeliefs` factory appended last in `contextTools`' chain; new `belief_ledger` event; recorder `recordBeliefLedger`; decision probe Replay/DERIVED/recordedNotes), `same-plan.ts` (SamePlanBreaker attached by `stallBriefing(...)` in play-wiring; `StallKind` and the events enum gain `same_plan`), registry (`disproved-beliefs-v1` guidance needs null; `same-plan-breaker-v1` guard needs deterministic-loop-guard-v1; appended last in SWITCHABLE_FEATURES/FEATURES/playHarnessFeatures; `disproved-beliefs-v1` joins stateOnlyProblems), presets and DEFAULT_NEXT_RUN false, viewer (model kinds and loop label, trace label/MEM, panels event text, timeline marker), tail. Schema regenerated. Positional/count tests shifted by two (switch rows 60→62, guidance 27→28, guard 12→13); `readout-rules.test.ts` now checks that entry's incumbent names every switch up to and including its own (its file is not edited).
  - Wiring-removal checks: `chain=hinted` (ledger not in contextTools) → 7 ledger tests red; removing the SamePlanBreaker attach in stallBriefing → 4 same-plan tests red; not appending the ledger message → 7 red; not recording `belief_ledger` → 6 red. All restored, green.
  - Gates: `just coverage` exit 0: agent 1460 tests, 97.82 stmts / 94.48 branches / 98.17 funcs / 99.08 lines; viewer 822 tests, 95.19 / 90.63 / 93.55 / 97.65; Python 2132 passed, lines 97.14 branches 92.80 functions 100. New modules: disproved-beliefs.ts lines 100 branches 92.26; same-plan.ts lines 100 branches 91.81. `just lint`: tsc, eslint, ruff clean; mypy only the known worktree `mgba._pylib` import-not-found. `just build` green.
  - Full-run replay (snapshot, 1006 decisions, turns 1–1009): the ledger made 4 entries, all true contradictions (precision 4/4): Mom's push-back at Brendan's front door (T59, dropped T61 when intro_stage 4→5), PROF. BIRCH placed on lab tiles (T81–T89, T124–T125; dropped T214 when rival_stage 0→2), the twin's push-back (15 tries T142–T170; dropped T214), Birch's Route 101 push-back (47 tries T261–T307; dropped T335, birch_lab_stage 0→2). Delivered on 206 model calls. Rejected candidates: "a woman (MOM) at (8,7)" (parenthetical, T177–T178), "RIVAL_MAY_NORMAL has appeared at (2,5)" (sprite kind), "The scientist (Prof. Birch) is at (8,3)" (parenthetical, a true belief lost by the conservative rule). Missed: T225–T228's third lab trip (no tile claim; the entry had been dropped at T214).
  - Same-plan full-run replay: 28 notes (twin T144–T171 ×10, Route 101 T264–T306 ×15, Route 103 T780, T800, T803), all in windows where none of the 3 decisions reached a new state; 0 in walking, battles, truck or intro. Near-identical plan windows (≥0.80) number 398 of 1006 decisions; the state rule suppresses all but 79, and re-arming every 3 decisions leaves 28 notes. ON shifts the T171 drought briefing to T172 (the same-plan note occupied the stall slot); every other guard event is identical to OFF.

- 2026-10-16 04:10 AM EDT: M3 RED: `panels.test.ts` asserts both cards link their explainers and the tracked pages carry the run's own ledger line and note; `server.test.ts` serves both through the allowlist. Both fail (no mapping, no files).

- 2026-10-16 04:25 AM EDT: M3 GREEN. `docs/explainers/disproved-beliefs-v1.html` and `same-plan-breaker-v1.html` (inline CSS/SVG; replayed T147 ledger and T144/T264 notes from sh02, sources/retirement/wiring diagrams, entry lifespans, measurements, status); `just pages-check` prints nothing. FEATURE_EXPLAINERS and README entries. Pending `experiments/disproved-beliefs.json` and `same-plan-breaker.json` (incumbent = readout-rules-in-prompt's with both new ids false; activation PLAYER_NAME_CONFIRMED; provisional source.commit c33cb859), `experiment-cli check`: ok, 55 experiments. Readiness rows PENDING. Viewer 823 tests.

- 2026-10-16 04:40 AM EDT: merged main (da8993aa: explorer-guidance-v1, the timeline-closed rule, the self-merge rule). Conflicts in the registry and its positional tests resolved by taking main's files and re-appending both switches after explorer-guidance-v1 (end-relative positions shifted by two; guidance and guard counts one more each than main's). Following CLAUDE.md's new rule (the timeline is closed to additions), the belief_ledger timeline marker is dropped: the ledger shows in Activity History, the agent trace and raw inspection only; the viewer test now asserts the timeline carries nothing of it, and the explainer says so. Experiment incumbents regenerated in registry order with explorer-guidance-v1 explicit. Gates after merge: agent 1469 tests 97.83/94.49/98.17/99.08; viewer 826 tests 95.19/90.64/93.55/97.64; Python 2132 passed, 97.14/92.80/100; lint clean except the known mypy `mgba._pylib`.

- 2026-10-16 04:50 AM EDT: merged main again (3c51c547: connection-edge-tiles-v1). Same resolution: main's registry files, both switches re-appended after connection-edge-tiles-v1, end-relative asserts +2, counts +1, server explainer list resolved to main's plus both ids, `dialogue-context-kept.test.ts` stub keeps `recordBeliefLedger`. Experiment incumbents regenerated in registry order (connection-edge-tiles-v1 explicit off); `experiment-cli check`: ok, 56. Gates: agent 1480 tests 97.85/94.46/98.27/99.09; viewer 827 tests 95.19/90.64/93.55/97.64; Python 2162 passed 97.15/92.87/100; lint clean except the known mypy `mgba._pylib`.

## Surprises

- The twin's coordinate trigger leaves the player at (11,1) with field controls locked and no message; the push back to (11,2) happens on the next press. A state-equality rule over one decision never sees this loop; a two-state rule does.

## Multi-Model Review Log

- `tests/env/test_warp_arrival_settle.py::test_the_default_warp_bound_is_used_in_frames` failed once under full-suite load (301 vs 300 frames) and passes alone 3/3; pre-existing, Python untouched here. Left for its owner.

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive

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
- [ ] COMMIT (RED)

**M2 — GREEN**
- [ ] Modules, registry, presets, DEFAULT_NEXT_RUN, events schema (`just schema`), recorder, decision probe, viewer labels
- [ ] Gates: test, lint, build, coverage ≥90
- [ ] Replay on the run snapshot: entries and precision, same-plan firings and false positives; before/after excerpts via the decision probe
- [ ] COMMIT (GREEN)

**M3 — explainers, pending experiments, review, merge**
- [ ] Two explainers + FEATURE_EXPLAINERS + README; pending `experiments/disproved-beliefs.json`, `experiments/same-plan-breaker.json`; readiness rows
- [ ] Principles self-review; Codex, Grok, Claude until LGTM
- [ ] Merge latest main, re-run gates, merge to main (standing OK), repin source.commit

## Closing the Loop

Report per switch: id, model-facing before/after excerpts from this run, precision and false positives, test and coverage numbers, review verdicts, merge SHA, explainer links, pending experiment ids.

## Session Log

- 2026-10-16 03:22 AM EDT: design drafted from the run snapshot (prototypes in the session scratchpad: push-back finds T59, T142–T170 (15 calls), T261–T307 (47 calls); claims find Birch in the lab T81–T91, T124–T125 and two rejected candidates, "a woman (MOM) at (8,7)" T177–T178 and "RIVAL_MAY_NORMAL has appeared at (2,5)" T221; same-plan at 0.80 fires on T144–T171, T264–T307 and three Route 103 stalls (T780, T800–T804, T810), and on nothing else in 1006 decisions). Approved by the parent session relaying the operator's request; proceeding to M1.

- 2026-10-16 03:40 AM EDT: RED. `packages/agent/src/disproved-beliefs.test.ts` (15 tests) and `same-plan.test.ts` (12 tests) on the new fixture `packages/agent/test-support/beliefs-sh02.json` (970 real events of sh02, turns 48–62, 72–126, 140–148, 168–172, 212–216, 219–228, 257–266, 316–322, 846–853; states reduced to the fields the modules and schema read). With the implementation set aside, both files fail: `Cannot find module './disproved-beliefs.js'` / `'./same-plan.js'`.

## Surprises

- The twin's coordinate trigger leaves the player at (11,1) with field controls locked and no message; the push back to (11,2) happens on the next press. A state-equality rule over one decision never sees this loop; a two-state rule does.

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive

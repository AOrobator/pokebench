# disproved-beliefs-v1 and same-plan-breaker-v1

Asked by the operator 2026-10-16 (relayed by the parent session, 03:20 AM EDT) after `runs/reports/cook-run2-forensics.html` sections 1–7 on the live run `2026-10-16T02-23-17_qwen36-gpu1_sh02` (read-only; analysed from a snapshot copy up to seq 17052, turn 1009, taken 03:17 AM EDT). Branch `claude/beliefs-and-same-plan` in its own worktree. Two default-off switches, both meant for the bundle arm of bundle-v-control (the bundle file is owned by another thread and is not edited here). Standing merge OK once Codex, Grok and Claude approve and every gate passes.

## Problem Statement

1. **The model acts on beliefs the game already contradicted.** It went to Birch's lab three times (T79, T122, T227) after the lab's scientist said at T98 "The PROF's away on fieldwork. Ergo, he isn't here." and while every lab readout said "Not on this map: PROF. BIRCH". Inside the lab it placed Birch on tiles (T81–T91, T124–T125: "Prof. Birch is at (7,7)"). It pressed UP at (11,1) 15 times (T142–T170) although the twin's script moved it back to (11,2) each time. On Route 101 the "Don't leave me like this!" script moved it from (6,15) back to (7,15) 47 times (T261–T307).
2. **The same plan, word for word, while the game does not move on.** In T142–T171 and T263–T307 the stated plan was near-identical every turn and the state only repeated. The loop guard was silent for both (fixed separately on `claude/pushback-loop-guard`).

## Skills Loaded

feature-worklog, feature-switch, feature-explainer, experiment-queue, agent-observability, pokebench-game-state (character presence and coordinate scripts), multi-model-review (cloud lanes only: Codex, Grok, Claude; no think_fast/think_swarm by operator instruction).

## Architecture

### Switch 1: `disproved-beliefs-v1` (guidance, default off, needs story-state-v1 since review round 1)

Review round 1 changes to the rules below: names match the readout's spelling or title case only (MAY or May, never "may"); a negation or hedge anywhere in the sentence (not, n't, never, no longer, away, might, maybe, perhaps, probably, possibly, likely, if, whether, unsure, unclear, may, could) rejects it; the push-back wording is "Each time a script moved you back to R; the latest time (turn N) it showed: …".

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

### Round 2 (cumulative packet main 1e1feec9..dcb45ee2 excluding the fixture, SHA-256 4305e88a…10ac; fix delta e29510e3..fa456f63, SHA-256 e48b63ea…e915; principles unchanged, 0 FAIL)

- Claude CLI: LGTM.
- Codex (gpt-5.6-sol): BLOCKING. (1) capitalized hedges ("Could Professor Birch be at (7,7)") and questions ("Is Professor Birch at (7,7)?") still make claims; (2) a push-back direction is accepted when it appears anywhere in a batch, not bound to the input that met the script. Non-blocking: experiments still name c33cb859 (repin at landing); retained conversations survive a story change.
- Grok: BLOCKING, same as Codex (1) for "Could". Non-blocking: stale comment ("no negation between"); "Cannot" missed by `\bnot\b`; soft dependencies.
- Accepted: all; plus the conversation clearing and the comment. 2026-10-16 06:05 AM EDT round-2 RED: 3 failing tests (capitalized hedges/questions/cannot; first-direction binding; conversations dropped on story change). COMMIT (f606c67b).
- 2026-10-16 06:15 AM EDT round-2 GREEN: NEGATION is case-insensitive and adds cannot, could, would, should and "?"; MODAL is lower-case "may" only; a press push-back is bound to the call's first direction, with the pages beginning on the starting tile or one step from it in that direction; a story change also clears retained conversations; comment, description and explainer updated. Full-run replay unchanged (4 entries, all true). Gates: agent 1491 tests 97.85/94.45/98.27/99.09; viewer 852 tests 95.16/90.68/93.41/97.61; Python 2180 passed 97.16/92.88/100; lint clean (TS/eslint); pages-check silent. COMMIT (77d89c69).
- 2026-10-16 06:25 AM EDT: merged main 5fd00072 (battle-text-auto-advance-v1; normalized presets in registry order; run-tagged experiments). Same resolution: main's side of 19 files, both switches re-appended after battle-text-auto-advance-v1 (registry, presets, defaults, test lists), end-relative asserts +2, battle-text's key-order asserts now `.at(-3)`, counts +1, rows +2, server arrays extended, experiment incumbents regenerated. Gates: agent 1529 tests 97.89/94.43/98.31/99.11; viewer 868 tests 95.36/90.97/93.57/97.71; Python 2209 passed 97.26/93.01/100; lint clean (TS/eslint).

### Round 3 (cumulative main 5fd00072..6ca00330 excluding the fixture, SHA-256 c751e694…d9c9; fix delta dcb45ee2..77d89c69, SHA-256 eb10788b…7252)

- Claude CLI: LGTM. Grok: LGTM.
- Codex: BLOCKING. (1) push-back uses requested buttons, not sent ones (requested A,UP, sent A: an A-started script that moves the player down was "Moving UP"); (2) "Can Professor Birch be at (7,7)." is accepted; (3) same-plan labels include a state outside the window (A,B,A,A,A said "back and forth"); (4) the decision probe's recorded derivation puts the pinned hint before the ledger, while the production chain delivers the ledger first. Non-blocking: push-back evidence omits the tool_call/button_press seqs.
- Accepted all four and the non-blocking evidence item. 2026-10-16 06:55 AM EDT round-3 RED: 4 failing tests (sent inputs; modal questions; window-only labels; recorded note order), plus a passing test that pins the production order (ledger before hint). COMMIT (7c3881d9).
- 2026-10-16 07:05 AM EDT round-3 GREEN: the press push-back binds to the first direction in the auto-advance event's `sent` list; push-back evidence adds the tool_call seq; NEGATION adds `can` and a sentence-initial is/are/was/were/where/does/do/did/will; same-plan names only the states the 3 decisions ended in (twin note now reads "(11,2) facing up and … (11,1) facing up, field controls locked"); `recordedNotes` returns guard, belief ledger, hint, instruction ledger, memory. Explainers updated. Full-run replay unchanged: 4 entries, 206 deliveries; 28 same-plan notes; ON vs OFF guard events differ only by the T171→T172 drought briefing. Gates: agent 1534 tests 97.91/94.42/98.32/99.11; viewer 868 tests 95.36/90.97/93.57/97.71; Python 2209 passed 97.26/93.01/100; lint clean (TS/eslint); pages-check silent. COMMIT (e8a1a631).
- 2026-10-16 07:15 AM EDT: merged main 6d2be8af (F12: stall briefing knows the naming editor, new stall kind `interface_dwell`). Conflicts only in the stall-kind unions (events.ts, loop-detection.ts StallKind, viewer model/trace labels): both kinds kept; schema regenerated. Full-run same-plan replay unchanged (28 notes, same turns). Gates: agent 1538 tests 97.93/94.25/98.32/99.12; viewer 868 tests 95.36/90.97/93.57/97.71; Python 2209 passed 97.26/93.01/100; lint clean (TS/eslint).

### Round 4 (cumulative main 6d2be8af..4aa7c8d3 excluding the fixture, SHA-256 35e011bb…01fa9; fix delta 6ca00330..e8a1a631, SHA-256 e6ee65db…f569)

- Claude CLI: LGTM. Grok: LGTM.
- Codex: BLOCKING. (1) denials and hypotheticals outside the hedge list ("I doubt …", "There is no evidence …", "It is false that …", "Suppose …") still make claims: needs a positive assertion grammar; (2) a navigate_to push-back's direction is inferred from the script's move, not bound to the step the walk sent; (3) an overworld `active_ui` with a diagnostic or not ready still qualifies as a same-plan state.
- Accepted all three. 2026-10-16 07:45 AM EDT round-4 RED: 3 failing tests. COMMIT (d250a663).
- 2026-10-16 08:00 AM EDT round-4 GREEN: a claim is a plain assertion: the sentence opens with the name (or "The" and the name) as its subject, then is/stands/sits/waits/was (an appositive between commas allowed), then at (x,y); a navigate_to push-back needs the walk's last sent direction to be the direction pushed back; an overworld state whose active_ui has a diagnostic or is not ready withholds the same-plan note. Description and explainer updated. Full-run replay unchanged: 4 entries (all true), 206 deliveries; 28 same-plan notes. Gates: agent 1541 tests 97.94/94.29/98.33/99.12; viewer 868 tests 95.36/90.97/93.57/97.71; Python 2209 passed 97.26/93.01/100; lint clean (TS/eslint); pages-check silent. COMMIT (ef0c6be9).
- 2026-10-16 08:15 AM EDT: merged main 48d6b48f (battle-message-waiting-v1). Same resolution: main's side of 20 files; both switches re-appended after battle-message-waiting-v1 in the registry, presets (normalize and flag defaults), DEFAULT_NEXT_RUN and test lists; FEATURE_EXPLAINERS and the belief_ledger Activity History text re-added in panels.ts; end-relative asserts +2; battle-text's key-order asserts `.at(-4)`; experiment incumbents regenerated (`experiment-cli check`: ok, 60). Gates: agent 1546 tests 97.94/94.29/98.33/99.12; viewer 869 tests 95.36/90.97/93.57/97.71; Python 2234 passed 97.29/93.10/100; lint clean (TS/eslint).

### Round 5 (cumulative main 48d6b48f..67799193 excluding the fixture, SHA-256 c7c0ea42…b07b; fix delta 4aa7c8d3..ef0c6be9, SHA-256 691c96ed…270d)

- Grok: LGTM.
- Codex: BLOCKING: "Professor Birch, I think, is at (7,7)." and "Professor Birch is apparently at (7,7)." pass (comma phrase and anything between the verb and "at"). Non-blocking: cite the button_press seqs behind a push-back's direction.
- Claude CLI: BLOCKING: "Prof. Birch was at (7,7) in his lab.", "May is in her house at (14,8).", "Mom is downstairs at (8,2)." pass and would be false entries.
- Accepted: the verb must be is/stands/sits/waits, optionally followed by standing/sitting/waiting, then directly "at (x,y)"; no comma phrase; nothing placing the character elsewhere right after the tile (in, inside, on, upstairs, downstairs, outside, behind, near, next, of). This drops T81's "standing next to the red carpet at (7,8)" (a true claim; the entry still forms from T82). Push-back evidence adds the button_press seqs. 2026-10-16 08:50 AM EDT round-5 RED: 1 failing test. COMMIT (7f2ec848).
- 2026-10-16 09:05 AM EDT round-5 GREEN as accepted above; description and explainer (rule text, T81 row now "no", a row for the other-place and past-tense cases, 205 deliveries) updated. Full-run replay: 4 entries, all true contradictions; the Birch entry now starts at T82 (T81's sentence is rejected); delivered on 205 model calls. Same-plan unchanged (28 notes). Gates: agent 1547 tests 97.94/94.30/98.33/99.12; viewer 869 tests 95.36/90.97/93.57/97.71; Python 2234 passed 97.29/93.10/100; lint clean (TS/eslint); pages-check silent. COMMIT (e2c3c589).
- 2026-10-16 09:20 AM EDT: merged main 08fadf73 (script-line-presence-v1). Same resolution (scripted): main's side of 22 files, both switches re-appended after script-line-presence-v1, end-relative asserts +2, battle-text key-order asserts `.at(-5)`, explainer mapping and belief_ledger text re-added, experiment incumbents regenerated (ok, 61). `serial-comparison.test.ts` (real filesystem lock) failed once under the full run and passes alone 2/2; pre-existing, untouched. Gates: agent 1570 tests 97.95/94.36/98.34/99.13; viewer 870 tests 95.36/90.97/93.57/97.71; Python 2235 passed 97.29/93.10/100; lint clean (TS/eslint). COMMIT (1edb1aaa).
- 2026-10-16 09:30 AM EDT: merged main 115c3bfc (viewer workbench off-thread loading; viewer-only, no conflicts). Viewer 880 tests pass.

### Round 6 (cumulative main 115c3bfc..704d7258 excluding the fixture, SHA-256 6966b15d…50ce; fix delta 67799193..e2c3c589, SHA-256 7c901b55…620a)

- Codex: BLOCKING: trailing qualifiers ("…at (7,7), I think." / ", apparently." / ", under the table in her house.") and a later retraction in the same reply ("Actually, the readout says he isn't here") still make claims. Non-blocking: the experiment notes say 206 deliveries (205 now).
- Grok: BLOCKING: a comma before the place word ("May is at (14,8), in her house.") defeats the after-tile check.
- Claude CLI: BLOCKING: same (comma, dash, bracket, "back in the lab"); non-blocking: "earlier, but he left".
- Accepted: the claim must end at the tile (only "." or "!" may follow it), and a claim is dropped when the same reply names the character in any sentence with a negation or hedge. This also drops T124's "Professor Birch is at (9,8) and the scientist is at (9,9)." (the entry keeps T125). Experiment notes corrected. 2026-10-16 10:05 AM EDT round-6 RED: 1 failing test. COMMIT (33971d92).
- 2026-10-16 10:20 AM EDT round-6 GREEN as accepted; the never-clip test now checks long pages and a long readout line (a claim sentence is short by grammar). Full-run replay: 4 entries, all true; Birch claims at T82–T88 and T125; delivered on 205 model calls; same-plan unchanged. Gates: agent 1571 tests 97.93/94.33/98.35/99.13; viewer 880 tests 95.32/90.98/93.61/97.63; Python 2235 passed 97.29/93.10/100; lint clean (TS/eslint); pages-check silent.

## Surprises

- The twin's coordinate trigger leaves the player at (11,1) with field controls locked and no message; the push back to (11,2) happens on the next press. A state-equality rule over one decision never sees this loop; a two-state rule does.

## Multi-Model Review Log

### Round 1 (packet: diff --binary 3c51c547..e29510e3 excluding the 1.6 MB fixture, SHA-256 f4562284…6948ffe; principles self-review 11 PASS / 2 N/A / 0 FAIL)

- Codex (`codex exec -m gpt-5.6-sol --sandbox read-only`; the CLI default `gpt-6.1-sol` is refused for ChatGPT accounts): BLOCKING. (1) the pending experiment is inert: its incumbent has character-presence-v1 and dialogue-auto-advance-v1 off; (2) three empty plans compare as identical; (3) negation/hedges outside the name-to-tile span ("I don't know if Professor Birch is at (7,7)"); (4) retirement needs story state but no dependency is declared. Non-blocking: explainer `</head>` inside `<style>`.
- Grok (`cursor-agent --mode ask --model cursor-grok-4.5-high`): LGTM. Non-blocking: soft dependencies / inert standalone experiment; explainer head; "back and forth" can name one move; provisional source.commit.
- Claude (Claude CLI, default profile, `--permission-mode plan`): BLOCKING. B1 = Codex 1; B2 case-insensitive names make the word "may" match MAY. Non-blocking: empty plans; claims are tied to the current map; "Each time … while it showed" quotes only the latest pages; back-and-forth wording; same-plan wiring placement.
- Accepted: all four Codex blockers, Claude B2, the "Each time" wording, the explainer head. Deferred (non-blocking, recorded): a claim naming another map (no place parsing added); back-and-forth wording for a single return.
- 2026-10-16 05:15 AM EDT: round-1 RED: 5 failing tests (needs story-state-v1; 'may' and lowercase names; hedge anywhere in the sentence; experiment incumbent has both sources on; empty plans). COMMIT: `test: RED review round 1: …` (80f273a9)
- 2026-10-16 05:35 AM EDT: round-1 GREEN. `nameMatcher` per word: readout spelling or title case, PROF. as PROF/Prof/Professor, no `i` flag; NEGATION/MODAL tested on the whole sentence; push-back text "the latest time (turn N) it showed"; same-plan returns when any plan in the window is empty; `disproved-beliefs-v1` needs `story-state-v1` (description says why); `experiments/disproved-beliefs.json` incumbent turns on character-presence-v1 and dialogue-auto-advance-v1 (notes say so; readiness row updated); explainers: `</head>` no longer inside `<style>`, rule text, T89 and "may" rows, eyebrow. Preset fixtures with story-state off now also set the ledger off (play-preset.test, server-controls.test). Full-run replay unchanged: 4 entries (T89's "not walkable" sentence is now rejected, so the Birch entry's latest claim at T117 is T88), 206 deliveries; same-plan 28 notes. Gates: agent 1483 tests 97.86/94.47/98.27/99.09; viewer 827 tests 95.19/90.64/93.55/97.64; Python 2162 passed 97.15/92.87/100; lint clean (TS/eslint); pages-check silent. COMMIT: `fix: review round 1: …` (fa456f63)
- 2026-10-16 05:45 AM EDT: merged main again (1e1feec9: in-game-naming-readout-v1, no-nickname-guidance-v1, viewer baseline cache). Same resolution: main's registry files, both switches re-appended after no-nickname-guidance-v1, end-relative asserts +2 (auto-merged files had main's and this branch's identical +2 edits, so +2 again), counts +1, switchboard rows 64→66, server explainer arrays extended, experiment incumbents regenerated in registry order. Gates: agent 1488 tests 97.86/94.46/98.27/99.09; viewer 852 tests 95.16/90.68/93.41/97.61; Python 2180 passed 97.16/92.88/100; lint clean (TS/eslint).

- `tests/env/test_warp_arrival_settle.py::test_the_default_warp_bound_is_used_in_frames` failed once under full-suite load (301 vs 300 frames) and passes alone 3/3; pre-existing, Python untouched here. Left for its owner.

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive

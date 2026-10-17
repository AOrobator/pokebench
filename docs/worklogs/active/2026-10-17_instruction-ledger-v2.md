# instruction-ledger-v2: a tool-free conversation ledger inside the tool result

Operator decision (the operator, 2026-10-17 4:02 PM New York): drop dialogue-log-v1 and note_contradiction; build `instruction-ledger-v2`, bundle arm only, with an explainer page. Design from the PokeBench review in `runs/reviews/2026-10-17-tool-design/` (harness-engineer, eval-integrity, data-scientist, ml-engineer). Coordinator note: build it independent of harness-trust-v1's story-goal line and story-destinations-v1; show the speaker and turn for the pinned conversation ("MAY, turn 444").

Branch `claude/instruction-ledger-v2`, worktree `/private/tmp/pokebench-instruction-ledger-v2`, from main f5742c00. Stops before the review loop (coordinator brief).

## Design

- New switch `instruction-ledger-v2` (observation, needs `dialogue-auto-advance-v1`, default OFF everywhere). No model tool, no prompt line, no model-written text. instruction-ledger-v1 is untouched.
- A block inserted in every observe, press and navigate_to result on the free overworld, right after the readout's `Story:` line (after Location/Position without one), not a trailing user message.
- **Latest conversation**: the field pages of the latest dialogue_auto_advance call that reached the model and has at least one page with the game's own `NAME:` prefix (speaker_source `name_prefix`), whole, with its speakers and turn. Battle pages never count. No character list, milestone order or route knowledge (PB4). Faced sprites and faced objects are not names the game prints (sprite kinds, harness labels for signs and clocks); counting them pins MANIAC filler and signs (2fb4). Fallback: the latest field page, labelled as such.
- **Rooms visited**, newest visit first, each with the last field page heard there, keyed on the auto-advance page's own map (fixes v1, which compared the newest page seq with the tool result's state_seq and stays "nothing heard" under auto-advance).
- Whole text, no caps (no model-facing truncation). Line breaks in game text become spaces.
- Recorded through the tool_result text. No ledger_context event: decision-probe replays ledger_context as a trailing user message, which v2 is not.

## Milestones

- [x] M1 RED: recorded-run fixtures (93eb, 0e05, e962, defa, 2fb4) and failing tests: pinned speaker and pages, per-room last heard, placement, empty ledger, OFF byte-identical, factory wiring, registry/preset/default/explainer/experiment.
  - Fixtures `packages/agent/src/fixtures/instruction-ledger-v2-{93eb,0e05,e962,defa,2fb4}.jsonl.gz`: streamed from each run's events.jsonl up to the decision (93eb seq 2780, 0e05 1290, e962 10345, defa 9930, 2fb4 8330), keeping states (world context, targets, grid and party dropped), every dialogue_auto_advance, and tool results (text kept only near the decision).
  - Expected blocks computed by an independent Python oracle over the same fixtures, then read against the run scans: 93eb T134 and 0e05 T76 pin the MOM/INTERVIEWER TV conversation ending "He lives right next door"; e962 T445 pins MAY's four post-battle pages, T450 pins "Let's hurry home!" with ROUTE103 keeping "head back to the LAB"; defa T402 pins MAY in the delivering result while v1 shows ROUTE103 "nothing heard"; 2fb4 T321 keeps MOM turn 245 pinned over MANIAC's newer filler (v1 pins MANIAC).
  - Finding for the report: in 2fb4 the line that names ROUTE 103 came from May's mother, WOMAN_4, a faced sprite with no NAME: prefix, so the game-named rule does not pin it; it shows only as that room's last line ("Like father, like child..."), not even the ROUTE 103 page.
  - RED run: 19 of 22 new agent tests fail against the stub (3 pass: OFF identity, no prompt/tool change, v1 title); viewer explainer/default tests added.
- [ ] M1 GREEN: ConversationLedger + withInstructionLedgerV2 in playGameTools; registry, presets, flagFeatures, DEFAULT_NEXT_RUN, explainer, FEATURE_EXPLAINERS, pending experiment, readiness row. Gates: just test, lint, build, coverage >= 90.
- [ ] Wiring break check recorded.
- [ ] STOP before review (coordinator).

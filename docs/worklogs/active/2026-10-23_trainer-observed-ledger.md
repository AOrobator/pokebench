# Observed trainer Pokémon ledger

## Problem Statement
The operator authorized remembering observed Pokémon for every trainer and including them in retry recaps, without exposing unseen Pokémon. Follow-up explicitly requests a switch and bundle inclusion. In glm53-mac_0d5d, tool results 138432 and 138711 delivered WINGULL Lv18 and its faint before GROVYLE Lv20; the model later forgot WINGULL.

## Skills Loaded
feature-switch, feature-explainer, agent-observability, pokebench-game-state, close-the-loop, execute-worklog, talk-to-claude, multi-model-review.

## Architecture
Extend BattleOutcomes and its existing result-facts consumer. New trainer-observed-party-v1 defaults OFF, needs battle-loss-recap-v1, bundle ON/control OFF. Keep only opponent battlers whose species and level appeared in successful delivered tool results or decision input. Delivered faint pages can update already known opponents. State polling alone teaches nothing. Key by trainer ID and party slot; remember across attempts and milestones. Render historical observations, never a complete party claim. Two-opponent battles without per-trainer attribution are excluded. No new tool, event schema, route, move advice, ROM party lookup or live run mutation.

## Invariants
- INV-1: OFF result bytes unchanged; existing recap tests plus exact equality.
- INV-2: internal/failed/absent/ambiguous observations reveal nothing; delivery regressions.
- INV-3: ordinary trainers and leaders retain distinct slots and distinct IDs, including same names; replay tests.
- INV-4: memory survives retry and story milestones; historical fainting is labelled last observed.
- INV-5: bundle ON/control OFF; omitted presets OFF.

## Security Review
Read-only recorded game state and delivered text. No raw enemy party decoding, external service or new persistence surface.

## Milestones
- [x] M1: failing regressions and RED commit
- [x] M2: implementation, switch, bundle, explainer, full gates and GREEN commit
- [ ] M3: frozen cloud review, landing-board coordination, local merge and viewer proof if all required lanes approve

## Closing the Loop
Production playGameTools seam; historical May trace replay read-only; delete/restore wiring; themed explainer/card tests and background browser proof. No gameplay/inference launches authorized or needed.

## Session Log
- 2026-10-23: Scope authorized by operator's fix request and bundle follow-up. Isolated codex/trainer-observed-ledger branch; canonical checkout untouched.

## Surprises
- Detailed existing attempt memory only covers Gym Leaders and was OFF in the failing run.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive this worklog

- RED b9f792305: 6 failed / 3 passed, historical May memory, factory wiring and registry absent as expected. The background test finished immediately after commit dispatch; RED receipt retained at /tmp/trainer-red.log.

- GREEN evidence before main sync: agent 4065 tests, viewer 1764 tests, Python 4050 passed. Build and vendor checks passed. TypeScript coverage with 30s per-test deadline passed: agent lines 99.13%, branches 92.92%, functions 97.61%; viewer lines 98.03%, branches 91.60%, functions 95.16%. Default 5s instrumented run timed out in unchanged child-process suites under concurrent full-gate load and then cascaded through their teardown; no test/source policy altered. Lint and Python coverage finishing.
- Delivery predicate accepts only the matching Foe/Battler line, not a player's party or an unrelated text mention. Historical states omit trainer_opponent during some returned observations; same-battle identity comes from the existing BattleOutcomes running trainer owner. Wild battle types cannot inherit that trainer.
- Performed mutation receipts in runs/trainer-observed-preview/: removing delivery wiring caused 8 failures; failed-delivery guard 1; delivered-readout predicate 3; opponent-side predicate 5; ambiguous-owner guard 1. Restored code: all 12 new tests passed. Each receipt retained separately.
- Eight current bundle definitions enabled: bundle-v-control, bundle-cook-1h, whole-map-cook-1h, whole-map-pair-2h, bundle-v-control-2h, glm53-flash-4h and both gym-rustboro-torchic variants. Frozen older comparisons/control bases unchanged; factory armFeatureBits tests prove normalized bundle ON/control OFF.
- Coordinator reports ELEVATION then party-health own the next landing windows. No hold granted. Sync after their main moves; when number 1, this branch owns one viewer restart.

- GREEN commit c607081bc. Lint passed (TypeScript/ESLint, ruff, mypy). Initial standalone Python coverage command lacked POKEBENCH_ROM and failed fixture reads; rerunning with the same configured ROM used by just test, not changing tests.

- Browser proof: agent-owned headless Chrome, isolated scratch run root (original logs untouched), candidate viewer random port 65086. Harness Config card ON → READ EXPLAINER worked; desktop 1280/1440 and phone 375 screenshots inspected. Agent trace tool result and raw inspector contain reconstructed observed-opponent recap; original recorded frame displayed. No browser page errors; trainer-card art absent in scratch root. Phone source-revision overflow corrected and diagram made internally scrollable. Preview clearly labels reconstructed text, not a new measured run.
- Synced main favicon landing 1acc73468 into ecc9e426c; behavior delta unchanged.

- Syncing elevation/center landing 1389e21a5: preserved its registry order and added the memory switch last, kept both treatments in bundle definitions, regenerated historical tail-index assertions against current main plus this append. Python coverage: 4050 passed, lines 97.37%, branches 93.30%, functions 100%.

- Post-elevation agent tests: 4084 passed. First viewer rerun used pre-sync agent dist and rejected the two new main switches; rebuilt shared agent exports before rerunning viewer tests. This was build ordering, not a source fallback or test suppression.

- Round 1: Claude LGTM; GPT, Sol fallback and Astra fallback BLOCKING on the same real per-slot faint attribution bug in duplicate-species doubles. Fix classification: in-contract correctness defect, not expanded scope. Added two regressions (faint attribution and ambiguous compact Foe line); both fail on original implementation (12 pass, 2 fail). Fix uses paired state's fainted bit and only unique species/level compact candidates; numbered Battler lines remain slot-specific. Grok Cursor unavailable: account usage exhausted; no equivalent Grok harness exposed. Fallback reviews do not authorize self-merge.
- Current synced source gates before review fix: agent 4084, viewer 1766, Python 4065 passed; lint/build passed. Python coverage 97.37/93.30/100%. Latest TS instrumented suite hit unchanged serial-comparison 100ms watchdog before child stdout under load; retained full failure receipt, no test changes.

- Round 1 synthesis: all three GPT-family reviewers independently reproduced the same faint-slot bug; Claude missed it. No other confirmed blocker. Fix stayed inside original BattleOutcomes owner. New duplicate-compact-Foe regression enforces spoiler boundary conservatively; no new data source/tool/runtime domain.
- Round 2 deletion/restoration receipts: independently deleting MULTI operand failed 1 test; TWO_OPPONENTS operand 1; compact Foe delivery alternative 1; numbered Battler alternative 9; native faint-slot guard 1; compact unique-slot guard 1. Restored code passes all 14 feature tests. Receipts uniquely named r2-*.log; original round retained.
- Final Python coverage after main sync: 4065 passed, lines 97.37%, branches 93.30%, functions 100%. Final full TS gates rerun after the bounded review fix.

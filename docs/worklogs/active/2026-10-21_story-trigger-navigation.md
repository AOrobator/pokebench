# Navigation script boundaries

Authorized outcome: fix the trigger-policy contradiction; leave the active run untouched.

One milestone: allow a model-selected route to enter a matching coordinate trigger, then return control to the model after that step. No story classifier, hard-coded route, objective selection, live-run edits or launches. Existing terrain, object, trainer and input gates stay authoritative. New default-OFF switch preserves exact incumbent behavior. Consumers: navigate_to, navigate_to_target, recorded tool result/model feedback and feature card.

Evidence: ea04 turns 600–660, seq 22794–24576; 17 refusals across matching Rustboro var 0x405A=1. pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881 RustboroCity StolenGoodsTrigger0–4 leads to StolenGoodsScene and changes state to 2. General policy uses only current matching trigger coordinates; no hidden story knowledge is delivered.

- [x] RED regression and exact OFF contract
- [x] GREEN production wiring and semantic stop; adversarial deletion/restoration
- [ ] Gates and read-only replay on recorded Rustboro state
- [x] Explainer and pending experiment
- [ ] Principles and cloud review
- [ ] Landing and served proof, only through landing board

Implementation boundary: navigation.ts and semantic-navigation.ts if required, existing feature registration/preset/default owners, focused tests, explainer mapping/docs, pending experiment. No new runtime owner or event schema.

RED: ec21f9bf initially contained a test syntax error; corrected before production edits. Valid red run /tmp/trigger-red2.log: OFF passes, both ON cases fail (no action sent).

## Validation receipts

Focused factory tests: 11 cases (direct and semantic calls, settled scripts, collision, conditions/elevation, facing-only attempt, omitted presets, real Rustboro state and walking modifiers). The Rustboro replay is a planner replay using fake responses, not a new gameplay trial or proof of story completion. Its decoded fixture is seq 22793 with event envelope removed; original log/raw/frame untouched.

Adversarial deletion: /tmp/trigger-adversary-wiring.log removed the feature operand, 4 failures/6 passes. /tmp/trigger-adversary-stop.log removed the stop, 5 failures/5 passes. /tmp/trigger-adversary-restored.log restored both, 10 passes; one additional walking-modifier regression added afterwards. No source edits in the measured run.

Feature catalog append required mechanical position updates in older registry tests. Server-only registry positions and historical harness lists remain unchanged; the legacy ALL_ON fixture explicitly leaves the new treatment OFF. Historical experiment inventories exclude the appended switch rather than rewriting their source definitions.

Explainer: pages-check passes; 8791 candidate URL returned 200. Opened and inspected screenshots at 375, 1280 and 1440, saved under main runs/mockups/trigger-navigation-boundary-v1/shots. Phone diagram has its own horizontal scroll and source names wrap. Scratch viewer on 8793 against an excerpt of completed d548 (no approvals/ledgers/queue runner): HARNESS CONFIG -> SCRIPT TRIGGER BOUNDARIES -> Read explainer opened the tracked candidate document. Main viewer was not restarted. No new timeline marks or event schema.

Initial full test errors were missing worktree ROM configuration/native binding, corrected locally; initial TS gate errors were registry-tail expectations and the new test cleanup, corrected. Overlapping gate attempts exposed existing 5-second test deadlines; no deadlines, tests, or coverage gates were changed. Full configured sequential receipts are tracked below.

## Principles Adherence

| ID | Result | Evidence / scope |
|---|---|---|
| PB1 | PASS | Game flags still grade progress. No script completion is inferred or credited. |
| PB2 | PASS | Original failed run, refusals and evidence retained unchanged. |
| PB3 | PASS | One regression is evidence of a correctness defect only; no benefit estimate or promotion. |
| PB4 | PASS | Named default-OFF switch, explicit metadata and OFF invariance; no memory writes. |
| PB5 | PASS | Only trigger admission/observation boundary policy changes; pending one-switch experiment. |
| PB6 | N/A | No context or memory budget change; no long-run reliability claim. |
| PB7 | PASS | Existing ordinary press and observation/tool-result owners retained; no hidden inputs. |
| PB8 | PASS | One trigger attempt returns control; existing command, progress and loop limits retained. |
| PB9 | PASS | User explicitly requested this correction and preserving the active run; no larger feature/workflow added. |
| PB10 | PASS | No test skips, thresholds or deadlines changed; setup failures and timeout receipts retained. |
| PB11 | PASS | Production factories and pinned pi tool interfaces exercised; vendor pin verified. |
| PB12 | PASS | Worktree uses configured POKEBENCH_ROM outside TCC; ROM never copied or committed. |
| PB13 | PASS | Worklog records implementation, gates, review and landing as separate required states; no premature completion claim. |

## Frozen review boundary

Outcome: model-selected navigation must not refuse matching coordinate scripts as impassable. Enter/attempt their step and return the resulting state, with no further movement/target activation in that call. Ordinary non-stride inputs walk to avoid overshooting; existing strides already stop before script coordinates. All matching scripts are treated uniformly, with no hidden story classification. OFF preserves incumbent behavior.

Production paths: navigation.ts (policy/factory), features.ts and play-preset.ts (declaration/default/metadata), next-run.ts (default OFF), panels.ts (existing explainer map). Semantic-navigation.ts is unchanged; its existing stop_requested path handles the boundary. Tests, one frozen decoded fixture, docs and one unqueued/unapproved experiment are supporting artifacts. Non-goals: story solver, new objectives, script decoder, loop policy change, event schema, terrain/fence repair, active-run changes, bundle enablement, measured launch or performance claim.

Test-quality checks: production factory and semantic consumer assertions observe posted inputs and returned status/state (1); wiring and stop deletions performed/restored (2); no new globals (3); tests use private temp roots/local fixtures (4); gate timeouts retained and rerun without changed timeouts (5); no retries/skips/serialization added to product tests (6); exact posts/status/state asserted (7); fixture planner replay is four steps over the real 40x60 map with bounded fake responses, no emulator/network effects (8); synthetic tests use four tiles, no production-scale saturation (9).

Configured just test: 3409 agent + 1658 viewer + 3806 Python tests passed (/tmp/trigger-test-configured.log). just lint passed TS/eslint/ruff/mypy (/tmp/trigger-lint-final.log); build passed (/tmp/trigger-build-final.log). Agent coverage already passed 97.27 statements, 93.15 branches, 97.8 functions, 99.2 lines; viewer coverage retry pending after its existing experiment-cli deadline failed under load. Landing board joined as number 8 on 2026-10-21 at 4:05 PM New York; no main move allowed before slot 1.

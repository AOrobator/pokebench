# Navigation script boundaries

Authorized outcome: fix the trigger-policy contradiction; leave the active run untouched.

One milestone: allow a model-selected route to enter a matching coordinate trigger, then return control to the model after that step. No story classifier, hard-coded route, objective selection, live-run edits or launches. Existing terrain, object, trainer and input gates stay authoritative. New default-OFF switch preserves exact incumbent behavior. Consumers: navigate_to, navigate_to_target, recorded tool result/model feedback and feature card.

Evidence: ea04 turns 600–660, seq 22794–24576; 17 refusals across matching Rustboro var 0x405A=1. pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881 RustboroCity StolenGoodsTrigger0–4 leads to StolenGoodsScene and changes state to 2. General policy uses only current matching trigger coordinates; no hidden story knowledge is delivered.

- [x] RED regression and exact OFF contract
- [x] GREEN production wiring and semantic stop; adversarial deletion/restoration
- [x] Gates and read-only replay on recorded Rustboro state
- [x] Explainer and pending experiment
- [ ] Principles and cloud review — quality reviews complete; Grok quota unavailable, operator decision required
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

COMMIT: `fix: let navigation return at matching script triggers` (36662714). Pending definition now pins that committed implementation and explicitly normalizes all incumbent switches. Direct candidate parseExperiment validation passes. `just experiments-check` checks the main checkout (not this candidate) and is red on pre-existing starter-decision-salience trials.jsonl lines 1–150; no candidate-specific definition error and no ledger edits. This shared-data gate remains reported separately.

## Multi-Model Review Log and hold

COMMIT: `docs: pin pending trigger policy to its committed implementation` (e2ff1256a9048dbbb3299cdcf359090803d608df).

Frozen base 4b70c35ddb964e18d4e618bce57317503948a02c -> e2ff1256a9048dbbb3299cdcf359090803d608df; exact binary diff SHA256 d012ec4afcda86594a7ed8d6ac8222c6123c81ad1ddabe1fbe96e004472dcbef. Packet, transcripts, copied gate receipts, boundary, principles and synthesis: runs/reviews/trigger-boundary-r1/. After all four completed reviews, reproduced clean HEAD and exact diff digest before this evidence-only worklog update.

- Claude CLI dedicated review config, plan mode: exit 0, empty stderr, exactly one terminal VERDICT: LGTM.
- Fresh normal GPT lane /root/trigger_policy_review, fork_turns=none: VERDICT: LGTM, independently verified digest/status and passed 172 tests.
- Grok cursor-agent ask mode, discovered grok-4.7-high: exit 1, ActionRequiredError: account out of usage; ask admin to increase limit or switch Auto. Auto would not preserve the Grok family. This unavailable lane is not green.
- Standing availability fallback /root/trigger_fallback_sol, gpt-6.1-sol high, fork_turns=none: VERDICT: LGTM; independent exact digest/status; 170 navigation/semantic plus 88 stride/truth/warp assertions (overlap).
- Standing availability fallback /root/trigger_fallback_astra, gpt-6-astra high, fork_turns=none: VERDICT: LGTM; independent exact digest/status; 189 tests across seven files.

Reduced vendor diversity is explicit. Under execute-worklog's landing rule, fallback reviews do not authorize self-merge when a required cloud lane is unavailable. Operator approval of the replacement roster is required. No main move, live bundle enablement, run controls, experiment approval or launch.

No blockers from completed lanes. Combined treatment-plus-stride factory coverage is a nonblocking hardening follow-up; no scope expansion accepted. Existing native stride exclusion and ordinary-walking regression support current behavior. No native story-completion or benchmark-benefit claim. All nine test-quality dimensions assessed; no new skipped tests, retries, deadlines, coverage exclusions or owners. This evidence-only documentation commit updates stale checkboxes/receipts; code remains the reviewed e2ff1256 tree. At the landing slot, sync/reseal and perform any required new review, including this documentation, before landing.

Final configured gates: just test 3409 agent + 1658 viewer + 3806 Python passed. just lint, just build, just verify-vendor passed. Full just coverage passes every metric: agent lines 99.20 / branches 93.15 / functions 97.80; viewer lines 97.95 / branches 91.33 / functions 94.35; Python lines 97.29 / branches 93.11 / functions 100.00. All 194 candidate experiment definitions parse. The main-checkout convenience experiments-check remains red on pre-existing starter-decision-salience trial-ledger lines 1–150; history untouched.

Landing remains slot 8, updated to exact chat title Inspect Russborough gate mapping. Original ea04 later ended on its own budget; no input/control writes or viewer restart were sent by this work.

## Landing turn and authorized review roster

Operator directly authorized: "Yes, use the Sol/Astra fallback reviews and land the trigger-policy fix when it's our turn. Leave the active runs untouched." Coordinator later relayed "yes dont wait for grok" as broader standing authorization. This direct approval resolves the missing-Grok self-merge hold for this task. Reduced vendor diversity remains explicit.

Now number 1; merging main 4dcb448acd4cf4b1a157833b411e6aa6092ed626 into the owned branch. Registry/default/docs conflicts reconstructed from current main, with only this treatment appended; older registry tests shifted mechanically. navigation.ts production delta is byte-identical to prior implementation. Fresh gates and Claude/GPT/Sol/Astra review will bind the synced tree before fast-forward landing. Active runs must receive no inputs, control writes, preset changes or restarts.

Final preceding coordinator evidence commit b79749bb changed only its own worklog; incorporated before sealing the landing packet. Application sources and tests are unchanged from the synchronized b4e5fa03 tree on which the current full gate sequence began.

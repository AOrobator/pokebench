# Item 4: refusal-ledger-v1

Authorized by the operator's five-chat request (Claude transcript 00000000-0000-4000-8000-295de6bf4a05.jsonl line 1840, [private message reference], 2026-10-24T13:38:42Z), delegated by coordinator 00000000-0000-4000-8000-f5efe0494f81. Item 4 only. No model/probe/GPU/live-run calls authorized. No remote, push or PR.

## Frozen outcome and boundary

Extend the existing disproved-beliefs delivery with actual navigate_to/navigate_to_target refusal lines and repeated failed same-target counts, sourced from recorded calls, results and native states. New default-OFF switch needs disproved-beliefs-v1, whose story-state dependency remains required. OFF is byte-identical. Reuse belief_ledger event, model-context transform, Activity History and raw inspector; no timeline additions. Historical refusal text is quoted as harness history, never authoritative current state. Current observations take precedence. Clear on story/map change, reaching a coordinate, successful semantic activation, or a changed result/reason. Never generate supervisor advice or choose/send actions or end runs.

Smallest production paths: features.ts, play-preset.ts, refusal-ledger.ts, disproved-beliefs.ts, next-run.ts, panels.ts (explainer mapping only). Documentation and tests support those paths. No tool/schema changes, so no tool-prompt synchronization required. No independent anchor-fact-v1: report suggests choosing a best fact but does not establish a safe minimal reliability/expiry contract. No blocked-press or trainer-loss ledger extensions: outside this navigation-only item.

## Evidence

Report: runs/reports/run-analysis/2026-10-23_glm-granite-frontier/sections/glm_breakouts.md and qwen_recent.md. Checked original events read-only:
- 2aca: tool result 18777 t514 (semantic warp 14,5), 20519 t559 and 20539 t560 quote matching trigger 26,23. 20520/20521 are same-target guard notices, not independent attempts.
- a866: result 4879 t199 and 4895 t200 quote trigger 11,1 while targeting 10,0. Dialogue result 1715 t91 supplies upstairs history; it does not establish a current target recommendation.
- ee12: semantic refusals 9353 t318 / 9373 t320 and ledge result 9384 t321. Result 11265 t400 reached 15,2: success must not become a refusal.
- da1c: 23013 t578 contains the Stop learning PECK choice; tool call 23750 t609 presses A. B-loop t577–609 is outside navigation and must not create a navigation ledger entry.

Native refusal causes are already computed by navigation.ts/semantic-navigation.ts from game state. This feature quotes their delivered lines, adds no new game claims or unseen facts, and does not re-interpret dialogue.

## Plan / terminator

One milestone: RED fixtures and production delivery tests committed; GREEN implementation/defaults/docs; focused + appropriate full gates; adversarial deletion/restoration; frozen cloud reviews; board-controlled ff-only landing and coordinated one viewer refresh. Offline probe plans for 2aca560/a866200 only. Terminator: reviewed source landed default OFF with evidence and explicit unmeasured status. Any new tool, current-state ranking, recovery action, runtime owner, persistence or run-ending behavior requires a separate scope decision.

## Status

- [ ] RED committed
- [ ] GREEN and adversarial wiring receipt
- [ ] gates and explainer verification
- [ ] frozen cloud reviews
- [ ] board landing and coordinated viewer proof

RED: production context tests run offline from schema-validated projected recorded events. Focused invocation uses vitest directly (the initial pnpm test -- shape did not filter correctly; stopped only the owned vitest PID). Corrected fixture-only guard evidence and strengthened expiry tests to require a populated ledger before expiry. Final RED receipt /tmp/refusal-ledger-red-focused-v2.log. Expected failures are missing registry/retention/delivery, not import errors.

## Offline diagnostic probe plan (not permission to sample)

Tier: diagnostic/exploratory, no gameplay-benefit claim. No authorized GPU-hour budget or owner window exists; no launch/publisher/worker is created. Source run families 2aca and a866 are development cases already inspected, never held-out confirmation.

| case | source run | decision boundary | prior refusal | primary first-call rubric |
|---|---|---|---|---|
| woods-560 | 2026-10-22T08-11-26_qwen36-gpu1_2aca | turn_start seq 20523, t560 | seq 20519, target 14,5 map 24/11 | repeats exact refused target vs changes action; separately score source-supported trigger 26,23 or another observed target |
| littleroot-200 | 2026-10-22T22-54-04_qwen36-gpu0_a866 | turn_start seq 4882, t200 | seq 4879, target 10,0 map 0/9 | repeats exact refused target vs changes action; separately score a source-supported return to rival house, never assume upstairs success |

Candidate batch proposal only: 4 draws × 2 arms × 2 cases = 16 model decisions, balanced order, fixed N and one inspection after batch completion. Arm OFF reproduces each run's own features and historical context with refusal-ledger-v1 OFF; ON differs only by this switch. Both already have disproved-beliefs-v1 and story-state-v1; verify source run_start again before freeze. Preserve full source dialogue, screenshot/readout, same tools, same model/runtime and sampling; do not inject a recommended route or anchor fact. Source boundary is the named turn_start, never later result seq 20539/4895. Freeze full input hashes, source pins, original and candidate harness feature lists, tool and system-prompt hashes, image hashes, sampling and discovered actual model before any call. Reconstruct context via decisionContext/contextTools; discard derived historical belief_ledger events and regenerate only the candidate history without importing stale supervisor messages. Compare OFF reproduction with the recorded decision_input before proceeding.

Scoring: exact first tool call and validity; repeated-target rate; factual grounding from delivered observations; unsupported future fact or forced-action bias; empty/tool-error rate; input/output tokens and latency. A changed call is not a recovery or gameplay win. Inspect complete successful and failed response chains after the finished exploratory batch. No p-value/winner claim from repeated draws on these two cases. ee12 semantic refusal and successful-arrival cases plus da1c B-loop are correctness contrasts, not untouched confirmation. Any broader claim needs separately authorized held-out source families and a precision-sized design.

Cost: source context estimates at boundary are 34,581 tokens (woods) and 19,523 (littleroot), with 6 and 4 images respectively; these are recorded estimates, not new measurements. At 8 decisions per case, historical-estimate input floor is 432,832 tokens plus ledger overhead; runtime/model/latency dependent. A numeric GPU-hour cap must be authorized and priced from comparable endpoint calls before launch. The report's 16–32 samples/arm suggestion is deferred to a later design, not started as an initial large batch. Before sampling, coordinate every affected owner/lease, publish the real probe manifest/lane schema, rehearse fake data and verify the existing viewer's probe surfaces without restarting runs. Future confirmation reserves must be named before exploration consumes any budget.

GREEN: focused agent tests passed 98/98 before additional negative-case strengthening (21 candidate cases now pass). Viewer panels/server tests pass 304/304 after the agent build. Adversarial deletion receipts: runs/refusal-ledger-proof/adversarial-delivery-wiring.log, adversarial-model-message.log, adversarial-map-expiry.log each fail the intended production delivery/expiry assertions; restoration passes. Initial type-check exposed optional normalization and a union narrowing gap; both corrected before freeze. One test-only redundant conditional removed after eslint identified it. Full gates and reviews remain pending.

COMMIT: `test: expose missing navigation refusal memory for item 4` (fd7dd9f35).

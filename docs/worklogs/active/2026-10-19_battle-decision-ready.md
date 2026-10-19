# Battle decision readiness

## Problem Statement
The operator approved fixing the encounter-message / battle_action refusal cycle and enabling the repair in both control and bundle (2026-10-19: "ok lets make that fix and include it in control and the bundle"). This follows the reviewed proposal in this chat: settle non-choice battle text before model requests and defensively before battle_action; stop at every real choice.

## Skills Loaded
feature-worklog, feature-switch, feature-explainer, experiment-queue, agent-observability, pokebench-game-state, close-the-loop, execute-worklog; cloud review contract.

## Architecture
Reuse battle-text-auto-advance's source-grounded classifier, bounds, journal and dialogue_auto_advance recording. Add default-OFF battle-decision-ready-v1, dependent on battle-text-auto-advance-v1. Wrap observe to settle pending battle text and return its final screenshot/readout plus all pages. A pre-request transform checks fresh state and invokes that observation only when engaged, before context ledgers and JIT snapshot construction. battle_action uses the same routine before validation; no requested action runs across an intervening prompt, battle end, unknown state or exhausted bound. Existing refusal/no-press contract remains true for the action itself; preflight button presses are separately recorded. OFF preserves existing tools and request context by identity. The fixed bundle-v-control definition lists this in onInBoth, never switches; historical source, approvals and records remain untouched.

## Invariants
- INV-1: OFF preserves old tool behavior, descriptions and transforms. Production-factory identity and legacy refusal tests.
- INV-2: Only native non-choice messages get B; animations get bounded waits; prompts/menus stop. Source-grounded classifier and recorded fixture tests.
- INV-3: No stale move is executed after a boundary or failure; fresh state is validated and preflight pages remain in returned/model context. Production tool tests.
- INV-4: Both comparison arms include the same repair, without changing treatment membership or immutable control-base bytes. Parse both effective presets and verify control-base validation.
- INV-5: Automatic presses, ordered text, stop and final state are recorded through existing event owners and rendered by existing Activity History/replay consumers. Schema-valid fixture replay.

## Security Review
No game-memory writes, save edits, vendor edits, new network surface, local inference use, experiment approval or launch. All inputs use ordinary checked press and native waiting. Signal cancellation and existing pause gate remain authoritative.

## Milestones
- [x] M1: RED regressions and commit.
- [x] M2: Implementation, metadata, explainer and both-arm definition; GREEN gates and mutation proof.
- [x] M3: Recorded/native probe and viewer/explainer proof; principles self-review and frozen cloud reviews.
- [ ] M4: Fast-forward local landing after required cloud approvals, viewer restart and live proof.

## Closing the Loop
Prove production entrypoint context delivery, repeated battle_action calls, prompt stops, OFF parity, finite caps and both-arm configuration. Run full tests/coverage/lint/build/vendor gates; inspect recorded pages and final state in replay and actual viewer. Do not launch measured trials.

## Session Log
- Created isolated worktree from clean main 3c626e32. Source reference pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881 is clean; TextPrinterWait/WithDownArrow use JOY_NEW(A_BUTTON | B_BUTTON), src/text.c:865-899. Existing classifier separates message_waiting, busy, prompt, input and screen owners.

## Surprises
- Current refusal bypass and its test intentionally guarantee no buttons for refused calls; repair must make preflight explicit rather than silently falsifying that receipt.

## Multi-Model Review Log
Pending.

## Boy Scout Log
No unrelated changes.

## Archive Milestone
- [ ] User-approved archival; keep active until requested.
- M1 RED: added encounter observe, battle-action preflight, real-choice boundary and OFF regressions; current implementation fails ON cases (receipt /tmp/battle-ready-red.log).
- M2: production factory and actual live.ts context regressions pass; native manual probes use separate servers 8186/8187 and the existing first-battle-appeared checkpoint. OFF reproduces the refusal on the waiting encounter. ON executes SCRATCH after one preflight B and waits to the next menu; the second call also executes once and reaches the battle end. A separate pre-request probe returns the encounter page plus final input state. Receipts: runs/battle-ready-proof/native-{action,observe}-receipt.json and viewer-runs/*/events.jsonl; no model inference or benchmark trials.
- Native source and current ROM: SHA-1 f3ae088181bf583e55daf962a92bb46f4f1d07b7. Full raw archives retained by the real server and referenced through the proof run directories. The native probe was built from the dirty candidate at RED commit a8c11765; it is a mechanism proof, not a frozen reviewed build claim.

- The new both-arm control-base check exposed an inherited redundant `visited-terrain-navigation-v1: false` key absent from the frozen control-base file and every design override. Removed that redundant key from the mutable definition; omitted normalization still yields false in both arms. Frozen control-base bytes and SHA are unchanged. This makes the real definition pass controlBaseProblems rather than weakening the test.
- Full Python gate: 2750 passed; coverage lines 97.07%, branches 92.68%, functions 100%. Agent coverage: 2583 passed, lines 99.25%, branches 94.07%, functions 98.23% (V8 report statements 97.85%). TypeScript lint passes. Viewer coverage found one inherited socket timing flake plus the now-repaired redundant base key; rerun pending.
- Delivery audit tightened pre-request proof: reuse the existing typed decision_input snapshot event to durably pair final state, actual model text and screenshot, and update JIT from that final state even when no new battle journal page appears. Semantic-action results retain preflight summaries/pages without appending an obsolete full menu readout after the action. Preflight events identify their actual triggering tool. Operator pause gates cover settling entry, each automatic press and native waits when this switch is ON; OFF retains prior behavior.
- Mutation receipts: live-wiring and action-preflight deletion fail and restore green. Boundary-stop attempt 1 changed only one operand and unexpectedly passed because other operands still stopped the prompt; retained, not counted. boundary-stop-v2 deletes the complete boundary and fails/restores green. pending-pages fails/restores green. snapshot-delivery attempt 1 encountered an incomplete test filesystem double after restoration and is not counted; fixed its binary-frame sink, then snapshot-delivery-v2 fails/restores green. All unique logs retained in runs/battle-ready-proof/mutations/.
- Native v2 probes prove the final runtime delivery path: action-v2 OFF refusal remains message_waiting, ON SCRATCH executes once and a second call reaches battle end; observe-v2 records decision_input (final state/text/frame) before the request. Both probes have terminal run_end records. Validated all 62 action and 9 observe raw archives against hash/layout/ROM; reparsed first/last archives with the production read_state: message_waiting -> overworld for action, message_waiting -> input for pre-request observe. Servers 8186–8189 were stopped after proof, leaving shared sessions untouched.
- Previous final coverage attempt under concurrent native-server load had timeout failures in existing long-route/card-delivery/human tests; preserved /tmp/battle-ready-ts-final-coverage2.log. Native servers stopped and agent coverage rerun with two workers, preserving normal per-test timeout and all tests. No gates or timeouts weakened.

- Final GREEN gates: agent 2584 tests (165 files), viewer 1264 tests (86 files), Python 2750 tests. Coverage agent lines 99.25 / branches 94.08 / functions 98.28; viewer lines 97.60 / branches 90.93 / functions 93.72; Python lines 97.07 / branches 92.68 / functions 100. Full lint/build/vendor gates pass. 122 experiment definitions validate. pages-check passes; served explainer returns 200. Frozen native-v2 runtime module hashes exactly match the final build after TypeScript-only annotation cleanup. Final logs: /tmp/battle-ready-{agent-final-coverage3,viewer-final-coverage,python-tests,final-lint2,final-build3,experiments-final}.log.
- Pause-wiring mutation fails with factory gate forwarding removed and restores green. Actual viewer replay on scratch port 8793 shows encounter pages, B x1, next-menu stop, decision_input's final state/text/frame and raw receipt. Harness Config reports the switch ON and its READ EXPLAINER click opens the tracked page. Explainer layouts at 1280, 1440 and 375 were captured and visually inspected; no clipping/overflow. Screenshots under primary runs/mockups/battle-decision-ready/shots/.

- GREEN implementation committed as eeac1f0afbbb841ed5b1ef2776513680a7553999. Standalone registration now pins that implementation; no queuePosition, approval or launch. Freezing the cumulative candidate for Claude/Grok/GPT cloud review.
- Integrated main 38feef65 (targeted viewer-card snapshot optimization) at d041504b before external review. Synced tree passes agent 2584 and viewer 1266 coverage tests, TypeScript lint/build, and unchanged Python/vendor gates already recorded. Updated event schema generation produces no extra diff. Synced receipts: /tmp/battle-ready-synced-{build,agent-coverage,viewer-coverage,lint}.log. Main remains clean at 38feef65; no other landing has been modified.

### Review round 1 — frozen 306f4e7c, diff 99af65d6…7640
- Cursor Claude Opus and Sonnet each failed with account usage-limit errors. Dedicated Claude CLI auth status reports loggedIn=false. No Claude verdict; this remains a landing blocker unless the operator explicitly accepts the missing lane.
- Cursor GPT failed with account usage-limit error. Fresh read-only GPT reviewer verified the packet and found P2: projected readiness observation is not canonical pi history; the next request after a text-only reply/non-game tool/retry loses it. FIX: retain one readiness observation and re-project until a newer delivered game observation supersedes it; regress against canonical rather than previously transformed history.
- Required model-diverse outage fallback: Luna found no bug (LGTM, reduced diversity). Astra found P2: settle() carries an intermediate blackout receipt in typed state but omits missingNotices(), so the one-shot whiteout/money-loss notice can disappear from returned and recorded text. FIX: preserve notices in both settle output and preflight summary, with a consumed-intermediate-receipt regression. These fallback verdicts do not replace Claude cloud approval.
- Cursor Grok reached the 300-second bound with no stdout/verdict; incomplete, never green. Original stdout/stderr/exit and fallback messages retained under runs/battle-ready-proof/review/.
- Main advanced separately to 64ca188a with the already-landed loop-rule extraction. A merge-tree rehearsal is conflict-free but canonical diff bytes differ due shared-test context; sync and re-gate before review round 2.
- Review fixes RED: canonical-history retention and both observe/battle_action intermediate-whiteout cases fail against the round-1 implementation (/tmp/battle-ready-r2-red.log). GREEN: retain one projected readiness message until a newer successful image-bearing game-tool observation replaces it; API retries/non-game tools/text-only continuations reuse it without another native press or duplicate snapshot event. The actual live.ts entrypoint now exercises a second request against canonical history. settle includes missing blackout notices in its returned observation and preflight summary; outer action carries typed preflight receipts forward. Targeted delivery tests pass (/tmp/battle-ready-r2-delivery.log). Retained-context and whiteout-text guard deletions each fail and restore green; unique mutation receipts retained.
- Review-round-2 gate on main64 integration: agent 2593 tests (166 files), viewer 1266 tests (86 files) pass full coverage; agent lines 99.22 / branches 94.08 / functions 98.05, viewer lines 97.60 / branches 90.92 / functions 93.68. TypeScript lint/build and pages-check pass; Python 2750/coverage/vendor remain unchanged and passed. Receipts /tmp/battle-ready-r2-{agent-coverage,viewer-coverage,lint,build}.log. Native observe-r2 proves two requests against canonical history retain the encounter/final menu with no repeat B and one snapshot event; server stopped after proof. No measured runs launched.

- Round-2 reviewed fixes committed as 125f61b25dd6ef41cb863db18fd0e6278a85fdeb; pending standalone source pin updated to this implementation. Preparing final frozen review packet; no main merge without the required cloud approvals or explicit operator exception.
- Pin commit's first attempt hit the hook's same-second worklog freshness boundary immediately after 125f61b2; it was rejected without bypass. Updated this log and retrying the ordinary commit before freezing. No reviewer was dispatched on the dirty attempt.

### Operator-authorized landing and main synchronization
- Operator explicitly answered “yes” to landing without unavailable Claude cloud review. Claude exception is authorized; no benchmark/experiment launch authorization is inferred. Final pre-sync packet d5af8cc6 had GPT and Grok LGTM; Astra/Luna fallback also LGTM. Grok ask-mode could read the packet/source but could not run git; the dispatch wrapper and final handoff independently verified clean HEAD and exact diff SHA.
- Main advanced to 0b5ad284 with Wally battle readouts/refusal detection and bundle metadata. Integrated it before landing. Conflicts are append-only registry additions, legacy test fixtures and adjacent documentation/tests; preserved main’s battle-refusal-loop-v1 before the appended battle-decision-ready-v1. Preserved both explainer tests and both bundle configurations. Main's battle_action refusal lifecycle and native Wally implementation remain unchanged.
- Initial integration gates exposed missed append-only registry offsets; fixed expectations while retaining OFF fixture projections and all assertions. First viewer attempt ran against stale agent dist; after completed build, all1268 viewer tests pass. First Python command omitted ROM env, producing229 native skips and the required Wally-ROM failure; reran with the verified Emerald ROM:2762 passed, no skips, coverage lines97.09/branches92.73/functions100. No gates weakened. TypeScript lint/build, Python lint/mypy and vendor check pass;123 experiment definitions validate. Agent full coverage:2605 tests/167 files passed; lines99.23/branches94.09/functions98.05. All integration gates now GREEN before the new frozen packet. Original failed attempts retained alongside corrected full receipts.

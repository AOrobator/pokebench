# Terrain gate audit and correction

## Problem Statement
GLM control run 2026-10-22T20-40-54_glm53-mac_0d5d sees Granite Cave muddy slopes as clear ground. Native archive 17231 confirms slopes at (9,9)/(9,10), while turns 889–891 repeat upward inputs and receive misleading window advice.

## Authorization
2026-10-23: operator agreed to the correction, requested improving field-move-gates-v1 and enabling it in both arms, auditing the whole map, and explicitly leaving the current run untouched. This authorizes implementation of the agreed correction; later unproven traversal solvers remain out of scope.

## Skills Loaded
Game-state, trace-forensics (read-only historical evidence), agent-observability, feature-switch, feature-explainer, feature-worklog, execute-worklog, close-the-loop, talk-to-claude.

## Architecture
Retain field-move-gates-v1 and its exact OFF path. Audit every ROM map and game-owned terrain/script handlers. ON maps and next-tile words identify special terrain; walking reachability and refusals cannot treat bike ownership as ordinary walking access. Closed terrain must remain visible even when it cuts no exit. Fix confirmed shared-rule defects and document unsupported mechanics honestly. Future fixed definitions move this switch into onInBoth, preserving pinned bases and historical recordings.

## Invariants
- INV-1: OFF map/readout/navigation is unchanged; regression tests compare existing paths.
- INV-2: no gameplay, RAM writes, current-run edits, scheduler changes, inference calls or shared service restarts during implementation.
- INV-3: item ownership is capability, not proof of riding/momentum or an executable walking route.
- INV-4: map glyph, adjacent words, obstacle state and navigation explanation agree; unknown native state stays unknown.
- INV-5: audit covers all map IDs; static ROM evidence is distinguished from runtime script mutations and observed native proof.

## Security Review
Read-only external ROM and archives; no game assets tracked, new network exposure or subprocess string execution.

## Milestones
- [x] M1: whole-ROM terrain inventory, source/guide cross-check and concrete defect register.
- [x] M2: RED regression commit; GREEN shared gate/readout/navigation correction with OFF invariance and native archive readback.
- [x] M3: both-arm future recipes, explainer, gates, frozen multi-model review and landing/live proof if all gates permit.

## Closing the Loop
Use archived native states for map/readout proof without disturbing the measured run. Build scratch viewer and verify page in background contexts. Distinguish implementation, checks, review, landing and future activation.

## Session Log
- Started isolated codex/terrain-gates from main. Existing main and current GLM run untouched. Claude coordination message saved (no listener).

## Surprises
- Prior gate audit names 81 early maps; whole-world claim tests exist, but terrain visibility remains absent.

## Multi-Model Review Log
Completed; final roster and operator-approved unavailable-lane exception are recorded below.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive worklog.

- RED: terrain visibility tests fail against no-op presentation and current owned-bike flood (16 failures, 1 pass); no current run changed. Full static ROM sweep: 518 maps read, zero failures.

- GREEN focused: 151 Python tests, 17 agent tests, 11 future-definition tests. Added 2 additional sandstorm/collision cases (18 visibility tests now pass). Native archive 17231 hash verified and reparsed through production reader: slope descriptions and upper-ladder foot→none labels confirmed. Deleted readout wiring once: factory test failed, then restored.
- Full TS coverage: agent 3909 tests, viewer 1728 tests pass; line/branch/function percentages agent 99.14/93.31/97.78, viewer 98.02/91.61/95.04. Full Python coverage run: 4028 pass and one old wording assertion fails; expectation corrected for the intentionally changed bike wording. Full Python gate rerun pending. Python coverage floor: lines 97.41, branches 93.47, functions 100. New terrain module has 100% statements/branches.
- TypeScript build/lint and Python ruff/mypy pass after isolated dependency install. Initial shared-node_modules symlinks resolved workspace types to main; replaced symlinks with an offline worktree-local install. No main source changed.
- Inventory script reads all 518 maps (zero unreadable), emits count metadata only. Detailed audit and updated existing linked explainer prepared. Remaining defects are explicitly retained in the report; no forced-movement solver or runtime-layout simulator was added.
- RED commit: 85779c569. Correction: that run had 16 failures, zero passes (earlier prose incorrectly said one pass).

- Gate correction: full Python now passes 4031 tests. Lines/branches/functions 97.41/93.45/100.00 (floor 90). Agent coverage passes 3909 tests, 99.14/93.30/97.78. Viewer coverage initially caught the removed Rusturf explainer example; restored the meaningful example rather than weakening its test. Rerun passes all 1728 viewer tests, 98.02/91.61/95.04. Build/lint pass; vendor remains clean at bbab97ad.
- One old mixed-needs wording assertion was still failing at implementation commit 54f195749; corrected it on the branch and reran the whole Python suite successfully. No production logic was changed to satisfy that old assertion.
- Background browser: both local pages return 200, no page errors or page-level overflow at 1280, 1440 and 375, closed and expanded. Fixed the mobile table and diagram after inspecting screenshots. Browser is standalone headless Chrome; no desktop focus taken. Shared viewer remains untouched.

## Review round 1 synthesis
Frozen base 74590b432, head bff18db2f, packet fbc596b677aea928d1a58f373d8b74d6b2d478b1493d56aab4d312d33a560739. Claude CLI (claude-opus-5-5) and isolated GPT reviewer both return VERDICT: BLOCKING on the same concrete defect: synthetic terrain occupancy is mistaken for a real object by targetReason. Fix accepted inside the existing navigation owner. Added four direct terrain target regressions (bumpy slope, cracked floor, rail, sandstorm) and one real-object-priority test. RED 4 failures; GREEN 91 navigation tests pass. Refusal identity now comes from original observed geometry plus actual closed obstacle objects; synthetic terrain stays planner-only. Also fixed a clipped SVG caption discovered in background visual QA.
- Nonblocking reviewer suggestions: compress long coordinate lists and unify broader terrain refusal vocabulary. Retained as follow-ups, without growing runtime owners or adding solvers.
- Grok Cursor lane unavailable: exit 1, ActionRequiredError account usage exhausted. No other Grok harness is available. Complete the standing two-model read-only fallback, report reduced diversity. Per execute-worklog, this does not authorize self-merge; operator approval is required before landing.
- Separate scratch viewer with copied native events, no outbound probes, opens Harness Config → READ EXPLAINER correctly in a standalone headless context. The deliberately partial scratch recording shows NOT RECORDED, so this check proves the link, not the historical feature-status rendering. Shared 8790 was not touched.

- Review fix verification: agent coverage 3914 tests pass (lines 99.20%, branches 93.39%, functions 97.78%); focused viewer 186 pass. Source build passes. All six final explainer screenshots inspected; caption fits desktop and phone. Main advanced with independent story-measurement work; sync before final review.

- Review fix commit bf8ea8012. Synced main d23155ba6 into the isolated branch (story measurement work); automatic merges only in docs index, readout and features. Final packet will use that main as base, so unrelated measurement work is excluded. Full gates rerun on the synced tree.

- Final synced gates: Python 4042 pass, coverage lines/branches/functions 97.38/93.34/100.00; agent 3922 pass, 99.20/93.38/97.78; viewer 1736 pass, 98.01/91.52/95.09. Build, TypeScript lint, ruff/format and mypy pass. The first viewer pass after sync lacked the newly added main story-progress build output; built that dependency and reran the complete viewer coverage successfully (initial failure receipt retained).
- Additional read-only broad scan recorded in audit: 3 collision-free 0xC0 axis barriers still drawn clear (Littleroot bedrooms and Wanda house), plus specialized warp behavior counts. These are follow-ups inside the disclosed incomplete activation/geometry audit; no new runtime behavior added.

## Final review and delivery receipt
- Reviewed implementation: 2382cf59d745fa7ce37a49e17c6c1ee0a1b8f7e8, base d23155ba6c37377e4082cbc7a1e9d3f1dbf73790, cumulative diff SHA256 e530878488d9615741aa79de90051f17765c760aa4d385d66930a86ce9c2cfc5. Before/after hashes match for each reviewer.
- Round 2 Claude CLI (claude-opus-5-5): VERDICT: LGTM; exit 0, stderr empty. Original isolated GPT review: VERDICT: LGTM, including independent local/full-map direct-target reproduction. Two fresh reduced-diversity fallbacks, gpt-6.1-sol and gpt-6-astra: VERDICT: LGTM each. No second-round blockers remain. Their recommendations for coordinate compression, vocabulary deduplication and unused constant cleanup are nonblocking follow-ups.
- Grok lane remains unavailable (Cursor account out of usage). This is reduced diversity, not normal three-cloud-lane approval. Per execute-worklog: no self-merge; awaiting operator approval to land with this roster. Not joined to landing board because landing is not yet authorized under the unavailable-lane rule.
- M3 preparation complete: 11 future definitions have v1 onInBoth, existing explainer linked and scratch click verified, all gates/native/browser proof pass. Landing, shared-viewer refresh and activation in an actual future run remain pending. Current run, its recordings, scheduler, inference services and shared viewer were not changed by this task.
- Local delivery: http://127.0.0.1:8791/terrain-gates/audit.html and http://127.0.0.1:8791/terrain-gates/explainer.html; screenshots under the sibling shots directory. Both return 200. This final worklog commit is evidence only; production code remains the reviewed 2382cf59d tree.


## Landing and live proof — 2026-10-23
- Operator replied “yes” to landing with Claude, GPT and the two fallback approvals while Grok was unavailable. Joined landing board as number 1 with actual Codex thread 00000000-0000-4000-8000-08d3409516f2; main was clean at the reviewed base. Fast-forward landed c3aa9d880365b0a151478afacde7f0c8c6821e6b. Its difference from reviewed implementation 2382cf59d is this worklog only.
- Canonical-main post-merge `just test`: agent 3922, viewer 1736, Python 4042 — all 9700 pass. Receipt: runs/terrain-gates-landing/tests.txt. Prelanding coverage/build/lint receipts above remain applicable to the unchanged production tree.
- `just viewer-main` completed successfully. At 10:44 AM EDT, exactly one loopback 8790 listener served the clean c3aa9d880 build. Served explainer bytes matched main and frozen viewer copy (SHA256 516d5d5288d9b54f40ead94cc0fcdde8c195c06e5f38cdf40bc70064a083358c).
- Standalone headless Chrome verified the live shared viewer: Harness Config → READ EXPLAINER opens the correct Field move gates heading at desktop 1440 and phone 375. Both screenshots opened and inspected; no popup page overflow or page errors. The first phone attempt incorrectly used the hidden desktop navigation button and timed out; using the visible phone page selector completed the check. Evidence: runs/terrain-gates-landing/browser-receipt.json and live-{config,explainer}-{1440,375}.png. No desktop focus was taken.
- The selected historical run still says NOT RECORDED for this switch; no retroactive ON claim. Workbench reports that same GLM run live with original source 5bec91dcd344b1732fc2e7ec1a0ce8c5dcc2aee5. During background recording indexing its only global notice was remaining recordings loading. Original gameplay agent 53193, launcher 53715 and game server 53718 retain their October 22 start times and frozen checkout. Refresh replaced only the viewer. No gameplay inputs, run configuration edits, inference or scheduler changes were made.
- Eleven current future-run definitions enable the improved gates in both arms. Actual future gameplay activation remains unlaunched; this task establishes implementation, review, landing, configuration and viewer proof, not measured gameplay benefit. All disclosed audit follow-ups remain open. No archive action authorized.

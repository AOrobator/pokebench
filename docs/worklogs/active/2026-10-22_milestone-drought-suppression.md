# Milestone drought suppression

## Authorized outcome and boundary

Operator requested a separate switch to suppress milestone-drought interventions, enabled in the bundle; cutscenes must not receive these timer-based interruptions. One milestone. Existing positive-supervisor-v1 stays independent; no new cutscene classification or blanket suppression of evidence-based repeated-action guards. No active run changes or experiment launch.

Evidence: GLM run 2026-10-21T22-35-12_glm53-mac_557c, seq 24541–24543, turn 313: new Devon researcher dialogue, locked field and dismiss_wait; drought warning says game is not moving forward. Turn 314 B advances into Aqua battle (seq 24661). Source pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, PetalburgWoods_EventScript_DevonResearcherIntro.

## Design

milestone-drought-suppression-v1, default OFF, needs stall-briefing-v1. ON retires milestone-drought notes to existing diagnostic loop_guard would_warn records; never calls detector.stall for drought. Map-cycle, interface-dwell, repeated-action and text-only supervisors unchanged. Existing positive supervisor keeps its old byte-identical diagnostics when both are on. Retired diagnostics remain in Activity History; no timeline additions. Current bundle definitions enable it, control stays false; historical definitions untouched. Pending single-switch experiment, unqueued/unapproved.

Production owners: stall-briefing.ts, play-wiring.ts, feature registry/defaults, fixed bundle definitions, pending experiment, viewer explainer mapping. No new event/schema/tool/server readout.

## Skills

feature-switch, agent-observability, feature-explainer, experiment-queue, talk-to-claude, execute-worklog, multi-model-review.

## M1

- [x] RED recorded cutscene/factory and OFF tests; commit
- [x] GREEN production wiring, registry/defaults, bundle, pending experiment and explainer; commit
- [x] Gates, deletion/restoration, local viewer proof
- [ ] Principles and independent Claude/Grok/GPT frozen-packet reviews
- [ ] Landing board, reviewed fast-forward, live surface proof

## Session log

- 2026-10-22: Created isolated managed worktree, informed Claude. Active runs untouched.

## Review log

Not started.

- RED: recorded cutscene test fails with the new switch absent; branch test commit contains unchanged production source.

- RED commit 862376708. GREEN tests: just test passed 4,436 agent, 1,671 viewer, 3,889 Python. Initial Python run lacked the worktree ROM configuration/native binding; configured the existing external ROM and linked the existing binding into this isolated virtualenv, then the entire Python suite passed. No Python source changes.
- Deletion/restoration receipts: /tmp/drought-delete-factory.log (diagnostic assertions fail), /tmp/drought-delete-gate.log (suppression and actual detector feedback fail), /tmp/drought-restored.log (7/7 pass). These exercise the production factory and actual loop-detector context delivery, not only a helper.
- Six current bundle recipes now include the switch, adding glm53-flash-4h (explicit current-main GLM recipe) to the five shared recipes. Their base/control stays OFF; positive-supervisor-v1 stays OFF. Historical versioned recipes/control-base hashes unchanged.
- Viewer model's existing diagnostic exclusion extended only for this switch, to preserve the closed timeline invariant. Agent-side JSON/schema remains unchanged. Existing Activity History and inspector retain the diagnostic.
- Historical registry-tail assertions move by one; old all-on fixtures explicitly keep this new treatment OFF. No behavioral assertions removed or weakened.
- Joined landing board number 2, behind claude/no-story-foreknowledge-min; informed coordinator to hold landings at our slot before packet sealing. Active runs untouched.

- GREEN implementation commit f15bfaf79536c51192da84d04dff6077b9b61986. Pending experiment pins this implementation; repin to final main before approval. Entry remains unqueued/unapproved. All 204 branch definitions parse. Readiness from actual main recordings: recent-lane fallback 4/4 think-fast (2f46, 6684, dc0e, 17a0, Oct 15); no exact-current-incumbent trials. Existing starter-decision-salience ledger errors remain unrelated and untouched.
- Full coverage passed: agent lines 99.23%, branches 93.29%, functions 97.98%; viewer lines 97.95%, branches 91.34%, functions 94.35%; Python lines 97.38%, branches 93.39%, functions 100%. Native suite 3,889 passed. Lint and build passed after explicitly narrowing legacy events before reading optional mode. Vendor pin clean.
- Browser proof: isolated 8794 server via startViewer directly (no auto-runner), derived offline replay of original GLM 557c state/result through production stallBriefing. Diagnostic #24543 appears in Activity History and raw JSON, SUPERVISOR count is zero, no drought timeline marker; original run unchanged. Harness Config shows this switch ON and its Read explainer click opens the correct tracked document. Proof files under main runs/mockups/milestone-drought-suppression-v1/. Source/current served module verification retained with review packet. No measured play or GPU use.
- Explainer screenshot QA at 1280, 1440 and 375 widths; corrected long source-symbol wrapping at phone width, repeated phone screenshot, and page network check passed. Diagram scrolls inside its own panel on phone.

## Review round 1

Frozen base a637f683c024f60e00455f68961ddec369602e6a, head 06802718cfe9366b9cd33495c13d7b2a60feefe5, diff SHA256 0f2c36d34df7e74ddd45c8a412857f96a146fc29e227a8ce4935d35378ae2de3. Claude CLI cloud lane: VERDICT: LGTM. Isolated GPT gpt-5.6-sol xhigh: VERDICT: BLOCKING, one required-record defect: the appended three-column readiness row is ignored by the four-column production parser. Fix accepted; no runtime finding. Grok Cursor cursor-grok-4.5-high: unavailable, exit 1, ActionRequiredError account out of usage. Not LGTM. No alternative Grok-family harness configured. Per execute-worklog, no self-merge without operator exception; two distinct-model fresh fallback reviews will provide reduced-diversity review evidence only.

Synthesis: behavior and test quality approved in both completed reviews. All nine test-quality checks considered: production caller and real detector context covered; factory/gate deletion/restoration receipts retained; no test-global mutation; test-owned local subscribers/fixtures; no new concurrency; no suppression/retry changes; exact diagnostic payload and identity assertions; fixture loops at most 31 in-memory state/result pairs, no per-iteration I/O or growing-prefix validation; timer advanced by injected time rather than waiting. Cosmetic README spacing and equivalent JSON unicode spelling are nonblocking and left alone. Required readiness record classified as in-contract metadata defect, not cosmetic. No scope growth or new runtime owner. One blocker-producing round only.

- Bounded round-2 fix: four-column readiness table with its own header, regression assertion through production parseReadinessDoc, and pending source pin moved to build/lint-valid implementation 06802718c. The runtime implementation is unchanged. Focused viewer tests pass. No approval or gameplay launched.

- Round-2 preflight: fdbf37e97 received Claude LGTM, but final viewer lint rejected the new test's asymmetric expect.stringContaining value as an unsafe assignment. Do not claim that packet gated. Replaced the matcher-object assertion with exact verdict and evidence-string assertions (same parser/value coverage), then re-sealed before dispatching remaining reviewers. No runtime change. Claude's statement that final lint passed was based on the earlier log and is not accepted as current gate evidence.

## Resume and integration (2026-10-22)

Verified standing operator authorization in Claude transcript 00000000-0000-4000-8000-1bb4e739f4f4.jsonl lines4143/4145 and4962/4964: server-copied the operator message [private message reference] at2026-10-21T20:35:35Z says "yes dont wait for grok"; project coordinator confirms this answered the global-while-Cursor-unavailable question allowing Claude+GPT+distinct fallback. Thus no new operator confirmation is required. Earlier request in this chat was unnecessary.

Final c1477a208 packet had Claude CLI, normal isolated GPT gpt-5.6-sol, fresh gpt-6.1-sol and gpt-6-astra fallback LGTM on exact diff b5182796027b0fea98482ba6301728800878da6fdd9779de0af2788c20d89346, clean before/after. Full synthesis in runs/reviews/milestone-drought-suppression/final/synthesis.md. Under verified authorization that roster is sufficient while Grok is unavailable.

Main advanced to d14390a48. Integrating it preserves the newer move-learn early comparison, current fixed recipes/defaults/registry order, and all unrelated source. Our treatment remains the one appended switch, defaultOFF, bundleON. Registry/default and historical tail tests resolved from current main plus our one append; no existing behavior tests removed. Pending incumbent refreshed to the current bundle with only this switch OFF. Native harness suppression code is unchanged from reviewed c1477a208. Initial sync tests exposed nine mechanical tail-index assertions, adjusted by exactly one.

The keeper expired the old landing slot while relay mail was buffered; current board position4. Main/restarts remain untouched until our turn. Final packet will be refreshed after upstream landings settle.

- Integrated snapshot22ad13abe gates: just test passes4443 agent,1671 viewer,3947 Python; just lint, just build (stamp22ad13a) and verify-vendor pass. First viewer test attempt used stale pre-main-sync agent dist and rejected the newly landed move-learn-early-comparison flag; rebuilding before the full suite resolved that without source changes.
- First coverage attempt hit the existing5000ms pending-field-dialogue test deadline (one failure; all4442 others passed). Unchanged full battle-text-auto-advance file then passed60/60. Repeated unchanged just coverage passed all TS and Python tests with no test/deadline/coverage edits: agent lines99.23 branches93.30 functions97.98; viewer lines97.95 branches91.34 functions94.35; Python all metrics above90. Logs /tmp/drought-sync-tests2.log, /tmp/drought-sync-lint.log, /tmp/drought-sync-build.log, /tmp/drought-sync-coverage2.log. No gate is lowered or skipped.
- Pending experiment source repinned to integrated implementation22ad13abe, whose current-main flag vocabulary matches its updated incumbent. This is metadata only, still unqueued/unapproved. Do not launch it.
- Fresh operator blanket land-without-Grok instruction also relayed at10:47AM EDT2026-10-22: "land without grok. you are not a very good coordinator if you force me to go into chats". Earlier verified standing waiver already authorized the fallback roster. No remaining operator-approval blocker; no further permission question needed.
- Current board position4, behind poison/berry readouts, evolution result page and slot-hard-cap. Upstream main has since advanced to7a85828b0 during those landings. Wait for board notification; then sync the final preceding main, rerun required integration gates, seal renewed packet and obtain Claude+GPT+distinct fallback LGTM under the verified waiver, reviewed fast-forward at slot1, single coordinated viewer restart/live checks, evidence-only main worklog commit and land-done. Main/restart/active runs untouched by this branch so far. No unresolved implementation or correctness blocker.

## Final landing integration

At next board notification main was e21aaa8c5, containing poison/berry, evolution result and30-minute slot updates. Followed updated talk-to-claude/execute-worklog rule: released slot before sync/re-review because our registry diff changes. Coordinator asked to hold main briefly; will rejoin ready. Standing operator Grok waiver continues to apply; no permission question.

Reconstructed shared registries/defaults/current recipes and historical registry tests from final main plus exactly our appended treatment; preserved every newer switch and behavior. Documentation keeps both upstream additions and our four-column readiness section. Suppression production owners remain the reviewed three-line behavior change. Initial agent suite had two append-only test expectation misses and the existing real-child startup deadline; corrected only registry/incumbent expectations, with timing test source unchanged. Pending incumbent refreshed to final current bundle with only this switch OFF.

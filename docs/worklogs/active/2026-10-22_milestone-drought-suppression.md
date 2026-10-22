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
- [ ] Gates, deletion/restoration, local viewer proof
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

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

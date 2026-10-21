# Coordinator empty wake repair

Operator requested fixing coordinator wake-ups that find no mail. Scope: mailbox notification bookkeeping only; no gameplay or viewer restart.

Cause: --hold unlinks wake-sent before collecting letters. New arrivals during forwarding can queue an extra wake; the current turn consumes those arrivals, leaving the queued wake empty.

Repair: retain the wake marker through every held batch and acknowledgment. Clear it only when the held mailbox finishes an empty read, under the mailbox lock together with its final drain. This makes arrival-before-idle part of the current turn and arrival-after-idle eligible for a new wake.

- [x] RED: regression for arrival during forwarding and next idle-to-mail transition.
- [x] GREEN: marker cleared only on atomic empty drain.
- [x] Gates and independent cloud review.
- [x] Land at board turn, verify the corrected consumer (watcher implementation unchanged), verify event-driven forwarding.

RED verified: two regressions fail on premature marker deletion and redundant wake during forwarding.

GREEN: 63 mailbox tests pass. RED commit 0802aa64. CLI regression retains one wake through forwarding and permits a new wake only after empty read. Added deterministic arrival during final read. Full lint/build/coverage/vendor gates running; separate just test hit the unchanged serial-comparison hung-child startup timing failure under concurrent load; no source or threshold change. Rerun after broad checks complete.

Landing slot arrived 18:36 New York. Synced main a919c5ca6 cleanly in merge 60ae1a82; slot-expiry changes preserved. Serial normal gates running on synchronized code. Real-process CLI rehearsal runs/reviews/wake-dedup/rehearsal.json: three exact letters across two drain turns, two fake queue calls, zero empty wakes, no real queue/game/model calls. The watcher function is unchanged, so correcting the consumer does not require restarting it. Existing 600-second stale-wake recovery remains unchanged; no exact-once crash guarantee claimed.

## Landing proof — 2026-10-21 18:46 New York

- Frozen packet: base a919c5ca62aa7769230f949ddb84503ab78802a0; head 773485f1a5f014522d4c10980ef3ad167b9ebaa2; binary diff SHA256 cd3884eb84384bb07e1538d3c0747bfd7d488f976bf93b2fa21c30866422f31d. Clean, unchanged packet verified immediately before ff-only merge into main.
- Normal build/lint/test/coverage/vendor all pass. Test and coverage counts: agent 3434, viewer 1662, Python 3850. Python coverage 97.34% lines / 93.25% branches / 100% functions; agent_mail.py 100% lines and branches. Initial Python coverage attempt lacked worktree ROM environment (164 failed, 515 skipped); connected existing .env and reran full normal coverage and tests without source, timeout or threshold changes. Earlier unmodified startup-timing failures retained with the receipts.
- Exact-hash reviews: Claude CLI LGTM, independent GPT subagent /root/wake_repair_review LGTM, independent gpt-6.1-sol fallback /root/wake_repair_fallback LGTM. Cursor Grok failed with ActionRequiredError out of usage. Used the operator's general Claude + GPT + fallback authorization relayed with the exact 4:35 PM question/answer in the coordinator chat. Reduced vendor diversity; no claim of Grok approval.
- Post-main build and normal tests pass again: 3434 agent / 1662 viewer / 3850 Python.
- Main-checkout real-process CLI proof: imported canonical env/pokebench_env/agent_mail.py at 773485f1a; exact first/during-forwarding/after-idle letters preserved; three letters, two drain turns, two fake queue calls, zero empty wakes. No real Codex wake, model request or game input in rehearsal.
- One coordinated viewer-main refresh: served clean 773485f1a, listener 62386 on 8790, workbench HTTP 200 with no older-build problem. All six game/agent PIDs 36628,36786,52760,56597,79986,80022 and automatic controller 37440 survived. No schedule, live preset, lease or gameplay changes. Watcher process kept running; changed consumer code is loaded by each fresh mailbox command.
- Canonical receipts: runs/reviews/coordinator-wake-dedup-20261021/ (packet, reviews, gate logs, rehearsal.json, main-rehearsal.json, live-proof.json).
- Non-blocking review follow-up: a stopped forwarder retains the marker until stale recovery permits another wake (600 s on a later ping); no stronger crash-recovery guarantee is claimed. Docstring clarification and pre-existing empty-claim/multiple-listener guarantees are outside this repair.
- Evidence-only worklog commit follows the reviewed code; then land-done releases the slot. Worklog is not archived without operator approval.

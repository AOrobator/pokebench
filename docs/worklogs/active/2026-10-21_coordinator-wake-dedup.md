# Coordinator empty wake repair

Operator requested fixing coordinator wake-ups that find no mail. Scope: mailbox notification bookkeeping only; no gameplay or viewer restart.

Cause: --hold unlinks wake-sent before collecting letters. New arrivals during forwarding can queue an extra wake; the current turn consumes those arrivals, leaving the queued wake empty.

Repair: retain the wake marker through every held batch and acknowledgment. Clear it only when the held mailbox finishes an empty read, under the mailbox lock together with its final drain. This makes arrival-before-idle part of the current turn and arrival-after-idle eligible for a new wake.

- [x] RED: regression for arrival during forwarding and next idle-to-mail transition.
- [ ] GREEN: marker cleared only on atomic empty drain.
- [ ] Gates and independent cloud review.
- [ ] Land at board turn, restart only the watcher with corrected code, verify event-driven forwarding.

RED verified: two regressions fail on premature marker deletion and redundant wake during forwarding.

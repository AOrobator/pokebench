# Extend an active run

## Problem Statement
The operator wants EXTEND beside Pause/Stop/Abort, opening a dialog with +30 minutes and +1 hour. A finite extension preserves the current run and GPU until it ends; automated runners must wait. Keep the 20,000-turn cap. Preserve the original evaluation horizon and label later play as an operator-extended continuation.

Authorization: 2026-10-19, after discussing this exact flow, the operator said “ok make a worklog and then execute it”. This authorizes creating and executing this worklog without a second plan approval. No gameplay launches or changes to existing runs are authorized or needed.

## Skills Loaded
feature-worklog; execute-worklog; feature-switch (applicability assessed); feature-explainer; agent-observability; viewer-e2e; close-the-loop; multi-model-review.

## Architecture
Reuse the typed control.jsonl request channel and durable operator event stream. An explicit extension request adds exactly 1,800,000 or 3,600,000 ms to the current active-time cap, never the turn cap. One effective-budget owner feeds BudgetTimer and Governor. The agent durably acknowledges acceptance with old/new limits and request identity; the UI waits for that acknowledgement. Replays reconstruct the effective cap. Historical run_start remains immutable. Original-horizon experiment grading stays unchanged; extended progress is disclosed separately. Existing runner launch/adoption waits retain the GPU until actual process completion.

This is an operator control like pause/stop, not a model treatment: no prompt, tool, game observation, autonomous action or automatic extension changes. No ablation switch or experiment registration; the explicit request is the opt-in and absent requests preserve the current runtime. All runs still have a finite deadline. Existing frozen binaries cannot acquire this new capability; the viewer must not offer unsupported controls.

## Invariants
- INV-1: Only the two finite additions are valid; reject arbitrary/negative/infinite values. Test boundary schemas and API validation.
- INV-2: No request means exact old time/turn behavior. Repeated distinct requests accumulate; duplicate identities do not. Test production control delivery, timer rearming and turn-boundary checks.
- INV-3: Only live, capable agent runs can extend. Ended/replay/human/unsupported runs reject; a terminal race cannot revive a run. Test API and consumer states.
- INV-4: Successful UI state follows durable agent acknowledgement, not HTTP request enqueue. Test pending/error/retry, stale-run selection and mounted dialog interactions.
- INV-5: Pauses remain excluded and stop/abort semantics remain unchanged. Test paused extension/resume and stop races.
- INV-6: The runner does not advance the same GPU until process exit, including adoption. Rehearse with fake time and extended events through runFixed.
- INV-7: Original horizon and turn cap remain immutable; post-horizon progress is marked continuation and is not credited at the original cutoff. Test ledger grading and replay consumers.

## Security Review
Reuse loopback/allowed-origin, run-id validation and existing POST control ownership. Typed requests, bounded increments, monotonically sequenced durable requests; do not add arbitrary process control or filesystem routes. No ROM reads, model calls, real extensions or GPU launches needed for verification.

## Milestones
**M1 — End-to-end finite extension**
- [x] RED: control, timer, budget, viewer API/DOM/replay and runner regression tests; commit with this log.
- [x] GREEN: implement typed request/ack, shared effective cap, dialog, history and continuation disclosure.
- [x] Gates: just test, just lint, just build, just coverage (90% independently), just verify-vendor, schema regeneration.
- [x] Fake-data runner rehearsal and isolated browser clicks at desktop/phone widths, inspected screenshots, pending/failure/recovery and replay.
- [x] Explainer with mechanism diagram, local delivery and verification.
- [ ] Principles PB1–PB13 self-review; frozen packet; independent Claude/Grok/GPT review; triage and at most two rounds.
- [ ] Commit GREEN and land only with required cloud approvals and passing gates. Do not overwrite unrelated checkout edits.
- [ ] After landing, viewer restart coordinated with other owners and live read-only proof; existing gameplay processes preserved.

## Closing the Loop
Scratch runs root only, no experiment approvals; candidate viewer on owned port. Exercise +30/+60, cancel, paused extension, end race, rejection, repeat requests, focus through polling, reload/replay and raw inspection. Retain evidence under ignored runs/extend-run-proof. Never extend a real benchmark for a smoke check. Report separately code, gates, review, landing and live availability. Old running binaries remain unsupported until subsequent runs start from the new build.

## Session Log
- Created from main in managed worktree; primary checkout is codex/viewer-60fps with unrelated edits. Original read-only audit found record 1,543 turns; no turn-cap change.

## Surprises
None yet.

## Multi-Model Review Log
Pending.

## Boy Scout Log
No adjacent cleanup planned.

## Archive Milestone (user-gated)
- [ ] ASK USER before archiving. Keep active after delivery.
- RED: new production-control deadline/governor, pause/terminal/unsupported, schema/turn-cap tests and replay/capability/history tests fail on the missing extension contract (receipts /tmp/pb-extend-red-{agent,viewer}.log).
- RED commit 0da25eb6 recorded; GREEN runtime/control and viewer implementation underway. The capability bit is emitted only for the live gameplay entrypoint and survives withRun into run_start. Old binaries/recordings do not advertise extension support.

- Operator amendment: 2026-10-19, “needs to be more pokemon themed, use the emerald and current design language”. Replaced the generic dark dialog with the viewer’s Emerald frame, inset blue border, pixel heading, PokéNav label, yellow confirmation and red advance arrow. Phone rehearsal exposed the continuation note occupying a stat cell; moved it after the four metrics with full-width readable text.

- Operator amendment: vertically center Pause/Extend/Stop text with their icons. Split symbols and labels into flex-aligned elements; preserve the Abort hold instruction below its label.
- Core/runtime seam: actual live.ts entrypoint -> withRun -> control.jsonl -> typed acknowledgement -> target callback and Governor verified. Paused extension also retains its original active-time grading horizon. Four adversarial deletions each failed the intended test and passed after restoration: live Governor wiring, timer cap, replay cap, experiment cutoff (runs/extend-run-proof/mutation-*-{red,restored}.log).
- Rehearsal: runFixed held two child launches past the old caps, then finished all twelve planned slots with no replacements and no post-horizon STONE_BADGE credit. No GPU/model/emulator calls. Existing adoption awaits PID liveness.
- Browser: owned 8798 server with scratch root only. Cancel; +30 minutes; reload retained cap; Pause; +1 hour via keyboard; paused clock held; Resume via keyboard. Durable events #2/#5 and Activity History show 2h -> 2h30 -> 3h30. Raw state and final replay checks pending. No console errors. Desktop/phone Emerald screenshots opened and inspected at 1280, 1440 and 375. Latest screenshots: main checkout runs/mockups/extend-run/shots/emerald-*.png.
- Gates before final freeze: full TS 2573 agent + 1237 viewer and Python 2724 tests passed; coverage agent 97.86 statements/94.08 branches/98.27 functions, viewer 95.41/91.36/93.97, Python 97.12 lines/92.85 branches/100 functions. Final re-run includes the operator theme/alignment amendments and the paused-horizon regression.
- Standalone Claude reviewer namespace reports loggedIn=false; use standing-authorized Cursor Claude equivalent. Discovered Claude, Grok and GPT model ids via agent models. No local inference reviewers.
- Final proof: inspector selected real scratch extension event #2 with previous=7200000/new=9000000 and request=1. Built/served app.js, index.html and style.css SHA-256s match (served-assets.json). Explainer zero-network check and local 8791 delivery pass; screenshots inspected at all three widths (viewport-bound tab; corrected an initial unbound-tab capture).
- All final tests: 2574 agent, 1237 viewer, 2724 Python, zero skipped. just lint/build/verify-vendor pass. Original-horizon pause regression added within existing patch-results owner. Agent coverage re-run after that test; other stack coverage unchanged and above 90. Green source remains unlanded pending cloud review.

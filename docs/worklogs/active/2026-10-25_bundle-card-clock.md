# Restore the live bundle card after a clock regression

User authorization: fix the viewer so the 24-hour bundle appears; investigate the backward timestamp; do not interrupt or restart active runs.

Single repair milestone. Production boundary: packages/viewer/src/frontier-recording.ts and workbench-store.ts. Preserve strict grading readers; introduce explicit display-only clock tolerance, retain event identity/sequence/terminal/schema checks, report the first regression, withhold all split/measurement credit for the anomalous log, and preserve live/paused/end status and recorded card fields. No trainer-card design, schema, agent behavior, recipe, source recording, or active-process edits. Producer investigation is read-only. No timeline additions.

Consumers: native recording projection -> workbench loader -> health-confirmed cards -> existing browser card and problem surfaces. Keep incremental append reductions; do not add a whole-log fallback on each poll.

Terminator: tests/gates, cloud review, serialized local landing, one coordinated viewer-only refresh, real card/frame proof; existing gameplay PID identities and recording remain intact. Scope growth requires a separate proposal.

## Milestone
- [x] RED regression and adversarial tests: workbench regression tests failed 2/2 (62 existing passed); reader tests added to preserve strict grading and identity/terminal boundaries. Initial attempt before agent build failed dependency imports and is not counted as behavioral RED.
- [ ] GREEN display-only recovery
- [ ] Gates and isolated browser proof
- [ ] Cloud reviews and synthesis
- [ ] Landing and live proof

## Investigation
Run 2026-10-24T19-31-52_qwen36-gpu0_9e33 at pin aacff23719689857d161901e51004af1c4718f1b. seq78475 native_action t00:55:54.024, seq78476 state t00:55:53.981 on 2026-10-25 EDT: 43ms backward. Sequence continuous, no run_end; gameplay still writing at turn2030. Card-selected API reports invalid event order; ordinary card API strips invalid run into ended placeholder. RunLog.append samples local Date synchronously at every append and does not enforce monotonic time. State schema excludes t. OS timed log at the exact moment confirms settimeofday success: adjust -0.079839110 seconds, from TMTimeSynthesizer following NTP measurement. The next recorded event is 43ms earlier because some real time elapsed between appends. This is system-clock correction, not reordered sequence or an agent restart. No producer change needed for active run recovery.

## Evidence
Pending.

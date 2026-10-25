# Restore the live bundle card after a clock regression

User authorization: fix the viewer so the 24-hour bundle appears; investigate the backward timestamp; do not interrupt or restart active runs.

Single repair milestone. Production boundary: packages/viewer/src/frontier-recording.ts and workbench-store.ts. Preserve strict grading readers; introduce explicit display-only clock tolerance, retain event identity/sequence/terminal/schema checks, report the first regression, withhold all split/measurement credit for the anomalous log, and preserve live/paused/end status and recorded card fields. No trainer-card design, schema, agent behavior, recipe, source recording, or active-process edits. Producer investigation is read-only. No timeline additions.

Consumers: native recording projection -> workbench loader -> health-confirmed cards -> existing browser card and problem surfaces. Keep incremental append reductions; do not add a whole-log fallback on each poll.

Terminator: tests/gates, cloud review, serialized local landing, one coordinated viewer-only refresh, real card/frame proof; existing gameplay PID identities and recording remain intact. Scope growth requires a separate proposal.

## Milestone
- [x] RED regression and adversarial tests: workbench regression tests failed 2/2 (62 existing passed); reader tests added to preserve strict grading and identity/terminal boundaries. Initial attempt before agent build failed dependency imports and is not counted as behavioral RED.
- [x] GREEN display-only recovery: 97 focused tests pass. Explicit display policy alone tolerates backward timestamps; records the first sequence/delta, preserves raw log and gap/identity/terminal validation, and removes graded splits/measurements. Existing cohort fixture now shifts every event with its header instead of accidentally generating multi-day backward jumps.
- [x] Gates and isolated browser proof: full test 4389 agent +1913 viewer +4159 Python passed, protected design guard and3approved screenshots passed; lint/build/coverage/vendor passed; inspected candidate live-frame screenshots.
- [ ] Cloud reviews and synthesis
- [ ] Landing and live proof

## Investigation
Run 2026-10-24T19-31-52_qwen36-gpu0_9e33 at pin aacff23719689857d161901e51004af1c4718f1b. seq78475 native_action t00:55:54.024, seq78476 state t00:55:53.981 on 2026-10-25 EDT: 43ms backward. Sequence continuous, no run_end; gameplay still writing at turn2030. Card-selected API reports invalid event order; ordinary card API strips invalid run into ended placeholder. RunLog.append samples local Date synchronously at every append and does not enforce monotonic time. State schema excludes t. OS timed log at the exact moment confirms settimeofday success: adjust -0.079839110 seconds, from TMTimeSynthesizer following NTP measurement. The next recorded event is 43ms earlier because some real time elapsed between appends. This is system-clock correction, not reordered sequence or an agent restart. No producer change needed for active run recovery.

## Evidence
Pending.

### Validation receipts
RED commit 1ee198e4e. /tmp/bundle-clock-red.log preserved. Six independent adversarial deletions (incremental policy, one-shot policy, raw-split suppression, split suppression, measurement removal, problem delivery) each fail the focused suite; each source is restored in finally. /tmp/bundle-clock-mutation-<name>.log; /tmp/bundle-clock-mutants-restored.log = 97/97 passed. Small in-memory fixture arrays (4-7 events) serialize once to unique temp dirs; incremental test alone appends individual pause/end lines to prove byte offsets. No global environment/cwd mutation, new retry/sleep, process spawning, or model/network calls in unit tests. Four hostile identity/order cases remain rejected in display mode.

Initial full test: TS 4389+1913 passed; Python missing worktree .env failed (not a code pass). Setup fixed by read-only .env link; local worktree Python environment installed independently, shared editable Python path restored to canonical checkout. Full lint passes. Coverage: agent lines99.17/branches92.74/functions97.61; viewer lines98.05/branches91.74/functions95.20; Python4159 passed, lines97.40/branches93.43/functions100. Vendor clean. Experiment audit emits no findings. Final full test includes4159Python tests and protected trainer-card guard plus3approved screenshots; all pass.

Candidate built viewer18794 reads scratch copies of 9e33/d41e/6bbd logs, with frame/art links read-only. Real browser headless Chrome: visible 9e33 card -> pointer Watch -> correct run hash, RUNNING label and game frame; all3cards retained across12s polling, no page errors. Inspected1280/1440/375 screenshots under canonical runs/mockups/bundle-card-clock/shots/candidate-*.png. Original user tab untouched. Current protected gameplay/runner PID baseline at canonical runs/bundle-card-clock-evidence/processes-before.txt; no process actions sent.

Producer: production RunLog with an injected two-value clock reproduces exactly43ms backward with contiguous sequence0,1; canonical runs/bundle-card-clock-evidence/producer-reproduction.json. macOS timed evidence at timed-clock-adjustment.log records successful settimeofday correction -0.079839110s and NTP source. No live recorder change; no model decision or game mechanics blamed.

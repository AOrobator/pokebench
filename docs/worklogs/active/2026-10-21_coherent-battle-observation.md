# Coherent battle observation repair

## Authorized outcome and boundary
User: fix disappearing damage readouts, preserve safety guard, test and independently review before experiment launch. Separate from strategy support. Starting from current main in isolated managed worktree; no active-run inputs/restarts, no experiment launch. Root evidence: run2e93 turns660–675,12/16mid-callback tool results omit battle details via the existing guard. Frozen-source replay and hashes under canonical runs/strategy-support/readout-investigation.

## Frozen production path
Existing FrameSettle owns the bounded frame wait and capture lifecycle; extend it for battle coherence, wire from existing serve factory. Observation owner records existing settle reason and explicit incomplete-capture notice. Existing game_state/main_loop_idle guard is unchanged. Append-only switch registration/presets/server propagation/viewer next-run/explainer/pending-entry metadata are required integration surfaces, not new runtime owners. Tests/proof may add fixture/replay harnesses. No new thread/persistence owner, dependency, timeline marks, move policy or native milestone grader.

## Invariants and intended consumers
- OFF exactly preserves existing capture/readout behavior; new coherent-battle-observation-v1 defaults OFF everywhere.
- ON waits for a current coherent frame during battle instead of reading save-backed data mid-callback; never patch or bypass main_loop_idle/game_state guard, never mix old RAM with new image.
- Bound60emulated frames, plus2-second wall-clock wait check using existing Event lifecycle; pause/input hold/bound/error produce explicit truthful metadata and preserve guard-protected partial state. No game inputs or memory writes; waiting can advance natural game time and is declared.
- Raw receipt, state, screenshot and model text refer to the same capture. Producer→typed state/tool result→recorded events/model delivery→viewer raw/activity/replay use existing paths; no timeline additions.
- Coherent party/resource/native story facts and damage return together; plan-owner continuity can be tested against strategy candidate in proof without bundling it into repair source.

## Verification plan
RED production-shaped wait/capture regression; GREEN existing/new frame/timeout/paused/held/failure tests; default-OFF/preset/server/factory registration checks; real raw/native isolated capture proof with no inference; guard-wiring deletion/restoration receipts; complete tests/lint/coverage/build/vendor. Freeze clean packet, PB1–PB13 self-review and cloud review with authorized fallback if unavailable. Exact source/ROM/vendor and nine-check review evidence retained. Terminator: tested and reviewed repair, held before measured experiment. Landing remains a separate repository gate.

## Session log
- Read repository rules, feature-switch, game-state, observability, explainer/experiment lifecycle and multi-model-review contracts. Canonical main initially clean; isolated worktree created. No behavior edited yet.

- Implemented bounded FrameSettle capture with default-OFF wiring, unchanged game-state guard, truthful bounds/timeout metadata and explicit missing-CPU failure. Native isolated proof restored damage after one natural frame; no model calls or live-session inputs. Added archived native writable-RAM/CPU fixture and factory/observation regression tests. Mechanical registry expectation migration preserves historical feature assertions.
- Focused 27-test repair suite GREEN, six distinct adversarial mutations RED and byte-restored GREEN (factory, CPU predicate, battle-end continuity, frame bound, timeout cleanup, incomplete notice). Full initial TS suite: agent passed; viewer 1608 passed/one registry-overhead projection failure already repaired on current main. Build passed. Preparing sync with concurrent main before final integration gates/review; no gate waiver or launch.

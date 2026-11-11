# Keep viewer displays live across additive event changes

Operator requested tolerant display parsing, independent cards and clock during
history rebuilding, and a coordinated refresh of viewer and current-state service.
The actual failing state at Opus turn 1483 contains running.movement_direction,
which the older projector rejects. Preserve strict grading and original logs.
Work in isolation, prove unsupported and malformed records remain visible as
warnings while later valid state updates continue. Refresh both services together
only after review and gates. Preserve active gameplay and its pinned runtime.

## Implementation and focused evidence

- Viewer-only decoder strips additive fields, retains strict recorder/grade schemas,
  and represents unsupported bodies as explicitly partial display records. Damaged
  JSON remains an omission warning; later identity and backward-sequence checks hold.
- Independently bounded control-only scan recovers pauses/extensions before expensive
  state/history replay. It persists its cursor; unknown control bodies withhold the
  clock. Partial history never publishes complete token/error totals.
- Viewer refresh installs the projector and web consumer from one prepared tree.
- No harness switches, model prompts, gameplay runtime, recording, trainer-card
  identity/design, or grading authority changed.
- Focused viewer tests: 42 passed; affected viewer tsc/ESLint passed. Python ruff,
  mypy passed; refresh/unload tests 4 passed. Initial parser tests failed before
  implementation. Follow-up regression exposed and retained the existing approximate
  backward-time display behavior separately from omitted-record completeness.
- Read-only native event replay: event seq 76877 / turn 1483 with
  running.movement_direction=4 decodes as state and passes strict validation after
  display normalization. Original recording unchanged.
- Offline isolated projector rehearsal: 2,204 events, trainer card and verified
  clock available while complete=false; later complete=true; restart reload and
  public reader pass. Evidence runs/proofs/viewer-compatible-events/rehearsal.json.
  Rehearsal used focused transpilation, not a claimed full build/gate.
- Full gates requested through relay; no listener, request saved. Full gates,
  independent reviews, browser proof, landing and activation remain pending.
- Grok standing all-branch waiver: operator 2026-10-22; disclose on landing.
- Stats redraw preserves the reader's keyed panel position while the independently
  available budget rows and eventually recovered totals change.

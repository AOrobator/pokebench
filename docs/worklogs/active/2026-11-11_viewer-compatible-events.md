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

## Round one and correction batch

Frozen base aaecbda1732db0f598dfd5489055ce671f063c98, head
0bb4a046c629b5ea4d00d13ace4fb4fd9312dd4c, diff SHA-256
8c7336cf8c4d799a1e213606cd425962a4c9d1cbb5c1454b69dc683c2032fb74.
Full lint/build/test/vendor passed on that frozen source: agent 3017, viewer 1261,
env 3089, gateway 39 tests; all coverage floors and no-I/O proof passed.
No coordinator listener; used operator's earlier instruction to run needed checks
without queueing. No gameplay/recording changes.

Independent GPT BLOCKING: unsupported-only history page incorrectly terminated
pagination. Fix accepted: explicit skipped-record cursor bookkeeping; RED regression
failed before correction. Independent Claude BLOCKING: malformed trailing-line gap
was not durable on restart, and lost-owner health semantics had changed. Both fixes
accepted: persist both live and rebuild pending-gap cursors; restore previous owner
status behavior. Claude nonblocking refresh-order issue accepted within same refresh
owner: start backward-compatible web consumer before updating projector. Other
hardening observations retained as follow-ups, not additional scope.

Browser rehearsal found a phone document scroll jump when counters become available;
protect the document as well as the inner stats pane. No card appearance or identity
changed. Focused correction tests: 52 viewer tests and 4 Python tests passed with
affected types/lint. Repeat full gates and cumulative independent reviews pending.
- Damaged-line restart rehearsal now passes with durable currentGap/rebuildGap;
  a separate unsupported-only 200-event recording pages back to valid seq 0/1.
  Evidence: runs/proofs/viewer-compatible-events/damaged-restart.json.
- A failed web refresh leaves the existing projector alone (new pure regression).
  Refresh order is web first, then projector, from the same prepared tree.
- The scroll owner is selected between the inner pane and document to avoid
  compensating twice; Chromium desktop recovery drift is below 1 px.

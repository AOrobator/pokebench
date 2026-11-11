# Durable current snapshots and stable trainer cards

Operator authorized durable fix after live verification showed a 71,814-byte valid
completed Opus summary rejected by the 65,536-byte summary cap. That summary mixes
20,522-byte immutable header, ~30KB configuration, and 20,277-byte milestone history.
Preserve gameplay and recording, all checkpoints and original logs. Do not raise the
cap as a substitute for separating owners.

Scope: store immutable header/config once behind a content reference; compact live
publication includes only bounded current facts and card progress anchors; indexed,
paginated progress/history is separate. Hydrate configuration once per browser cache.
Retain durable event snapshot when only separate evidence files change. Keep existing
cards during list refresh/pages/failure and verify the reported flicker. Old publication
rows remain readable, migration does not delete source or derived checkpoints. No
model, gameplay, card appearance/identity, stop limit or timeline lane changes.

Acceptance: pure RED/GREEN tests for large real-shaped progress/config, metadata
binding/cache and stable list refresh, evidence change checkpoint reuse; actual Opus
saved projection (read-only copy) promotes complete below original summary cap;
restart consumes only new suffix; headless Chromium/WebKit desktop/phone and repeated
polls hold card and row stable; full gates, independent review and post-main test;
single coupled refresh and actual live proof with original gameplay PIDs preserved.

## Focused implementation evidence

- RED full-game fixture failed with original 64KB summary limit; RED retained-card
  test against original client emitted [true,false] while a later list page waited.
- Live/current wire records now reference immutable metadata stored once by SHA-256;
  cached header/config hydration preserves old in-memory contracts and legacy rows.
  Card anchors are bounded to furthest reached + latest; full saved progress has an
  independent paged endpoint (64 records) and incremental cursors.
- Old snapshots survive receipt changes via prefix-only event-evidence comparison;
  source identity, byte anchors, restoration prefix and generation guards remain.
- Client refresh retains previous same-epoch rows until all pages finish, and selected
  last-known cards remain visible through health/projection errors without claiming
  their process is live. No trainer appearance or recorded identity change.
- Current data with immutable metadata no longer triggers legacy full-log card
  enrichment on startup or each incomplete-state update. Legacy fallback retained.
- Focused tests: 73 passed, affected tsc passed; final lint retry after two test-only
  style corrections. Actual cached Opus projection read-only rehearsal: 1,661-byte
  summary, 44,825-byte detail, one metadata row, 234 milestones in 4 pages, zero
  source-log bytes for current/progress reads; resumed existing completed rebuild.
  Restart after changed evidence kept generation and read only suffix data (anchors
  still verified). Proof runs/proofs/viewer-snapshot-boundaries/native-checkpoint.json.
- Original source log was read through an isolated hard link (never written), not
  copied or replayed in full. Original game/gateway/recording untouched.
- On-demand progress waits for prefix reconstruction before issuing incremental
  cursors, so a provisional tail cannot cause earlier recovered milestones to be
  skipped. Current card/clock stay independent.
- Completed #run views retain the final snapshot instead of automatically initiating
  a full replay; explicit #replay and selecting a recording preserve playback.
- Candidate browser rehearsal passes Chromium/WebKit at1440/375: one metadata
  request per page across repeated polls, no legacy /api/cards enrichment, progress
  pages served from the saved checkpoint. Optional frontier grading was explicitly
  withheld inside the isolated browser, not counted as proven. Original HOF frame
  copied read-only to scratch fixture for actual recorded image rendering.
- Source types, changed ESLint,73 focused tests, Python changed-file lint and shell
  syntax pass. Full CPU request saved with no listener; proceed under operator's
  standing instruction not to queue needed checks. Full gates/reviews/landing/live
  activation remain pending.
- Screenshot inspection exposed a final-snapshot caller: retain ended current views
  without starting a dead live-frame stream. The initial scratch fixture lacked its
  recorded PNG. A suspected regex issue was disproven against the original code
  (native189734_0.png is accepted); discarded that unrelated change and test. No
  server frame routing or filename contract changes belong in this patch.
- Saved progress carries per-milestone active time, recorded while folding each event
  rather than subtracting today's pause total from every past milestone. Legacy
  paused checkpoints with no historical timing stay unknown. RED pause regression
  proves before/after times; the display labels observed progress separately from
  grading. This connects the fast paged data to the existing splits display.

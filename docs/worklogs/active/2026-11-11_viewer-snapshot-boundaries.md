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

## Freeze and upstream impact

Final focused checks:92 tests passed, viewer type check and changed ESLint clean.
Browser checks pass Chromium/WebKit desktop1440 and phone375; recorded PNG decodes
at240x160, four progress pages paint observed split rows, metadata is fetched once,
legacy card reduction is absent, and ended current views avoid live-frame retries.
No card-design or frame-routing contract changes. Explicit replay remains separate.

Merged current main before sealing: unrelated foe-item readouts/presets and menu
null-id switch landed upstream. No overlapping viewer snapshot implementation;
new registry entries are carried by the same immutable metadata transport. Full
checks run on the integrated source. Historical November8/10 relay messages were
replayed into this chat and ignored; they do not authorize new gameplay/probes or
add any stop conditions. No original recordings or native checkpoints removed.

Integration head161829f25 is the source under full checks (test includes build,
then lint/vendor/protected visuals). The freeze-record commit initially hit the
worklog timestamp gate immediately after the merge; this substantive update records
that source identity and the running checks. No hook was bypassed.

## Independent review, round one

Frozen base3ae49f1e0 / headd26c4c130, digest
1b98e5caf5f6d9b7089801919452390f742b67c0956caa40496503ee266c602a.
Independent GPT LGTM; Claude found no implementation blocker but BLOCKING docsB1:
old viewer-only rollback cannot read compact rows, and old projector does not
republish completed rows. Fix accepted: document compatible backup + both-consumer
rollback order and limits; forward repair preferred. No backward writer/shim added.
Other hardening notes are follow-ups outside the frozen owner boundary.

Full gates passed on integrated source: agent3038, viewer1276, env3121, gateway39,
coverage floors/no-I/O, lint/vendor and protected trainer visuals3/3. Browser card
stability under held refresh and error/recovery remains an explicit completion
receipt, separate from the already passing happy-path/progress/native fixture proof.

## Landing and completed proof receipts

Round-two frozen base3ae49f1e0 / headea8998449, digest
03f2ddeb65f9bad7562df7ff0311ba1275d07e1afe270161b0877c29f9f8d510:
independent Claude and GPT both VERDICT: LGTM. Grok waived under the operator's standing
2026-10-22 all-branches waiver; no Grok review is claimed. Docs-only round-two
rollback clarification retains the executable evidence from the same source.

Final native rehearsal: compact summary1661 bytes, detail44825, 234 milestones
across4 pages; current/progress reads consume zero source-log bytes. Checkpoint
restart retains generation and suffix-only data reads after independent receipt
change. Initial recovery reads1504630 suffix/clock bytes; it is not a zero-read
reconstruction. Original recording untouched.

Card fault/recovery rehearsal: Chromium1440/375 and WebKit1440/375 sampled683,
691,601,601 animation frames respectively with zero missing selected cards.
Held same-epoch pagination, injected display error, HTTP503 and recovery covered;
phone opens the existing run sheet. Final current/progress/failure screenshots
opened and inspected. Native happy path loads metadata once,4 progress pages,
no legacy card reduction and no browser errors. Reference grading withheld only
in isolated rehearsal; live verification remains separate.

Landed fast-forward on main at ea899844965b460c5784ac035c0d81716ed538a1.
Required post-main just test passed (build, all suites/coverage and no-I/O proof).
Consistent preactivation SQLite backup saved with node:sqlite backup under
runs/proofs/viewer-snapshot-boundaries/pre-activation.sqlite (404951040 bytes).
Resolved actual preactivation served tree3ae49f1e0 (another owner's refresh since
the earlier6d5a67339 observation). No original source/cache/checkpoint deleted.
Evidence lives in runs/proofs/viewer-snapshot-boundaries; activation follows.

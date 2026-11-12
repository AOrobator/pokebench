# Splits replay story line

Authorized JOB splits-replay-line, relayed from Claude through coordinator. One bounded viewer correction; Grok standing waiver; Claude + fresh GPT review required. No viewer-main without the operator's words; never touch live Astra af33.

## Frozen boundary
Outcome: an ended recording opened with #replay draws its recorded story line despite paged event history; rewinding still hides future progress. Production paths: app.ts (consumer), run-splits.ts (pure split selection). Tests observe selected split identities and SVG series through racePlot. Existing screenshot-derived timing visibility stays with visualSplitView. No table, frontier, trainer-card, timeline, harness, recording, or server changes.
Terminator: RED/GREEN, focused checks, headless browser proof, full gates in relay CPU window, Claude + GPT LGTM, board-coordinated local landing and post-main test. Activation held. Split trigger: any new runtime owner, grading or replay-history architecture change.

## Progress
- [x] Read rules and active worklog; isolated branch codex/splits-replay-line at main 2a2b7dc0f.
- [x] Headless Chromium reproduction on ended Astra ef7d: replay scrub enabled, frontier polyline has 133 points, own line absent and own point count 1. Qwen 3bb0 stayed in loading and was not a valid repro; corrected initial interpretation.
- [x] RED regression: two failing pure tests (graphSplits absent), /tmp/pb-splits-red.log. COMMIT: `test(viewer): cover sparse replay story graph` (this commit).
- [x] GREEN correction and cheap checks: 34 tests pass, changed-file ESLint and viewer tsc --noEmit pass. Native recorded splits use the displayed event sequence bound; screenshot-derived points retain displayed-evidence gating. COMMIT: `fix(viewer): retain earlier story splits in replay graph` (this commit).
- [ ] Browser verification desktop/phone
- [ ] Full gates (CPU START required)
- [ ] Claude + GPT review; Grok waived by job
- [ ] Landing board and post-main test
- [ ] Activation: held for the operator; never run viewer-main here

## Evidence
Before screenshot: /tmp/pb-splits-before.png (ef7d, inspected). Browser entirely headless; read-only 8790, no run control actions.

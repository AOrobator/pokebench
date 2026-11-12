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
- [x] Browser verification: Chromium + WebKit, 1280/1440/375; six screenshots inspected; native own line 43 points, rewind 40, restored 43; repeated navigation + two polling cycles, no JS errors. Scratch 18796 stopped.
- [x] Relay CPU START 00:16 ET, RELEASE after proof. Full test/build: agent 3053, viewer 1312, env 3492, gateway 39; coverage + no-I/O proof passed. Full lint, pinned vendor, protected trainer guard and 3 visual checks pass (reuse successful build).
- [x] Claude CLI and fresh GPT subagent /root/review_splits_replay (fork_turns=none), both VERDICT: LGTM. Grok waived by job. Frozen base 2a2b7dc0f, head 1347c5460, exact binary diff SHA256 c4feadfc31ddbdba25a42797dd994cf61eb51c254f058eaf3793ae75cf6e89f5. Clean pre/post identity verified.
- [ ] Landing board and post-main test
- [ ] Activation: held for the operator; never run viewer-main here

## Evidence
Before screenshot: /tmp/pb-splits-before.png (ef7d, inspected). Browser entirely headless; read-only 8790, no run control actions.

## Review synthesis and receipts

RED e5a36c1f0; GREEN 1347c5460. Round 1 green, zero blockers or accepted fixes. PB1–PB13 scored with zero FAIL; all nine test-quality checks reviewed. Four performed and restored operand mutations failed (paged-head, rewind, screenshot, non-replay). Tests are constant-size, synchronous and no-I/O; exact identity-scoped split arrays and SVG assertions reach the graph consumer; browser proof covers actual app wiring. Claude hardening suggestions (producer-based screenshot test; explicit initial hash/mode in receipts) deferred as adjacent proof improvements; unchanged sparse table remains out of scope. No production-domain growth or contradictions.

First Claude invocation was invalidated and stopped because the final temporary live-mode mutation overlapped its read window; it did not count. A fresh invocation after clean restoration passed with exit zero, empty stderr and one successful terminal verdict. GPT independently reproduced frozen digest and clean status before/after. No source changed during accepted reviews.

Detailed synthesis, frozen diff, principles, reviewer and gate/mutation/browser logs: main checkout runs/reviews/splits-replay-line/pb-splits-*. Screenshots: main runs/mockups/splits-replay-line/shots/{chromium,webkit}-{1280,1440,375}.png. Six receipts record 43→40→43 own points; real served baseline ef7d had one own mark/no polyline. No run selections added/removed; only selected graph visibility corrected. Scratch current-projector warning is preview-only; recorded frame and graph work. No live-runtime proof claimed.

COMMIT: `docs(worklog): record replay graph gates and reviews` (this evidence commit).

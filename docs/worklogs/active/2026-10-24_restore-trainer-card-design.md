# Restore approved trainer cards and protect their design

User request 2026-10-24: "restore the trainer cards to how they look in my screenshot and add those protections so this doesn't happen again. get it reviewed, land it, and verify it's live".

## Frozen scope
Restore experiment/preset identity, arm type badge, and trial count from the October 21 screenshot, retaining current replay/live/loading fixes. Preserve card geometry, sprites, six party slots, story/time bars and milestone glow. Queue controls and scheduling stay retired. No harness behavior, gameplay, launches, or inference calls.

Protect approved design with fixed-data desktop/phone visual baselines, independent field assertions, an explicit operator approval policy, and a staged-file guard requiring a recorded, hash-bound approval for changes to baselines/protected tests/guard. User authorized these protections here; future design changes need their own explicit approval. No system can prevent an agent deliberately bypassing local hooks; this catches ordinary cleanup and baseline-update mistakes.

## Milestone
- [x] RED restoration and protection checks
- [x] GREEN narrow viewer restoration and approval guard
- [x] Gates and headless candidate proof at 1280/1440/375
- [ ] Principles, Claude/Grok/GPT reviews and synthesis
- [ ] Landing board, fast-forward main, full main tests
- [ ] Coordinated viewer restart and headless live proof

## Evidence
Read-only investigation identified 2269190c3 (2026-10-22 20:46 EDT) as removal; original design documented in docs/worklogs/2026-10-16_trainer-card-header.md. Browser verification uses isolated headless contexts only; never activates apps or user tabs.

RED: restored the original title/arm/trial assertions in both renderer and mounted App tests. Dependency build required before executing source tests in this fresh worktree; initial missing dist import was setup failure, not RED evidence.

## Implementation and proof
- RED commit 5894373da: three failures / 39 passes in renderer and mounted App tests against pre-restoration code. GREEN restores only the deleted card identity fields and the original arm palette; no geometry/CSS changes.
- An additional comparisons-page assertion encoded trial removal; restored it to require trial 2/4. Preserved current font/loading/replay and GPU-avatar logic.
- Saved original attached screenshot as protected reference. Fixed-data visual baselines at 1280/1440/375 exercise production cardInputFor, cardHtml, card-dom font painting, CSS and ROM art. Baselines inspected. Temporarily forced grayscale CSS: all 3 visual checks failed; restored byte-identical CSS and all 3 passed (logs /tmp/trainer-visual-mutation.log and trainer-visual-restored.log). Matching pinned Chromium v1234 also passes all 3 with zero differing pixels.
- Guard test invokes the actual pre-commit hook in a temporary Git repository: a staged weakened guard, removing the normal-test design gate, absent/unstaged receipt, changed bytes after approval, reused receipt, deletion without new approval and wrong parent all reject. Exact new staged receipt permits only approved bytes/deletions. No external auth or cryptographic-human-identity claim.
- Candidate browser: isolated scratch copy of events/frames for the screenshot run 2026-10-21T00-16-44_qwen36-gpu1_2e93; headless 1280/1440/375, pointer + Enter, two polling cycles each, exact selected run and decoded 240x160 recorded frame, BUNDLE/trial 1/2, no page errors. Screenshots inspected after restoring mutation; proof under runs/trainer-card-proof/shots. Original tab untouched.
- Gates: full suites 4174 agent + 1800 viewer + 4068 Python; final just test including visual/protection gate passed (3 visual checks and actual hook test). Lint, build and vendor verification passed. Coverage full rerun passed: agent lines99.14/branches92.71/functions97.52, viewer98.04/91.63/95.17, Python97.36/93.28/100. Initial concurrent coverage run hit live-human.test's existing 5s timeout and follow-on mock contamination; normal full rerun passed without code/test/timeout/retry changes.
- Dedicated worktree has its own Python environment/native binding; shared canonical environment restored after setup. No gameplay/inference launched or stopped. Review/landing hold letter saved to Claude mailbox (no listener at final dispatch); restart will be coordinated through board/process checks.

## Multi-model review
- Round1 frozen head909499112, base05d401b51, diff SHA256a6ac20d6fe99aa6170ac3919aab3ccdc39409d4401ecd378cccd41a77b492b3b. Claude cloud LGTM (exit0, empty stderr). Fresh GPT BLOCKING: commented-out normal-test command still passed substring guard. Verified concrete in-contract defect; accepted. Grok4.5 and4.7 both rejected by Cursor account usage exhaustion, no review. Synthesis in ignored proof/review/synthesis.md.
- Round2 fix batch: exact active-command detection; regressions for commented/echoed check; actual rejection reason assertions; mounted App desktop/phone and comparisons require exact experiment tab and BUNDLE/CONTROL badge. New guard regression RED (empty stderr/false pass), then GREEN. Overriding title/arm at both consumer call sites failed new assertions; restored original sources byte-identical and all68 affected tests passed. No production/style/baseline changes. Prior full coverage remains valid; final just test and viewer lint rerun on batch. Broad protected files and local art/browser prerequisites remain documented limits, not new domains.

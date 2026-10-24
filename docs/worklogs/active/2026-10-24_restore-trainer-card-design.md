# Restore approved trainer cards and protect their design

User request 2026-10-24: "restore the trainer cards to how they look in my screenshot and add those protections so this doesn't happen again. get it reviewed, land it, and verify it's live".

## Frozen scope
Restore experiment/preset identity, arm type badge, and trial count from the October 21 screenshot, retaining current replay/live/loading fixes. Preserve card geometry, sprites, six party slots, story/time bars and milestone glow. Queue controls and scheduling stay retired. No harness behavior, gameplay, launches, or inference calls.

Protect approved design with fixed-data desktop/phone visual baselines, independent field assertions, an explicit operator approval policy, and a staged-file guard requiring a recorded, hash-bound approval for changes to baselines/protected tests/guard. User authorized these protections here; future design changes need their own explicit approval. No system can prevent an agent deliberately bypassing local hooks; this catches ordinary cleanup and baseline-update mistakes.

## Milestone
- [ ] RED restoration and protection checks
- [ ] GREEN narrow viewer restoration and approval guard
- [ ] Gates and headless candidate proof at 1280/1440/375
- [ ] Principles, Claude/Grok/GPT reviews and synthesis
- [ ] Landing board, fast-forward main, full main tests
- [ ] Coordinated viewer restart and headless live proof

## Evidence
Read-only investigation identified 2269190c3 (2026-10-22 20:46 EDT) as removal; original design documented in docs/worklogs/2026-10-16_trainer-card-header.md. Browser verification uses isolated headless contexts only; never activates apps or user tabs.

RED: restored the original title/arm/trial assertions in both renderer and mounted App tests. Dependency build required before executing source tests in this fresh worktree; initial missing dist import was setup failure, not RED evidence.

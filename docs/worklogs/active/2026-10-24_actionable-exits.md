# Actionable exits

## Problem Statement
The Oct 24 run analysis found dormant Route 116 Terra Cave warp records advertised as exits (0517 seq 29346, 107 attempts) and unreachable SOUTH/Verdanturf retained among exit choices. User approved addressing both with separate switches enabled only in the bundle; gym-door-label-v1 both-arm activation is delegated and lands independently.

## Skills Loaded
feature-switch; pokebench-game-state; feature-worklog; feature-explainer; agent-observability; close-the-loop; execute-worklog; talk-to-claude.

## Architecture
- `active-warp-exits-v1` default OFF: require a source-supported warp activation metatile before promoting a static warp record into an exit. Current-map checks use coherent live tiles, remote arrival summaries use qualified ROM terrain facts and do not promise script activation. Share across model readout, state targets, arrival summaries, supervisor/untaken exits. Preserve unknown/unreadable evidence honestly.
- `available-exits-presentation-v1` default OFF, needs exit-reachability-v1: move confirmed blocked exits out of interaction choices into a compact unavailable-facts line; remove approach instructions and supervisor bearings for them. Unknown reachability remains a candidate with its existing caveat.
- Register, transport, document and test both independently. Enable only as bundle factors in the evolving bundle-v-control and bundle-v-control-2h recipes. Preserve active runs and historical definitions.

## Invariants
- INV-1 OFF preserves previous readout/state/prompt behavior byte for byte. Regression comparisons.
- INV-2 No raw static event alone establishes an active entrance. Closed/open ordinary doors, arrows, ladders and dormant records test the rule; retained native RAM validates production reader.
- INV-3 Blocked, unknown and available are distinct; no navigation suggestion contradicts confirmed blockage. Tests through readout and supervisor factory.
- INV-4 Flags independent and default OFF; control OFF, bundle ON for both in future recipe expansion; no run launch or mutation.

## Security Review
Read-only native state under existing reader; no RAM writes, ROM copies, new endpoints, route advice or inferred story names. Reference source pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881.

## Milestones
**M1 — Implement and validate the two approved switches**
- [x] RED tests and commit
- [ ] GREEN implementation; mutation proofs
- [ ] Full test/lint/build/coverage >=90% and vendor checks
- [ ] Native archived RAM proof and explainers with background browser verification
- [ ] Frozen cloud reviews Claude/Grok/fresh GPT; landing board; main merge and served verification

## Closing the Loop
Retained native readouts and production delivery tests; no measured gameplay launched. Explain exact surface coverage and remaining limits, preserve active process identities across coordinated viewer restart.

## Session Log
- User approved preceding design then requested both fixes, separate switches bundle-only, and parallel subagent gym both-arm activation/landing. This is authorization for this worklog scope; no repeated approval requested.
- Created managed isolated worktree from main ebed5a7f3. Gym subagent owns a different checkout. Canonical main clean at intake.

- RED: native presentation regression 2 failed / 2 passed; active-warp reader test collection fails with missing module before implementation. Registry test registered before switches exist. Test evidence /tmp/actionable-presentation-red.log.

## Surprises
None yet.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive this worklog

# Post-clock navigation milestones

## Outcome and authorization
User requested separate milestones for leaving the player house after clock, entering the rival house, and reaching the rival bedroom. Parent owns landing and active cohort; this isolated change does not alter benchmark builds or assign navigation objectives.

## Source and invariants
Reference pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, clean. Littleroot scripts define intro 4/5 as player-house clock instruction/bedroom and rival state 2 as entered rival bedroom, 3 met rival, 4 Pokédex. Both gender map scripts check player gender before setting rival state 2. Never infer gender from chosen name; retain a pre-clock house witness. Unknown/transitioning state cannot earn splits. Exit requires actual home 1F-to-town observed transition after clock. Raw historical events remain untouched.

## Plan
RED tests; production native predicates/tracker/evidence qualification; objective catalog/schema and viewer ordered split list; GREEN gates; mutation receipts and independent external review; parent-coordinated landing. Native gameplay unavailable while benchmark lease active; use retained real records and synthetic production-shaped evidence, explicitly qualify any missing live proof.

## Validation and status
Preparing regression tests. No implementation, review, landing, or live proof claimed yet.

## RED/GREEN implementation
RED 7106445: two regressions failed before implementation. GREEN adds bounded home identity and actual post-clock exit evidence, opposite-house entry, persistent rival-bedroom native stage, native objective enum, schema max three evidence records (milestone/target proof only; loop evidence unchanged), ordered viewer splits and historical not-recorded labels. No controls/navigation automation or stopping changes.

Current validation: 664 agent, 236 viewer and 510 Python tests; TS lint/build and per-metric coverage above 90%. Four isolated mutations (exit clock, same-home identity, rival-opposite identity, bedroom stage 2) each failed; restoration passed. Retained actual native records replayed without changing raw logs. No fresh native gameplay or browser-served proof while benchmark reservation active; source/recording/replay tests establish the added data path, browser proof remains a distinct follow-up.

Review/landing pending. Canonical controls.test.ts has other-chat WIP: the only overlapping patch is updating measured-feature lock count from five to six; parent must preserve all human-playthrough changes when landing.

## Independent review round one and repairs
Sol/Astra blocked frozen690ad9d on objective verification max2, target-stop retaining only latest/truck, and unknown-screen exclusion. Corrected ObjectiveSchema max3, bounded route-specific target witnesses (home, previous stable, current), and new-route-only unknown exclusion. Production ObjectiveTracker write is now validated through checkEvent; both actual multi-state target stops tested. Three additional isolated deletion attempts each failed; consumer restoration passes. Re-ran full TS coverage/lint/build. Existing Python510 pass remains valid: no Python source changed.

# Roxanne grader repair and reuse-only continuation

Human authorization: Fix the grader, verify it against these exact traces offline, score the gameplay already recorded, then resume within remaining budget without repeating completed episodes.

Scope: lossless native-event shards within an oversized decision; offline exact-trace reconstruction, blinded cloud grading, explicit hash-bound reuse of the two completed recovery episodes. Frozen gameplay source 2335b79b812f8d827cfc51edad0263e29199f21a, prompts, starts, eligibility and rubric remain unchanged. Grader/controller repair source recorded separately. No GPU for qualification or scoring. Original failed two episodes never gain efficacy credit. Physical prior cost 5952038ms total, 4 physical episodes; remaining 51647962ms/34 new maximum. Mac workload untouched.

Validation: RED/GREEN bounded sharding and independent reconstruction, exact full recorded traces through final blinded prompt builder, native score recomputation, no-launch reuse tests and fake full continuation accounting; normal gates and required review before landing/launch. Owner coordination pending final source.

## Session log
- Created isolated branch from main 1a5970818. Offline work only; reviewed old failure and exact native outcomes.
- RED fixture initially rejected by event schema; corrected to valid loop_guard, then reproduced actual bounded-context failure. GREEN 7/7 grading tests; 36/36 combined focused grader/runner/measured-host tests.
- Added optional hash-bound archived episode recovery before any lease acquisition. Rechecks terminal native provenance, raw RAM/journal score, reminder, launch/trace/continuation/physical receipt hashes. Same frozen gameplay pin stays2335; repair controller pin recorded separately. Imported episodes count toward the same 38/16h budget exactly once.
- Exact-trace offline replay in progress. Pure diagnostic script initially compared sequence order after grouping by turn; corrected audit to compare complete sequence membership sorted by native seq, while every individual segment retains source order. Historical late turn0 diagnostic events explain ordering; no evidence dropped.
- Initial normal test attempt lacked worktree .env and skipped ROM tests; restored link to canonical .env and will rerun normally. No skip/budget weakening.

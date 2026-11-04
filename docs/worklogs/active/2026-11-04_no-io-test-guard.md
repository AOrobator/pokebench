# No-I/O test guard

**Started:** 2026-11-04
**Status:** in progress on `claude/no-io-test-guard` (local clone `/private/tmp/pb-no-io-guard`; this thread cannot create a worktree)
**Operator:** The operator, 2026-11-04 — "you're good to start cleaning up tests and land the guard though. im good with steps 1-5. coding is now allowed"; "the cap is 1 and tests that fail should be deleted. agents going forward will need better architecture"

## Steps

- [ ] 1. Guard on every Vitest and pytest test: throw on disk, process, network, DNS, fetch, sockets; 1 event loop per test
- [ ] 2. Delete every test that fails it; keep passing tests in mixed files; rewrite nothing
- [ ] 3. Coverage floor set to where coverage lands
- [ ] 4. trainer-card-check out of `just test`, baselines unchanged
- [ ] 5. CLAUDE.md: no-I/O rule and dependency injection

## Measurements

Before, at 23bd43908: `just test` 199.10 s wall (565 s user, 281 s sys); 13,269 tests (agent 5,474, viewer 2,427, env 5,252, gateway 116); 839 temp entries per run.

## Multi-Model Review Log

## Progress

- Guard committed 25e419bc6. Python import-time reads by application modules (interaction-names.json, event-graphics.json, timezone data) stay allowed so one read does not take out every importing test; test files and conftests get no such allowance. Flagged to the operator.
- Mechanical deletion: `/private/tmp/pb-noio-tools` tools removed failing tests by location; one round reached zero failures apart from the two protected viewer files awaiting the operator.

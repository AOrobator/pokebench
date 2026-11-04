# No-I/O test guard

**Started:** 2026-11-04
**Status:** in progress on `claude/no-io-test-guard` (local clone `/private/tmp/pb-no-io-guard`; this thread cannot create a worktree)
**Operator:** The operator, 2026-11-04 — "you're good to start cleaning up tests and land the guard though. im good with steps 1-5. coding is now allowed"; "the cap is 1 and tests that fail should be deleted. agents going forward will need better architecture"

## Steps

- [x] 1. Guard on every Vitest and pytest test: throw on disk, process, network, DNS, fetch, sockets; 1 event loop per test
- [x] 2. Delete every test that fails it; keep passing tests in mixed files; rewrite nothing
- [x] 3. Coverage floor set to where coverage lands
- [x] 4. trainer-card-check out of `just test`, baselines unchanged
- [x] 5. CLAUDE.md: no-I/O rule and dependency injection

## Measurements

Before, at 23bd43908: `just test` 199.10 s wall (565 s user, 281 s sys); 13,269 tests (agent 5,474, viewer 2,427, env 5,252, gateway 116); 839 temp entries per run.

## Multi-Model Review Log

## Progress

- Guard committed 25e419bc6. Python import-time reads by application modules (interaction-names.json, event-graphics.json, timezone data) stay allowed so one read does not take out every importing test; test files and conftests get no such allowance. Flagged to the operator.
- Mechanical deletion: `/private/tmp/pb-noio-tools` tools removed failing tests by location; one round reached zero failures apart from the two protected viewer files awaiting the operator.
- COMMIT: `test: delete every test that fails the no-I/O guard` (4b6acc660). 7,034 tests remain under the guard (agent 2,377, viewer 791, env 3,828, gateway 38).
- Coverage after deletion: agent lines 63.41 branches 54.88 functions 57.59 statements 58.03; viewer 36.35 / 39.33 / 40.57 / 35.68; env 81.64 / 76.75 / 74.55; gateway 46.94 / 44.67 / 22.62. Floors set to those values rounded down; the Python gate takes one floor per suite (lowest metric).
- Protected `trainer-card-app.test.ts` and `workbench.test.ts` fail the guard and are held out of the viewer suite until the operator decides.
- `scripts/test_trainer_card_design_guard.py` and Playwright specs run only in `just trainer-card-check`, outside the guard.
- `power_test.py` passes the guard but needs scipy, so it stays outside `just test`.
- Lint on main already fails (9 ruff errors, `Iterable` undefined in map_observation.py); not touched here.
- COMMIT: `test: floors at landed coverage, trainer-card-check its own command` (5b240678a). `just test` after: 60.76 s wall (330 s user, 31 s sys), all suites pass; 2 temp entries, both tool caches; `just trainer-card-check` and `just verify-vendor` pass.
- Review round 1: Claude BLOCKED, correctly: the pytest assertion-rewrite allowance hid module-level reads in 28 test files. Fixed by allowing tool frames only before any test frame, with an import-time proof module. Grok and Cursor GPT out of usage until 2026-11-17.
- Second deletion pass: 28 test modules and their dependents; env now 2,727 tests, coverage 78.03 / 71.86 / 69.36, env floor 69.

## Multi-Model Review Log (results)

- Round 2 on packet b8d31c7b6, diff SHA-256 9b5b670e938fa80fec7c0f9f48a86c7cec903058e19a5a7697022c9771d49142: Claude CLI LGTM; GPT (Codex CLI gpt-5.6-sol) LGTM; fallback subagent (Sonnet) LGTM in place of Grok, which is out of usage until 2026-11-17, under the operator's standing word of 2026-10-22.
- Follow-ups, not in this branch: Python threads running stdlib targets (`asyncio.to_thread(path.read_text)`) have no repo frame so pass the guard; `os.readlink`, `os.pipe`, `os.statvfs`, `os.mkfifo` raise no audit event; `pkgutil.get_data`; module-level `try/except OSError` in a test file; Node `fs.realpath.native`, `node:sqlite`, capitalised constructors, `createRequire`; Vitest `beforeEach` reset drops swallowed `beforeAll` violations; skills that name deleted tests (close-the-loop, feature-explainer).
- `just test` at b8d31c7b6: 53.65 s wall, 5,933 tests (agent 2,377, viewer 791, env 2,727, gateway 38).
- Post-review doc delta only: corrected CLAUDE.md wording, viewer-spec floor, tool-prompt-sync bullet, three EOF blanks.

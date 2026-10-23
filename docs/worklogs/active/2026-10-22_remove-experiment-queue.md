# Remove experiment queue

User approved removal of the queue, all experiment UI on Stats and PokéNav, related skills and registration requirements. Preserve fixed-run tooling and historical recordings. No gameplay or inference launches.

## Scope
Delete queue runtime, endpoints, approval/promotion machinery, root definitions and queue documentation. Extract shared fixed-run helpers and historical ledger readers. Remove experiment filters, badges, trial labels and polling from viewer surfaces. Retain fixed definitions, run event schemas, ledgers and recordings. Update active skill guidance.

## Milestones
- [x] RED removal contract tests: both fail on existing queue HTML/runtime wiring (2026-10-22).
- [ ] GREEN implementation, skill cleanup and fixed-run compatibility
- [ ] Gates: test, lint, build, coverage >=90, vendor
- [ ] Background browser proof and read-only real-data check
- [ ] Principles and three cloud review lanes
- [ ] Landing board, merge, live verification

## Skills
execute-worklog, viewer-e2e, close-the-loop, talk-to-claude, multi-model-review. Browser actions must preserve desktop focus. No local inference reviewers.

## Evidence
Implementation pending. Shared viewer and gameplay processes unchanged.

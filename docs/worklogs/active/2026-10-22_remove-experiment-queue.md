# Remove experiment queue

User approved removal of the queue, all experiment UI on Stats and PokéNav, related skills and registration requirements. Preserve fixed-run tooling and historical recordings. No gameplay or inference launches.

## Scope
Delete queue runtime, endpoints, approval/promotion machinery, root definitions and queue documentation. Extract shared fixed-run helpers and historical ledger readers. Remove experiment filters, badges, trial labels and polling from viewer surfaces. Retain fixed definitions, run event schemas, ledgers and recordings. Update active skill guidance.

## Milestones
- [x] RED removal contract tests: both fail on existing queue HTML/runtime wiring (2026-10-22).
- [x] GREEN implementation, skill cleanup and fixed-run compatibility
- [ ] Gates: test, lint, build, coverage >=90, vendor
- [x] Background browser proof and read-only real-data check
- [ ] Principles and three cloud review lanes
- [ ] Landing board, merge, live verification

## Skills
execute-worklog, viewer-e2e, close-the-loop, talk-to-claude, multi-model-review. Browser actions must preserve desktop focus. No local inference reviewers.

## Evidence
Implementation pending. Shared viewer and gameplay processes unchanged.

## Implementation evidence
- Removed queue UI, endpoints, autorun/approval/promotion machinery, 232 root definitions, queue/winner explainers and queue skill + agent symlink. Fixed definitions and recorded event schemas remain.
- Shared fixed-run source identity helpers moved intact to fixed-source.ts. Legacy ledger schemas/readers moved intact to legacy-experiment-ledger.ts; no scheduling or approval exports remain.
- Stats has hardware-only run-lanes polling; no queue request. Cards/phone headers/PokéNav run identity omit experiment badges and trials. Chart versions are configurations numbered per model, without arm headings.
- Mixed feature/registration tests retain feature, fixed-arm and native-RAM checks. Native tests previously loading queue definitions now exercise explicit fixture arms. No coverage thresholds/excludes or skips changed.
- TypeScript: agent 3881 tests, viewer 1714 tests passed. Initial full Python run lacked the checkout ROM configuration; fixed by linking the canonical .env and copying the native mGBA package into this worktree venv. Only test fixtures/logs/frames copied for browser proof; no shared runs altered.
- Background browser at candidate port 61172: real graph-point → details → WATCH/REPLAY → exact historical run and decoded recorded frame, desktop 1280/1440 and phone 375; page directory/picker excludes queue; no experiment badges or queue requests; zero page errors. 12 inspected screenshots and browser.json under ignored runs/queue-removal-proof. Browser is agent-owned headless; desktop focus unchanged.
- Read-only real catalog: starting 515 runs, later 516 (one concurrent new run), zero missing or duplicated identities; internal provenance index reports zero read problems. Historical metadata and ledger files untouched.
- Installed ~/.codex/skills/pokebench-cross-model-analysis/references/harness-ablation.md also redirects launches to fixed-run-launch; before/after patch /tmp/queue-installed-skill.diff.
- Build, lint and vendor checks pass. Final full coverage underway; TypeScript coverage agent lines 99.2%, branches 93.39%, functions 97.77%; viewer lines 98.02%, branches 91.61%, functions 95.04% in preceding run.

## Review boundary
Explicit user scope: remove queue and all experiment UI on Stats/PokéNav, preserve fixed-run and historical recordings. No changes to gameplay policy, model prompts, evaluation horizons, live campaigns, or recorded events. Historical provenance fields and read-only ledger interpretation are compatibility, not queue runtime. New hardware-only endpoint replaces the deleted queue API dependency. Terminal condition: required checks + independent cloud reviews, coordinated local landing and verified served UI. New capabilities or reviewer infrastructure proposals are follow-ups.

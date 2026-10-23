# Remove experiment queue

User approved removal of the queue, all experiment UI on Stats and PokéNav, related skills and registration requirements. Preserve fixed-run tooling and historical recordings. No gameplay or inference launches.

## Scope
Delete queue runtime, endpoints, approval/promotion machinery, root definitions and queue documentation. Extract shared fixed-run helpers and historical ledger readers. Remove experiment filters, badges, trial labels and polling from viewer surfaces. Retain fixed definitions, run event schemas, ledgers and recordings. Update active skill guidance.

## Milestones
- [x] RED removal contract tests: both fail on existing queue HTML/runtime wiring (2026-10-22).
- [x] GREEN implementation, skill cleanup and fixed-run compatibility
- [x] Gates on initial candidate: build/lint/vendor pass; full coverage runs all suites (agent 3881, viewer 1714, Python 4013), all above 90. Repeating after main sync.
- [x] Background browser proof and read-only real-data check
- [ ] Principles and three cloud review lanes
- [ ] Landing board, merge, live verification

## Skills
execute-worklog, viewer-e2e, close-the-loop, talk-to-claude, multi-model-review. Browser actions must preserve desktop focus. No local inference reviewers.

## Evidence
Implementation pending. Shared viewer and gameplay processes unchanged.

## Implementation evidence
- Removed queue UI, endpoints, autorun/approval/promotion machinery, 232 root definitions initially (233 after main sync), queue/winner explainers and queue skill + agent symlink. Fixed definitions and recorded event schemas remain.
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

- Synced main 5bec91dcd, retaining move-learn-goal-reminder gameplay/prompt/fixed recipes. Resolved test conflicts by keeping current main feature assertions and removing obsolete queue registration checks; deleted its new pending entry and readiness file. No main edits made by this chat.

- Main-sync tests: agent 3900, viewer 1716, Python 4013 passed (full just test). Main-sync lint exposed only empty/unused remnants of removed registration assertions in five conflicted tests; removed those remnants without changing behavior checks. Re-running required gates on the final tree.

- Endpoint deletion proof: temporarily renamed the actual server run-lanes route; the real HTTP contract test failed (404 instead of the exact one-run hardware payload). Restored byte-identical source and all 3 queue-removal contract tests passed. Removed one remaining unused test helper left by main-sync registration removal. Skill validator passes all seven edited skill entrypoints.

- Final pre-review inspection found scripts/viewer-restart.sh still probing deleted /api/experiments. Stopped the first Claude inspection before verdict and retained its partial receipt; that packet is superseded. This existing restart caller must use /api/run-lanes. Strengthening the existing fake viewer rehearsal to answer only the retained endpoint provides RED/GREEN proof; no new runtime mechanism or gameplay scope. Also found two persona/analysis skill references to the deleted API for cleanup.

- Restart dependency RED/GREEN: fake node viewer now returns 404 for every endpoint except /api/run-lanes. Old restart failed its readiness check (24.39s); retargeted only that probe, then both restart lifecycle rehearsals passed (2.82s). Audit/fixed-runner target suites: 76 passed. Persona-review and run-analysis skills no longer require deleted queue state; both validate. This is the existing viewer restart lifecycle already required by the removal acceptance, not new scheduling infrastructure. Rechecking full gates before resealing review.

- Full post-restart-change test pass: agent 3900, viewer 1716, Python 4013. Both TypeScript lint lanes pass; Python lint caught a long line in the strengthened fake HTTP handler, now split into ordinary statements. No production behavior changed by that formatting repair.

## Multi-Model Review Log
- Round 1 packet 1664b9761 / c9ff2966: Claude LGTM; independent GPT found retained fixed-arm count and sets-wide tool-prompt-docs OFF assertions incorrectly removed. Accepted as PB10 defect; restore only those existing assertions. No production defects found. Claude adjacent cleanup deferred. Grok Cursor failed with account usage limit; discovered alternative checked. Synthesis saved under proof/review.
- Restored retained fixed-run assertions; all 131 tool-prompt-sync tests pass. Both Cursor Grok 4.5 and discovered Grok 4.7 report account usage exhaustion; no verdict. Required distinct-model fallback reviews will document reduced diversity and cannot authorize self-merge.

- Round 2 packet e2f760b14 / cb5b9d61: GPT, distinct Sol and Astra fallback reviewers LGTM. Claude found two active references to deleted readiness ledger; verified documentation-only defect. All final gates passed: 3902 agent, 1716 viewer, 4013 Python, coverage/lint/build/vendor green. Synthesis under proof/review/synthesis-round2.md.
- Operator checkpoint satisfied: user explicitly said "yes fix those references and finish the review, land it, and verify it's live". Fix only listed documentation references and finish. Main advanced to699d1de16 with repo-local skill migration; synced it, retaining migrated skills and removal of queue guidance. Global cross-model skill was retired by that authorized migration, so do not recreate it. Repository copy now records readiness in worklogs.
- Grok outage exception verified from exact project user message [private message reference] at2026-10-22T14:47:31Z: "land without grok. you're not a very good coordinator if you force me to go into chats". Coordinator confirmed blanket applicability while Cursor out of usage; Claude+GPT+distinct fallback approval suffices. Evidence retained operator-grok-waiver.json.

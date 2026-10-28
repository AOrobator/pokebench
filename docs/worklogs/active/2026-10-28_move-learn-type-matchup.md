# Move-learn type matchup with learner bonuses

## Problem Statement
Qwen3.6 run9c88 turn668 declined DOUBLE KICK while stating ROCK resists FIGHTING and NORMAL is neutral against ROCK (assistant31959; call31960; repeated32015). User approved the revised plan and explicitly requested this worklog, implementation, then decision probes before any landing. Include learner STAB, actual relevant stats and known abilities, not only type-table multipliers. Bundle ON/control OFF is the approved evaluation direction; the switch defaults OFF. User permits stopping the current bundle run for probes, subject to owner coordination and preserving recordings/checkpoints.

## Skills Loaded
feature-worklog; feature-switch; pokebench-game-state; tool-prompt-sync; agent-observability; feature-explainer; pokebench-decision-probes; pokebench-experiment-design; pokebench-run-coordination; fixed-run-launch (authorized stop only); viewer-e2e; close-the-loop; talk-to-claude. User approval is already granted in this chat; no second start approval required.

## Architecture
Default-OFF move-learn-type-matchup-v1. Source-pinned Emerald data for type arithmetic and move metadata. Agent delivery ledger accepts only foes/types actually shown by successful model-visible results or decision snapshots, never internal polls or hidden parties. Annotate early move-learning text (9c88 state31936), YES/NO, forget screen and ready battle choices through production play wiring. Show chart factor and learner STAB separately, actual Attack/Sp. Atk, known ability and activation effects. Historical profiles explicitly historical; do not manufacture current conditions. Reuse server's existing source-faithful battle damage calculator for live battle ranges, including per-hit/two-hit Double Kick under this switch. No recommendations or automatic choices. No tool changes intended; audit prompt parity.

## Invariants
- INV-1: OFF preserves bytes, prompt, tools and behavior; factory regression and wiring mutation.
- INV-2: derive arithmetic from pret/pokeemerald731ad5bfd6e6f265508d0efcca0ba42f9dcf5881; FIRE vs GEODUDE0.5, FIGHTING2, NORMAL0.5; deduplicate defender types; full table source comparison.
- INV-3: no hidden/future/cross-run knowledge; delivery-only ledger and prefix restoration tests.
- INV-4: early move page coverage and identity correctness; wrong learner/stale ended battle must not supply current stats.
- INV-5: STAB, stats, abilities, hit count and damage are distinct facts; unknown/special cases explicitly unavailable, status moves not damage.
- INV-6: no live gameplay modification or checkpoint reload for probes; freeze exact source prefixes and preserve original evidence.

## Security Review
No credentials in artifacts; normal endpoint-file transport and exclusive lease. No network requests in HTML. No ROM copies, offsets or vendor edits. Local reference data only. No new raw-file serving paths or timeline marks. No foreground desktop automation.

## Milestones
### M1 — source-grounded switch and production delivery
- [ ] RED source arithmetic, early screen, delivered-only ledger, learner bonuses, OFF/factory tests; commit RED.
- [ ] GREEN registry/preset/defaults/server flags, annotation wiring and reused damage engine; commit GREEN.
- [ ] Wiring deletion/restoration proof; full just test (coverage >=90), lint, build, vendor.
- [ ] Source/ROM provenance, real recorded state and delivered observation check.
- [ ] Local explainer + Harness Config mapping and visual evidence.
- [ ] Independent multi-model review; do not mark complete before review.
### M2 — exploratory decision probes before landing
- [ ] Freeze 8 development contexts: learning9c88/668,88ea/648,a702/518; ready battle9c88/695,88ea/664,a702/575; PECK9c88/661; SAND-ATTACK88ea/1384.
- [ ] First batch proposed48 calls,3 draws per OFF/ON/case; max90s per call,72min hard call-time ceiling. Cost estimate from comparable historical calls before launch. Initial batch only; no confirmation claim; untouched families reserved for a separately designed confirmation.
- [ ] Coordinator acknowledgments of exact endpoint/window; graceful authorized bundle stop only if necessary; preserve checkpoint and event logs.
- [ ] Fake runner rehearsal; exact source/build/payload hashes; arm balance and grader rubric.
- [ ] Register canonical probe manifest/status/provenance before sampling; normal exclusive lease.
- [ ] Complete fixed batch then inspect actions/reasoning; report errors and regressions, not only learning rate.
- [ ] Browser click-through verifies current study, cases and terminal totals. Preserve failed/incomplete draws.
### M3 — evidence and review handoff
- [ ] Update worklog with implementation/gates/review/probe results and uncertainty.
- [ ] Report to user and Claude; no main merge or activation before probe evidence and required reviews.

## Closing the Loop
Prove production annotations on the real recorded pre668 state and counterpart screens; pin serialized OFF/ON payloads. Probe calls never execute actions. Validate model decisions independently from intended/native acquisition. Verify local explainer at1280/1440/375 and probe viewer using background browser. No viewer restart for study registration.

## Session Log
2026-10-28: Worklog created on isolated codex/move-learn-type-matchup following user approval. Read canonical active worklog without changing its pointer. Requested Claude compute-owner clearance; delivered receipt is not acknowledgment. Current observed bundle9c88 runner97154 child98262; all are rechecked before any action. No inference or stop performed yet.

## Surprises
- The pre668 page is evolution_move_learning (ready text, not YES/NO); old effectiveness-heard block is absent there.
- 88ea/648 and a702/518 already acquired DOUBLE KICK; inspected histories are regression/development, never untouched confirmation.

## Multi-Model Review Log
Pending frozen implementation and gates. No self-issued lane waiver.

## Boy Scout Log
No unrelated changes planned.

## Archive Milestone
- [ ] ASK USER: archive worklog after completion.
RED receipt /tmp/move-matchup-red.log: vitest fails importing not-yet-created move-matchup.js. Fixture contains original source state/result pairs for first GEODUDE, first NOSEPASS and pre668; no synthetic game data. Worklog/test-first commit below. Coordinator explicitly reserves GPU1 same model after screenshot baseline; GPU0/9c88 remain untouched; exact grant pending READY.
COMMIT: test: pin move matchup delivery and learner bonus regressions (RED) (cdf1d2428). Additional Python RED /tmp/move-matchup-python-red.log: two tests fail on missing fixed_two_hits keyword, before implementation. Implementation under way; full gates pending queue clearance.
Setup correction: initial venv symlink was unsafe with uv auto-sync: it briefly changed canonical editable .pth to this worktree. Removed symlink, created independent uv venv, restored canonical .pth via canonical uv sync and verified canonical path. Bundle Python98398 uses its separate pinned /private/tmp/... venv; observed bundle PIDs remained alive. Notified coordinator. No gameplay stop/restart or inference occurred. Do not reuse canonical venv for uv commands. Earlier targeted Python commands used explicit PYTHONPATH to own source.
Implementation candidate: production contextTools emits a transient evidence-bound user readout; no tool or prompt changes. Bounded 64 retained/12 displayed profiles; live battler facts supersede absent party slots. Safe ROM-only chart is available through new flag on mid-frame early returns; no fabricated party/damage facts. Raw battle archive45,905 bytes contains writable memory only and is hash-provenanced. Additional native mid-frame RED and GREEN receipts retained. Native pre668 OFF/ON reparses pass. Focused TS201 and Python43 pass; full gates pending coordinated queue, no completion/review claim. Factory wiring deletion fails targeted assertion and restoration passes (/tmp/move-matchup-factory-*). Standalone explainer HTTP200, theme/check clean; six headless1280/1440/375 screenshots inspected; improved mobile diagram/table scroll then recaptured. Tool-prompt audit passes with unchanged tool roster. Probe input attempt1 direct count mismatch; production replay recorded-trim matches the original inner recorder counts with outer notes retained. Attempt3 exposed actual absent-party battle state; fixed through active battlers plus safe ROM chart; no save-backed guess. Attempt5 serialization hash hit Node string limit on long88ea prefix; replacing join with incremental hashing. No inference yet.
COMMIT: implementation candidate GREEN (targeted checks only; full gates and independent review remain open). User authorized build/probe; no main landing authorized by this receipt. Coordinator requires sync current abaadae4c before queued full gates.

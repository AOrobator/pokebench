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
COMMIT: feat: add default-off move matchups with learner bonuses and two-hit damage (e32b29fd6). Synced main abaadae4c into owned branch; shared append conflicts resolved preserving main's id-card-bound registry position and adding move-matchup after it (index305). Both explainers and both exact-route/card tests retained; preset/schema/defaults regenerated from main plus only this switch. Full combined gates pending queue. Canonical/main and GPU0 unchanged.
Pre-freeze probe amendment (no sampling yet): replace battle695/664/575 with first subsequent same-screen ready ROCK contexts with coherent save-backed party/field facts:9c88/697,88ea/672,a702/605. Eight contexts and48 calls unchanged; original mid-frame snapshots remain regression/native proof, and these replacements exercise full damage ranges. Coordinator informed. This is development preparation, no held-out claim. Independent venv needed native mGBA package; linked only its existing compiled package read-only from canonical site-packages (not the venv) after mypy exposed absent binding; canonical editable package path remains canonical.
COMMIT: merge main preserving both registrations (0e9fb7355). Combined focused201TS pass; full TS lint passed on both workspaces before coordinator's later clarification that full lint requires START. Acknowledge no full lint/test remains; do not repeat full checks before START. Python focused43 pass; current mGBA binding issue corrected using existing compiled package in independent venv. Full test/coverage/review not complete. Review principles PB1-PB13 and frozen boundary prepared under canonical runs/reviews/move-learn-matchup.
Independent Claude review1 (standalone credential namespace, read-only) BLOCKING: Future Sight, Doom Desire and Beat Up bypass typecalc in Gen3 and must not receive ordinary type/STAB labels. Reproduced with3 RED tests (/tmp/move-matchup-typeless-red.log); added to existing special-rules refusal, all17 matchup tests GREEN (/tmp/move-matchup-typeless-green.log). Same frozen production domain; no scope expansion. Previous probe build9c5dc is superseded before sampling; no real calls occurred. Re-freeze/rehearse updated build and re-review before landing. Full CPU queue still pending.
First full build PASS. Full test attempt1:4898agent passed/1failed compact-map-grid registry test expects its server feature last. Preserve its existing test/relative order: insert new server id immediately before compact-map-grid rather than changing unrelated tests. Stopped owned lint process group94991 after cwd verification; released heavy CPU to snapshotsM5; no full gate completion claim. Independent GPT review2 BLOCKING: new flag did not bypass old early+comparison AND gate. Added exact31936 writable-RAM fixture, demonstrated native RED with both old flags OFF (/tmp/move-matchup-native-alone-red.log), OR-ed new flag into same gate, native GREEN; no new domains. Grok CLI unavailable (ActionRequiredError out of usage); no self-waiver or merge. First attempted isolated TypeScript transpile emitted CommonJS and fake import failed; no real calls. Superseded runtime/manifest retained. Full tsc build produced correct ESM; next freeze uses that build plus only targeted changed-file emit as necessary while full gate queue pending. Exact native/probe inputs unchanged for the selected8 contexts because their recorded older comparison flags were already ON.
Claude review2 found a separate parser blocker: offered power1 moves render as pow varies and were incorrectly parsed as zero/status. Added3RED regressions (NIGHT SHADE, ENDEAVOR, HIDDEN POWER), then parse category and numeric/varies power explicitly; unknown damaging power becomes unavailable, never status. All20matchup tests GREEN. This remains the same factual-readout parser domain. Earlier relay's statement that both reviewers identified the same blocker was corrected; GPT found the early gate, Claude found variable-power parsing. Grok unavailable; no landing. Both full reviewers' prior frozen verdicts remain BLOCKING until fresh fix review.

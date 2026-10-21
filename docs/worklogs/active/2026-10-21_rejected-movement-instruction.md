# Rejected movement and field-dialogue retention

## Problem Statement
Bundle 9f27 skipped the rival bedroom and then requested 44 rejected direction batches in turns 72–136. The unnamed woman's upstairs instruction was delivered but excluded from observed instruction memory. User authorized fixes behind separate switches and inclusion in the bundle on 2026-10-21. This is implementation authorization; no new measured run is authorized.

## Skills Loaded
feature-switch, feature-explainer, experiment-queue, agent-observability, pokebench-game-state, feature-worklog, execute-worklog, close-the-loop. User's explicit fix request approves this scoped implementation without another approval checkpoint.

## Architecture
- rejected-movement-step-v1: only where navigation-tool-use-guard-v1 would reject a free-field direction-only batch, submit its first direction through ordinary checked input/timing and discard the rest. Return requested/submitted/dropped receipt. No inferred route or objective; ordinary collision and story scripts still apply.
- observed-field-dialogue-v1: extend observed-instructions-v1 selection to all nonempty delivered field-dialogue episodes, preserving exact pages and unknown attribution. Battle pages and failed deliveries stay excluded. No objective extraction or retirement.
- Register both optional, default OFF, with independent pending experiments; enable both in fixed bundle treatment only. Control OFF. No changes to existing running pins.

## Invariants
- INV-1 Both OFF reproduce previous bytes and native inputs; factory tests compare OFF/omitted.
- INV-2 Recovery sends exactly one ordinary direction, no remainder, no guessed path; input and result receipt tests, boundary tests.
- INV-3 Keep raw words, speaker uncertainty, source refs; no battle/failed/foreign-run memory; replay fixtures.
- INV-4 Separate switches, explicit default OFF, prerequisites, feature receipts, independent one-switch arms, unchanged control.
- INV-5 No game/RAM writes outside ordinary input, no active-run edits or measured launches.

## Security Review
No new external API, paths, subprocess interface or network authority. Dialogue remains quoted data in existing context.

## Milestones
**M1 — Two independently switched repairs and bundle registration**
- [x] RED: targeted production tests fail (7 failed, 45 passed); receipt /tmp/pokebench-rejected-red.log. Commit 5cbf18fe. Tests cover first-direction native input and actual unnamed upstairs recording.
- [x] Implementation, two default-OFF registry entries, independent blocked/pending definitions, bundle-only flags and linked tracked explainers.
- [x] Production wiring mutations: movement factory deletion fails four direction tests; dialogue factory deletion fails actual upstairs recording test; both restored, all 56 targeted tests pass. Receipts runs/rejected-movement-instruction/*-deleted.log and wiring-restored.log.
- [x] Coverage suite: agent 3306, viewer 1613, Python 3647 pass. Lines/branches/functions: agent 99.21/93.12/97.74; viewer 97.90/91.33/94.33; Python 97.27/93.07/100.00. Lint, build, vendor and HTML check pass. Final post-commit gates pending source freeze.
- [x] Initial frozen multi-model review: Claude, Grok and fresh isolated GPT all LGTM on c76bd1aa; sync requires a fresh packet.
- [x] FF landed 7acdccf8b; post-main tests and real-browser feature-card/explainer checks passed.

## Closing the Loop
Production-factory tests and native input seam; replay actual 9f27 dialogue with no gameplay. Browser proof for both feature-card explainers. No claim of benchmark benefit without measured evidence.

## Session Log
- 2026-10-21: isolated managed worktree from main 143966bc. Worklog created before implementation. Existing run evidence remains immutable.

## Surprises
- Appended optional switches require mechanical registry-position and legacy-default fixture updates; existing tests remain enabled. No coverage excludes or thresholds changed.
- Worktree lacked native mGBA Python binding and ROM environment. Reused canonical pinned binding in isolated venv, set POKEBENCH_ROM explicitly; initial Python failures were environment setup, not code defects. Final 3647-test Python suite passed without skips.
- Native probe setup attempts are retained and do not count as proof: initial script import failed; initial recorder setup declared an unavailable battle journal and had unqualified metadata; next checkpoint sample was still in its door transition. Probe v4 confirmed input but inherited an experiment tag, so v5 is the qualified manual probe. No measured run was touched or started.
- Canonical experiments-check reads main definitions/ledgers, not this worktree: it reports 150 pre-existing starter-decision-salience ledger errors. Candidate definitions validate separately with empty ledgers. Current store auto-queues an unnumbered READY entry, so both new entries explicitly use blocked to remain pending until design and reviewed pin.


## Native and delivery proof
Manual native probe v5 (checkpoint resume, no inference, explicit probe label): repair OFF sends zero buttons and stays (5,9); ON sends one DOWN at 10 hold/8 release frames and moves to (5,10). Two remaining directions are dropped. One bootstrap B settles the checkpoint door transition first and is recorded separately. Exact checkpoint hash, source HEAD+dirty identity, events, frames and raw RAM under runs/rejected-movement-instruction/native/. Actual upstairs source fixture includes unchanged delivered dialogue and result, not copied runtime RAM.
Pinned-pi test proves the next decision receives the requested/submitted/dropped receipt and recorded button_press contains only UP. Production context chain preserves exact WOMAN_4 attribution and upstairs text after newer dialogue and empty/pruned history.

## Multi-Model Review Log
Round 1: base f671f35d4342ed5b2cebcbe7179af5c3ccf65203, head c76bd1aa15c32a5c5ed9d95ed73612d1203504cc, binary diff SHA256 64c4922d8ed06b8e705e42789c8aaa23e1ef327be54c0c09f955d3151ba25cce. Claude CLI, Cursor Grok 4.5 high, and fresh isolated GPT 5.6 sol xhigh (/root/repair_gpt_review, no inherited turns) independently returned VERDICT: LGTM. No blockers. Shared follow-ups: stronger OFF equivalence assertion, explicit foreign-run ON case, and bundle prerequisite assertions. These are hardening beyond the demonstrated unchanged branches and current configuration, not feature changes. Full artifacts under ignored runs/rejected-movement-instruction/review/.


## Boy Scout Log
None.

## Archive Milestone (user-gated)
- [ ] ASK USER before archiving.

- GREEN implementation commit c9dc7d53d. Synced main fe4ed9c70 (training/catching switches); kept its seven appended switches and re-applied these two at the end. Shared test registry offsets and legacy fixtures revalidated. Earlier lint overlapping the merge is invalidated; gates rerun after conflict resolution.

- Bundle inclusion covers canonical bundle-v-control, bundle-cook-1h, whole-map-cook-1h and the active whole-map-pair-2h definition. Each base/control explicitly OFF; each bundle treatment ON. Existing running pins remain unchanged.

- Browser candidate proof: 8798, actual Harness Config search → READ EXPLAINER for rejected-movement-step-v1 and observed-field-dialogue-v1 opened the matching documents. Desktop layout inspected. Direct viewport resizing was not exposed; subsequently checked each document in real-browser same-origin iframe viewports at 375x812, 1280x900 and 1440x900. Six screenshots saved/opened under canonical runs/mockups/rejected-movement-instruction/shots/. Native probe v5 has no inherited experiment tag; earlier v4 remains an invalid metadata attempt outside benchmark runs.

- Main advanced with documentation/theme and landing-board workflow only. Syncing f671f35d4; apply required Emerald theme to these two new explainers before review. Runtime changes are unchanged.

- Synced coverage: agent 3336, viewer 1620, Python 3691 pass; lines/branches/functions agent 99.23/93.06/97.80, viewer 97.90/91.33/94.33, Python 97.29/93.05/100. Theme-only main sync adds tooling tests, run separately. Scoped native behavior is unchanged across the sync.

- Independent experiment definitions are blocked/pending and point to implemented main-synced checkpoint bc542c5090b7c1da9c5ce874bd4d12297439a052, not the earlier RED commit; repin before cohort execution.

- Final synced lint/build pass (109 Python modules), theme tooling 11/11 pass; bundle contract 50/50 passes after replacing a test-only non-null assertion. Six themed real-browser layout captures opened. Final packet follows. Human coordination authorization verified in 00000000-0000-4000-8000-4d7046dac4e7; repair prerequisite and fresh source pin communicated to that audit chat and run-preparation owner. No launch/process changes.

- Landing slot received. Synced main 4a1ede49adbd2ebd171b92c61b75fcca0a7046fd, retaining progress-aware-cycles-v1 and shop-interface-v1. Registry/legacy-default conflicts resolved by appending repairs after both predecessors. Both repairs now OFF in base/control and ON in bundle for all five fixed definitions, including canonical renamed bundle-v-control-2h; original legacy definition retained. No active game/controller changes.
- Synced gates: build/vendor/pages-check pass; agent coverage 3354 tests (lines99.18/branches93.05/functions97.76); viewer coverage1628 (97.90/91.32/94.33); Python3760 (97.21/92.98/100). All above90 floor. Final registry assertions33/33. Initial sync attempts exposed and corrected mechanical test offset/default conflicts and three missing closing braces; no tests suppressed. Final lint PASS (111 Python modules, both TypeScript stacks); final build PASS. Fresh synced review packet follows.

## Final synced review and landing
- Synced packet: base4a1ede49adbd2ebd171b92c61b75fcca0a7046fd, head7acdccf8b9aae140b598564f1ac534313345da5b, exact binary diff SHA256ea2408f24d71322a5c2a0feb91c8270c83d23bef2dc480981c6a891b95d9e7f1. Claude CLI, Cursor Grok4.5high, fresh isolated GPT5.6sol xhigh (/root/repair_synced_gpt_review, fork none) all VERDICT: LGTM, no blockers. Pre/post clean HEAD and independently reproduced digest. Nine test-quality checks and PB1-PB13 pass/N-A, no FAIL. No new runtime domain; all three runtime patch deltas byte-identical to initial review. Same nonblocking hardening follow-ups; no feature scope expansion.
- Board slot verified first before fast-forward main. Canonical build then just test PASS: agent3354, viewer1628, Python3760 (8742 total). Coverage/lint/build/vendor/HTML gates passed on synced candidate. Review/evidence copied to canonical ignored runs/rejected-movement-instruction/ with symlinks preserved, scratch viewer-data excluded.
- Standard viewer-main run in detached supervisor PASS at clean7acdccf8b, listener90752. Both live gameplay processes survived. Real browser loaded current run/frame, both feature cards and actual READ EXPLAINER links opened correct headings and upstairs text; console warnings/errors empty. Canonical8791 explainer links both200. New cards correctly show NOT RECORDED on the existing old-pin run; no historical enablement inferred. Main screenshots retained under runs/rejected-movement-instruction/shots/; six earlier desktop/phone-layout captures under runs/mockups/rejected-movement-instruction/shots/.
- This evidence-only commit touches docs/worklogs only. Final viewer refresh follows it so the serving stamp equals the final source pin; final listener/build/browser receipts are kept under runs/rejected-movement-instruction/live-proof.json. Controller owner receives that exact final pin and retains activation ownership. No gameplay launched, no active game/controller edits, and no benchmark benefit claimed. Worklog remains active; archive is user-gated.

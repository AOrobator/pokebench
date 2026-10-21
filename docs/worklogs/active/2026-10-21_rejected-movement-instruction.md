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
- [ ] Frozen multi-model review
- [ ] Land and verify viewer cards/explainers if review gate permits

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
Pending frozen packet.


## Boy Scout Log
None.

## Archive Milestone (user-gated)
- [ ] ASK USER before archiving.

- GREEN implementation commit c9dc7d53d. Synced main fe4ed9c70 (training/catching switches); kept its seven appended switches and re-applied these two at the end. Shared test registry offsets and legacy fixtures revalidated. Earlier lint overlapping the merge is invalidated; gates rerun after conflict resolution.

- Bundle inclusion covers canonical bundle-v-control, bundle-cook-1h, whole-map-cook-1h and the active whole-map-pair-2h definition. Each base/control explicitly OFF; each bundle treatment ON. Existing running pins remain unchanged.

- Browser candidate proof: 8798, actual Harness Config search → READ EXPLAINER for rejected-movement-step-v1 and observed-field-dialogue-v1 opened the matching documents. Desktop layout inspected. Phone viewport was not exposed by the current browser control API; no phone-layout claim. Native probe v5 has no inherited experiment tag; earlier v4 remains an invalid metadata attempt outside benchmark runs.

- Main advanced with documentation/theme and landing-board workflow only. Syncing f671f35d4; apply required Emerald theme to these two new explainers before review. Runtime changes are unchanged.

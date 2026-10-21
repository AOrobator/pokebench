# First script trigger bundle activation

## Problem Statement
User approved bounded navigation to the first blocking script trigger and bundle inclusion for the next run. Recorded 1fe0 T72–84 shows nine refusals at the rival house landing before one DOWN triggered the introduction. Existing trigger-navigation-boundary-v1 was independently implemented and landed during investigation; reuse that separate default-OFF switch instead of duplicating it. Preserve script-free routing where available, stop after the first trigger attempt, never retry/continue or activate the originally selected target within that call. User authorization approves this scoped worklog and implementation; no new gameplay launch is authorized here.

## Skills Loaded
feature-switch, feature-explainer, experiment-queue, agent-observability, pokebench-game-state, talk-to-claude, feature-worklog, execute-worklog, close-the-loop.

## Architecture
Reuse trigger-navigation-boundary-v1 and existing navigation/semantic owners. Add rival-recording and two-trigger/no-retry cases, retain safe-route preference, and enable only fixed bundle treatment flags including bundle-v-control-2h. Existing experiment remains unapproved and pending. No game-specific route/goal instructions.

## Invariants
- INV-1 OFF/omitted retain existing inputs, descriptions and results.
- INV-2 ON prefers a script-free route; if none exists, attempt only the first active trigger and return its observed result even when already settled, facing-only, pushback or unchanged. No automatic retry or target activation.
- INV-3 Preserve collision, elevation, gates and fresh checked-input validation; walking prevents overshoot; strides stop before scripts.
- INV-4 Bundle ON/control OFF, global default OFF; actual next-run pin/flags verified by existing launcher owner, current runs untouched.

## Security Review
No new external interface, game memory write, subprocess authority or file-serving route. Existing ordinary press and recorder owners remain authoritative.

## Milestones
**M1 — Bounded trigger policy and bundle**
- [x] RED: 3 fail / 6 pass. Safe-route preference and bundle configuration fail on landed trigger policy; no-retry and recorded rival behavior already pass. Receipt /tmp/first-trigger-red.log.
- [ ] GREEN code/config/explainer and production wiring mutation
- [ ] Gates: test, lint, build, coverage >=90, vendor
- [ ] Native/manual proof and feature-card click as applicable
- [ ] Frozen independent reviews
- [ ] Landing board, main tests, viewer and launcher handoff

## Closing the Loop
Recorded rival snapshot exercised through real production factories with observed input counts; synthetic two-trigger/facing/pushback cases must return after first attempt. Keep fake responses distinct from native proof. Existing native execution may require a separate manual probe, never inputs to active runs.

## Session Log
2026-10-21: isolated managed worktree created. Read-only investigation already validated 68 raw states and 14 screenshots against exact matching ROM; no errors. Existing runtime overlap discovered and owner contacted before edits.

## Surprises
Overlapping trigger-navigation-boundary-v1 landed from another chat while work began; reuse it.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone (user-gated)
- [ ] ASK USER before archiving worklog.

RED commit 91d78817. GREEN focused 20/20; guarded safe-route preference added to walker and semantic approach selection, retaining first-attempt boundary. Existing switch reused, five bundle definitions explicit OFF base/ON treatment.

## Implementation proof and setup receipts
- Added 1fe0 state1308 gzip fixture (run pin4b70c35d; no ROM/save content) through real press/navigation/semantic factories. Two-trigger, no-net-movement and alternative safe-edge cases assert native request bodies and bounded results. Generated presets validated through viewer armPreset.
- Mutation receipts under runs/first-script-trigger: wiring, route-preference, semantic-preference and stop each fail when deleted, restored suite green. Focused agent19 initially, then20 with alternative safe-edge test; viewer generated-preset1.
- Browser explainer inspected at1280/1440/375; screenshots canonical runs/mockups/first-script-trigger/width-*.png. Diagram intentionally scrolls within its own container at phone width. No new card/server mapping: existing trigger-navigation-boundary-v1 link retained.
- First lint found unsafe test-only unknown assignments and URL coercion; corrected. First coverage found two old historical-preset expectations; added explicit treatment bit without changing incumbents, skips, timeouts or thresholds. Final full gates pending.
- Probe attempts retained separately and do not count as native proof: v1 unsupported launcher --no-ocr, v2 undeclared battle-journal integration, v3 door transition not settled, v4 missing initialized vendor, v5 startup wait too short, v6 upstairs transition not settled. v7 now waits for native control at both stair transitions. All probe metadata says manual/no inference, no experiment tag.
- Initial venv symlink let a read-only landing-board helper refresh shared editable package location. Restored canonical editable package immediately; own venv now isolated with native-binding path. Canonical vendor/main/game inputs untouched. No further shared package installs.

## Principles Adherence
|ID|Result|Evidence|
|---|---|---|
|PB1|PASS|Native milestones unchanged; no inferred rival completion.|
|PB2|PASS|Original run and all failed probe/gate receipts retained.|
|PB3|PASS|No performance claim; tests/native proof are not benchmark outcomes.|
|PB4|PASS|Existing separately registered default-OFF switch and metadata; bundle-only configuration.|
|PB5|PASS|One trigger-policy treatment, pending independent experiment preserved.|
|PB6|N/A|No context-budget or long-run-memory change.|
|PB7|PASS|Existing recorder/ordinary input path; probe has events, raw RAM and frames.|
|PB8|PASS|First attempted trigger returns; no retry/continuation; mutations fail.|
|PB9|PASS|Explicit user authorized proposal and bundle activation. No archive or launch authorization inferred.|
|PB10|PASS|No thresholds/timeouts/exclusions/skips changed. Historical expectation updates explicit.|
|PB11|PASS|Production pi interfaces, exact recorded ROM/state and existing pinned native binding.|
|PB12|PASS|Operator ROM external path only, no protected-folder access or ROM copies.|
|PB13|PASS|Worklog records distinct implementation/gates/review/landing/activation states.|

GREEN commit 2eb56900. Pending experiment source repinned to that implementation; no approval/queue mutation. Four guard mutations restored and tests green. Final gate sequence running before queue join.

Follow-up test typing: alternative-edge fixture now explicitly GameStateSnapshot (mutable destination tuple), no behavior change. Pending experiment parse and actual armPreset generation pass: active cook control false/bundle true, wall7200000. v7 setup raced the initial house-entry script; v8 waits then explicitly advances the setup conversation before testing. No failed setup qualifies as proof.

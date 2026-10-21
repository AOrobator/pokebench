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
- [x] GREEN code/config/explainer and four production wiring/policy mutations; see receipts.
- [x] Gates: test, lint, build, coverage >=90, vendor
- [x] Native manual probe v9 and returned frame/RAM validated. Updated explainer browser inspected at three widths. Existing card mapping unchanged; final main click pending landing.
- [x] Frozen independent reviews
- [x] Landing board, main tests, viewer and launcher handoff

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

## Qualified native proof
Manual probe v9 passed in an isolated native server with checkpoint f5bf9d39b4df428489f33d2cbdfc80c479ac8064, no inference/experiment tag. Reached the native rival-house landing (2,3), rival_stage2. OFF request for outside warp sends0 inputs. ON sends exactly1 DOWN, resulting position(2,4), native field script takes control; navigation stop_requested true, goal_entry_attempted false, semantic activation_attempted false. No target activation or subsequent input in that call. The semantic interruption owner legitimately reports the running script instead of the narrower trigger status; v8 had exactly the correct inputs but an over-specific probe string assertion, retained as failed. v9 checks the required input/typed-result contract. Live benchmark processes were not addressed.
Canonical preserved receipt: runs/first-script-trigger/native-proof.json, with raw RAM/frames/events in manual-probe-first-script-trigger-v9. Setup actions are separately attributed manual-1…12; comparison requests manual-13 and14.

## Gate status before queue
Agent full coverage:3427 pass, lines99.22/branches93.28/functions97.94. Full build and lint pass; verifier vendor pass. Viewer historical-preset expectation corrected explicitly for the new bundle bit. Viewer full coverage attempts retained: original failed that expectation plus unchanged experiment-cli and server-stream five-second timeouts; second failed only server-stream; third failed both unchanged timing-sensitive tests. Focused server-stream25/25 passed. No product test code, timeouts, concurrency, skips or thresholds changed to evade these failures. Full viewer gate is NOT green; rerun required on synchronized landing tree. Python full coverage and normal just test are running. Read-only native proof/actual generated presets pass. Review has not begun: shared workflow requires final sync/freeze at landing slot. No main changes or launch from this branch.

## Preparation closeout (before serialized landing)
- Committed runtime/bundle2eb56900, pending source d490a66b, typed fixture118d9ae6, historical viewer expectation1353b98d.
- Normal just test attempt:3426 pass/1 unchanged serial-comparison hung-child stdout timing assertion failed. Full agent coverage remains3427/3427 pass. Viewer coverage third attempt1660 pass/2 unchanged5s timing tests fail; focused stream25/25 passes. These are retained incomplete gates, not waivers. Sync and all required gates/review remain mandatory before main.
- Python coverage suite3827 passed in113.22s; per-metric coverage gate finishing. Vendor verifies pinned clean. Full lint and build passed; last viewer-only expectation string was linted separately.
- Confirmed native v9 server exited. Actual returned frame inspected: player at2,4 and rival appearing at entrance; paired raw archive reparses exactmap/position with fieldlocktrue, screenshot SHA1 matches and nonblank.
- Launcher owner says no automatic-start hold is authorized in that chat. Existing controller remains untouched; next expected bundle~18:05NY but earlier completion can advance it. It captures freshmain/definition per trial and will pick up this switch only after reviewed activation lands. No promise that preparation alone changes any run.
- Per coordinator: join the board, then stop if queued; finalmain sync/freeze/review happens at slot1. No parallel hold of main while waiting.

## Landing slot sync
2026-10-21: now slot1, merged current main31fdd105. Conflicts were additive preset/registry/readiness/historical fixture updates: retained milestone-memory feature and restored trigger preference/activation. Runtime navigation.ts/semantic-navigation.ts merge clean, unchanged from qualified native proof. Required synchronized gates and fresh independent reviews next.

Pending experiment source repinned to synchronized implementation f742d0c8d8687c40186a1b91fe5b444dc5c20bc9 before final tests/review; source metadata only, no queue/approval.

## Synchronized frozen review preparation
All required gates pass at5e1a86488d: build, normal tests3443 agent/1663 viewer/3850 Python, lint (TS/eslint/ruff/mypy), coverage3443/1663/3850 and clean pinned vendor. Coverage lines/branches/functions: agent99.23/93.31/97.95; viewer97.95/91.34/94.35; Python97.34/93.25/100. Floor90 unchanged. Receipts runs/first-script-trigger/landing/*.log. Earlier timing failures remain retained; no retries/sleeps/serialization added to tests.
Test-quality self-review: (1) real factory seam and generated armPreset; (2) four performed guard/wiring mutations fail and restored passes; (3) no global mutation; (4) exact local request arrays and explicit recipe identities; (5) no new concurrency/shared state; (6) no suppression; (7) exact observed payload assertions; (8) bounded two-cell/six-cell and one recorded snapshot fixtures, nine cases, one gzip read/decode per recorded case, five recipe reads and bounded existing phase loops, no external I/O or growing-prefix transactions; (9) tiny fixtures, no cap filling. PB1–13 table remains current with zero FAIL. Frozen production domains remain two existing navigation owners plus existing feature/config/docs; no new owner.
Review policy waiver provenance: coordinator relayed direct operator words "yes dont wait for grok" to the question whether this applies everywhere until Cursor is back with Claude+GPT+fallback. Try Grok and retain outage receipt; use authorized reduced-diversity roster if unavailable, never count outage as LGTM. No benchmark-model/local-inference reviewers.

## R1 synthesis and endpoint regression RED
Claude LGTM, independent GPT5.6Sol and Astra each BLOCKING on same concrete endpoint case: semantic safe pass counts an active-trigger approach endpoint as safe because coordinate navigation intentionally permits explicitly requested trigger goals. Accepted Fix in existing semantic owner. Added endpoint, different-elevation and already-standing no-entry cases alongside original interior case. No other accepted fixes, new domains or changed boundary. Full R1 synthesis/identity/waiver/outage receipts retained runs/reviews/first-script-trigger-r1. RED focused execution next, before implementation.

Endpoint RED observed:1 expected endpoint failure/11 pass, endpoint-red.log; no implementation yet.

Endpoint GREEN: safe-pass candidates exclude matching-trigger endpoints only when travel would enter them. Zero-length already-standing choice remains eligible; mismatched elevation remains eligible. Fallback to first-trigger policy unchanged. Focused23/23 pass. Three new performed mutations endpoint-filter/endpoint-standing/endpoint-elevation each fail expected case; restored23/23. Exact patches+outputs retained under runs/first-script-trigger. No production-domain growth, first-trigger stop code unchanged, recorded native rival test still passes. R2 full gates next.

Pending source repinned to endpoint-corrected runtime 4cb7df503aa6b484b89de1fa8405ef49f43e66e7; still pending/unapproved.

## R2 synchronized gate proof
Endpoint-corrected ab8360586 passes build, normal tests3446agent/1663viewer/3850Python, lint, coverage and pinned clean vendor. Coverage lines/branches/functions agent99.23/93.32/97.95, viewer97.95/91.34/94.35, Python97.34/93.25/100, floor90 unchanged. Receipts runs/first-script-trigger/landing-r2. PB1–13 all unchanged PASS/N/A; safe endpoint preference defect fixed inside existing semantic owner. Endpoint guard/standing/elevation operand mutation receipts include exact patches and observed failures, restoration23/23; all nine quality dimensions remain satisfied. Full cumulative R2 packet next; main31fdd unchanged.

## Landing and live proof
Reviewed tree17c436edfe3ddb3f0fbbfd1d1ebc4c3b046ecec5 fast-forward landed atslot1 frombase31fdd105. R2 exactbinarydiffSHA bf95ec3f4e0e048a54427a20f76bb26cbec992031f7bf40cbf145b7c30ff5563. Claude CLI plan-mode session 00000000-0000-4000-8000-8008af7cfc7a VERDICT: LGTM; isolated normalGPT5.6Sol/xhigh (/root/first_trigger_gpt_review, originalforknone) VERDICT: LGTM; fallbackAstra/high (/root/first_trigger_fallback_review, originalforknone) VERDICT: LGTM. Grok unavailable/usage-limit, authorized general operator waiver relayed coordinator, reduced vendor diversity explicitly recorded. R1 blocked endpoint issue, fixed inR2; no unresolved blockers or scope expansion. PrinciplesPB1–13 zeroFAIL and all9test-quality checks reviewed. Complete syntheses/identity/receipts retained canonical runs/reviews/first-script-trigger-r1,r2.
Positive matching-elevation and wildcard operands additionally proven in isolated exact-module copies, preserving frozen candidate: each deletion makes its own fixture fail and otherpass; restoration2/2, source/copy hashes and failedsetup receipts retained runs/first-script-trigger/operand-proof-r2. Regular focused23agent+1bundle pass. Promoting supplementarycase into regular suite is nonblocking followup, not a shipped requirement.
Canonical main justtest passed3446agent/1663viewer/3850Python (post-main-test.log). All premerge build/lint/coverage/vendor gates green as above. One viewer-main build refreshed17c436edf. Its first background process exited after toolcompletion; retained failedavailability check and restored same builtCLI through official viewer-restart in a detachedsession, no second rebuild. Viewer stable atPID6436, one8790listener; servedstamp17c436ed clean at19:11:49NY. Source17 is exact reviewed/mergedcode; the following evidence-onlycommit changes docs/worklogs only and does not need another rebuild. Three gameplayPIDs36628/52760/79986 and controller37440 remain alive; no schedule/controller/lease/currentrun changes.
Live browser shows selected GLMrunf3b2 RUNNING/turn54 and nativeframe. HARNESS CONFIG card contains updated safe-route/first-triggerdescription; historicalrun truthfully NOT RECORDED for switch. READ EXPLAINER opens exact updateddocument on8790. Browser consolewarn/error empty. Screenshots runs/mockups/first-script-trigger/live-main.png and landed-explainer.png viewed; candidate3widthshots retained. Served main.js/app.js/panels.js and explainer bytes match built/trackedfiles (served-bytes.json); workbench contains no build-olderproblem. Canonical8791explainer HTTP200 and pagescheck pass.
Generated from freshly served build plus canonical recipefiles: bundlecontrolcanonical confirmatory+cook, twohourcook and3otherrecipes each controlfalse/bundletrue, all defaultOFF. Exact hashes in runs/first-script-trigger/generated-recipes-main.json (canonical d9b65dbf...,twohour579b51b6...). Launcher receives source+flags+servedproof before slotrelease. No gameplay launch/hold/reorder here. Pending individual experiment remains pending/unapproved; no performance benefit or next-run outcome claimed.

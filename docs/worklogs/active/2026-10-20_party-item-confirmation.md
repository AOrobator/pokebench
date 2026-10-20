# Party item confirmation correctness repair

Authorized by delegated operator request 2026-10-20. One repair milestone: reproduce → RED/GREEN → full gates/review → eligible local landing. No GPUs, active games, presets, viewer restart or benchmark launch. Original recordings immutable. Canonical main is preserved until repository landing gates pass.

## Boundary and consumers

Correct party_item_message readiness only when the exact close-after-text task and unique party printer own a drawn window 6, an active window-6 printer points into the current message, and its native state waits for a button with auto-scroll disabled. Preserve passive printing, HP animation, fade and handoff. No injected press. Default-OFF server feature party-item-confirmation-v1; exact OFF behavior. Consumer path: raw memory → menus → active_ui → game_state/rerender → typed observation/readout → viewer/replay existing Interface field. Registry, defaults, explainer and pending unqueued metadata are required collateral.

## Evidence before edits

Reference pokeemerald clean 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881. strings.c gText_PkmnHPRestoredByVar2 ends PAUSE_UNTIL_PRESS; party_menu.c Task_PrintAndWaitForText keeps task active until RunTextPrintersRetIsActive ends; Task_ClosePartyMenuAfterText waits for it. text.c TextPrinterWait requires JOY_NEW(A_BUTTON|B_BUTTON), except autoScroll. include/text.h TextPrinter stride 0x24, active +0x1b, state +0x1c, WAIT=1.

Reproduced from matching-ROM hash-validated raw archives 6468,6472,6507 of run 2026-10-20T14-04-18_qwen38-mac_28f3, frames 823448/825148/842563: window 6 printer pointer 0x02021fef, active=1, state=1, text_flags=1 (autoScroll mask 0x04 clear). Existing reader returns ready=False and passive handoff wording. Paired 028132_0.png visually opened: complete TORCHIC HP restoration message. ROM SHA1 f3ae088181bf583e55daf962a92bb46f4f1d07b7. Reparse script retained canonical runs/party-item-confirmation/reproduce.py (read-only originals). The run also contains model errors; no attribution of all terminal delay or performance benefit.

## Checklist

- [x] Rules, coordination, source, raw reproduction and screenshot
- [ ] RED regression commit
- [ ] GREEN implementation, exact OFF and consumer propagation
- [ ] Gates, mutations, isolated viewer/replay verification
- [ ] Principles and cloud review, synthesis
- [ ] Landing if eligible; no runtime restart

## Open questions

Validate message-pointer bounds/consumed wait bytes against raw receipts, and fail closed for invalid native printer ownership. Review availability and concurrent main movement may block landing; neither is approval.

## RED/GREEN and verification receipts

COMMIT: `test: reproduce party item confirmation readiness error` (f09b971f). Eight new tests fail before implementation (missing native readiness path).

Implementation: exact message owner and window-6 printer WAIT after FC09, bounded to the current terminated message, no fade/autoScroll. HP/printing/handoff stay passive. Feature registered default OFF through server factory and viewer; no active preset edits. Existing fixed registry/order tests shift by one; frozen experiment fixture lists exclude new switch without rewriting the old definitions.

Native integration test cuts 89 exact read requests from hash-validated archive6507 into a tracked provenance fixture; full production read_state→state_json/readout asserts ON and exact OFF. Independently ran canonical pre-repair reader over the fixture: OFF readout matches byte for byte. Three archives reparsed before changes, screenshot opened. Synthetic cases cover printing, timed pause, inactive printer, autoScroll, HP animation, handoffs, fade, wrong window/cursor/state, short printer and duplicate tasks. No automatic press.

Mutation receipts: initial run ten failures/restoration green; a second run accidentally reused some filenames and then stopped at a changed search string. Earlier overwritten receipts are not claimed preserved. Fresh uniquely named `mutation-r3-*.txt` receipts independently show ten failing guard/wiring deletions with all restored tests green; summary in `runs/party-item-confirmation/mutations-summary-3.txt`.

Initial full Python run without configured ROM had 247 skips and 10 failures (nine registry expectations + ROM test). Configured external ROM, updated registry collateral and reran: 3011 passed, zero skips (before four additional focused cases). Python coverage lines97.09/branches92.63/functions100. Initial TS coverage passed agent2965/viewer1436, with agent97.21 statements/92.95 branches/97.60 functions/99.16 lines and viewer95.09/91.06/93.85/97.70. A later full coverage run hit an unrelated existing viewer stream timeout (`keeps the downstream socket open...`, received2 frames; server.test.ts445), recorded in final-coverage.txt. No timing threshold, skips or streaming implementation changed. Final gates recorded below after completion.

Browser: isolated direct startViewer server at scratch port49481 (no queue/autorun), scratch replay copy only, no approvals/ledgers or canonical runtime access. Expanded Activity History and raw inspector show exact corrected Interface string. Searched Harness Config by exact switch ID and clicked its READ EXPLAINER link; expected tracked document opened. 375/1280/1440 screenshots retained and visually opened; wide diagram scrolls within card at phone width. Browser error/warn log empty. Canonical 8791 mockup copy returns200; pages-check clean. No live runtime claim.

`just experiments-check` resolves canonical main, so it reports pre-existing starter-decision-salience invalid ledger rows1–150 rather than checking this unlanded entry. No ledger edits. Direct current parseExperiment validates this branch's new pending entry, queuePosition undefined; incumbent normalized with every switch explicit. Readiness remains PENDING; no approval, queue or gameplay.

Final lint passes (TS, eslint, ruff, format, mypy101 files). Build and vendor verification pass. Viewer coverage confirmation: 1436 passed, all metrics >=90%; the earlier stream timeout remains retained as an unrelated gate flake, not hidden. Agent final coverage2965 passed, all metrics >=90%. Final Python coverage receipt recorded separately. Focused native suite now17 cases.

ROM address checks: exact ROM bytes retained in source-addresses.txt, no ROM added to git. Task_PrintAndWaitForText at081B1B8C has MOV r0,#6 and BL08121F20 (RunTextPrintersRetIsActive); Task_ClosePartyMenuAfterText at081B6794 calls081B1BD4 (IsPartyMenuTextPrinterActive), then081B12C0 (close). That helper calls080A91E4 (FuncIsActiveTask). Existing sTextPrinters020201B0 and gTextFlags03003014 literals are present in this matching ROM. Native archive window6 is active/state1 with currentChar02021FEF after FC09, matching text.h layout. C and native receipts agree.

GREEN implementation prepared; final configured full-test and Python coverage commands running on unchanged implementation. All receipt files under this worktree's ignored runs/party-item-confirmation. Source no-new-activity boundary preserved. Review principles/boundary artifacts prepared under review-r1; reviewers receive frozen base/head/diff digest after commit. Claude dedicated review profile auth status logged out; equivalent Cursor Claude will be tried on the sealed packet. No cloud approval inferred.

COMMIT: `fix: report native party item confirmation readiness behind default-off switch` (57b9f720). Final configured Python coverage:3015 passed, zero skips; lines97.11%, branches92.67%, functions100%. Agent2965/viewer1436 full suites green and >=90% coverage. Lint/build/vendor green. One retained unrelated stream timeout, followed by full viewer coverage1436/1436. Pending entry now pins implementation57b9f720; no queuePosition. Asked coordinator/user to hold other landings per execute-worklog before round1; main remains5f7a2aca. Full-test configured receipt pending terminal Python result; coverage already runs the same full Python suite.

## Operator follow-up 2026-10-20

The operator replied “yes, the fix should be on in the bundle” to the explicit request to approve landing with Grok/Sol/Astra despite unavailable Claude. This authorizes the cloud-Claude exception and bundle-only enablement. Global defaults stay OFF, control stays OFF; update canonical bundle-v-control and current bundle-cook-1h definitions for future selection. No running preset/game/viewer/GPU changes or benchmark launch. Main moved to ba71c60f after initial review; sync, integrate append-only registry collateral, rerun gates and review the cumulative packet. Prior completed R1: Grok/Sol/Astra LGTM, no blockers; sixteen guard/wiring deletions fail and restored17/17. Final configured full tests2965+1436+3015, zero skips. R1 receipts/synthesis under ignored runs/party-item-confirmation/review-r1.

Main-sync integration preserves upstream whiteout-healed-v1 and gym-readiness-readout-v1, appending this repair after their registry entries. Resolved conflicting registry-order/default-OFF assertions against latest main rather than dropping upstream behavior. No game/runtime activity. Bundle changes follow in the next commit after a production-arm RED case.

Bundle wiring RED: production fixed-definition/armFeatures/armFeatureBits case added for bundle-v-control and current bundle-cook-1h; fails because switch is absent. Main-sync agent suite2988/2989 with one mechanical expected-list string issue in battle-effective-damage test (combined two IDs vs array elements), to correct in GREEN without production change.

Bundle GREEN: switch explicit false in control base and appended once to switches in bundle-v-control and bundle-cook-1h. Production fixed arm builders confirm control false / bundle true in both feature maps and recorded feature bits. Initial RED/GREEN attempt hit stale built agent schemas after main sync; rebuilt agent, retained invalid attempts, then repeated RED with actual switch removed (fails exact switch assertion) and restored GREEN33/33. No gameplay. Updated historical open-goal fixture comparison to exclude this newly introduced switch; no old experiment definition rewritten. R1 optional readiness smoke hardening now uses exact INPUT value and deliberately flipping viewer readiness fails the focused test; restored175/175. Corrected prose to mask0x04 rather than ambiguous “bit4.”

Current-main agent coverage2989/2989 and viewer1439/1439 pass; both stacks above90% every required metric. Full Python coverage running on integrated tree. Updated explainer served locally200 and phone screenshot opened (bundle-explainer-375.png); mechanism unchanged from R1 desktop/browser proof. Fixed definition changes apply to future selection only, not frozen active cohorts. Read-only runtime check identifies canonical viewer71445 executing /private/tmp/pokebench-viewer/.../cli.js; no restarts or runtime changes. Canonical build after eventual merge will not replace that frozen viewer checkout.

Implementation and bundle integration committed; standalone pending definition pins that code/config commit before R2 freeze. R2 reviews cumulative delta against current main ba71c60f, under explicit operator cloud-Claude waiver. Round1 hardening notes both resolved (exact readiness test + mask wording); bundle-arm test and its performed removal/restoration add proof without runtime activity.

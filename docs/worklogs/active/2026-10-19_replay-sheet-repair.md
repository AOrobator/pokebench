# Replay trainer card and mobile sheet repair

## Contract

Default to a live run when any live run exists. Deliberately opened replays remain accessible separately and show their own dotless Trainer Card. The mobile sheet reuses the existing full Trainer Card renderer with its original artwork, keeps card nodes stable and animates opening with reduced-motion support. Viewer only; no harness or experiment changes.

## Evidence and scope

- Reported tab: 8790, selected `2026-10-19T16-13-42-317Z_qwen36-gpu1_petalburg2h-r6-visited-map`, REPLAY mode, no trainer cards. Served build `35edd7af`, PID 9114.
- Discovery advertises two newer live runs plus two stale old runs. The workbench has not loaded the newer runs and marks the old pair unresponsive. `cardInputs` returns an empty live branch and never reaches replay fallback.
- Mobile sheet currently remounts every card when any card markup changes; this can discard loaded image backgrounds. Preserve sheet card nodes separately from its surrounding metadata and give the art a solid fallback surface.
- Use an isolated worktree from main; the original checkout belongs to ongoing 60fps changes and is dirty.

## Milestone

- [x] RED: both regressions fail at the consumer seam: no replay card when live workbench records are missing; unchanged other mobile card is replaced when a fresh badge expires. Focused result 16 passed / 2 failed.
- [x] Implemented fallback based on renderable live cards, preserved the sheet's card container through metadata updates, and reused `syncCards` for per-card updates. Added a solid art fallback and clipped long title tabs to protect the state badge. Mobile entrance is a 260ms slide plus 180ms shade fade, disabled under reduced motion.
- [x] Build and gates: viewer 1,240 tests; agent 2,574 tests; Python 2,724 tests with ROM; TypeScript lint, ruff, formatting and mypy passed; pinned vendor verified. Coverage: viewer lines/branches/functions 97.72/91.32/93.97; agent 99.25/94.08/98.27; Python 97.12/92.85/100.
- [x] Browser on isolated 8803 with a clone-on-write copy of the reported replay (no experiment approvals): selected dotless REPLAY card in the mobile sheet with its PNG background, 260ms entrance style, pointer and Enter opening, card activation closes sheet; no horizontal overflow at 375. Desktop checked at 1280 and 1440. Captures visually inspected in tool record; persistent screenshot paths are unavailable from this browser surface.
- [x] Independent review and local-main landing, followed by live proof (final amended receipt below).

## Operator correction and final behavior

- Operator rejected the bespoke sheet blocks: "use the trainer cards ... reuse what we already have". Removed the custom YOU'RE WATCHING summary, plain other-run WATCH tiles and duplicated run metadata. Sheet now mounts the exact same `cardHtml(..., "wide")` used by the desktop header. No substitute background surface; existing PNG art is retained.
- Operator clarified: "replays should NEVER be selected when there are live runs. a live run should be the default selection. the user always has the ability to view replays separately but it shouldn't show by default when there are live runs".
- Default navigation prioritizes a live run over a stale `#run=` replay selection. Explicit replay links use `#replay=` and the existing run picker still opens replays deliberately. An explicitly selected replay gets only its own selected, dotless Trainer Card. Automatic following advances to the next live run; deliberate replay viewing remains separate.
- Historical custom-sheet tests were replaced with assertions for the persistent Trainer Card mount. Integration asserts the mobile full card's inner markup equals its desktop counterpart, and no `.rs-now` or `.rs-other` is rendered.
- Revised viewer suite: 1,238 passed; coverage lines/branches/functions 97.72/91.31/93.96, lint/build pass. Earlier agent and Python gates remain applicable: no agent/Python code changed in this amendment.
- Browser on revised owned 8803: opening the reported stale replay URL selected live run `2026-10-19T18-15-28-702Z_qwen36-gpu0_petalburg2h-r7-visited-map` by default.
- At 375px the sheet showed two existing full silver Trainer Cards with their PNG backgrounds, one WATCHING and one LIVE, and zero custom blocks. Deliberately selecting the ended run through the sheet picker closed the sheet, changed the URL to `#replay=...`, and showed exactly its own dotless REPLAY card. The default route and explicit replay route are now distinct.

## Principles adherence

Review correction: a fresh milestone in a retained live workbench record could override the selected replay's badge with NEW MILESTONE and a dot. The new mounted header/sheet regression failed on the missing REPLAY chip (18 passed / 1 failed), then passed 19/19 after `cardInputFor` suppresses live freshness for replay inputs. Existing live milestone decoration remains tested. Also mutation-checked the stale-`#run` default and full-card reuse invariants: reverting the selection guard selected the exact ended fixture ID; swapping the sheet back to mini produced zero wide cards. Both targeted tests failed, then passed 2/2 after restoration. No mutation remains.

PB1 PASS: status remains recorded/discovered data, no agent claims used. PB2 N/A: no result filtering. PB3 N/A: no benchmark claim. PB4 PASS: viewer only. PB5 PASS: no measured runs. PB6 N/A: no context changes. PB7 PASS: scratch replay uses recorded events. PB8 N/A: no agent retry changes. PB9 PASS: operator clarified live default versus deliberate replay navigation and mandated existing full Trainer Cards. PB10 PASS: original regressions observed RED; amended tests assert live default, explicit replay and exact reused full-card markup; gates unchanged. PB11 PASS: no dependency/API change. PB12 PASS: ROM stays outside git and recordings unchanged. PB13 PASS: worklog and independent review track closeout.

## Review boundary

Production owners: `app.ts` default/explicit selection and sheet rendering, `run-head.ts` static card mount (bespoke blocks removed), `workbench-view.ts` explicit replay links, `trainer-card.ts` title geometry, `style.css` sheet entrance. Operator's correction explicitly amends the earlier frozen boundary. No new runtime, dependency, API, persistence, experiment or gameplay behavior. Stop when live defaults, separately opened replays, reused stable cards and mobile animation are verified and reviewed; adjacent viewer performance work belongs to the separate checkout.

Test quality: mounted app consumer tests with fixture-owned IDs and exact card sets/node identity; both were RED before changes. Existing per-test DOM setup and width cleanup retained; no new shared global owner, concurrency, retries, sleeps, skipped tests or large fixture loops. Browser uses a scratch copy of real data, not the shared queue root.

## Final closeout

### Follow-up: dismissal and double speed

Operator requested animated dismissal and 2x animation speed. Scope: existing app sheet visibility lifecycle and its CSS only; retain existing Trainer Cards, all dismissal entry points, focus restoration, reduced motion, and immediate desktop resize cleanup. Opening and closing sheet 130ms; shade 90ms. No harness, card or selection changes. Terminator: mounted lifecycle/timing tests, independent subagent review and browser proof before local landing. RED observed: 2 failing tests / 19 passing, immediate hidden on close and old 260ms timing. Existing user tab confirmed immediate dismissal at clean served b54aa819. PB1-8 N/A (viewer-only animation); PB9 PASS explicit timing/dismissal request; PB10 PASS actual RED, unchanged gates; PB11 N/A no dependency/API integration; PB12 PASS no protected files; PB13 PASS tracked follow-up and review.

GREEN: retain sheet/shade through CSS exit then hide on the sheet's own exit completion/cancellation; ignore child/entrance events and stale completion after reopening. Closing sheet becomes inert and focus returns immediately. Reduced motion and widening hide synchronously. Focused initial lifecycle/timing tests pass21/21; added cancellation/resize and reduced-motion tests. No timer owner, dependency or card-renderer changes.

Follow-up receipt: read-only subagent reviewed frozen de6aa54882e265619120f9adcde2ab580e664d38, diff SHA256 dc3ef3d094ea9baad6e774d366ddc1b611de08e1518d2d324119ada4c3dbe295, independently passed121 focused tests, exact clean head before/after, VERDICT: LGTM. Same user-authorized subagent review/landing roster as original repair; no claim of cloud diversity. Synthesis: no findings/contradictions/scope growth; all PB rows above covered, zero FAIL. Test quality: mounted real app seam and observed RED; existing DOM/viewport containment; fixture-owned exact elements; event-driven assertions without sleeps/retries; diagnostic values retained; fixed tiny event sequence/no new I/O or cap-sized loop. Browser proof separate from source approval.

Viewer coverage1243 passed; lines97.72/branches91.34/functions93.97, lint/build pass. Fast-forward landed exact reviewed de6aa548; postmerge full tests agent2574/viewer1243/Python2724 pass. Logs `/tmp/sheet-dismiss-{coverage,lint,build,postmerge}.log`. Official restart at approximately14:44 EDT; single8790 listener PID53385, clean served stamp de6aa548. Original tab RUNNING; real Enter opens with computed0.13s rs-slide-in, Escape shows visible data-closing sheet with0.13s rs-slide-out then both sheet/shade hidden and focus at header; pointer close and backdrop close passed. Preview375 screenshot preserves existing card; desktop1280/1440 screenshots inspected; no layout redesign. Live375 screenshot inspected. Browser screenshots available in tool record only. Reduced-motion immediate path covered deterministically; no browser OS preference changed. Owned preview stopped/tab closed; temporary viewport reset. Evidence-only closeout commit does not change reviewed running code.

- Independent subagent reviewed amended frozen source `b54aa819bcc34157e433e82ceb3e6e1776ed9448`, cumulative diff SHA256 `91fab6181b9ef5b8719b5a98573f89ac0751b9c48bf6486413b937ce0a4422f5`, clean before/after. It independently passed 176 focused tests and returned LGTM after the freshness correction. Optional external review lanes were unavailable (Claude authentication, Cursor usage limits; stopped silent optional Grok attempt); none was represented as green. Operator-authorized subagent review completed.
- Final viewer coverage run: 1,239 passed, statements 95.41%, branches 91.32%, functions 93.96%, lines 97.72%. Lint/build passed with clean b54aa819 stamp. Logs `/tmp/replay-sheet-reviewed-{coverage,lint,build}.log`.
- Fast-forwarded clean local main to exact reviewed b54aa819. Post-merge `just test` passed: agent 2,574, viewer 1,239, Python 2,724. Log `/tmp/replay-sheet-postmerge-tests.log`. No remote exists; no push or PR.
- Official `just viewer-main` restarted 8790; verified one listener PID 35126 and clean build stamp b54aa819. Live browser reload of the old saved `#run=...r6-visited-map` selected r7 gpu0 visited-map automatically, reached RUNNING with the current screen/thinking, and showed two full original Trainer Cards. At 375px: original wide-gold/silver PNGs visible, no custom sheet blocks or horizontal overflow, computed rs-slide-in 0.26s. Manual picker opened r6 via `#replay=`, closed sheet, and its subsequently opened sheet showed one original gold REPLAY card with zero dots. Captures visually inspected in tool output; browser surface did not expose persistent screenshot paths.
- Restored user's live selection, closed owned preview tab/server and reset temporary mobile viewport. Original 60fps checkout and gameplay recordings untouched. This closeout commit changes evidence only; running code remains the exact reviewed source.

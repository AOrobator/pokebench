# Menu refusal recovery

Operator authorization: "Let's fix the refusal guard and menu recovery behind a new switch, add it to the bundle, and test it against this recorded loop. Keep the navigation issue separate."

## Scope
One bounded change, menu-refusal-recovery-v1, default OFF; bundle ON and control OFF. Detect repeated no-button battle_action refusals while a native ready shop_action_menu is open. Deliver menu-specific recovery feedback through the existing rejection episode; stop after the existing recovery bound if the menu remains unchanged, including with the speed-run supervisor enabled. Closing/changing a qualified interface retires the episode. Unknown observations do not establish recovery. No automatic buttons, navigation changes, runtime restarts or measured launches.

Reference evidence: run 2026-10-21T00-16-44_qwen36-gpu1_2e93, turn 261 shop opens; turns 262–287 no-battle run refusals; turn 288 B closes it. Preserve original records; commit a bounded production-shaped gzip fixture with source hash and seqs. Game source shop.c Task_ShopMenu handles MENU_B_PRESSED through Task_HandleShopMenuQuit, reference 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881.

## Work
- [ ] RED: replay through production recorder/guard and assert OFF invariance, ON warning, delivery, stop and B recovery.
- [ ] GREEN: registry, optional/default-OFF schema, factory wiring, bundle inclusion, explainer and pending experiment.
- [ ] Verify: focused and full gates, adversarial wiring/feedback/stop deletion receipts, source-grounded fixture, viewer explainer proof.
- [ ] Review: principles and frozen three-cloud-lane packet. Land only under existing repository review authorization; absent lane is not approval.

## Load-bearing questions
- Existing battle refusal guard requires an initialized battle; new shop qualification must be independent of that switch.
- A shop's unavailable field-message owner does not invalidate its independently qualified ready active UI.
- Existing speed-run supervisor rebriefs indefinitely; only new shop-refusal episodes receive the bounded-stop behavior.
- Current fixed bundle definitions must be identified; historical experiment definitions and completed run presets stay immutable.

## Verification and review log
Initial worklog recorded before implementation. No current game process modified.

RED: five recorded-loop tests run via vitest; OFF passes and four ON assertions fail because warnings, bounded stop and recovery do not exist. Receipt /tmp/menu-refusal-red.log. Fixture retains only turns 261–288 tool/state/button/turn records, no model reasoning, ROM or save assets; original event-file SHA256 retained in fixture.

GREEN implementation: new optional/default-OFF registry switch and production live/probe guard wiring. Independently qualified shop action UI permits no-battle refusal detection without battle-refusal-loop-v1. Reuses rejection evidence and six-call recovery bound, suppressing generic infinite rebrief only for the new menu episode. Qualified interface changes retire it; missing states do not. No automatic buttons or navigation changes.

Checks before sync: just test passes 3265 agent + 1569 viewer + 3564 Python, zero skips. The later pending-entry test raises focused tests to 81. pnpm lint and build pass; vendor verified at bbab97ad. Agent coverage 97.26 statements / 93.10 branches / 97.70 functions / 99.20 lines. Viewer coverage with two workers: 91.19 branches / 94.41 functions / 97.92 lines; unchanged threshold 90. Initial isolated Python attempt lacked POKEBENCH_ROM; repeated through just with the normal .env and installed binding passed all 3564 tests. Initial viewer coverage under concurrent load had two timing failures and one historical arm-comparison expectation; fixed the historical comparison only and reran with two workers successfully.

Adversarial receipts: runs/menu-refusal-recovery/mutations/01-factory-wiring.log through 06-pi-delivery.log each fail their intended consumer assertions; receipts.json binds each original/mutated/restored SHA256. 07-restored.log: 81 focused tests pass. Source wiring in both live.ts and decision-probe.ts is asserted; factory-switch deletion removes recorded-loop warnings and fails.

Browser: isolated server 8793, scratch-only transformed replay (never a measured run). Warning and stop visible in Activity History and existing rejection inspector; Harness Config search shows SHOP MENU REFUSAL RECOVERY ON and its READ EXPLAINER opens the correct local document. Desktop 1280/1440 and phone375 screenshots retained under canonical runs/mockups/menu-refusal-recovery/shots; first diagram label overlap corrected and screenshots repeated. Existing timeline renderer unchanged. Screenshots and original event files remain untouched.

Experiments check: the standard CLI resolves the canonical root, where pre-existing starter-decision-salience ledger rows fail validation. No ledger edits. New pending definition parsed and its ON/OFF arm delta tested in isolation. No queue position, approval or measured launch.

Main advanced to 6fbce3326 (only script/config/worklog changes); sync next, then freeze final candidate and review. Current whole-map-pair-2h bundle newly appeared on main; include this evolving definition alongside the prior three so future bundle picks inherit the switch, keeping control OFF and all historical run headers unchanged.

Synced main 6fbce3326 via e24b90eb2; no production conflicts. Added menu switch to the fourth evolving bundle, whole-map-pair-2h; control stays OFF. Source pin names implementation1395c244 pending reviewed landing/repin. Production readinessOf: NOT READY, recent boot lane basis, 0/4 OLDALE_TOWN; current GPU save-state cooks do not qualify as think-fast boots.

Final gates on synchronized tree: just coverage passes 3266 agent + 1569 viewer + 3564 Python = 8399 tests, zero skips. Agent branches93.09/functions97.70/lines99.20; viewer branches91.19/functions94.41/lines97.92; Python branches92.95/functions100/lines97.25. just lint passes both TS and all Python lint/type checks. just build and pages-check pass (logs /tmp/menu-refusal-final-*.log). Earlier direct Python coverage attempts without the just-loaded environment failed and are retained; final just coverage uses external ROM and installed mGBA binding, with no exclusions or gate changes.

- [x] RED regression committed f81223bd.
- [x] GREEN implementation committed 1395c244; existing default/OFF behavior tests preserved.
- [x] Full gates, six deletion/restoration checks and browser feature-card/explainer proof.
- [ ] Frozen independent review and permitted landing. Claude dedicated CLI profile currently logged out; try Cursor Claude on the sealed packet. No experiment or runtime start requested.

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

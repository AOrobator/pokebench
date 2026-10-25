# Mauville puzzle readout correctness

Authorization: The operator: “Let’s do it… bug fix… on in both arms, the control and the bundle.”

One bounded milestone: expose observable Mauville Gym floor-switch state and electric-door tiles from the current live map. Distinguish these from permanent walls/floor; label the existing interaction targets without changing their keys or selecting an action. Show the current barrier configuration on each observation so changes remain visible. Register mauville-puzzle-readout-v1, default ON with explicit OFF restoring legacy bytes, and onInBoth in the current feature recipe. Preserve frozen active runs and historical metadata.

No puzzle solver, route policy, foreknowledge of switch effects, input changes, or live-run restart. Runtime field state comes from the current paired map snapshot, never a predicted puzzle state. No new persistence or event schema.

- [x] RED tests committed (22f42e155).
- [x] GREEN implementation, shared arm config, explainer.
- [x] Native archived-state proof and mutation check.
- [ ] Full gates, principles, cloud review.
- [ ] Serialized landing and viewer proof.

Reference: clean pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, matching US ROM f3ae088181bf583e55daf962a92bb46f4f1d07b7. Sources: MauvilleCity_Gym/scripts.inc, field_specials.c MauvilleGymPressSwitch/SetDefaultBarriers, metatile_labels.h. Evidence d41e #193989/#194138/#195466 reproduces recorded full grids exactly from hash-validated raw RAM.

RED: production-readout and arm-materialization regressions added. Python collection fails because the puzzle module is absent (expected).

## Implementation evidence

- Default ON explicitly authorized in both arms; current.json features true plus onInBoth. Old frozen definitions/headers unmodified. Six production definition materializations checked, all phases/control/bundle.
- Text-only rendering over existing paired LocalMap/FullMap, map10/0 qualified; collision/elevation grid and interaction target identity unchanged. Local views never annotate outside their tiles. No state history, predicted switch effects, navigation policy or new schema. Switch/door coordinate lists describe the current configuration, including beneath preserved @/N/W.
- 13 focused Python checks pass, including exact production formatting, partial/full views, inactive screens, all vertical footprint states, fixed-pole exclusions and adjacent labels. Two production arm/default/env recording tests pass; viewer map routes/cards covered by existing owner tests.
- Native reparse of raw63370/63432/63956 with archive and ROM hash validation: outputs show raised->pressed switch and blocked->open->blocked upper gate. OFF equals pre-fix main production bytes for all three; SHA256 1f933039f7ca443deb40060ff5fccb245987c720f77d7dff5a05bbb7d480b568 / bbf22a07b3481cb507dc51aa3e615a6fc4b7017428b97a4444f736e2989b8ffb / 3a553497dfa6201b26d6b80773e51182a2b9b346c59ce9df947371026506dc17. No live gameplay input.
- Mutation: removed readout overlay wiring -> intended production readout assertion FAIL; restored ->13PASS. Receipts /tmp/mauville-mutation-{no-overlay,restored}.log.
- Pre-sync agent4407PASS/viewer1954PASS/Python4171PASS+one expected registry-count failure (88->89 corrected). Legacy fixture lists now explicitly include the new server OFF id; flags/default expectations use the operator-approved ON. An overlapping coverage/test invocation timed out two unrelated5000ms tests; discarded, gates rerun serially without timeout changes. Lint/build/vendor pass; final combined gates pending.
- Headless Chromium: matching Harness Config card ON -> real READ EXPLAINER click opens exact tracked page;1280/1440/375 no overflow, no page errors; all screenshots inspected. Offline candidate replay is labelled NOT A GAMEPLAY TRIAL / NOT MODEL DELIVERY; original logs untouched. Native saved frames inspected.
- Coordinator confirms live9e33/d41e/6bbd/429f and runner84389/97487 remain frozen; queued swapped pair also captured old pin. Only future fresh launches inherit the fix. One eventual coordinated viewer refresh permitted at number1, using /private/tmp/pokebench-viewer-qwen36-20261024. Another branch landed f6da68cf3 while this branch gated; sync before freezing and rerun combined gates.

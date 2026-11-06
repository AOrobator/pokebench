# Field call text box waits for A

Run 2026-11-05T17-17-57_rayquaza-lane-qwen_7442 (read-only, live) sat on Dad's scripted call on Briney's boat from turn 439 to 474. The readout said `Interface: field_match_call_...; input not ready; ...; text printing: YES`, so the model observed and waited. Run 5f0f cleared the same call in about 4 turns (319-323) with batched A presses.

## Plan

- [x] RED tests for the reader, state wiring, registry and field call advance.
- [x] GREEN: `field-call-input-v1`, default off, OFF byte-identical, on in both arms of the current and Rayquaza recipes and true in both plain presets.
- [x] Decide whether PokéNav call auto-advance covers the field call.
- [ ] Explainer linked from the feature card.
- [ ] Replay 7442's stall turns and 5f0f's turns 319-323 from raw RAM.
- [ ] Read-only GPT review of the merge-base diff.

Not landing here. Focused tests, tsc and eslint only; full suites wait for a coordinator CPU window.

## Findings

Source pokeemerald 731ad5b, ROM SHA-1 f3ae088181bf583e55daf962a92bb46f4f1d07b7.

- `pokenavcall` (`Route104_EventScript_SailToDewfordDadCalls`) calls `ShowPokenavFieldMessage`, which expands the text into gStringVar4, then `StartMatchCallFromScript` runs the `ExecuteMatchCall` task. Task data[0] is tState, data[2] is tWindowId.
- States 4 and 5 run `RunMatchCallTextPrinter`. State 4, `MatchCall_PrintIntro`, prints `sText_PokenavCallEllipsis`, six ellipsis characters then `\p`; the ROM has it at 0x0860EF70, the only match. That first page needs a press too, so `field_match_call_transition` also stalled: 7442 turns 439-441.
- At `\p`, `\l` and pause-until-press the printer stays `active` in RENDER_STATE_CLEAR (2), SCROLL_START (3) or WAIT (1) until `JOY_NEW(A_BUTTON | B_BUTTON)` (`TextPrinterWaitWithDownArrow`, `TextPrinterWait`), with no `IsSEPlaying` check, unless gTextFlags.autoScroll (bit 2). The old reader took `active` for printing, and required silence.
- Mid-character is told apart by the same byte: state 0 HANDLE_CHAR, 4 SCROLL, 5 WAIT_SE or 6 PAUSE. These stay not ready.
- `MatchCall_PrintMessage` takes A or B with the printer inactive only when `!IsSEPlaying()`, so `finished` keeps the sound check.
- Ownership: the printer's own windowId must be tWindowId, and its cursor must be inside the ellipsis (state 4) or gStringVar4 (state 5). gStringVar4 is not read in state 4: a random call fills it only in `MatchCall_PrintIntro`, after the ellipsis.
- gDisableTextPrinters would stop the printer, but only `mauville_old_man.c` sets it and its address is not mapped. It cannot be set while a call owns the field; not read.

## Auto-advance decision

Extended, behind this switch, with the existing limits. It is the same mechanism: one call text in one printer, waiting on the same `JOY_NEW(A_BUTTON | B_BUTTON)`, with no choice for the player. `MatchCall_PrintMessage` has no menu. `withPokenavCallAutoAdvance` already holds the loop, the checked press, caps and the `dialogue_auto_advance` record, so the field call adds an entry test and `fieldCallDecision`. The field call stops at "call ended", or if the map, caller or interface changes or a battle starts. A message after the call, such as the POKéNAV registration box, is left to dialogue auto-advance and the model. Either switch works alone: the PokéNav branches stay gated on `pokenav-call-auto-advance-v1`, the field branch on this one.

With ready true, inner dialogue auto-advance now stops with `menu` on a call instead of waiting on a not-ready interface; the outer wrapper takes over from there.

## Commits

- RED: `test(readout): RED for field-call-input-v1`. Python collection error on the missing names; 16 of 17 agent tests failed.
- GREEN: `feat(readout): field call text box waiting for A behind field-call-input-v1`.

## Checks

- Python focused under the no-I/O guard: `test_field_call_input.py`, `test_menu_field_people.py`, `test_shop_shelf_hidden.py`, `test_interface_guidance.py`, `test_menu_nav.py` pass. ruff check and format clean, mypy clean on the reader.
- Agent focused: `field-call-input.test.ts` (17), `shop-shelf-hidden-switch.test.ts`, `features.test.ts`, `play-preset.test.ts`, `live-human.test.ts` pass. tsc and eslint clean.
- Wiring mutation: replacing `field_call_input=field_call_input_enabled` with False in `read_game_state` turned `test_production_path_honors_the_switch` red; restored.
- `shop-shelf-hidden-v1` tests pinned that switch as the last one; they now pin membership, as the feature-switch skill asks.
- Full suites not run; they need a coordinator CPU window.

# shop-interface-v1

The operator 2026-10-21 10:50 AM ET in the mart stock thread: "build it and put it in the bundle." (the shop Interface-line fix proposed after mart-stock-readout-v1 landed). Branch `claude/shop-interface`, worktree `/private/tmp/pokebench-shop-interface`, based on local main d00cded5. Landing: coordinator's queue (after the control promotion and the seven training/catching switches), fast-forward only, Claude + Grok cloud LGTM, max 2 rounds. No push or PR.

## Problem Statement

Run 2026-10-21T06-28-18_qwen36-gpu0_1331, RUSTBORO CITY MART (turns 680-690, raw RAM 9903-9988):

- Row 0 read "selected POKé BALL; item id: 18". 18 is PARLYZ HEAL: `menus.py` takes the list row's id (which `BuyMenuSetListEntry` sets to the item id) as an index into the stock.
- Rows 1+ read `STATE COVERAGE ERROR: invalid shop item list/index` (the item id 13 or 22 is not below the stock count 10), so every DOWN press result was "unavailable (state coverage error)".
- After buying, "Here you go! Thank you very much." waits for A or B in `Task_ReturnToItemListAfterItemPurchase` (0x080E100D), which the reader does not know: "Shop has no unique verified input owner" for 56 snapshots.
- The quantity box says "selected ITEM 22".

## Game grounding (pokeemerald 731ad5bf src/shop.c)

- `Task_BuyMenu` (0x080E0AC9): data[7] is the list menu task; the list row id is the item id, or LIST_CANCEL (-2) for CANCEL (`BuyMenuBuildListMenuTemplate`, `BuyMenuSetListEntry`).
- `Task_BuyHowManyDialogueHandleInput` (0x080E0D89): tItemId data[5], tItemCount data[1].
- `BuyMenuSubtractMoney` → `Task_ReturnToItemListAfterItemPurchase` (0x080E100D): waits for A or B with the `gText_HereYouGoThankYou` message (expanded into gStringVar4 by `BuyMenuDisplayMessage`).

## Architecture

| Switch | Side | ON | OFF |
|---|---|---|---|
| shop-interface-v1 | server, active_ui | On the buy screen the Interface line names the highlighted row (item name, or CANCEL) with its real item id, the quantity box names the item, and the after-purchase message is a ready `shop_purchase_message` that A or B continues, with the game's message | the shop reader as before, byte for byte |

A post-pass over the native reader's result (like evolution-decision-v1's `decision_ui`), so `menus.py` is untouched. Default off; ON in the bundle arm of bundle-cook-1h, bundle-v-control, whole-map-cook-1h, whole-map-pair-2h.

## Invariants

- INV-1: OFF is byte for byte the previous readout and state JSON on every fixture.
- INV-2: ON never invents: with no unique known owner it returns the native result unchanged (its diagnostic included).
- INV-3: The production path (rerender.read_state → game_state) honours the switch; the agent transports it as a server feature.

## Milestones

**M1 — RED**
- [x] Tests `env/tests/env/test_shop_interface.py` on the five mart-stock fixtures (run 1331): exact ON lines for row 0, row 2, quantity box, after-purchase message; CANCEL row; untouched screens; no-owner and failed-read keep the native result; OFF goldens (today's lines); only active_ui/dialog differ; registry. `packages/agent/src/shop-interface.test.ts`.
- RED: `pokebench_env.shop_interface` does not exist (collection error); 3 vitest failures (not registered).
- [ ] COMMIT

**M2 — GREEN**
- [ ] `env/pokebench_env/shop_interface.py`, game_state/rerender wiring, registry; collateral.
- [ ] Gates.
- [ ] COMMIT

**M3 — bundle arms, pending experiment, explainer, review, land**
- [ ] Fixed definitions, experiment entry, readiness row, explainer (Emerald style), FEATURE_EXPLAINERS.
- [ ] Reviews, coordinator slot, ff-only, viewer-main, live check.

## Multi-Model Review Log

## Session Log

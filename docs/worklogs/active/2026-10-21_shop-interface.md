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
- [x] COMMIT: `test: shop-interface-v1 on the recorded Rustboro MART list rows, quantity box and after-purchase message (RED)` (d3ef1d69)

**M2 — GREEN**
- [x] `env/pokebench_env/shop_interface.py` (post-pass: list row → item name and real item id or CANCEL; quantity box → item name; Task_ReturnToItemListAfterItemPurchase → ready `shop_purchase_message`, message from gText_HereYouGoThankYou because gStringVar4 then holds the money), game_state/rerender wiring, registry (features.ts, play-preset.ts, next-run.ts, legacy-features, readout.py). Collateral: index offsets and OFF strings in ~60 agent tests and 11 pytest files; test_mart_stock's native-reader fixture check now names this switch off.
- [x] Gates: lint ok; agent 3295, viewer 1609, pytest 3668; shop_interface.py 100% lines and branches.
- [x] Delete-the-guard: 6 guards, each red (game_state wiring 4; rerender gate 4; unique owner 1; callback gate 1; CANCEL row 1; agent when() 2). Receipt runs/shop-interface/mutations.txt (ignored).
- [x] COMMIT: `feat: shop-interface-v1 names the highlighted buy-list row, the quantity box's item and the after-purchase page on the Interface line (default off)` (c1b53450)

**M3 — bundle arms, pending experiment, explainer, review, land**
- [x] Fixed definitions (bundle arm only) in bundle-cook-1h, bundle-v-control, whole-map-cook-1h, whole-map-pair-2h; `experiments/shop-interface-v1.json` (incumbent = bundle-v-control bundle arm with only this switch off; activation OLDALE_TOWN; source.commit c1b53450); readiness row; Emerald-styled explainer + README + FEATURE_EXPLAINERS + panels/server/fixed-runner tests; pages-check clean, 200 on 8791. Pending incumbents (heal-first, story-battle-heal-gate, open-goal-prompt) drop the new id like the other later ids.
- [x] Gates: lint ok; agent 3295 (97.27/93.11/97.74/99.21); viewer 1612 (95.42/91.34/94.33/97.9); pytest 3668 (lines 97.28 branches 93.11 functions 100). fixed-cli check exit 0 on all four, bundle switches end with shop-interface-v1.
- Waiting in the coordinator's queue (control promotion and seven training/catching switches land first); review runs once on the resynced packet so it isn't voided by their registry changes.
- [ ] Reviews, coordinator slot, ff-only, viewer-main, live check.

## Session Log (resync)

- 2026-10-21 ~11:50 AM ET: merged local main fe4ed9c7 (control promotion 607954b2, seven training/catching switches 4d884c03) with `-X theirs`, then re-applied this switch after said-type-matches-v1 in every registry list, the four fixed definitions and the incumbent (refreshed to the current bundle arm); collateral offsets re-derived. Stepped aside on the landing board while finishing (rejoined at #6).

- Gates on 7e2eb4fa: lint ok; agent 3325 (97.32/93.05/97.8/99.23); viewer 1615 (95.42/91.33/94.33/97.9); pytest 3712 (lines 97.30 branches 93.09 functions 100); verify-vendor ok; fixed-cli check exit 0 on all four, bundle switches end with shop-interface-v1.

- ~12:05 PM ET: merged main f671f35d (Emerald pages theme: explainers now go through `just pages-theme`) cleanly; explainer re-themed, dark block dropped as the skill now says, pages-check clean, opened at 8791. Viewer 1615 green.

## Principles self-review

| ID | Score | Evidence |
|---|---|---|
| PB1 | PASS | Interface text only; no grading change. |
| PB2 | N/A | No run accounting touched. |
| PB3 | PASS | No benefit claimed; pending experiment. |
| PB4 | PASS | Named switch, default off, bundle arm only; vendor untouched. |
| PB5 | PASS | One switch, one hypothesis. |
| PB6 | N/A | No context growth (same lines, corrected). |
| PB7 | PASS | active_ui is recorded in state events as before. |
| PB8 | PASS | No owner or failed read keeps the native result, its diagnostic visible (tests). |
| PB9 | PASS | The operator asked for it; scope is the three broken buy-screen states seen in run 1331. |
| PB10 | PASS | No skipped tests; collateral re-indexed only. |
| PB11 | PASS | Task addresses and data slots match pret 731ad5bf and the recorded RAM of run 1331. |
| PB12 | PASS | ROM via POKEBENCH_ROM only. |
| PB13 | PASS | Tests on recorded states through the production path; explainer opened; viewer-main and live check after merge. |

## Frozen boundary

In scope: `env/pokebench_env/shop_interface.py`, its wiring in game_state.py and rerender.py, the registry, four fixed definitions (bundle arm only), `experiments/shop-interface-v1.json`, readiness row, explainer + README + FEATURE_EXPLAINERS, tests (new and collateral). Out of scope: `menus.py` itself, decoration shops, the SELL screen, the Premier Ball page, quantity-box controls wording.

## Multi-Model Review Log

- Round 1 (packet ebc615c0, base f671f35d, head a18d545d): Grok LGTM; Claude (read-only subagent) LGTM with one medium finding, triaged Fix: in a decoration shop (martType 1/2) the row id is a decoration id, and ON labelled it "item id". RED test added (decoration shop keeps the native result) (f2e48dc3). Fixed: shop_ui returns the native result unless sMartInfo.martType is 0. Gates: lint ok; agent 3325, viewer 1615 (experiment-cli's git test failed once under load, passed alone), pytest 3724; shop_interface.py 100%. Round 1's Claude note 2 (constant HERE_YOU_GO) stands as correct, no change.

## Session Log

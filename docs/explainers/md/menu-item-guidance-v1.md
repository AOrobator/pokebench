POKÉBENCH · DEFAULT OFF · menu-item-guidance-v1

# Menu item guidance

> Markdown twin of [menu-item-guidance-v1.html](../menu-item-guidance-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Requested after bundle run gpu1_2e93, turns 548–563: Torchic stayed at 24/31 HP and Potion ×1 while the model repeatedly opened SUMMARY.

## OFF · existing behavior

SUMMARY | ITEM | CANCEL<br>
Directions select

## ON · candidate behavior

UP/DOWN selects; A chooses SUMMARY<br>
\1. SUMMARY (selected)<br>
\2. ITEM<br>
\3. CANCEL

![Native menu state flows through the feature switch into recorded tool feedback](menu-item-guidance-v1/fig-1.svg)

ITEM manages held items. Using medicine begins in BAG, then USE, then a target or message. The model chooses every input.

## Boundaries and grounding

Readiness and selections come from the current verified active_ui owner. Unknown or diagnostic owners get no guessed menu directions. Bag action grids retain their two-column layout; party action menus use UP/DOWN. No input is automated by this change.

Game reference: pret/pokeemerald 731ad5bf, start_menu.c StartMenu_Input; party_menu.c Task_HandleSelectionMenuInput, CursorCb_Item, CursorCb_Give; item_menu.c Task_ItemContext_SingleRow and Task_ItemContext_MultipleRows. Running US ROM SHA-1 f3ae088181bf583e55daf962a92bb46f4f1d07b7.

## Validation status

Candidate in isolated a working branch checkout. Native battle and field probes verify successful use, cancellation and no-effect preservation; raw RAM, screenshots and delivered feedback are retained. Two review findings were corrected and re-review is pending. The no-effect message and shop-list decoders still have pre-existing coverage gaps; these are recorded for follow-up. No measured benefit claimed, no existing run changed, no pending experiment approved or launched.

# SHOP INTERFACE

> Markdown twin of [shop-interface-v1.html](../shop-interface-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`shop-interface-v1` · server readout switch · on in both arms of current (the operator 2026-11-01); registered default off · the operator 2026-10-21: "build it and put it in the bundle"

The Interface line is how the model knows which row the cursor is on and whether a press worked. On the POKéMON MART buy screen it was wrong or missing almost everywhere. In run `2026-10-21T06-28-18_qwen36-gpu0_1331` (RUSTBORO CITY MART, turns 680–690), the first row named item id 18 (PARLYZ HEAL) for POKé BALL. Every later row was a coverage error, so each DOWN press came back "unavailable". The quantity box said "ITEM 22", and the page after buying was an unknown owner for 56 snapshots.

With this switch, the Interface line on the buy screen names what the game shows: the highlighted row with its real item id (or CANCEL), the item in the quantity box, and the "Here you go!" page as a ready page that A or B continues. Nothing else in the readout changes.

## Cursor on row 3 (raw RAM 9913)

OFF · TODAY

Unverified menu buffer: cursor 1 of 3; active menu owner unavailable Interface: shop_menu; input unavailable; Menu observation unavailable; STATE COVERAGE ERROR: invalid shop item list/index Menu state: selected index (zero based): 2

ON

Menu: shop_menu; selected SUPER POTION Interface: shop_menu; input ready; selected SUPER POTION; Directions select; A accepts; B cancels Menu state: selected index (zero based): 2; item id: 22

## After buying (raw RAM 9930)

OFF · TODAY

Dialog: none Menu: unavailable (active owner not verified) Interface: shop_menu; input unavailable; Menu observation unavailable; STATE COVERAGE ERROR: Shop has no unique verified input owner

ON

Dialog: "Here you go! | Thank you very much." Menu: no menu choice open (the Interface line says what owns input) Interface: shop_purchase_message; input ready; A or B continues Menu state: message: Here you go! | Thank you very much.

## Quantity box (raw RAM 9919)

OFF · TODAY

Interface: shop_quantity; input ready; selected ITEM 22; Directions select; A accepts; B cancels

ON

Interface: shop_quantity; input ready; selected SUPER POTION; Directions select; A accepts; B cancels

Exact text from the production reader on the mart-stock fixtures of run 1331.

## What was wrong, and the game's own flow

![pret/pokeemerald 731ad5bf src/shop.c. The message comes from gText_HereYouGoThankYou: by the time the page waits, PrintMoneyAmountInMoneyBox has overwritten gStringVar4 with the money, and that task is reached only from this page.](shop-interface-v1/fig-1.svg)

*pret/pokeemerald 731ad5bf `src/shop.c`. The message comes from `gText_HereYouGoThankYou`: by the time the page waits, `PrintMoneyAmountInMoneyBox` has overwritten gStringVar4 with the money, and that task is reached only from this page.*

## Never invents

The switch runs after the existing shop reader. If the buy screen is not up, if no single known task owns input, or if a read fails, the existing result is kept, coverage error included. With the switch off the reader is unchanged, byte for byte (tests on all five recorded states).

## Status

21 tests on the recorded states plus registry tests; six guards deleted one at a time each turned the tests red. On in the bundle arm of bundle-v-control, bundle-cook-1h, whole-map-cook-1h and whole-map-pair-2h. Pending experiment `experiments/shop-interface-v1.json`, not queued. Pairs with [mart-stock-readout-v1](mart-stock-readout-v1.md), which lists the stock and prices.

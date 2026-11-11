# Bag pocket truth

> Markdown twin of [bag-pocket-truth-v1.html](../bag-pocket-truth-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`bag-pocket-truth-v1` · Separate bugfix switch. Omitted presets default OFF; Operator authorized ON in both arms of the current fixed-run recipes.

## What changes

The native pocket enum is 0 ITEMS, 1 POKE BALLS, 2 TMS HMS, 3 BERRIES, 4 KEY ITEMS. The old order placed KEY ITEMS second and shifted the remaining labels.

![The same recorded condition with the switch off and on](bag-pocket-truth-v1/fig-1.svg)

Correct labels flow through the production reader into the typed state and model readout.

## Recorded evidence

Run `2026-10-24T10-22-09_qwen36-gpu0_3b6e`, turn 1360: the readout changes from BERRIES to TMS HMS while the press result says interface unchanged. The paired frame shows BERRIES. Hash-validated raw RAM changes from native pocket 4 to 3.

Source: clean pret/pokeemerald revision `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`, `include/constants/item.h`, `include/item_menu.h` and `src/item_menu.c`. Matching US ROM SHA1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7`.

<details>
<summary>Scope and verification</summary>

Each repair is independently switchable. Historical logs and pinned runs stay unchanged. Activation uses base.features plus onInBoth; the fixes are excluded from the arm treatment switches.

Regression tests cover OFF behavior, production wiring, the native enum, press comparisons and repeated bag input. Recorded replay establishes mechanism correctness; no gameplay benefit is claimed. Review, landing and served verification are recorded separately in the feature worklog.

</details>

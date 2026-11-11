POKÉBENCH · HARNESS LAB

# JIT v2 · stable core, timely guidance

> Markdown twin of [just-in-time-prompt-v2.html](../just-in-time-prompt-v2.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`just-in-time-prompt-v2` keeps a fixed system core and the full tool catalog, then appends instructions for the verified interface beside observations.

**Prepared treatment, not a measured improvement.** Default OFF. No v2 runs, new GPU allocation or launch approval. V1’s experiment stays frozen. V2 supersedes v1 if both are selected; the proposed experiment disables v1 in both arms.

## Keep the beginning reusable

![Illustrative new-game order, grounded in main_menu.c and data/scripts/players_house.inc at pret/pokeemerald 731ad5bf. Intermediate guides are omitted for clarity. The provider owns image serialization; guides follow the complete observed result batch. Unknown startup adds no permanent guide. A recognized interface at task-only startup retains the existing task anchor; this example starts at MAIN_MENU.](just-in-time-prompt-v2/fig-1.svg)

*Illustrative new-game order, grounded in main_menu.c and data/scripts/players_house.inc at pret/pokeemerald 731ad5bf. Intermediate guides are omitted for clarity. The provider owns image serialization; guides follow the complete observed result batch. Unknown startup adds no permanent guide. A recognized interface at task-only startup retains the existing task anchor; this example starts at MAIN_MENU.*

## Why v1 was still fairly large

Exact proposed experiment preset, measured locally from source on 2026-10-18. These are JavaScript text characters, not token counts. Control’s full system is 13,939 characters.

| Scene | V1 system | V2 core | V2 new guide body |
|---|---|---|---|
| Overworld | 10,435 | 3,308 | 7,803 |
| Clock | 3,315 | 3,308 | 369 |
| Naming | 4,939 | 3,308 | 1,993 |
| Battle | 5,149 | 3,308 | 2,203 |
| Menu | 4,651 | 3,308 | 1,705 |
| Unknown interface | 13,939 (fallback) | 3,308 | 0 · no guide |

Known-scene body sizes exclude the guide’s label. Unknown interfaces add zero guidance characters: the model receives the stable core, full tools, current screenshot/readout and retained conversation. Existing known-scene guides remain while their anchors survive, so total guidance can still grow. Removing fallback is an unmeasured policy change, not proof of better caching or progress.

## When a guide is added

For a recognized interface, at actual request dispatch: first request, scene change, or loss of the active guide’s observation during context trimming. Returning through an unknown interface to the same recognized scene creates a fresh guide after the latest observation. Repeated requests retain exact guide text and timestamp. Tool-call IDs anchor guides through observation collapse; intervening canonical assistant replies can anchor a newer guide after those replies. Evicted guides leave the projection; needed current guidance is appended at the newest retained observation. Transient instruction ledgers do not become anchors.

Each guide applies only to its labelled interface. Current screenshots and readouts determine input ownership. Unknown scenes create no guide, even at startup. Older known-scene guides can remain as retained history but are not an active guide for the unknown interface. No additional main-menu, Birch, starter, PC or map guides are introduced. Cross-scene trust, evidence and supervisor rules remain in the core. V2 adds no execution guard or tool filter.

## Recorded evidence

Assistant `request_context.mode = jit-v2` records the exact core and hash, full tool names and definition hash, current scene/state sequence, active guide’s original source state, anchor, ordinal, text/hash and injection reason when present. Unknown requests omit active guidance; their scene and all retained guides are still recorded. `projected_guidance` lists every retained guide. Activity History and raw inspection preserve these receipts; no timeline marks are added.

`component_chars.core_text` and `guidance_text` count raw text characters. `canonical_history_json` counts serialized canonical history including image encoding; it is not text tokens or directly comparable with the two text counts. Provider token and cache counters remain the source for request size. No invented per-section token estimates.

## Limits and OFF behavior

OFF takes the existing full/v1 path unchanged. V2 does not prevent prefix changes caused by baseline history collapse, screenshot pruning, changing ledgers, provider formatting, or backend cache eviction. Tests prove the v2 projection preserves its retained bytes; only a new experiment can measure backend reuse and gameplay progress.

This minimal-unknown revision is on a working branch. Review and landing status live in the active worklog. The separate ten-minute screen remains a proposal.

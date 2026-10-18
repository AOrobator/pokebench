# BAG page: item ledger in the PokéNav

## Problem Statement

The operator picked mockup "C · Item ledger" (`runs/mockups/bag-inventory/variant-c.html`, screens in `runs/mockups/bag-inventory/screens/{desktop,phone}-c.jpg`) for a BAG page in the run viewer's PokéNav. Runs already record the bag in every state (`resources.bag`, `resources.pc_items`) and every quantity change as a `native_action` of kind `item_quantity_changed`; the viewer shows none of it.

## Architecture

Viewer-only. No new recorded fields, no harness behavior change, so no feature switch. The TIMELINE is untouched.

- **`bag.ts` (new browser module).**
  - `BagLedger` folds a run's events: bag snapshots from states, item changes from `item_quantity_changed`, each resolved at the next state with a bag.
  - Causes are inferred from recorded state only:
    - BOUGHT: money drops in that step.
    - SOLD: money rises as the item leaves.
    - FROM PC / TO PC: the item storage PC changes by as much.
    - TUTORIAL BAG: in battle, the ITEMS and POKé BALLS pockets become exactly one POTION and one POKé BALL. That is `DoWallyTutorialBagMenu` in pokeemerald `src/item_menu.c`.
    - BAG RESTORED: the pockets swap back to the saved ones.
    - Otherwise FOUND / GIVEN, or USED / TOSSED.
  - `bagPage` draws the page:
    - headline numbers;
    - pockets in the game's order (ITEMS, POKé BALLS, TMs & HMs, BERRIES, KEY ITEMS), with empty pockets faded;
    - one step chart per item on a shared turn axis, with the tutorial window shaded;
    - changes newest first, with New York times and ▶ jumps.
- **`app.ts`.**
  - The page is folded from the whole run, not the replay cursor, and redrawn only while it is open and the ledger changes.
  - ▶ pauses the replay on the first recorded frame after the change and scrolls the game screen into view.
  - Jumps are disabled on a live run.
- **Art.**
  - `just bag-art` (`scripts/bag-art/build_bag_art.py`) builds item icons from `gItemIconTable` and the bag pocket sprites from `gBagMaleTiles`. Every pointer and block is verified against the ROM, and the output goes to gitignored `runs/sprites/bag-v1`.
  - The server allowlists `/sprites/bag/...`.
  - Without the art, the page shows names only.

## Milestones

**M1: BAG page**
- [x] RED: bag ledger, page, app jump and server art route tests (bag.test.ts fails to import bag.ts; 4 app/server tests fail)
- [x] GREEN: bag.ts, app wiring, page, styles, server route, `just bag-art`. Gates: viewer 1147 (95.57/91.42/94.05/97.74), agent 2338, Python 2478 passed (97.48/93.42/99.43), lint clean
- [x] Synced with main 8e0e0c34 (merge 5b321636, docs-only upstream). Gates on the tip: viewer 1147, agent 2338, Python 2478 passed / 229 ROM-skipped (97.48/93.42/99.43), `pnpm -r lint` clean, mypy clean (run with the main checkout's venv: this worktree's fresh venv lacks the mGBA binding, a pre-existing env gap), build OK.
- [x] Browser proof on a scratch copy of e046 (scratch viewer on 127.0.0.1:8797, stopped after): headline 10 gained / 0 used / ¥500 in 2 buys / 1 tutorial swap, the same as the mockup; pockets in game order with BERRIES and KEY ITEMS faded; tutorial band T450–T454. A pointer click on ▶ T611 paused the replay at TURN 611 on frame 017180 (the mart after the POTION buy, ¥2084). Enter on a focused ▶ T450 showed Wally's tutorial bag (POTION ×1). At 390 px, a tap on ▶ T514 scrolled to the game at TURN 514 in Petalburg Woods. No horizontal overflow; the only console errors are 404s for trainer-card art the scratch root lacks. Screenshots: runs/mockups/bag-inventory/shots/.
- Art: the session could not read the ROM (permission denied), so `just bag-art` was proven on a synthetic ROM that holds the decomp's LZ77 blocks and a gItemIconTable (309 icons, 5 pockets verified). The operator runs `just bag-art` once against the real ROM.
- [ ] Review (Claude, Grok, GPT cloud lanes) on a frozen packet

## Multi-Model Review Log

(none yet)

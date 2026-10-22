# BAG page: item ledger in the PokéNav

## Problem Statement

The operator picked mockup "C · Item ledger" (`runs/mockups/bag-inventory/variant-c.html`, screens in `runs/mockups/bag-inventory/screens/{desktop,phone}-c.jpg`) for a BAG page in the run viewer's PokéNav. Runs already record the bag in every state (`resources.bag`, `resources.pc_items`) and every quantity change as a `native_action` of kind `item_quantity_changed`; the viewer shows none of it.

## Architecture

> M1 design below is superseded by M2 (no change list or jumps, no tutorial band, no pocket sprites); see M2.

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


**M2: The operator's redesign (coordinator, 2026-10-21)**

The approved mockup changed: runs/mockups/bag-inventory/variant-c.html, v3.
- Pocket headers become the game's bag pocket label: a yellow pill with red-outlined white text and a count box; empty pockets are grey. No bag sprite and no dots.
- The CHANGES list and its ▶ jumps are removed.
- POKéMON PARTY moves right after AGENT TRACE.
- Wally's tutorial bag is not counted at all. Item changes shown in states with party_owner "tutorial" (the game's BATTLE_TYPE_WALLY_TUTORIAL flag) are skipped, and the lent bag never becomes a snapshot. The tutorial band, its legend entry and the TUTORIAL SWAP number are gone.
- Round 1 GPT fixes are folded in:
  - a ball thrown in an ordinary battle is no longer taken for the tutorial (the bag-shape heuristic is gone);
  - an unrecorded pc_items is unknown, not empty;
  - a pocket that is empty now shows grey even when it has history.
- [x] Merged main ec8f514b into the branch (05c9d3a5d). Conflicts took main's side and re-added the BAG page; phone rules now use :root[data-phone].
- [x] RED: new bag, app (page order, art, head→history refold) and server tests fail on the old page.
- [x] GREEN: pocket-label headers, 3 headline numbers, no change list or jumps, tutorial bag skipped on party_owner "tutorial" (plus the swap back when the player's bag only reappears after the tutorial), pc_items null = unknown, empty = nothing held now, the ledger refolds when the head view is replaced by full history, item icons only (pocket sprites dropped from `just bag-art` and the route), PARTY after TRACE. Gates: viewer 1546 tests (95.4/91.1/94.4/97.9; bag.ts 100/91/100/100), agent 3230, lint clean, build OK; Python 2980 passed / 513 skipped, with one ROM-env test failing because this shell has no POKEBENCH_ROM (Python untouched), coverage 96.57/91.77/98.47.
- [x] Browser (scratch e046, 127.0.0.1:8797, stopped after). Desktop: pointer click on BAG shows 10 / 0 / ¥500 (2 buys), pills with count boxes, BERRIES and KEY ITEMS grey, POTION 0→1→2 and POKé BALL 0→5→6 with no tutorial dip, axis T0 T302 T514 T1064, no tutorial text. Phone 390: ▶ from AGENT TRACE lands on POKéMON PARTY, the BAG pick renders without horizontal overflow. Shots: runs/mockups/bag-inventory/shots/v2/.
- [x] Main synced again (43da67e7, merge 5c4d2b17); gates re-run on the tip: viewer 1549, agent 3230, lint clean, build OK.
- [x] Review round 2 on packet 43da67e7..5c4d2b17 (sha256 3f11f221…):
  - Grok (Cursor cursor-grok-4.5-high): LGTM.
  - Claude: LGTM. The Cursor Opus harness hit its usage limit and the Claude CLI hit its weekly limit, so this ran on a read-only Claude subagent (operator memory: the Claude lane is not down while subagents run).
  - GPT (isolated Codex gpt-5.6-sol xhigh; Cursor GPT had hit its usage limit): BLOCKING. (1) Tutorial-loan item changes showed as unresolved in the window before the tutorial state, e.g. the e046 prefix through seq 11830. (2) A pending change does not bump the render key.
- [x] Fix: changes waiting for their state are no longer drawn or counted, since only that state can rule out the tutorial loan. This removes both findings. Test: every prefix through the swap draws the same page. Viewer 1550 (95.41/91.15/94.4). Not re-reviewed: a round 3 needs operator approval (cap 2).

- [x] the operator approved round 3. Main synced (46663221, merge d565a9a9). Gates: viewer 1552 (95.41/91.15/94.4), agent 3246, lint clean, build OK.
- [x] Real-ROM `just bag-art` failed for the operator: IndexError in lz77 via build_items → rom.decompress. `rom.raw(head)` took the first raw copy of the QuestionMark icon/palette pointer pair, which is not the table. Fix:
  - `find_icon_table` tries every 4-aligned copy of every candidate head (all LZ copies of the first icon and palette).
  - It accepts only a run where every pair points inside the ROM and decompresses to that item's decomp art; anything else is a VerifyError.
  - The shared lz77 reader returns None for an offset outside the data.
  - Tests: env/tests/tooling/test_build_bag_art.py covers a decoy head before the table, an out-of-range pointer, missing first art, and lz77 bounds.
  - The synthetic ROM still builds 309 icons. Python 2992 passed; the 59 failures all need POKEBENCH_ROM, which this shell lacks (test_move_learn from main, test_wally_battle). Coverage 96.07/91.07/97.40; ruff and mypy clean.
  - The operator reruns `just bag-art` on the real ROM.

## Multi-Model Review Log

- Round 1 (old design, packet 8e0e0c34..18760f81): Grok LGTM. GPT BLOCKING: tutorial heuristic false positive, pc null read as empty, empty-with-history pockets not faded (all fixed in M2), and the real-ROM art receipt (rebutted: ROM reads are denied in the session). Claude CLI was at its weekly limit.
- Round 2: see M2 above.
- Round 3 on packet 772a4614..8431c4ec (sha256 aa633171f7feda91e5038524ae3aadc7f1e6c626bdf11087d613b027b39d6418):
  - Claude (read-only subagent; Cursor Opus and the Claude CLI were both at usage limits): LGTM.
  - Grok (Cursor cursor-grok-4.5-high): LGTM.
  - GPT (isolated Codex gpt-5.6-sol xhigh): BLOCKING. Human recordings write the state before the game's native actions (packages/agent/src/human.ts), so a purchase confirmed by the preceding state stayed waiting forever, or resolved as found.
- [x] Fix after round 3:
  - An action whose item quantity the latest player state already shows as `after`, while the state before it shows `before`, resolves against that pair. Agent runs still wait for the next state, since there the latest state still shows `before`.
  - `seriesOf` groups changes in linear time (GPT follow-up).
  - Test: a state before its action resolves as bought with ¥200 spent, and a PC withdrawal as from_pc.
  - Viewer 1557 (95.42/91.18/94.41). Not re-reviewed.
- [x] the operator: GPT-only check of the last fix, then land.
  - Main synced (8c0cf282, merge 74b85b45). Gates: viewer 1557, agent 3246, lint clean; Python 2992 passed, with 59 failing only for lack of POKEBENCH_ROM.
  - Packet 8c0cf282..74b85b45, sha256 346780917083582cb0d8d3c32240bbc3c8fce0cab000759d7817c5081e177fee. GPT (isolated Codex gpt-5.6-sol xhigh): BLOCKING. In human order the restored player state comes before the swap-back actions, so those actions leaked in as found/used.
- [x] Fix:
  - Until the next state after the tutorial, an action whose item the restored bag already shows at `after` is the swap back and is dropped. In agent order a real change arrives before the state that shows it, so it never matches.
  - Test: a human-order tutorial swap and restore leave 0 changes, and the next real use counts.
  - e046 still folds to 10 / 0 / ¥500 (2 buys) with 6 changes.
  - Viewer 1558 (95.42/91.18/94.41). No further round, per the operator.

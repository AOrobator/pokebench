# mart-stock-readout-v1

Requested by the coordinator (relay 2026-10-21 9:20 AM ET), proposal 4 of `runs/reports/rustboro-strategy/index.html` ("Rustboro gym battle strategy" thread). Branch `claude/mart-stock-readout`, worktree `/private/tmp/pokebench-mart-stock`, based on local main fc40a11a. Landing: coordinator merge slot (fixed/ edits only while holding it), between overnight-loop pins, fast-forward only, Claude + Grok cloud LGTM, max 2 rounds. No runs, push or PR.

## Problem Statement

No run in 11 reached ROXANNE having bought anything, while holding ¥4,286–6,960. Run 1331 (2026-10-21T06-28-18_qwen36-gpu0_1331) opened the Rustboro MART buy list at turns 680-690 and the readout could not follow it:

- Row 0 read "selected POKé BALL; item id: 18" (18 is the wrong item: `menus.py` treats the list item id as a row index).
- Rows 1+ read `STATE COVERAGE ERROR: invalid shop item list/index`; every DOWN press result said "unavailable (state coverage error)" (raw seq 9909-9914, 9984-9988).
- After the purchase the readout said "Shop has no unique verified input owner" for 56 snapshots (raw 9928-9983).
- Nothing showed the prices or what any item does; the game shows one description at a time for the highlighted row.

## Game grounding (pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881)

- `src/shop.c`: `sMartInfo` (EWRAM 0x02039F60: callback, menuActions, itemList @+8, itemCount u16 @+12, windowId @+14, martType @+15). `BuyMenuSetListEntry` sets each list row's id to the item id; the last row is `gText_Cancel2` with id LIST_CANCEL (-2). `BuyMenuPrintPriceInList`: normal marts print `GetItemPrice(item) >> IsPokeNewsActive(POKENEWS_SLATEPORT)` as `gText_PokedollarVar1` "¥{STR_VAR_1}". `BuyMenuPrintItemDescriptionAndShowItemIcon`: `GetItemDescription(item)`, or `gText_QuitShopping` "Quit shopping." for CANCEL. Decoration marts (martType 1/2) use `gDecorations`; out of scope (no block).
- `CB2_BuyMenu` = 0x080DFD65 (`SHOP_CALLBACK`), `Task_BuyMenu` = 0x080E0AC9, its data[7] = list menu task (`menus._list_selection`).
- `src/tv.c` `IsPokeNewsActive` / `ShouldApplyPokeNewsEffect`: the Slateport half price applies only on SLATEPORT CITY (map 0/1) while talking to the Energy Guru (local id 25) and a Slateport PokeNews entry (SaveBlock1 +0x2B50, 16×{kind,state,u16}) is ACTIVE (2). `gSpecialVar_LastTalked` 0x020375F2 (after `gSpecialVar_Result` 0x020375F0; 1 = the Rustboro clerk in run 1331).
- `gItems` 0x085839A0, 44-byte rows: name[14], itemId u16 @14, price u16 @16, description pointer @20.

## Architecture

| Switch | Side | ON | OFF |
|---|---|---|---|
| mart-stock-readout-v1 | server readout | While a normal mart's buy screen (CB2_BuyMenu) is up: a block after the Interface line listing each row with its price and the game's description, CANCEL with "Quit shopping.", the highlighted row when the buy list task owns input, and the player's money | no block; readout byte for byte as before |

Default off; ON in the bundle arm of bundle-cook-1h, bundle-v-control, whole-map-cook-1h, whole-map-pair-2h; never control.

## Invariants

- INV-1: OFF is byte for byte today's readout and state JSON on every fixture.
- INV-2: Text only from game tables and strings (item names, prices, descriptions, "Quit shopping."); nothing ranks or recommends an item.
- INV-3: No block outside CB2_BuyMenu or in a decoration mart; a failed read is a visible `HARNESS BUG (mart stock)` line, never a guessed list.
- INV-4: The production path (rerender.read_state → game_state → readout, and the agent's server-feature transport) honours the switch.

## Milestones

**M1 — RED**
- [x] Fixtures: raw-RAM archives from run 1331 (buy list row 0, row 2, quantity box, after-purchase message, BUY/SELL/QUIT menu) + provenance.
- [x] Tests: `env/tests/env/test_mart_stock.py` (reader per recorded state, CANCEL row, decoration shop, Slateport sale, failure paths, exact block, OFF byte parity, state JSON, visible harness bug, registry); `packages/agent/src/mart-stock-readout.test.ts` (registry, presets, server transport). Registry collateral lands with GREEN.
- RED: `pokebench_env.mart_stock` does not exist (collection error); 3 vitest failures (switch not registered).
- [x] COMMIT: `test: mart-stock-readout-v1 on the recorded Rustboro MART buy list, quantity box and after-purchase states (RED)` (c102edaf)

**M2 — GREEN**
- [x] `env/pokebench_env/mart_stock.py` (typed MartStock, Slateport sale exactly as IsPokeNewsActive applies it, highlighted row cross-checked against the stock, None without a read save block), GameState text-only fields with a visible `HARNESS BUG (mart stock)` line, readout block after the Interface lines, rerender wiring, registry (features.ts SWITCHABLE/FEATURES/SERVER/playHarnessFeatures, play-preset.ts, next-run.ts, legacy-features, readout.py SERVER_FEATURES + default-off list). Registry collateral: 62 agent test files (index offsets, server OFF strings, incumbent filters), 11 pytest files.
- [x] Gates: `just lint` ok (tsc, eslint, ruff, format, mypy 106 files); `just build` ok; `just coverage` agent 3284 (97.26/93.1/97.71/99.2), viewer 1600 (95.42/91.33/94.33/97.9), pytest 3621 lines 97.25 branches 92.97 functions 100; mart_stock.py 100% lines and branches.
- [x] Delete-the-guard: 9 guards deleted one at a time, each red, each restored (readout wiring 5; rerender read gate 6; readout OFF gate 5; decoration gate 1; buy-screen gate 1; highlight agreement 1; save-block gate 1; Energy Guru check 1; agent when() 2). Receipt runs/mart-stock-readout/mutations.txt (ignored).
- [x] COMMIT: `feat: mart-stock-readout-v1 lists the clerk's buy list with prices, the game's item descriptions, the highlighted row and money (default off)` (d778a741)

**M3 — bundle arms, pending experiment, explainer, review, land**
- [x] Fixed definitions (bundle arm only: `switches` + `base.features: false`) in bundle-cook-1h, bundle-v-control, whole-map-cook-1h, whole-map-pair-2h; `experiments/mart-stock-readout-v1.json` (incumbent = bundle-v-control bundle arm with only this switch off, activation OLDALE_TOWN, primary ROXANNE_DEFEATED, source.commit d778a741), readiness row. `experiment-cli check`: no problem for this entry (its only problems are 150 pre-existing starter-decision-salience ledger lines).
- [x] Explainer `docs/explainers/mart-stock-readout-v1.html` + FEATURE_EXPLAINERS + README line + panels/server/fixed-runner tests; `just pages-check` clean; copied to main runs/mockups/mart-stock-readout-v1/, 200 on 8791.
- [x] fixed-run check through `fixed-cli main(["check", id])` with root = this worktree: all four exit 0, bundle switches end with mart-stock-readout-v1, control base unchanged.
- [x] Gates on the synced tip: `just lint` ok; `just build` ok; `just coverage` agent 3284 (97.26/93.11/97.71/99.2), viewer 1604 (95.42/91.33/94.33/97.9), pytest 3621 (lines 97.26 branches 93.04 functions 100); `just verify-vendor` ok. open-goal-prompt's incumbent test drops the new bundle switch like the other later ids.
- [x] Claude + Grok LGTM on the frozen packet; coordinator slot; ff-only merge; `just viewer-main`; live check.
  - Landed 2026-10-21 10:18 AM ET: `git merge --ff-only` to ad0209b3 (main = the reviewed tree, packet c99043e1… over base 29da3cb0).
  - `just viewer-main`: viewer at ad0209b3, 2 live gameplay processes kept. Live: /explainers/mart-stock-readout-v1.html 200 on 8790 and 8791; Harness Config shows the MART STOCK READOUT card (NOT RECORDED on an older run) with READ EXPLAINER → /explainers/mart-stock-readout-v1.html.
  - `just test` on the landed tree (built worktree at ad0209b3): agent 3285, viewer 1607, pytest 3638, all pass. (In the primary checkout `just test` fails the viewer suite only because that checkout's agent dist is never rebuilt there; not a code failure.)
  - Overnight loop: round 3 pins main at about 10:28 AM ET, so whole-map-pair-2h's bundle arm carries the switch from that round.

## Follow-ups

- Shop Interface line: `menus.py` reads the list item id as a row index (wrong item id at row 0, coverage error at rows 1+) and has no owner after a purchase (`Task_ReturnToItemListAfterItemPurchase`-style message task 0x080E100D). A harness bug fix, so it needs its own switch (coordinator 2026-10-21).

- 2026-10-21 ~10:05 AM ET: merged local main 4e6d5bb3 (move-learning menu line fix: readout.py, test_move_learn.py) cleanly. Gates on the merged tip: lint ok; agent 3284 (97.26/93.1/97.71/99.2); viewer 1604 (95.42/91.33/94.33/97.9; server-stream's event-loop timing test failed once under parallel load and passed alone and in a rerun of the whole viewer suite); pytest 3627 (lines 97.26 branches 93.04 functions 100).

- 2026-10-21 10:03 AM ET: Claude (read-only subagent) and Grok round 1 both LGTM on packet 69f66ebd; the resync to 52b086ac kept the packet byte-identical. Before the merge, main moved to 5534f285 (codex/gym-door-label, landed outside the coordinator's queue): 34 conflicts, all registry order. Resolved by putting gym-door-label-v1 first and this switch after it (the incumbent was refreshed to the current bundle arm). Conflicted collateral tests were taken from main and their offsets re-derived. The new packet needs review round 2. Gates on 26aa4381: lint ok; agent 3285 (97.26/93.11/97.71/99.2); viewer 1607 (95.42/91.33/94.33/97.9); pytest 3638 (lines 97.27 branches 93.04 functions 100); verify-vendor ok; fixed-cli check exit 0 on all four (bundle switches end gym-door-label-v1, mart-stock-readout-v1; whole-map-pair-2h has no gym-door switch on main).

- Round 2 (packet c99043e1…, base 29da3cb0, head ad0209b3): Grok (cursor-grok-4.5-high) VERDICT: LGTM; Claude lane as a read-only Claude subagent (Cursor Opus and Sonnet usage-capped, CLI OAuth expired) VERDICT: LGTM, packet verified start and end. Receipts runs/reviews/mart-stock-readout-v1/ (ignored).

## Principles self-review (docs/agent-principles.md)

| ID | Score | Evidence |
|---|---|---|
| PB1 | PASS | Text only; no milestone or grading change. |
| PB2 | N/A | No run accounting touched. |
| PB3 | PASS | No benefit claimed; pending experiment, N from the experiment-design skill when queued. |
| PB4 | PASS | New RAM-derived readout is a named switch in `harness_features`, default off, bundle arm only; vendor untouched (`just verify-vendor` ok). |
| PB5 | PASS | One switch, one hypothesis in `experiments/mart-stock-readout-v1.json`. |
| PB6 | PASS | Block appears only on the buy screen; ~13 lines; not truncated (no model-facing clipping). |
| PB7 | PASS | Readout text is recorded in tool results like every readout line; state JSON unchanged (test). |
| PB8 | PASS | A failed read is a visible `HARNESS BUG (mart stock)` line; no silent fallback (test). |
| PB9 | PASS | Brief's forks answered by the coordinator (fixed set, landing slot); Interface-line bug left as a proposed follow-up with its own switch. |
| PB10 | PASS | No skipped tests; floor 90; collateral tests updated, none weakened (offsets and later-switch exclusions only). |
| PB11 | PASS | Addresses checked against pret 731ad5bf and the running ROM via five raw-RAM archives (sMartInfo, gItems, gSpecialVar_LastTalked = 1 at the Rustboro clerk). |
| PB12 | PASS | ROM only via `POKEBENCH_ROM` (~/.roms). |
| PB13 | PASS | Tests on recorded states through the production reader; explainer checked in the browser at desktop and phone; viewer-main and live check after merge. |

## Frozen boundary

In scope: `env/pokebench_env/mart_stock.py` (new), its wiring in `game_state.py`, `readout.py`, `rerender.py`; the registry (`features.ts`, `play-preset.ts`, `next-run.ts`, `legacy-features.ts`); four fixed definitions (bundle arm only); `experiments/mart-stock-readout-v1.json`; readiness row; explainer + README + `FEATURE_EXPLAINERS`; tests (new and registry collateral). Out of scope: the shop Interface line in `menus.py` (pre-existing bug, follow-up with its own switch), decoration shops, SELL screen, any change to control arms or other switches.

## Multi-Model Review Log

- Round 1 (packet 69f66ebd…, base 4e6d5bb3, head 66914b64): Grok LGTM; Claude (read-only subagent) LGTM. Non-blocking notes kept as-is: hyphenated line ends join as "critical- hit" in some hold-item descriptions; the harness-bug line repeats its prefix.
- Round 2: see the session log (LGTM from both after the gym-door resync).

## Session Log

- 2026-10-21 9:45 AM ET: merged local main 8f98367d (party HP bar class fix, viewer only) cleanly. Full coverage then caught two pending-incumbent tests (heal-first, story-battle-heal-gate) that compare their incumbents with the current bundle arm; they now drop mart-stock-readout-v1 the way they drop menu-refusal-recovery-v1 (a switch added after the incumbent was pinned).
- 9:48 AM ET: The operator asked for Pokémon-themed explainers (coordinator relay); the explainer now uses the summary screen's INFO palette, Press Start 2P (inlined), the game's text-window frame and a laid-out buy screen from raw RAM 9913. pages-check clean; desktop and phone (dark) screenshots checked at 127.0.0.1:8791, no horizontal scroll at 375 px.

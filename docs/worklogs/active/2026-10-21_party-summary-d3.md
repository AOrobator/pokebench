# Worklog: POKéMON PARTY page, design D3 ("party opens up")

Branch: `claude/party-summary` (main checkout; this thread cannot create a worktree). Owner: thread "POKéMON PARTY redesign".

## Problem Statement

The viewer's POKéMON PARTY page is a plain list (name, level, HP numbers, a generic bar). The operator asked for a page much closer to Emerald's own party and summary screens and approved mockup D3 on 2026-10-21 (`runs/mockups/party-menu/variant-d3.html`): the party list is the screen, each slot uses the game's party-slot palettes, HP bar and status icons, and the selected slot opens in place into its summary, with ribbon tabs for PROFILE, STATS and MOVES. Moves open to show POWER, ACCURACY and the game's description. Everything is drawn from the decomp and ROM-verified art, in the game font.

Operator feedback built into D3: no white gutters, a wide HP bar with padding on both sides, three page tabs only (no dead fourth dot), move description wraps inside its box, padded POWER/ACCURACY rows, ball sprite inset from the left edge.

Scope limits (from the data the runs record today):
- Superseded 02:40: The operator asked to add stats, ability and met to the party readout (M1b). Runs recorded before M1b lack them: those fields show `---`, the memo shows only `<NATURE> nature.`, and the ability shows only when the species has one ability.

## Skills Loaded

- feature-worklog, execute-worklog (RED → GREEN → review, landing on main)
- viewer-e2e and close-the-loop (real-browser clicks, 1280/1440/375 screenshots, live check after merge)
- pokebench-game-state (grounding readouts in the decomp)
- No feature switch: viewer-only change; the model sees nothing new.
- No timeline change (timeline is closed to additions).

## Architecture

1. `scripts/party-art/build_party_art.py` (pattern of `scripts/bag-art`): builds `runs/sprites/party-v1/` from pret/pokeemerald, every image and table checked against the ROM, published atomically. Outputs: front pics for every species, type icons, status icons, party ball sprites (big/small, open/closed), summary Poké Ball, HP tag, EXP bar strip (empty/full), mon markings, and `data.json` (species: Hoenn dex, types, abilities, gender ratio, growth rate; moves: type, power, accuracy, description; ability names/descriptions; natures; experience tables). `just party-art`.
2. Viewer server: allowlisted `/sprites/party/...` paths only (same rules as trainer-card and bag art).
3. `packages/viewer/src/party-view.ts` (pure): parses the art manifest/data with concrete types; derives gender, nature, EXP progress and 64-tick bar, status from the status word, HP bar level/width, PP colors (GetCurrentPPToMaxPPState); renders D3 markup from `RunView.state.party` and a small UI state (selected slot, tab, open move).
4. `app.ts`: the POKéMON PARTY page uses the new view, keeps the UI state across polls, paints game text with the existing `paintGameText`, wires click and keyboard. Without built art, the page falls back to a plain but correct list.

## Invariants

- INV-1 The ROM and ROM-derived art never enter git. Art lives under `runs/sprites/party-v1` only. Test: build output path check; pre-commit hook.
- INV-2 The page makes no new network origins; the server serves only allowlisted party art paths. Test: server path tests (allowed and rejected cases).
- INV-3 Shown values come from the recorded state or decomp tables only; unknown values show `---` or are left out, never guessed. Test: party-view unit tests for missing stats, unknown ability slot, missing personality/moves/species.
- INV-4 Selection, tab and open move survive live polls; a repaint keeps keyboard focus and does not restart icon animations when nothing changed. Test: app test across two polls; e2e.
- INV-5 The page works without art (fallback list) and with partial data (null species, egg, empty party). Test: unit tests.

## Security Review

- No new subprocesses in the viewer. The build script uses argv lists only and reads the ROM path from `POKEBENCH_ROM`.
- Server paths are matched by a fixed regex; no path joins from user input beyond the allowlist.
- Rendered strings (nicknames, item names) are escaped.

## Milestones

**M1 — Party art and data build**
- [x] Write tests: server allowlist accepts the party art paths and rejects others (fails: 404 for every party path)
- [x] COMMIT: `test(viewer): party art paths (RED)` (d0280f08e)
- [x] Implement `scripts/party-art/build_party_art.py`, `just party-art`, server allowlist; build into `runs/sprites/party-v1` and record the ROM proof. Built: 386 front pics, types/status/balls/HP tag/EXP bar/markings, small and normal fonts, data.json; every image raw/LZ77-verified, gSpeciesInfo/gBattleMoves/gExperienceTables read from the ROM and cross-checked against the decomp, sSpeciesToHoennPokedexNum and every move/ability/nature string found in the ROM. Font paths added to the allowlist test in the same commit.
- [x] Gates: lint, build pass; test agent 3246 / viewer 1567 / python 3564; coverage viewer lines 97.92 branches 91.19 functions 94.41, python lines 97.25 branches 92.95 functions 100 (two unrelated timeout flakes under load 17-21 passed on rerun: serial-comparison hung child, experiment-cli production host)
- [x] COMMIT: `feat(viewer): build party art from the ROM (GREEN)` (25a42594c)

**M1b — Party readout: stats, ability, met (added 2026-10-21 02:40 at the operator's request)**
- [x] (4 Python tests fail on import, the TypeBox accept test fails) Write tests: party members decode ATTACK/DEFENSE/SPEED/SP. ATK/SP. DEF from the party struct (0x5A-0x63), ability slot and the species' ability ID, met location (map section and its name), met level, origin game, ball (item and name), OT name and gender; box members carry no stats; the model-facing state text is unchanged
- [x] COMMIT: `test(env): party readout stats, ability and met (RED)` (8356b0499)
- [x] Implement in `env/pokebench_env/pokemon.py` (recorded state only; `render` untouched); TypeBox `PokemonSchema` and `just schema`. Golden tests that compare against bodies recorded before these fields now strip them (`tests/env/recorded.py`); party-item-6507 fixture gained the three ROM reads the decoder now makes. Real a8f9 frame decodes TORCHIC Lv17 26/21/22/33/23, BLAZE, ROUTE 101 Lv5, Emerald, POKé BALL, OT AARFTT male. Art build: the single summary Poké Ball became all 12 ball sprites (`parts/balls.png`); server allowlist and its test follow.
- [x] Gates: lint, build; test agent 3248 / viewer 1567 / python 3568; coverage viewer lines 97.92 branches 91.21 functions 94.41, python lines 97.21 branches 92.92 functions 100
- [x] COMMIT: `feat(env): party readout records stats, ability and met (GREEN)` (5ae6dca09)

**M2 — Party view model and D3 renderer**
- [x] (fail: module missing) Write tests: gender by ratio, nature, EXP ticks and next level per growth rate, status decode (incl. fainted), HP bar level/width, PP color states, ability shown only when unique, stats `---`, empty/egg/null species, markup for each tab and an open move, escaping
- [x] COMMIT: `test(viewer): party view (RED)` (c468d8a33). Two RED expectations were my own errors and were corrected in GREEN: happy-dom serializes `<` unescaped inside attributes (now asserts no `<b>` element), and EMBER 23/25 is PP state 3, not 0.
- [x] Implement `party-view.ts` and its CSS (from the approved mockup); `paintGameText` gains an optional selector so the small and normal fonts paint their own spans; party colors added to GAME_TEXT
- [x] Gates: lint, build; test agent 3248 / viewer 1587 / python 3568; coverage viewer lines 97.96 branches 91.36 functions 94.53, agent 99.2/93.08/97.7, python 97.21/92.92/100
- [x] COMMIT: `feat(viewer): POKéMON PARTY page in the game's style (GREEN)` (1a807a341)

**M3 — Wire into the PokéNav and verify**
- [x] (fail: art never requested) Write tests: app keeps selection/tab/open move across polls, keyboard and click handlers, fallback without art
- [x] COMMIT: `test(viewer): party page interactions (RED)` (be73da5b8)
- [x] Implement wiring in `app.ts` (+ `party-view` browser module). The browser check found two bugs, fixed here with tests/CSS: data.json carries ability row 0 (ABILITY_NONE), which the key check rejected (page fell back to the plain list); slots were wider than a 375 phone (min widths reduced under 600px).
- [x] Gates: lint, build; test agent 3248 / viewer 1590 / python 3568; coverage viewer lines 97.96 branches 91.35 functions 94.51, agent 99.2/93.08/97.7, python 97.21/92.92/100
- [x] COMMIT: `feat(viewer): wire the party page (GREEN)` (aee2b58ff)
- [x] viewer-e2e: candidate viewer from this checkout's dist on 8796 over a scratch runs dir (symlinks to 8d39, a8f9 and a probe run `2026-10-21T03-00-00_partyprobe_d3d3` = a8f9's run_start and last state with the real decoded a8f9 TORCHIC facts plus two added Pokémon). Real clicks: ZIGZAGOON slot → STATS (12/13/15/9/11, EXP 399, NEXT 113, PSN) → MOVES → TAIL WHIP (POWER ---, ACCURACY 100, description). 1440, 1280 (8d39 recorded before the readout: stats ---) and 375 (scrollWidth 375, full move names) screenshots opened, in runs/mockups/party-menu/shots/build/. Browser module cache needed a cache-busting reload after rebuild. 8790 untouched.
- [x] Merged main (6fbce3326) into the branch (be61525e5); gates on the merged tip: lint, build; test agent 3248 / viewer 1590 / python 3568; coverage viewer 97.96/91.35/94.51, agent 99.2/93.07/97.7, python 97.21/92.92/100. Principles self-review: 0 FAIL.
- [x] Multi-model review: Claude and Grok LGTM on 7b7089dd; GPT's remaining test-setup objection rebutted; The operator approved landing ("land it")
- [x] Landed: `git merge --ff-only` → main 1a53bbc08 (main had not moved from 6fbce3326; whole-map loop not mid-pin). `just test` on main: agent 3255, viewer 1592, python 3583 passed. `just viewer-main`: 8790 at 1a53bbc08, 3 live runs kept. Live check on run 2026-10-21T06-28-18_qwen36-gpu0_1331: POKéMON PARTY loads all art (12 /sprites/party requests, 200), WURMPLE → MOVES shows only TACKLE and STRING SHOT (decoder's four-slot shape, no MOVE 0), selection survives 10 s of live polls; 1440 and 375 (scrollWidth 375) screenshots in runs/mockups/party-menu/shots/landed/.

## Follow-up: HP bar geometry (the operator, 2026-10-21 08:42 New York)

The operator: the green fill shows the white bar above and below it; the HP tag should be full height and line up with the bar's left edge. Cause: `.pv-hp` was 9u tall with the tag drawn 9u (its art has two transparent top rows, so it sat a row low) and 16u wide over a frame starting at 14u (2u overlap); the track covered only 3 of the 5 white interior rows (the game leaves those white rows; The operator wants them filled). The EXP bar is the ROM strip itself and is unchanged.
- [x] RED: style-css.test.ts asserts tag and frame are the bar's full height, the tag ends where the frame starts, and the track fills the whole white interior
- [x] GREEN: `.pv-hp` 7u tall; tag 15u x 7u showing art rows 2-8 and columns 0-14; frame from 15u, top 0; track inset 1u on all sides so the fill covers the 5 white rows. Gates: lint, build; coverage agent 3281 tests 99.2/93.1/97.71, viewer 1600 tests 97.9/91.33/94.33, python 3583 tests 97.23/92.97/100.
- [x] Review round 1 (packet 28ab3218..7d9ff1a0, sha256 760a3f92…8d08): Claude LGTM (follow-up: tag column 14 is the bar's dark left border, so a frame at 15u doubles it); Grok LGTM; GPT BLOCKING: the geometry test only checked relations, so a wrong crop or uniformly wrong sizes passed. Both taken: RED pins exact numbers and the crop, frame moves to 14u under the tag's last column.
- [x] GREEN: frame at 14u under the tag's dark last column (1u left border like the other sides), track from 15u. Gates: lint, build; coverage agent 3281 tests 99.2/93.11/97.71, viewer 1600 tests 97.9/91.32/94.33, python 3583 tests 97.23/92.97/100.
- [x] Review round 2 (packet 28ab3218..07eecdc8, sha256 e7bbb8fd…3836): Claude, Grok and GPT/Codex all LGTM. Browser: clean build 07eecdc on 8796, real clicks POKéMON PARTY → ZIGZAGOON, 1440, 375 (scrollWidth 375) and a magnified bar (07eecdc-*.jpg).
- [x] Landed: `git merge --ff-only` → main 3f31079b4 (main had not moved from 28ab3218f; loop not mid-pin). `just test` on main: agent 3281, viewer 1600, python 3583 passed. `just viewer-main`: 8790 at 3f31079b4, 3 live runs kept. Live check on run 2026-10-21T08-28-28_qwen36-gpu1_8892: POKéMON PARTY → TORCHIC, bar 14px tall with the frame at 28px (7u/14u at u=2px); screenshot runs/mockups/party-menu/shots/landed/3f31079-1440-live-hpbar.jpg.

## Follow-up 2: HP box shifted and thick top edge (the operator, 2026-10-21 09:16 New York)

The operator: the HP black box still needs to move left a bit and the black bar at the top is too thick. Cause: `hpMarkup` also gave the bar the trace page's generic `.hpbar` class (2px #444 border, 4px radius, white background, `.hpbar i` green blocks), which wraps the whole party bar in a thick rounded dark box and pushes the tag 2px right.
- [x] RED: party-view.test.ts expects the party bars to carry `.pv-hp` only, never `.hpbar` (existing tests now select `.pv-hp`)
- [x] GREEN: `hpMarkup` emits `class="pv-hp"` only. Gates: lint, build; coverage agent 3281 tests 99.2/93.1/97.71, viewer 1601 tests 97.9/91.33/94.33, python 3583 tests 97.23/92.97/100.

## Closing the Loop

Real browser on the built viewer (8790 after landing): click each party slot, each ribbon tab, open and close a move; desktop 1280/1440 and phone 375 screenshots under `runs/mockups/party-menu/shots/landed/`, each opened.

## Session Log

- 2026-10-21 02:15 (New York): worklog drafted; waiting for the operator's approval.
- 2026-10-21 02:17 (New York): The operator approved ("go"). M1 started.
- 2026-10-21 02:40 (New York): The operator: "we should add stats ability and met to the party readout". Added M1b. Recorded-state only: the observation text is rendered separately (`observation.render`), so no feature switch.

## Surprises

- The root `WORKLOG.md` pointer in the main checkout pointed at an older worklog (2026-10-19 capture-stream-workers). Repointed to this one for the pre-commit hook.

## Multi-Model Review Log

Round 1 (packet 6fbce332..5bba3c3b, diff sha256 753e1fd0…1700). Cursor Claude and Cursor GPT were at their usage limits and the ~/.claude-review CLI login had expired, so per the standing harness switches: Claude lane = read-only Claude subagent (operator memory claude-review-lane), GPT lane = Codex CLI gpt-5.6-sol xhigh, Grok lane = Cursor cursor-grok-4.5-high.
- Grok: LGTM (follow-ups: art load memoised until reload; sprite routes without ETag; duplicated ROM constants).
- Claude: LGTM (follow-ups: art load memoised; SECRET BASE name).
- GPT/Codex: BLOCKING, 5 findings, all fixed: (1) new ROM lookups now fail soft (`_read_or_empty`; fault-injection tests); (2) null HP/level and unknown PP maximum render `---`/`--`, never `0/0`, `Lv0` or a derived PP color; (3) met location names follow GetMapNameHandleAquaHideout (HIDEOUT, SECRET BASE, FERRY) and an unnamed location is left out of the memo; (4) all six EXP rows checked against experience_tables.h formulas; (5) `build_party_art.py` refuses an output outside the repository's runs/.
Fix gates: test agent 3248 / viewer 1590 / python 3572; coverage viewer 97.96/91.39/94.51, agent 99.2/93.08/97.7, python 97.23/92.97/100.

Round 2 (packet 6fbce332..63a3fb8d, sha256 ac59ff86…0c80c): Claude (subagent) LGTM; Grok BLOCKING (unknown PP max still colored as state 3; ball lookup not fail-soft on OSError; no test for the runs/ guard); GPT/Codex BLOCKING (the objective record and its progress fingerprint serialize the full party, so the new fields would reach the model; ball OSError; unknown held item shown as NONE; types palette mapping, gPartyMenuBg_Pal and gSummaryScreen_Pal not ROM-checked; no runs/ guard test; no exact-head browser proof). All accepted as real. Asked the operator per the two-round rule (03:50) and proceeded with exactly these fixes. RED c33c5813c; fixes: objectives `legacyParty` drops the 15 summary keys from the model record and the fingerprint; `_ball_name` catches OSError; ITEM shows NONE only for held_item 0, else `---`; unknown PP max uses the plain dark text color; build verifies sMoveTypeToOamPaletteNum (raw), gPartyMenuBg_Pal and gSummaryScreen_Pal (LZ77); `RUNS_ROOT` guard tested in env/tests/tooling/test_party_art_paths.py (deleting the guard fails 5 of 6). Gates: test agent 3249 / viewer 1591 / python 3580; coverage viewer 97.96/91.39/94.51, agent 99.2/93.08/97.7, python 97.23/92.97/100.

Exact-head proof (fd7725f24, build stamp fd7725f clean, candidate viewer 8796 over the scratch runs dir): real clicks WURMPLE → STATS (ITEM NONE, RIBBON ---, HP 0/20, ATTACK 12, SP. ATK 9, DEFENSE 13, SP. DEF 11, SPEED 15, EXP 155, NEXT 61, STATUS FNT) → MOVES → POISON STING (POWER 15, ACCURACY 100, description); TORCHIC → PROFILE (OT AARFTT, ID 37568, BLAZE + description, BASHFUL nature, met at Lv5, ROUTE 101). 1440, 1280 and 375 (scrollWidth 375) screenshots opened: runs/mockups/party-menu/shots/build/fd7725f-*.jpg. Console errors are the live audio proxy (502, the probe run has no game server) and one missing frame (404); every /sprites/party request the page makes returns 200.

Round 3 (packet 6fbce332..248b6941, sha256 854c14a2…6cedd): Claude (subagent) LGTM; Grok LGTM; GPT/Codex BLOCKING, 4 findings. Triage: (1) empty move slots (move_id 0) render as MOVE 0 · PP 0/0, fix; (2) loop fingerprints (semantic, battle, waiting), field map-move progress and navigation-failure conditions still compare the 15 summary keys, fix (Claude and Grok listed it as a follow-up); (3) ball-small palette not ROM-checked, fix (the game draws it with TAG_POKEBALL's palette, gPartyMenuPokeball_Pal); (4) proof names the code tip fd7725f24, not the docs-only head 248b69410, rebutted (git diff fd7725f24 248b69410 touches only this worklog). Third round with blockers: asked the operator (land / round 4 / hold) and made the three fixes meanwhile.
- [x] RED: party-facts.test.ts (semantic/waiting/battle fingerprints), navigation-failure summary-only change, party-view empty move slots
- [x] GREEN: `legacyParty` moved to packages/agent/src/party-facts.ts and used by objectives, loop fingerprints (semantic, battle, waiting), field map-move progress and navigation-failure conditions; party-view skips move_id 0; ball-small verified with gPartyMenuPokeball_Pal (manifest: palette 0xD96F6C LZ77). Gates: lint, build; coverage agent 3252 tests 99.2/93.09/97.7, viewer 1592 tests 97.96/91.39/94.51, python 3580 tests 97.23/92.97/100.

Round 4 (packet 6fbce332..b7ccaab7, sha256 91a4f59c…5f8d): Claude (subagent) LGTM; Grok LGTM (listed short-cycle fingerprint as scope); GPT/Codex BLOCKING: (1) `cycleState`/`cycleFields` in fixed-point-breaker still hash the whole party with the 15 summary keys, fix; (2) no final-build browser receipt after the empty-slot change, answered: candidate 8796 rebuilt at b7ccaab78 (build stamp clean), probe run with the decoder's four-slot shape (`2026-10-21T03-00-01_partyprobe_empty`), WURMPLE → MOVES shows TACKLE, STRING SHOT, POISON STING and no MOVE 0 (b7ccaab-moves-empty-slots.jpg).
- [x] RED: party-facts.test.ts short-cycle fingerprint ignores summary facts
- [x] GREEN: `cycleFields` uses `legacyParty`; CYCLE_STATE_EXCLUDED lists `party[].<key>` for the 15 summary keys (exported SUMMARY_FACT_KEYS), and the list test follows. Gates: lint, build; coverage agent 3253 tests 99.2/93.09/97.7, viewer 1592 tests 97.96/91.39/94.51, python 3580 tests 97.23/92.97/100.

Round 5 (packet 6fbce332..1e44d042, sha256 76feca35…be395): Claude (subagent) LGTM (follow-up: storage/daycare Pokémon carry the same keys); Grok LGTM; GPT/Codex BLOCKING: (1) storage and daycare Pokémon's summary keys still reach `cycleFields` and navigation-failure `conditions` through `resources`, fix; (2) `runs/sprites/../..` passes the art output guard (its parent resolves into runs/), fix.
- [x] RED: party-facts.test.ts storage/daycare short-cycle case, navigation-failure stored-Pokémon case, path guard `runs/sprites/../..` and `runs/.`
- [x] GREEN: `legacyResources` strips the 15 keys from storage and daycare Pokémon for `cycleFields` and navigation-failure `conditions` (key order kept); CYCLE_STATE_EXCLUDED lists them under `resources.storage.occupied[].pokemon` and `resources.daycare[].pokemon`; the art build normalizes the output path and refuses a `.`/`..` leaf. Gates: lint, build; coverage agent 3255 tests 99.2/93.08/97.7, viewer 1592 tests 97.96/91.39/94.51, python 3582 tests 97.23/92.97/100.

Round 6 (packet 6fbce332..43dde2c4, sha256 a39d976e…6a03): Claude (subagent) LGTM; Grok LGTM; GPT/Codex BLOCKING on one test-only finding: the art path tests wrote fixed paths into the live runs/ and made a tmp dir per rejection row. Fixed: each test gets a private repository root (`RUNS_ROOT` monkeypatched to tmp runs/), the rejection rows use a constant ROM path, and one test pins the real root to the repository's runs/. Gates: lint, build; agent 3255, viewer 1592, python 3583 tests, coverage unchanged (python 97.23/92.97/100). Nothing is written under runs/ by the tests.

Round 7 (packet 6fbce332..7b7089dd, sha256 54f6d30a…27eb): Claude (subagent) LGTM; Grok LGTM; GPT/Codex BLOCKING only on test setup count (each of the six rejection rows gets its own tmp runs/). Rebutted per the review-pushback rule (operation-count demand on a 0.03 s test, no defect). Stopped for the operator's call: land as is, or hold. The operator (07:53 New York): "land it".

## Boy Scout Log

(empty)

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog after landing

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
- [ ] Multi-model review (Claude, Grok, GPT lanes) until LGTM on the frozen packet
- [ ] Land: merge main, gates, `git merge --ff-only`, `just test` on main, `just viewer-main`, live check on 8790

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

Round 2 (packet 6fbce332..63a3fb8d, sha256 ac59ff86…0c80c): Claude (subagent) LGTM; Grok BLOCKING (unknown PP max still colored as state 3; ball lookup not fail-soft on OSError; no test for the runs/ guard); GPT/Codex BLOCKING (the objective record and its progress fingerprint serialize the full party, so the new fields would reach the model; ball OSError; unknown held item shown as NONE; types palette mapping, gPartyMenuBg_Pal and gSummaryScreen_Pal not ROM-checked; no runs/ guard test; no exact-head browser proof). All accepted as real. Asked the operator per the two-round rule (03:50) and proceeded with exactly these fixes.

## Boy Scout Log

(empty)

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog after landing

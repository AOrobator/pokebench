# Worklog: POKéMON PARTY page, design D3 ("party opens up")

Branch: `claude/party-summary` (main checkout; this thread cannot create a worktree). Owner: thread "POKéMON PARTY redesign".

## Problem Statement

The viewer's POKéMON PARTY page is a plain list (name, level, HP numbers, a generic bar). The operator asked for a page much closer to Emerald's own party and summary screens and approved mockup D3 on 2026-10-21 (`runs/mockups/party-menu/variant-d3.html`): the party list is the screen, each slot uses the game's party-slot palettes, HP bar and status icons, and the selected slot opens in place into its summary, with ribbon tabs for PROFILE, STATS and MOVES. Moves open to show POWER, ACCURACY and the game's description. Everything is drawn from the decomp and ROM-verified art, in the game font.

Operator feedback built into D3: no white gutters, a wide HP bar with padding on both sides, three page tabs only (no dead fourth dot), move description wraps inside its box, padded POWER/ACCURACY rows, ball sprite inset from the left edge.

Scope limits (from the data the runs record today):
- ATTACK, DEFENSE, SP. ATK, SP. DEF and SPEED are not in the party readout. They show `---`, as in the approved mockup.
- Met level and location are not recorded. The memo shows only `<NATURE> nature.` (never a guessed met line).
- The ability slot bit is not recorded. The ability shows only when the species has one ability; otherwise the ability rows are left out.

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
- [ ] COMMIT: `test(viewer): party art paths (RED)`
- [ ] Implement `scripts/party-art/build_party_art.py`, `just party-art`, server allowlist; build into `runs/sprites/party-v1` and record the ROM proof
- [ ] Gates: `just test`, `just lint`, `just build`, `just coverage` (≥90 both stacks)
- [ ] COMMIT: `feat(viewer): build party art from the ROM (GREEN)`

**M2 — Party view model and D3 renderer**
- [ ] Write tests: gender by ratio, nature, EXP ticks and next level per growth rate, status decode (incl. fainted), HP bar level/width, PP color states, ability shown only when unique, stats `---`, empty/egg/null species, markup for each tab and an open move, escaping
- [ ] COMMIT: `test(viewer): party view (RED)`
- [ ] Implement `party-view.ts` and its CSS (from the approved mockup)
- [ ] Gates (as M1)
- [ ] COMMIT: `feat(viewer): POKéMON PARTY page in the game's style (GREEN)`

**M3 — Wire into the PokéNav and verify**
- [ ] Write tests: app keeps selection/tab/open move across polls, keyboard and click handlers, fallback without art
- [ ] COMMIT: `test(viewer): party page interactions (RED)`
- [ ] Implement wiring in `app.ts`
- [ ] Gates (as M1)
- [ ] COMMIT: `feat(viewer): wire the party page (GREEN)`
- [ ] viewer-e2e: real clicks on slots, tabs and moves; screenshots at 1280, 1440 and 375 opened and checked
- [ ] Multi-model review (Claude, Grok, GPT lanes) until LGTM on the frozen packet
- [ ] Land: merge main, gates, `git merge --ff-only`, `just test` on main, `just viewer-main`, live check on 8790

## Closing the Loop

Real browser on the built viewer (8790 after landing): click each party slot, each ribbon tab, open and close a move; desktop 1280/1440 and phone 375 screenshots under `runs/mockups/party-menu/shots/landed/`, each opened.

## Session Log

- 2026-10-21 02:15 (New York): worklog drafted; waiting for the operator's approval.
- 2026-10-21 02:17 (New York): The operator approved ("go"). M1 started.

## Surprises

- The root `WORKLOG.md` pointer in the main checkout pointed at an older worklog (2026-10-19 capture-stream-workers). Repointed to this one for the pre-commit hook.

## Multi-Model Review Log

(empty)

## Boy Scout Log

(empty)

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog after landing

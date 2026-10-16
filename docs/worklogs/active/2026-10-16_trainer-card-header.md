# Trainer card header

## Problem Statement

The operator picked the trainer-card design after nine mockup rounds (`runs/mockups/viewer-header-desktop/trainer-cards-9.html`, option 1, 4:00 PM EDT 2026-10-16) and approved the build with standing merge approval once reviews pass and the loop is closed. Each live run gets a card cut from Emerald's real Trainer Card:

- the experiment in the tab, in dark navy game font with no shadow, one pixel heavier;
- a trainer sprite picked by experiment and arm;
- the trainer name with the arm as a type badge;
- the latest milestone, place and trial;
- STORY and TIME bars;
- six 3x party boxes with bobbing 2x party icons;
- a tier color by STORY progress;
- clicking a card watches that run.

A new milestone shows a gold glow plus a 2-pixel gold border with stepped pixel corners, and a NEW MILESTONE! chip using the round-3 gold palette. On desktop the chip replaces WATCHING/LIVE in the corner and keeps the blinking dot; on phone it sits at the bottom of the card.

Desktop: the cards replace the live-run switcher buttons in the header. Phone: the Q header stays, and the run sheet shows the cards (watched run first).

## Architecture

- **Art (never in git).** `scripts/trainer-card/build_art.py` plus `just trainer-card-art` build the ROM-verified art into `runs/sprites/trainer-card-v1/`: card art per tier (wide, mini, mini-ribbon), 14 trainers, the game font, and the party icon of every species keyed by internal species id. A `manifest.json` records the ROM proofs.
- **Serving.** The viewer serves only those allowlisted paths at `/sprites/...` from `<runsRoot>/sprites/trainer-card-v1/`. Without the art, the old switcher and sheet stay as they are.
- **Data (DRY with the stats page).** `WorkbenchRun.card` carries `{name, location, party[{speciesId, level, egg}]}` from the last state event, filled in the same `loadRun` pass. The plate's milestone, freshness and clock facts are factored out of `workbench-view.ts` into one exported function that the plates and the cards share.
- **Rendering.**
  - `trainer-card.ts` (pure): art manifest parsing, trainer pick (FNV-1a of experiment and arm, probing to the next free sprite), tier, and wide/mini card HTML with game-text placeholders.
  - `game-font.ts`: paints the placeholders from the glyph sheet onto canvases.
  - Clocks and time bars update in place, so the glow and bob animations never restart.
  - Bobbing uses CSS steps over the two icon frames.
- **App.** Polls `/api/workbench` (5 s, shared server cache) and joins it with `/api/runs` cohorts (experiment, arm, trial) by run id.

No harness behavior change, so no feature switch.

## Milestones

**M1: art build and serving**
- [x] build_art.py and the just recipe; pixel-identical to the approved mockup art (0 diffs across 32 compared files); 387 icons, 14 trainers, 5 tiers x 3 cards, font; every asset verified against the ROM; nothing under runs/ tracked
- [x] RED/GREEN: `/sprites/` allowlist route (good paths 200, traversal and unknown paths 404). RED 681d3ac3

**M2: card data**
- [x] RED/GREEN: `WorkbenchRun.card` from the last state event (`readNativeRecording` returns it, since it drops `view.state`); parse and validate; shared `plateFacts`. workbench tests 77 + 34 green

**M3: cards in the viewer**
- [x] RED 681d3ac3 / GREEN: `trainer-card.ts` (manifest, tier, trainer pick, wide/mini markup, clock parts) and `game-font.ts` (glyph pixels, painter); 35 tests green
- [x] RED dd609ade / GREEN: desktop card row and click to watch, phone sheet cards (watched first), in-place clocks, game-font painting, fallback without art (no workbench poll). Three existing tests updated for intended changes (third interval, CSS block order, art fetch in a parked fake fetch)
- [x] Gates: build, lint (mGBA binding linked into this worktree's venv), coverage: viewer 1029 tests 95.44/91.19/93.83/97.57; agent 1951; Python lines 97.47 branches 93.46 functions 99.39
- [ ] Browser proof at 1280/1440/375 on a scratch viewer with copied fixtures (close-the-loop, viewer-e2e)

**M4: review and land**
- [ ] Claude, Grok and GPT LGTM on one frozen packet; merge slot from the coordinator (not :40–:55); ff-only
- [ ] `just trainer-card-art` into the main checkout's runs/; restart through the coordinator; live check

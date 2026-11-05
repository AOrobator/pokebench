# TRAINER CARD page: real in-game card

The operator picked mockup A on 2026-11-04 ("yeah" to "Should I build A?"), after "option A looks great" with the pasted-in look fixed. Mockups: runs/mockups/trainer-card-page.

Viewer-only, so no feature switch. The protected run cards are not touched: this is the PokéNav TRAINER CARD page, with its own art under runs/sprites/trainer-page-v1, so `just trainer-card-art` output and the design baselines stay as they are.

## M1

- [x] RED: 27070b9df
- [x] GREEN: page, art script, route; interface rows moved to FIELD STATE
- [x] Headless proof, desktop and phone
- [x] Gates, review
- [ ] Land, `just trainer-page-art`, `just viewer-main`, live proof

## Multi-Model Review Log

Round 1 at 8829f0a27: Claude, GPT, fallback BLOCKING; Grok out of Cursor usage until 11/17. Gates at 8829f0a27: `pnpm -r lint`, ruff, `just test` (2453, 838, 2901, 38), trainer-card-check passed.

- Fixed: a badge held at a checkpoint start no longer shows an earned time; eggs draw as eggs; ID and gender come from the player's own Pokémon; a redraw neither reopens a dismissed gym page nor closes a focused one; the pointer leaving keeps what the keyboard is on.

Round 2 at a66eb5e53: fallback BLOCKING. Fixed: blank state reads in battles and transitions (579 in 5f0f) no longer blank the card; it keeps the last full sample.

Round 3 at 35cefb4b7, delta: Claude, GPT, fallback LGTM. Gates at 35cefb4b7: `pnpm -r lint`, `just test` (2453, 841, 2901, 38), trainer-card-check passed. Rebutted: same-name traded lead (GPT round 2); this game has only NPC trades with other OT names. Follow-up, not fixed: Escape, hover another badge, leave can reopen the focused badge's page.

Landed b1a1e2be3, post-merge `just test` passed, art built, live on 8790.

## Gym box (the operator 2026-11-04: "I think that should probably just always be visible ... It should just be like a regular box.")

The popup is gone. The gym box is always on the page, opens on the next gym, and pointing at, tabbing to or tapping a badge changes it in place at a fixed height. The page grows rather than scrolling inside the 620px pane. Headless at 1440, 1280, 375: no overlap between card, run and gym boxes, height stable across all eight gyms.

Review at e01d2c9fd: fallback BLOCKING. Fixed: restoring focus after a redraw no longer counts as picking a gym.

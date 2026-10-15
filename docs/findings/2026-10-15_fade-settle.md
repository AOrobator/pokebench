# Observation fade settle (2026-10-15)

## Problem

Press/observe results were often all-black frames captured mid screen
transition. c497 turns 410–427: 17 of 18 press frames have sha1
`cf21bb4a34b28cbcb7809d05703574e20284147a` (all black) while Screen alternates
`bag_menu` / `unknown (callback2 0x080A933D)` / `unknown (callback2 0x081AAD8D)`
(battle Bag open/close). ~3.5% of all recorded frames are black (c497 22%,
258d 4.8%, c0b8 2.7%). The press tool waited only a fixed 150 ms.

## Game source (pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, clean)

- `include/palette.h` `struct PaletteFadeControl`: `u32 multipurpose1`;
  `u8 delayCounter:6`; `u16 y:5, targetY:5`; `u16 blendColor:15, active:1` —
  `active` is bit 7 of byte 7.
- `src/palette.c:64` `EWRAM_DATA struct PaletteFadeControl gPaletteFade`.
  `BeginNormalPaletteFade` sets `active = TRUE`, `deltaY = 2` (+|delay| when
  negative); `UpdateNormalPaletteFade` steps y by deltaY every
  `delay + 1` frames and clears `active` when finished. A 0→16 fade is
  8 steps of (delay + 1) frames plus finishing frames.
- `src/field_weather.c FadeScreen`: field fades use `BeginNormalPaletteFade`,
  except fade-in under rain/snow/fog/shade/drought weather, which runs through
  `gWeatherPtr->palProcessingState` without `gPaletteFade.active`. That case
  starts from an all-black palette, which the black-palette rule below covers;
  the weather struct address is not verified and is not read.

## Address receipt

`gPaletteFade` = `0x02037FD4`: literal-pool ROM inspection recorded in
`docs/findings/2026-10-14_menu-owner-coverage.md` (SHA-1 pinned US ROM,
`f3ae088181bf583e55daf962a92bb46f4f1d07b7`), already used as
`pokebench_env.menus.PALETTE_FADE` with `+7 & 0x80` by the menu readiness
readers. ROM reads were not permitted in this session, so it was not re-scanned.

Live corroboration from c497's paired raw-RAM archives (real ROM): for turns
410–427, byte 7 bit 7 is set on exactly the 6 `bag_menu` captures, with the
blend coefficient y (bits 6–10 of the halfword at +4) at 10–16; the one
non-black frame (turn 412, sha1 447bb9fc…) is a fading capture at y=10.

Palette RAM `0x05000000` (0x400 bytes, GBA hardware) is all zero in the other
12 captures (callback2 0x080A933D / 0x081AAD8D, fade finished, next screen
loading). Palette RAM all-zero matches the recorded frame being all black in
all 18 rows (fixture `env/tests/env/fixtures/fade-settle-c497-410-427.json`).
A fade-only wait would have missed those 12.

## Rule

`pokebench_env.screen_settle.FrameSettle`, wired by `serve.run(frames=EmeraldEmulator)`:

- Transitioning = `gPaletteFade.active` or palette RAM all zero.
- `/pokebench/observation` captures at once when not transitioning (no added
  latency). Otherwise it registers a waiter and the hook on the vendor's own
  `run_frame_with_buttons` (after each emulated frame, under the vendor
  memory lock) captures on the first frame that is not transitioning.
- Bound: 146 emulated frames (a full fade at delay 15: 16 × 9 + 2). At the
  bound it captures anyway.
- No wall-clock sleeps or polls. The hook does nothing while no observation
  waits. An operator pause parks the frame loop; parking releases waiters
  (`install_pause(on_park=FrameSettle.park)`), which then capture immediately,
  and observations during the pause capture at once. Ending the pause (or a
  pause that could not park) calls `on_resume=FrameSettle.resume` before the
  loop wakes, so the next observation waits for frames again.
- A fade read that raises on the game thread is handed to the waiting
  observations; it never propagates into the vendor frame loop.
- Human server: no settle. Its `/pokebench/human/snapshot` records the
  observation under the journal lock that each human frame step also takes,
  so waiting for a frame there would stop the frame loop. Human snapshots
  capture at once, as before (the readout still labels fading/black frames).
- The readout gets a first line when the captured frame is still fading
  ("Frame: captured while the screen was still fading …") or the PNG is all
  black without a fade ("Frame: the screen is black in this frame …").

press, observe, navigate_to's final observation and dialogue auto-advance all
read `/pokebench/observation`, so all share the settle; the TS tools are
unchanged.

## Remaining uncertainty

- Hardware fades (`BeginHardwarePaletteFade`) also set `active`; covered.
- Weather fade-in is covered only by the all-black start; a partly faded
  weather frame is not waited for.
- Screens that are legitimately all-black palettes for long stretches are held
  for at most 146 frames and then labelled.

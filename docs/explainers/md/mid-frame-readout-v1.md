Feature switch · observation · `mid-frame-readout-v1` · default OFF · bundle arm only · pending experiment

# Mid-frame readout

> Markdown twin of [mid-frame-readout-v1.html](../mid-frame-readout-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

A snapshot taken while the game is in the middle of a frame says so, instead of claiming the save data is not initialized.

## Why

98 readouts in 10 runs (0e05 17, dc5a 14, 93eb 12, bd60 11, 4495 10, f551 10, fe15 9, defa 7, b671 4, e962 4) ended `Save-backed world state unavailable: save data is not initialized or valid.` Every one was a snapshot whose CPU was not waiting in `WaitForVBlank`; transition-coherence-v1 skips the save reads then, because a save block can be half-moved. The save pointers were the same in the archives before and after, so the message was false.

## What the model reads

```
OFF, fe15 seq 9631 (last line)
Save-backed world state unavailable: save data is not initialized or valid.
```

```
ON, fe15 seq 9631
Save-backed world state (player, location, party) not read in this snapshot: the game was in the middle of a frame. Observe again to read it.
```

*Recorded RAM re-rendered on the real ROM with the switch off and on (env/tests/env/test_readout_truth_fixes.py). Nothing else in the readout changes.*

## How it decides

![decision flow](mid-frame-readout-v1/fig-1.svg)

*Only the reason changes. A snapshot on an idle frame whose save pointers really are invalid keeps the old line, and with transition-coherence-v1 off no snapshot is skipped, so nothing changes.*

## Game grounding (pret/pokeemerald 731ad5bf, US ROM f3ae0881)

| Fact | Source | Value |
|---|---|---|
| Idle main loop | `WaitForVBlank` (src/main.c), checked by `main_loop_idle` | b671 raw 5998 PC 0x08002DD6 (not idle) |
| Save pointers | `gSaveBlock1Ptr`/`gSaveBlock2Ptr` 0x03005D8C | stable across neighbouring archives |
| Why reads are skipped | `MoveSaveBlocks_ResetHeap` (src/load_save.c) on warps and battles | a half-moved block reads as garbage |

## Limits

- Needs `transition-coherence-v1`: without it no snapshot is skipped, so there is nothing to explain.
- The readout still has no position or party on that snapshot; the model has to observe again. Capturing at the next idle frame instead would change emulated timing and is left as a follow-up.

## Status

A working branch (2026-10-17 top-50 run analysis, Group A); gates in `docs/worklogs/active/2026-10-17_readout-truth-fixes.md`. Server switch, default off, bundle arm only; registered as a pending experiment, not queued. Not reviewed or measured yet.

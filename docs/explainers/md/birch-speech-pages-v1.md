Feature switch · observation · `birch-speech-pages-v1` · default OFF · correctness fix, meant to be ON in both arms

# Birch speech pages

> Markdown twin of [birch-speech-pages-v1.html](../birch-speech-pages-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

During PROF. BIRCH's speech after the name is accepted, a page that waits for A or B now reads input-ready, and the interface value is the page on screen. Each page turn becomes an interface change, so the press result reports it.

## Why

Cook run sh02, turns 34–44: the readout said `Interface: name_confirmed_transition; input not ready; Transition or text printing; selection input is not active` while frames 621, 645, 683 and 743 show a finished page with the red continue arrow. Each A turned a page ("Ah, okay!" → "You're GMREEN who's moving…" → "…I get it now!"), but the press result said `interface unchanged`, because nothing in the interface state changed. The `Dialog:` line quotes the whole multi-page buffer, so a page turn is invisible there too. About 8 extra A presses.

## Before and after, on recorded RAM

```
OFF  sh02 T35 (state 620; byte-identical to what the model received)
Interface: name_confirmed_transition; input not ready; Transition or text printing; selection input is not active
```

```
ON   the same RAM, re-rendered on the real ROM
Interface: birch_speech_page; input ready; value Ah, okay!; A or B shows the next page (the value is the page on screen)
```

*Only the Interface line changes. At T36 (state 632) the next page is still being written (printer state 0), and the line stays as it was.*

## When a page is input-ready

![Page readiness decision](birch-speech-pages-v1/fig-1.svg)

*Render states 1–3 are RENDER_STATE_WAIT, RENDER_STATE_CLEAR (`\p`) and RENDER_STATE_SCROLL_START (`\l`): TextPrinterWaitWithDownArrow waits for A or B with the arrow shown (src/text.c). Both tasks run the printer, and so take A or B, only once the task's `tIsDoneFadingSprites` (data\[5\]) is set (main_menu.c:1257, 1684, 1732); before that the page is not ready. A short read of the task, printer, text flags, window or page buffer keeps today's line. The window holds two lines (27x4 tiles): after a `\l` scroll the value is the line before it and the new line, as on screen.*

## Game grounding (pret/pokeemerald 731ad5bf, US ROM f3ae0881)

| Task | Source | Text it prints |
|---|---|---|
| 0x0803133D | `Task_NewGameBirchSpeech_WaitForSpriteFadeInAndTextPrinter` (main_menu.c:1684) | `gText_Birch_YourePlayer`: "Ah, okay!\\p You're {PLAYER} who's moving to my\\n hometown of LITTLEROOT.\\l I get it now!\\p" |
| 0x080314C5 | `Task_NewGameBirchSpeech_ShrinkPlayer` (main_menu.c:1732) | `gText_Birch_AreYouReady`: "All right, are you ready?\\p …" |

Printer 0 is `sTextPrinters[0]` at 0x020201B0 (active at +0x1B, render state at +0x1C, current character pointer at +0x00 into `gStringVar4` 0x02021FC4). Task data\[5\] (`tIsDoneFadingSprites`) is the s16 at gTasks entry +0x12. Recorded: sh02 state 620 printer active, state 2, cursor +10 ("Ah, okay!\\p"); state 682 state 2 on "All right, are you ready?".

## Wiring and arms

Preset feature → `POKEBENCH_FEATURES_OFF` → `rerender.read_state(birch_pages_enabled)` → `read_active_ui(birch_pages=True)`. The new phase is listed with the Birch phases the readout always shows, so an arm with expanded menu text off sees it. Correctness fix (operator decision 2026-10-16): meant to be ON in both arms of bundle-v-control. OFF: the old not-ready line, and page turns read `interface unchanged`.

## Status

Gates in the worklog. Proof: in the seven cook runs, 2–5 page waits per run read ready; OFF is byte-identical for all 5,642 results. Not measured.

# Viewer party state

## Request and boundary
Investigate GLM Marshtomp/Taillow empty party display, repair, review and land on local main. Viewer-only; no harness changes, flags, launches, game inputs, recording rewrites or timeline additions. Production paths: model.ts (party sample owner), panels.ts (fallback and notice), app.ts (rich party consumer). Tests cover partial reads, true emptiness, new samples, reset and replay.

## Evidence
Run 2026-10-22T20-40-54_glm53-mac_0d5d, state 126191 has Marshtomp Lv21 HP63/63 and Taillow Lv11 HP17/30. States 126192/126194 have started=true, screen=battle but party=[], name/location/money/play_time_s=null; state 126210 reads the two members again. game_state.py refuses save-backed reads mid-frame (transition-coherence-v1); readout_fixes.py describes these as unread, not empty. Viewer currently consumes every state.party directly. Headless browser on main ec19227bc showed two members at a readable sample, demonstrating the intermittent nature; original operator tab untouched.

## Invariants and proof
- Raw latest state remains exact and inspectable; party panel tracks its own last readable state with sequence disclosure when stale.
- A save-backed play_time_s or nonempty party establishes a readable party; pregame clears history. A readable empty party clears it too.
- Replay and run selection use the normal reducer lifecycle, never future data.
- Background browser only, desktop focus preserved. Preview uses scratch copied recordings.

## Progress
- Investigation complete; regression tests next.
- Required gates: test, lint, build, coverage >=90, verify-vendor; background browser desktop/phone; three cloud review lanes; landing board; main test and viewer restart/live proof.
- RED: panels/app regression run reached 276 tests: 3 failed, 273 passed. Exact failures: unread sample renders no Pokémon instead of Torchic/label; first unread sample says empty; rich party loses .pv.
- Source grounding skill used: pokeemerald clean revision 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, load_save.c MoveSaveBlocks_ResetHeap moves pointers then restores data. game_state.py lines 461-499 deliberately suppress save reads on torn frames; readout.py serializes None party as []. No decoder or model behavior change needed.

# Post-catch Pokédex input ownership

Request: fix registration reading as no input open; enable in bundle only.

Branch: codex/caught-dex-input. Baseline fc40a11a1. No measured runs authorized.

Evidence: c6c2 state 12066 / raw 5393 frame 165639 has CB2_BattleMain
0x08038421 and task 0x080C0089 with dex number 263. Earlier raw 5388
has display task 0x080BFE39. Source pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881,
src/pokedex.c Task_HandleCaughtMonPageInput checks JOY_NEW(A_BUTTON | B_BUTTON).
The standalone dex reader requires CB2_Pokedex, so it misses this battle overlay.

Plan: register default-OFF caught-dex-input-v1; detect task-owned page under battle
callback without dereferencing standalone PokedexView; stop battle wait/auto-advance
at the page, expose A/B controls, retain previous behavior OFF; enable both active
bundle definitions, register pending experiment and explainer. Verify source/ROM,
archive paired frame, red/green regressions, production wiring, gates and review.

## Implementation and verification

- Native source/ROM mapping verified read-only: 0x080C0088 reads gMain.newKeys
  with mask 3; its task replacement literal at ROM 0xC00E4 is 0x080C012D
  (Task_ExitCaughtMonPage). Corrected the provisional exit address before testing.
- Production archive reparse: SHA-256 19a7c10a…3066bdf4 verified through load_raw_ram,
  matching external US ROM. Raw 5388 is transition, 5393 is input-ready. The paired
  frame frames/012067_0.png was opened and shows registration completed for ZIGZAGOON.
- National dex number 263 is distinct from the displayed Hoenn number 012; the
  readout quotes the visible registration heading, stores national_dex_number separately.
- OFF remains busy/battle_resolving; ON yields screen/pokedex_caught_entry and A/B
  controls. Display/exit/invalid owners stay non-ready. No button is chosen automatically.
- Agent regression uses production-reparsed OFF/ON snapshots through parseGameState,
  observe/press wrappers: requested A is sent, no battle wait. Existing event schema
  and viewer rendering carry the state, without adding a timeline mark.
- Mutation receipt: removing rerender.caught_dex_enabled fails the production factory
  test; restoring it gives 6/6 targeted tests. Unique receipts in
  runs/diagnostics/caught-dex/mutation-factory-{removed,restored}.txt.
- TS coverage run: agent 3283 pass, viewer 1602 pass; lines/branches/functions clear 90%.
- Python coverage run: 3589 pass; lines 97.23%, branches 92.98%, functions 100%.
  Initial failed attempts lacked the worktree vendor checkout/ROM environment or
  needed append-only registry expectations; all were repaired, no test disabled.
- Both fixed bundle definitions pass fixed-cli check; control base remains matching.
- Global experiments-check also reports existing unrelated malformed starter-decision-
  salience trial ledger rows. No ledger edited; new pending definition parses in tests.
- Browser: isolated viewer on 8794 with a scratch reconstructed registration record
  (not a measured run); Harness Config search finds CAUGHT POKÉDEX INPUT ON, and
  READ EXPLAINER opens the correct locally served document. 1280px view inspected.
- Synced to main 8f98367d1 (unrelated party HP class fix); final lint/build and viewer
  regression recheck precede landing. No gameplay session changed or run launched.

## Principles Adherence

PB1 PASS: source task/RAM/frame establish readiness; no model-narration grading.
PB2 N/A: no measured run or failure excluded; historical records untouched.
PB3 PASS: correctness claim only, no performance inference from one capture.
PB4 PASS: default-OFF registered/server-forwarded switch and run metadata; vendor pristine.
PB5 PASS: one repair with independent OFF/ON; bundle-only treatment declared.
PB6 N/A: no context retention, compaction or long-run policy change.
PB7 PASS: existing state and tool-result schema/recording paths retained; scratch data labelled.
PB8 PASS: missing/duplicate/invalid task ownership never guessed ready; busy waits bounded.
PB9 PASS: requested bug and bundle scope explicit; no game policy or automatic choice added.
PB10 PASS: append-only expectations updated; complete gates, no lowered floor or skipped test.
PB11 PASS: reference revision plus exact ROM instructions and archived memory verified.
PB12 PASS: external ROM remains at ~/.roms; no TCC path or game asset committed.
PB13 PASS: worklog, regressions, coverage, lint and review packet; landing/live proof separate.

Integration note: concurrent gym-door-label-v1 landed on main5534f2850.
Preserving its registry order, default/control values, pending entry, test
expectations and bundle memberships while appending caught-dex after it.

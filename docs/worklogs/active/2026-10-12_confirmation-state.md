# Confirmation state coverage repair

## Problem Statement
Operator authorizes source-grounded active UI phase, selection and readiness readouts, actionable diagnostics for unsupported state, and a repository repair workflow. Model must distinguish naming editor from name confirmation and gender selection rather than canceling confirmed names. Unknown state remains an explicit coverage error until qualified; never invent a default.

## Skills Loaded
feature-worklog; repository pokebench-game-state and its game-source reference. Multi-model-review required before landing. User approval supplied directly in parent conversation.

## Architecture
Read active callback/task ownership from coherent emulator memory; emit typed UI phase/selection/readiness through Python, model observation, event validation and viewer. Preserve historical schema compatibility. Existing source reference is read-only pokeemerald731ad5bfd6e6f265508d0efcca0ba42f9dcf5881.

## Invariants
- INV-1: phase requires validated active owner, not stale menu RAM; test stale owner and unsupported task.
- INV-2: input readiness and transitions distinct; no guessed selection or zero defaults.
- INV-3: exact ROM symbols source-grounded and live-probed before qualification.
- INV-4: typed state propagates to model and viewer; unsupported diagnostics remain visible.
- INV-5: fresh isolated probes only after measured cohort release; never modify measured servers, vendor or source reference.

## Security Review
Read-only RAM through existing frame lock; no save manipulation/RAM writes. ROM external symlink only. No navigation helper or benchmark self-editing.

## Milestones
**M1 — State ownership and propagation**
- [x] RED tests and commit a46216e
- [x] Implement known confirmation/gender/clock/transition ownership and diagnostics
- [x] GREEN gates: tests, lint, build, coverage all metrics >=90
- [ ] Live coherent RAM/frame/model-text proof; mutations
- [ ] Multi-model review until LGTM; reviewed landing coordinated by parent
**M2 — Repair skill**
- [x] Extend existing skill with diagnostic capture and repair workflow

## Closing the Loop
Parent coordinates integration and archived worktree. Canonical source frozen40262a0 during cohort; no measured endpoint changes.

## Session Log
2026-10-12: isolated branch codex/confirmation-state created at40262a0. Read rules, approved principles, current experiment worklog and existing game-state skill. Reference clean731ad5. Existing Birch callback task whitelist omits name-confirmation/gender phases; existing menu has numeric cursor only with no active owner. Investigation begins.

## Surprises
Principles document draft header stale versus CLAUDE explicit operator approval; preserve rather than editing operator-owned principles.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive after closeout.

RED: six active-owner/selection/printing/diagnostic tests fail at absent production read_active_ui;22 existing tests pass. ROM read-only disassembly confirms ChooseGender0x08030E39→Menu_GetCursorPos0x08198560, CreateNameYesNo0x08031145→ProcessNameYesNo0x08031189, return textbox0x0803261D→SoItsPlayerName0x08031105, NO/B→BoyOrGirl0x08030DC9.

2026-10-12 implementation checkpoint: active_ui carries phase, selected option, readiness, contextual controls, value and coverage diagnostic through Python JSON/model text, TypeBox and viewer. Live metadata declares active-ui-ownership-v1. Explicit map-load transitions qualify all three observed map callbacks using source/ROM call targets and stored literals. ClockCB2 0x08134C9D invokes RunTasks/AnimateSprites/BuildOam/ScheduledBG/PaletteFade matching wallclock.c; task pointers0x08134CE9/4DC5/4E31/4EA5/4EE9 match adjustment/ask/confirm/confirmed/exit and typed clock task data[2]/[3]/[5]. A is not ready between minute-angle ticks. Generic unknown callback/task families produce state coverage errors; no claim of full-game UI exhaustiveness.

Native isolated prototype afd5 at8044 (feature tagged) proves BOY/GIRL, editor text/cursor, nameYES/NO and NO/B return to gender without native name milestone; YES eventually emits native PLAYER_NAME_CONFIRMED. Candidate continued evolving during this prototype; final frozen source/clock probe and original-event compatibility must still bind proof before review. Initial7acc completed with no new readout feature and retained as setup diagnostic; a3a1 refused8044ownedcollision before run_start, not a benchmark trial. Cold nativeOpenCV imports took roughly90seconds then completed; no privacy/runtime workaround. Native mGBA binding only symlinked from stable main runtime. Vendorouterpin clean; recursiveinit encountered upstream nested gitmodule withouturl, outervendor data available and unchanged.

Four assertion-killing mutations qualified: reverseYESNO mapping, omitconfirmation owner, allow stale printing menu, remove two-optionvalidation. All restore original reader. Readout consistency addition: press-result summarizes qualified naming/UI netchanges rather than worldposition unavailable; explicitly avoids per-frame acceptance claims, and coverageerror cannot establishchangedUI.

GREEN pre-freeze gates: agent374 +viewer148 +Python405 tests pass; build/lint/format/mypy clean. Coverage run404Python tests (one additional readout assertion added after coverage import, no source change) passesall90floors: agent98.68/93.17/98.29/99.16;viewer97.47/90.93/98.42/98.36;Python99.38lines/97.06branches/100functions. Native clock-source hashes captured before9020 probe, owntruck snapshot declared save_state SHA1 in native run_start; no measured-run gameplay. Commit freezes candidate source; review/live qualification remain unchecked until evidence completed.

2026-10-12 COMMIT implementation8b9ac3f. Diagnostic audit of all prototype states caught6 unsupported snapshots, rootowners0x08030C91/0x08030CD5/0x08030D85. Source main_menu.c SlidePlatformAway/StartPlayerFadeIn/WaitForPlayerFadeIn and prior read-only disassembly qualify these transitionowners. Missing finitephase mapping is a real in-contract coverage defect, not suppressed diagnostic; add preciseowner regressions and rerun ownfreshboot validation before reviews. Clockproof9020 complete: defaultNO,Adecline,Aquestion,UPYES,DOWNNO,Bcancel,Aquestion,UPYES,Aaccept→nativeCLOCK_SETseq197/storyclocktrue196. Normal model tooltext now reports interfacechange, matchedclockframes confirm10:00AM/YES/NO.

COMMIT5739b94 source freeze: gates374agent/148viewer/409Python; cleannativefreshbootb367 confirmsname and reachestruck, clock3fc6 confirmsclock withno diagnostics. Fresh replay exposed2 moreunsupportedstates root0x08030C19(StartBirchLotadPlatformFade, originalROMdisassembly30C18→RunTextPrinters→fade+nextroot30C91). Repair adds this exacttransitionowner, not blanketunknownrelabeling. New finalnativefreshboot rerun required; clockfunction/table remainsbyteidentical. No externalreview round dispatched before diagnostic closure.

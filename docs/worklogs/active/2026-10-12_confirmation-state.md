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
- [ ] RED tests and commit
- [ ] Implement known confirmation/gender/transition ownership and diagnostics
- [ ] GREEN gates: tests, lint, build, coverage all metrics >=90
- [ ] Live coherent RAM/frame/model-text proof; mutations
- [ ] Multi-model review until LGTM; reviewed landing coordinated by parent
**M2 — Repair skill**
- [ ] Extend existing skill with diagnostic capture and repair workflow

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

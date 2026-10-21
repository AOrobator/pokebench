# Pending field dialogue handoff

User requests inspection and repair of the running bundle's dialogue/loop stall. One implementation milestone: add a default-OFF pending-field-dialogue-v1 treatment, regression tests, explainer and pending experiment; gates and independent review precede landing. Do not alter the measured run or its source.

## Evidence

Live bundle 2026-10-20T20-26-22_qwen36-gpu1_97a0, clean ee11d5b8. Navigation turn 635 (28131) returns during a trainer script with field controls locked before a message owner is visible. Observe turn 636 (28143) exposes ordinary dismiss_wait ready=true. From turn 637 battle_action repeats no-battle refusals without input. Frame 028143_0.png visibly shows Tommy's intro; native story confirms Tommy undefeated. Game source 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, RustboroCity_Gym_EventScript_Tommy and TextPrinterWait: A/B advances the ordinary message. Exact ROM SHA1 f3ae088181bf583e55daf962a92bb46f4f1d07b7.

Current observe wrapper settles only battleEngaged; refused battle_action explicitly skips auto advance. battle-refusal-loop-v1 requires initialized battle, so no-battle refusals evade it. Positive supervisor and fixed-point breaker are OFF; duplicate-turn-collapse ON only produces stage-1 text=null records. No no-tool diagnosis applies to this stall.

## Scope

When ON, observe settles an already owned ordinary field message. battle_action preflight settles that field message but returns the reached boundary without executing the queued battle choice, even if a battle starts. Preserve exact pages and automatic input records, existing caps, menu/choice boundaries, pause gate and cancellation. OFF retains existing outputs and calls. Never press through unknown locks, menus or naming screens. Existing battle behavior remains unchanged.

## Checklist

- [x] RED: observed pending field dialogue and queued battle action boundary regressions
- [ ] GREEN: production wiring and metadata
- [ ] Gates and mutation proof
- [ ] Independent review; landing only with required approvals
- [ ] Isolated/native evidence and local explainer delivery

Not authorized: changing current measured run's config or injecting game input. Gameplay improvement remains unmeasured.

RED receipt: focused production-wrapper suite: 3 expected failures / 47 passing; observe sent no B; battle_action executed the stale choice. Log /tmp/pending-field-red.log.

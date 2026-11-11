# Accept the START menu's null id in select_menu_option

Status: in progress (branch `claude/menu-option-null-id`, base `6d5a67339`).

The operator approved the fix 2026-11-11 ("yes", relayed by the coordinator).

## Problem

`select_menu_option` refused every START-menu call. `MenuOptionArgs.menu_id` is `Integer | Null`, and pi-ai's
`validateToolArguments` (`@mariozechner/pi-ai/dist/utils/validation.js`) runs typebox `Value.Convert` before
`execute`, which turns `null` into `0`. The START menu view has `menu_id: null`, so the exact compare in
`menu-option-tool.ts` refused it. Run `2026-11-10T15-37-43_opus-rayquaza-boot_67d7` had 32 START-menu
refusals and 0 successes (turns 3462 and 4014). Its state at seq 184768 (turn 4013) is a valid START view.
Putting Null first in the union only moves the bug to real id 0.

## Plan (one milestone)

- [ ] RED: `packages/agent/src/menu-option-null-id.test.ts`, in memory, including a pi-ai `validateToolArguments` round trip on the recorded 67d7 START menu and a `playGameTools` factory test.
- [ ] GREEN: correctness switch `menu-option-null-id-v1`, default ON when omitted, `flagFeatures` OFF. ON: a menu whose view has no id accepts `menu_id` null or 0; real ids still need an exact match. OFF: exact compare. Prompt unchanged.
- [ ] Explainer `docs/explainers/menu-option-null-id-v1.html`, linked from `FEATURE_EXPLAINERS`.
- [ ] Cheap checks, then full gates in a CPU window.
- [ ] Reviews: Claude CLI and GPT (Codex coordinator); Grok if available.
- [ ] Land fast-forward on local main via the landing board.

## Evaluation

Correctness fix, default ON. Activation milestone: any run that opens the START menu. No comparison cohort.

## Log

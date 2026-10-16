# battle-message-waiting-v1: the battle input line says when a message waits for A or B

Asked by the operator 2026-10-16 (cook run #2): "the agent is in an observation loop, but it doesn't seem like the supervisor is detecting it. This seems like a harness bug that we need to fix." This branch fixes the untruthful readout; the loop-guard side (semanticState() null in battle) is another thread's.

Branch `claude/battle-message-waiting` in `/private/tmp/pokebench-battle-waiting`, cut from main `bebb98c3`. Default-OFF server switch (group observation). The bundle definition (`experiments/fixed/bundle-v-control.json`) is owned by the readiness thread, which will put the switch in `onInBoth`; this branch does not edit it.

## Evidence (cook run #2, `runs/2026-10-16T02-23-17_qwen36-gpu1_sh02`, read-only)

- T445 (seq 10026) to T716: 272 `observe` calls in a row (only presses before T445 and from T717, seq 11937).
- Every observe result said `Interface: battle_resolving; input not ready` and `Battle details: WILD single · turn 3 · resolving (no input until the game asks)` (e.g. tool_result seq 10035 at T446 on state 10034 / raw-ram 00004696; seq 11115 at T600 on state 11114 / raw-ram 00004850). Foe WINGULL HP 0/13.
- Frames from seq 10057 to 11927 alternate between three images (the ▼ arrow blinking) showing "Wild WINGULL fainted!"; the first press A after the loop (T717, seq 11937) changed the frame (11945). The game was waiting for A or B the whole time.

## Design

- Reuse: cherry-pick `91acc0d8` + `c754f612` from `claude/battle-text-auto-advance` (battle message window detector `battle_text.py`, `battle.message/prompt/text_phase` in the state JSON, page journal, `/pokebench/battle/wait`), without their battle-text worklog hunks.
- ON: when the battle message window shows a page waiting for A/B, the battle input line says so: `battle message waiting: "<whole page>" — press A or B to continue`. When the text is still printing or will close on its own, say that instead of "no input until the game asks". Input-ready cases unchanged.
- OFF: today's text byte-for-byte. Independent of `battle-text-auto-advance-v1`.

## Milestones

**M1 — detector, RED, GREEN**
- [ ] Cherry-pick the detector commits (reviewed here as part of this branch)
- [ ] RED: OFF byte-identical, ON waiting/printing/auto-closing lines, registry/presets/defaults/SERVER_FEATURES both stacks, factory/wiring test
- [ ] GREEN + gates (test with ROM, coverage ≥90, lint, build, verify-vendor)

**M2 — proof, explainer, review**
- [ ] Real-ROM re-render at the WINGULL seqs and the showcase battle seqs
- [ ] Explainer, FEATURE_EXPLAINERS, pending experiment entry, pages-check
- [ ] Review: Claude CLI, Codex, Grok until LGTM

## Session Log

- 2026-10-16 03:05 AM EDT: worklog created; bug confirmed from cook run #2 events and frames (seqs above).
- 2026-10-16 03:08 AM EDT: cherry-picked `91acc0d8` (RED tests + raw-RAM fixture for the battle message window) without its battle-text worklog file.
  COMMIT: `test(RED): battle message window, page journal and frame-driven battle wait` (cherry-pick of 91acc0d8)

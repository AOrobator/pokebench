# Worklog: harness-trust-v2, the header on battle_action results

Branch `claude/harness-trust-v2`, worktree `/private/tmp/pokebench-harness-trust-v2`, base `main` f7923b5c.

## Problem Statement

Cook run 2 (coordinator, 4:58 PM New York): with harness-trust-v1 and battle-move-tool-v1 both on, battle_action results lack the "Read from game memory, always true:" header, because `withHarnessTrust` wraps only observe, press and navigate_to. The coordinator asked for a small fix behind its own switch (or a v2), bundle only, with a merge slot requested before landing. Operator scope for harness-trust: every tool result starts with the header (the operator, 2:12 PM).

## Skills Loaded

feature-switch, execute-worklog, feature-explainer (explainer update), experiment-queue (pending entry).

## Architecture

New switch `harness-trust-v2` (guidance, needs harness-trust-v1, default OFF, bundle only). ON: `withHarnessTrust` also wraps `battle_action`, so its results start with the same header. A battle_action result is never "the player's own move" for the walk-away note (it is a battle choice; the note only reads overworld states anyway). OFF: harness-trust-v1 exactly as landed.

## Invariants

- INV-1: OFF (v2 off) is byte-identical to main for every tool.
- INV-2: the header text on battle_action is the same header the other tools get; nothing clipped.
- INV-3: battle_action never counts toward the walk-away note.

## Security Review

No new inputs, endpoints or files.

## Milestones

**M1: harness-trust-v2**
- [x] RED: `harness-trust-v2.test.ts` (battle_action wrapped only with the option, recorded 4caa T272 header; never counted as own move; registry, presets, factory through playGameTools with an extra battle_action tool) and the viewer default. 5:08 PM New York: 2 agent tests fail (option and registry missing).
- [ ] GREEN: option in withHarnessTrust, registry, presets, defaults, wiring, explainer section, pending experiment entry.
- [ ] Gates
- [ ] Review: Claude, Grok, Codex; 2-round cap.
- [ ] Merge slot from the coordinator; land ff-only; SHA to the coordinator.

## Closing the Loop

Factory test through the production playGameTools.

## Session Log

- 2026-10-17 5:05 PM New York: worktree from main f7923b5c.

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive.

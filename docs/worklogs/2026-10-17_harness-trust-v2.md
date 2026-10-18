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
  - COMMIT: `test(harness-trust-v2): RED header on battle_action results` (3a4b9573)
- [x] GREEN: `TrustOptions.battleAction` wraps battle_action; the walk-away own-move test is now press or navigate_to by name (battle_action never counts); registry (last, guidance, needs harness-trust-v1, state-only list), presets OFF, DEFAULT_NEXT_RUN OFF, playGameTools passes the switch; explainer section in harness-trust-v1.html mapped for the v2 card; pending `experiments/harness-trust-v2.json` and readiness row; heal-before-trainers and battle-move-tool incumbents list the new switch. Mechanical test updates: positions +1, v2 OFF wherever cited-destination is OFF, guidance 44, switchboard rows 104.
  - Wiring break: `battleAction:false` in play-wiring turned the factory test red; restored, 3/3.
- [x] Gates: agent 2257, viewer 1118, pytest 2564; lint, build clean; coverage agent 99.2 / 94.11 / 98.2, viewer 97.62 / 91.38 / 93.79, Python 97.65 / 93.78 / 100; verify-vendor OK; experiments-check ok (94); pages-check clean; schema unchanged.
- [ ] Review: Claude, Grok, Codex; 2-round cap.
- [ ] Merge slot from the coordinator; land ff-only; SHA to the coordinator.

## Closing the Loop

Factory test through the production playGameTools.

## Session Log

- 2026-10-17 4:55 PM New York: worktree from main f7923b5c.

## Surprises

## Multi-Model Review Log

- Round 1 (5:00-5:10 PM New York): base main 44652551, head e637d113. Claude LGTM, Grok LGTM, Codex BLOCKING: battle_action puts its status in the first text part and the readout in a later one, so the characters line was not found (charactersLine read only the first text part). Fix: on battle_action results the characters line is read from every text part; observe/press/navigate_to keep v1's first-part read, so harness-trust-v1 stays byte-identical.
- [x] RED: multi-part battle_action result (status, screenshot, T272 readout) must carry the characters line. 5:12 PM New York: fails.
- [x] GREEN: battle_action results read readout lines from every text part. Gates: agent 2258, viewer 1118, pytest 2564; lint clean; coverage agent 99.2 / 94.1 / 98.2, viewer 97.62 / 91.38 / 93.79, Python 97.65 / 93.78 / 100.
- [x] Round 2 (5:17-5:30 PM New York): base main 643f588e, head 8280b57a (after merging main). Claude, Grok and Codex all LGTM.
- [x] Merge slot granted by the coordinator (5:19 PM New York); LANDED `git merge --ff-only 8280b57a` on local main; worklog evidence 18486504; experiment repinned to 8280b57a.

## Boy Scout Log

## Archive Milestone (user-gated)

- [x] ASK USER: archive.

## Archived

2026-10-17, 8:40 PM EDT, on the operator's request to archive worklogs whose implementation is already on main (8280b57a Merge branch 'main' into claude/harness-trust-v2). Unchecked boxes left above are bookkeeping from before that landing.

# Harness fixes, strong bundle and fixed-incumbent relaunch

Requested by the operator in the "Agent trace failure analysis" thread (2026-10-15 16:41 UTC), after the reports
`runs/reports/2026-10-15-agent-trace-analysis.html` and `runs/reports/2026-10-15-switch-harm-followup.html`.
Branch `claude/harness-fixes-bundle`, worktree `/private/tmp/pokebench-harness-fixes`. Local only; merge on approval.

## Problem Statement

The thinking traces show the model being told false or incomplete things at its decision points:
- the loop supervisor contradicts the readout ("name confirmed, clock set" while the readout says "rival met");
- it grades reading a conversation with B as "no change, do not try again";
- it marks every tile the player stood on as tried, hiding exits;
- it clips dialogue, cutting May's "help Dad catch wild POKéMON" line, along with 12 other clipping sites.

The finals (24 h, from boot) measure navigation on top of these bugs. The operator's decisions (16:41 UTC):
1. Land the bug fixes **without an A/B**. They are corrections, not hypotheses. This is an explicit operator exception to the feature-switch rule for the items in M1 only.
2. **No truncation of anything sent to the model.** The context window is the only bound; detail is fetched through tools.
3. Bundle the high- and medium-value features into **one arm** against the fixed incumbent, from the CLOCK_SET save, 30-minute trials, 8 per arm.
4. Build faster screening (decision-point tests).
5. Do not let the finals run all day. Once the fixes and bundle are ready, start the new cohort.
6. The `navigate_to` prompt fix is a bug fix (M1).
7. Battle details: a thorough, game-owned readout (actions with enabled/disabled only where the game can disable them, moves with type/PP, opponent and party types, party movesets).
8. Dialogue auto-advance plus a full dialogue log under one switch, automatic rather than a tool. That is a separate worklog. So are the conversation repeat guard, the type-effectiveness battle skill and the human ground-truth traces (own thread).

## Skills Loaded
feature-worklog, feature-switch, experiment-queue, feature-explainer, pokebench-game-state (M2), agent-observability (M1, M3, M4), pokebench-patch-evaluation (M6), multi-model review contract.

## Architecture

- **M1, no switch:**
  - `loop-supervisor.ts` reads story steps from the same decoded story text the readout uses.
  - Attempt outcomes count a buffer cursor, phase change or closed box as "dialogue advanced" or "dialogue closed".
  - Tried targets are recorded only from actions: a `navigate_to` target, A facing a target, or a warp actually taken. Standing on a tile no longer counts. The tried set resets when story state changes.
  - Every `clip()` on model-facing text is removed (supervisor, navigation memory, instruction ledger, dialogue log, objectives). Over-long sections drop whole older entries and say how many were omitted and which tool recalls them. Strings are never cut.
  - Hint and supervisor subscribe before the recorder replays start-of-run milestones.
  - The story line reads "unavailable during map load" instead of "no completion confirmed".
  - The `navigate_to` description adds three rules: target a walkable tile, adjacent to an NPC or object; dismiss open messages first; use it for listed warps.
- **M2–M4, new switches (all default OFF):**
  - `battle-details-v2`, which needs `expanded-menu-battle-information-v1`.
  - `character-presence-v1`
  - `navigation-refusal-reasons-v1`
  - `transition-press-result-v1`
  - `stall-briefing-v1`
- **Strong bundle** = fixed incumbent + `named-warp-destinations-v1`, `world-destinations-v1`, `game-evidence-priority-v1`, `expanded-menu-battle-information-v1`, `battle-details-v2`, `character-presence-v1`, `navigation-refusal-reasons-v1`, `transition-press-result-v1`, `stall-briefing-v1`.
- **Fixed incumbent** = the finals incumbent switch set (from `2026-10-15T11-08-31_think-fast_504f` run_start) on the fixed build.

## Invariants
- **INV-1:** No model-facing string is cut mid-text. *Test:* property test over every context builder with 10 kB dialogue entries; output contains each kept entry verbatim.
- **INV-2:** The supervisor's story steps equal the readout's Story line for the same state. *Test:* fixtures at intro_stage/rival_stage values 0–4.
- **INV-3:** Every new switch OFF reproduces today's prompt, tools and readout bytes. *Test:* golden comparisons, plus a factory-path test per switch with the wiring-deletion check.
- **INV-4:** Battle readout facts come only from game RAM. Enable/disable flags appear only for actions the game can disable. *Test:* pokeemerald-cited fixtures from recorded raw RAM.
- **INV-5:** Cohort trials are isolated (INV-7 of the project): own run dir, own server, the same frozen source and checkpoint SHA-1 for both arms.
- **INV-6:** The ROM never enters git; the vendor tree stays untouched.

## Security Review
Local-only harness. No new network surface, subprocesses keep argv lists, and no user paths are interpolated. The cohort driver reuses the existing argv-only launcher.

## Milestones

**M1 — Harness bug fixes (no switch, operator exception)**
- [x] RED tests: supervisor story steps (staged values); B/page grading; action-only tried targets plus reset on story change; no-truncation property across supervisor/memory/ledger/dialogue-log/objectives; hint/supervisor subscription order from a CLOCK_SET save; story line during map load; navigate_to description text.
- [ ] COMMIT (RED)
- [ ] Implement
- [ ] Gates: `just test`, `just lint`, `just build`, `just coverage` (≥90 both stacks)
- [ ] COMMIT (GREEN)
- [ ] Observability check: replay `0c40` T520–540 and `504f` T252 states through the fixed supervisor; record the new note text
- [ ] Multi-model review loop until clean

**M2 — `battle-details-v2` (needs expanded-menu-battle-information-v1)**
- [ ] Game-source research recorded here: action options and when each can be disabled, catch/run eligibility, move type/PP/power/accuracy and disable sources, all types, party movesets, input phase, opponent party count
- [ ] RED tests on recorded raw-RAM battle fixtures (Birch rescue, a trainer battle, move select, empty bag prints "empty")
- [ ] Implement (Python decode + readout; TS registry/preset/defaults)
- [ ] Gates, GREEN commit, explainer, pending experiment entry, review loop

**M3 — `character-presence-v1`, `navigation-refusal-reasons-v1`, `transition-press-result-v1`**
- [ ] RED tests for each switch, ON and OFF byte-identity
- [ ] Implement:
  - Story characters by unique sprite graphics: "PROF. BIRCH: not on this map". A sprite kind is never named as a person.
  - Refusals: "a message is waiting for A/B", "(x,y) is <object>: stand at …, face …, press A", "wall/collision".
  - Press results: "warped: A (x,y) → B (x,y)", "moved by a script while controls were locked", "conversation restarted with X (nth time)".
- [ ] Gates, GREEN, explainers, pending entries, review loop

**M4 — `stall-briefing-v1`**
- [ ] RED tests: map A→B→A→B cycle briefs on the second round trip; N minutes with no new milestone briefs once per window; identical multi-button batches
- [ ] Implement (extends the supervisor triggers; the briefing text uses the M1-fixed facts)
- [ ] Gates, GREEN, explainer, pending entry, review loop

**M5 — Strong-bundle cohort launch (needs the operator)**
- [ ] ASK USER: approve the merge of M1–M4 into main
- [ ] ASK USER: press WITHDRAW FINALS in the viewer. Agents never press it; the trial in flight finishes.
- [ ] Freeze the source at the merge SHA in a detached worktree; presets `control` (fixed incumbent) and `bundle`; manifest; checkpoint `rival-push-checkpoint/CLOCK_SET.state` with SHA-1 check; 8 per arm, 30 min, 1,500 turns, balanced order; driver from the 2×2 pattern
- [ ] Launch (the operator authorized the start on 2026-10-15 16:41 UTC: "as soon as … the bugs are fixed, you can start the new run")
- [ ] Record the receipt, run ids and live status here

**M6 — Decision-point screening (built while the cohort runs)**
- [ ] Spike: rebuild a recorded turn's exact context (system prompt, history, images, ledger/supervisor) from events.jsonl and frames, and re-render its readout under a different switch set from the recorded raw RAM
- [ ] RED/GREEN: `just probe-decision <run> <turn> --switch <id>=on|off --samples K`, which reports how the next tool-call distribution changes
- [ ] Seed set: `c0b8` T314, `0c40` T529, `c497` T301, `258d` T641, `9d86` T148, `dea1` T137
- [ ] Gates, review loop

## Closing the Loop
Cohort report: furthest milestones first; reach counts and survivor medians per arm with DNFs kept; comparison against the human run and the 2×2. A bundle win nominates for finals under the winner gate. Afterwards, the decision-point probes ablate which switches carried it.

## Session Log
- 2026-10-15 16:45 UTC: worklog drafted; battle source research running read-only.
- 2026-10-15 16:47 UTC: The operator approved the worklog ("yes").

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER: archive this worklog
- Baseline: agent vitest 1083 passed; pytest 1877 passed (worktree, submodule initialised from local checkout).
- 2026-10-15 16:50 UTC: The operator decided the finals run now to keep the GPU busy; when fixes + bundle are ready, deploy and stop the finals (one bundle, all switches). Coordinate with the "Resume the finals" thread before merging (build pin).
- M1 RED: packages/agent/src/harness-fixes.test.ts 8 failing (story steps, map-load story, B grading/restart, action-only tried + reset, no truncation supervisor/ledger/log/memory, milestone replay, navigate_to rules); env test_story 1 failing (all-unavailable story line).

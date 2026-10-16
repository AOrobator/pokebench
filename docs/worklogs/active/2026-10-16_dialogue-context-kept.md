# Dialogue kept in context (`dialogue-context-kept-v1`)

Parent: `docs/worklogs/active/2026-10-16_prelaunch-fixes.md` (worklog on branch `claude/prelaunch-fixes`), milestone M3: fix F4 and the both-arm half of F5. Approved by the operator 2026-10-16 12:46 AM EDT; the switch is ON in both arms of bundle-v-control (`onInBoth`, wired by M6, not here).

## Problem Statement

Bundle qualification run `2026-10-15T23-47-41_qwen36-gpu1_3f21` (forensics `runs/reviews/2026-10-16-qualification-forensics/bundle-3f21.md`, bug 2): MOM's T98 instruction ("He lives right next door, so you should go over and introduce yourself", tool_result seq 1776) was shown whole only on T99–T103. `slideWindow` keeps the newest 4–6 tool results whole and collapses older ones to a one-line `summary()`; from T104 the T98 result read only `Navigation: a message is waiting … · LITTLEROOT TOWN BRENDANS HOUSE 1F (X=4, Y=5, facing left) [older screenshot omitted]`. The T107 decision went to the lab. Context was ~7–10k of 65k tokens. Operator rule: never truncate model-facing text; the context window is the only bound.

Bug 3 (both-arm half): the loop supervisor (and the text-only supervisor and stall briefing, which share `SupervisorBriefing.bearings`/`told`) quotes only the three newest dialogue pages. At T166 (seq 3310) that was the lab scientist's filler, not MOM's instruction.

## Skills Loaded

feature-switch, feature-explainer, agent-observability (supervisor text), pokebench-trace-forensics (read-only evidence).

## Design

Switch `dialogue-context-kept-v1` (guidance, needs nothing, default OFF).

1. **Collapsed results keep dialogue whole.** `contextWindow(features)` adds `keepDialogue: true` to the window (incumbent or doubled). `slideWindow` still collapses the same results at the same chunk boundaries; a collapsed result is today's one-line summary (and `[older screenshot omitted]`) followed, on new lines, by every dialogue unit the full result contained, byte for byte:
   - the auto-advance block `Dialogue shown during this call (N pages, in order, whole):` with its N numbered pages (speaker, map, position, turn);
   - each readout `Dialog: "…"` line (the control arm's dialogue: every page of the open message, " | " between pages, speaker prefix as the game prints it);
   - a `get_dialogue`/`recall_dialogue` result, kept whole (it is all quoted dialogue).
   Frames drop as today. Results with no dialogue collapse byte-identically to today. The turn window (`turns: 20/10`) is unchanged.
2. **Supervisor cites the last story instruction.** Under the switch, the loop supervisor, stall briefing and text-only supervisor add one line before "Recent dialogue": the dialogue pages the model was shown after the previous story milestone up to the turn of the latest story milestone the game confirmed (kind `story`, not present at start), oldest first, whole. Walks back to an earlier story milestone when the latest one had none. The three-newest line stays as it is. The helper is shared, so with the switch ON the bundle's stall briefing gets the line too; stall-briefing-v1's own F5 text change belongs to `claude/bundle-prelaunch-fixes` and is not touched here.

## Invariants

- OFF reproduces today byte for byte: `contextWindow(off)` is `WINDOW`/`DOUBLE_WINDOW` by identity; supervisor text equals the recorded seq 1010 and 3310 briefings.
- No dialogue page is shortened; the only bound is the window.
- Kept text is the exact text the full result showed (no re-rendering).

## Milestones

**M1 — RED**
- [x] Fixture `packages/agent/test-support/dialogue-context-3f21.json` (1.1 MB) from the real 3f21 events (seq 0–3310) plus the 2919 control readout (seq 1862); extraction trims to what the window, dialogue log and supervisor read (described in its `source`)
- [x] Tests (`dialogue-context-kept.test.ts`, 16): T107 context ON contains MOM's 8 pages verbatim; OFF equals today; non-dialogue collapse identical; control `Dialog:` line kept; recall results kept; registry/preset/viewer/explainer; supervisor OFF equals recorded seq 1010/3310, ON cites MOM's pages; control-arm walk-back. Existing position/count/default-list tests shifted by one for the new last switch.
- [x] RED: 14 fail, 2 pass (the OFF reconstruction of the recorded T107 shape, and OFF supervisor = recorded seq 1010 and 3310 byte for byte)
- [ ] COMMIT RED

**M2 — GREEN**
- [ ] Registry, presets, viewer default, harness collapse, supervisor line, pending experiment entry, readiness row, explainer
- [ ] Gates: test, lint, build, coverage (90% floor), verify-vendor
- [ ] Token growth over the 200-turn 3f21 run and the 2919 control run, ON vs OFF
- [ ] Guard check: delete the wiring once, watch the factory test go red
- [ ] Review: Codex + grok

## Session Log

- 2026-10-16 01:00 AM EDT: Worktree `/private/tmp/pokebench-m3-dialogue` on `claude/dialogue-context-kept` from main `fa09dbe6`. Evidence read: 3f21 seq 1773–1789, 2919 readouts (Dialog line equals the field-message buffer pages joined by " | "; over 130 runs from 2026-10-13 to 2026-10-16, 12,342 results with a buffer block, 23 with `Dialog: none` — a closed box's leftover buffer — and no unterminated `Dialog: "` line).

## Surprises

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
2. **Supervisor cites the last story instruction.** Under the switch, the loop supervisor, stall briefing and text-only supervisor add one line before "Recent dialogue": the dialogue pages recorded after the previous story milestone and before the latest story milestone (bounded by event seq, review round 1) the game confirmed (kind `story`, not present at start), oldest first, whole. Walks back to an earlier story milestone when the latest one had none. The three-newest line stays as it is. The helper is shared, so with the switch ON the bundle's stall briefing gets the line too; stall-briefing-v1's own F5 text change belongs to `claude/bundle-prelaunch-fixes` and is not touched here.

## Invariants

- OFF reproduces today byte for byte: `contextWindow(off)` is `WINDOW`/`DOUBLE_WINDOW` by identity; supervisor text equals the recorded seq 1010 and 3310 briefings.
- No dialogue page is shortened; the only bound is the window.
- Kept text is the exact text the full result showed (no re-rendering).

## Milestones

**M1 — RED**
- [x] Fixture `packages/agent/test-support/dialogue-context-3f21.json` (1.1 MB) from the real 3f21 events (seq 0–3310) plus the 2919 control readout (seq 1862); extraction trims to what the window, dialogue log and supervisor read (described in its `source`)
- [x] Tests (`dialogue-context-kept.test.ts`, 16): T107 context ON contains MOM's 8 pages verbatim; OFF equals today; non-dialogue collapse identical; control `Dialog:` line kept; recall results kept; registry/preset/viewer/explainer; supervisor OFF equals recorded seq 1010/3310, ON cites MOM's pages; control-arm walk-back. Existing position/count/default-list tests shifted by one for the new last switch.
- [x] RED: 14 fail, 2 pass (the OFF reconstruction of the recorded T107 shape, and OFF supervisor = recorded seq 1010 and 3310 byte for byte)
- [x] COMMIT: `test: RED dialogue-context-kept-v1 keeps story dialogue in collapsed results and the supervisor (3f21 T98→T107)` (76f452d2)

**M2 — GREEN**
- [x] Registry (guidance, needs null, recorded last), presets default false, viewer default false, `FEATURE_EXPLAINERS`, harness `dialogueUnits` + `collapsed`, supervisor `instruction()` line in `bearings` and `textOnly`, pending `experiments/dialogue-context-kept.json`, readiness row, explainer `docs/explainers/dialogue-context-kept-v1.html`
- [x] Gates: `just test` agent 1283, viewer 786, python 1960 passed (2 ROM skips); `just lint` TS clean, mypy fails only on the missing `mgba._pylib` binding in this worktree; `just build` ok; `just coverage` agent 97.63 stmts / 94.25 branches / 97.88 funcs / 99.03 lines (harness.ts 100/98.3/100/100), viewer 95.08/90.39/93.55/97.6, python lines 97.03 branches 92.57 functions 100; `just verify-vendor` ok
- [x] Token growth (window rebuilt per turn from recorded events, chars/4): 3f21 199 turns OFF max 11,544 / ON max 11,685, mean 6,199 → 6,408, largest added 985; 2919 248 turns OFF max 11,266 / ON max 11,315, mean 5,268 → 5,445, largest added 1,224. Rebuilt OFF = recorded turn_start within 10 tokens on 195/198 and 242/247 turns (the rest carry an appended loop-guard note). All dialogue in the whole run: ~4,150 (3f21) and ~4,010 (2919) tokens. Mom's next-door pages are in the ON context on 3f21 turns 99–111 (OFF: 99–103), 2919 turns 135–151.
- [x] Guard check: `contextWindow` reverted to ignore the switch → 5 tests red (incl. the play-wiring factory test); supervisor `kept()` stubbed to "" → 4 red; both restored → 17 green
- [x] COMMIT: `feat: dialogue-context-kept-v1 keeps every dialogue page in collapsed results and cites the last story instruction in supervisor briefings` (e513c4a6)
- [x] Pending experiment pinned provisionally to e513c4a6 (repin to the merge SHA on landing)
- [x] Review round 1: Codex BLOCKING — story boundaries by turn misattribute same-turn pages (valid). Grok BLOCKING — the two-dot `git diff main..HEAD` showed main's newer bedroom-exit merge as reverted (diff artifact: main moved after branching; fixed by merging main in). Both said the dialogue feature otherwise looks correct.
- [x] COMMIT: `test: RED supervisor story-instruction pages are bounded by event order, not turn (review round 1)` (da85a880): 2 red, 16 green; the 3f21 T166 line now also carries Mom's five turn-95 2F pages (shown after CLOCK_SET seq 1629, before MOM_RIVAL_INSTRUCTION seq 1775)
- [x] COMMIT: `fix: bound the supervisor's story-instruction pages by milestone seq, not turn (review round 1)` (df596e80): 18/18
- [x] Merge main 50db95d0 (bedroom-exit); one conflict in features.test.ts legacy list resolved by adding this switch to main's list. Gates after merge: agent 1292, viewer 790, python 1960 passed; TS lint clean (mypy only mgba._pylib); coverage agent 97.63/94.28/97.88/99.04, viewer 95.09/90.42/93.56/97.6, python 97.03/92.57/100; verify-vendor ok; build ok
- [ ] Re-review the round-1 delta

## Session Log

- 2026-10-16 01:00 AM EDT: Worktree `/private/tmp/pokebench-m3-dialogue` on `claude/dialogue-context-kept` from main `fa09dbe6`. Evidence read: 3f21 seq 1773–1789, 2919 readouts (Dialog line equals the field-message buffer pages joined by " | "; over 130 runs from 2026-10-13 to 2026-10-16, 12,342 results with a buffer block, 23 with `Dialog: none` — a closed box's leftover buffer — and no unterminated `Dialog: "` line).

## Surprises

- The turn window (20/10) still drops whole turns, so the harness half keeps Mom's pages only until about turn 111 in 3f21; the T166 stall is covered only by the supervisor line. Keeping all dialogue for the whole run would cost about 4k tokens at 200 turns; that is a separate decision (not done: it changes the turn window, which the brief did not ask for).
- The supervisor quotes pages without their " (sprite kind, not a name)" speaker labels (the dialogue log stores text only, as the three-newest line always did); speaker prefixes the game prints (MOM:, INTERVIEWER:) are in the text.
